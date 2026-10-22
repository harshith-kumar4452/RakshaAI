import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function normalizePhone(input) {
  return String(input || "").replace(/\D/g, "");
}

function normalizeAadhaar(input) {
  return String(input || "").replace(/\D/g, "");
}

function maskedAadhaar(last4) {
  return `XXXX XXXX ${last4}`;
}

function hashText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function pickVerificationMethod(seed) {
  const methods = ["manual", "ocr", "uidai_offline_xml", "masked_aadhaar"];
  return methods[Number(seed) % methods.length];
}

function seededProfile(last4) {
  const seed = Number(last4);
  const gender = seed % 2 === 0 ? "male" : "female";

  const maleNames = [
    "Arjun",
    "Rohit",
    "Vikram",
    "Karthik",
    "Aman",
    "Siddharth",
    "Harish",
    "Nikhil",
  ];

  const femaleNames = [
    "Aditi",
    "Sneha",
    "Priya",
    "Kavya",
    "Ananya",
    "Meera",
    "Ishita",
    "Ritika",
  ];

  const surnames = [
    "Sharma",
    "Reddy",
    "Patel",
    "Verma",
    "Nair",
    "Iyer",
    "Singh",
    "Gupta",
  ];

  const places = [
    { district: "Hyderabad", state: "Telangana", pincode: "500081", locality: "Madhapur" },
    { district: "Bengaluru Urban", state: "Karnataka", pincode: "560034", locality: "HSR Layout" },
    { district: "Chennai", state: "Tamil Nadu", pincode: "600042", locality: "Velachery" },
    { district: "Pune", state: "Maharashtra", pincode: "411014", locality: "Viman Nagar" },
    { district: "Mumbai Suburban", state: "Maharashtra", pincode: "400097", locality: "Malad East" },
    { district: "Delhi", state: "Delhi", pincode: "110017", locality: "Saket" },
    { district: "Ahmedabad", state: "Gujarat", pincode: "380015", locality: "Vastrapur" },
    { district: "Kolkata", state: "West Bengal", pincode: "700091", locality: "Salt Lake" },
  ];

  const firstName =
    gender === "male"
      ? maleNames[seed % maleNames.length]
      : femaleNames[seed % femaleNames.length];
  const surname = surnames[Math.floor(seed / 10) % surnames.length];
  const place = places[Math.floor(seed / 100) % places.length];

  const year = 1985 + (seed % 17);
  const month = 1 + (seed % 12);
  const day = 1 + (seed % 28);

  return {
    full_name: `${firstName} ${surname}`,
    gender,
    date_of_birth: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year_of_birth: year,
    address_line: `Flat ${1 + (seed % 90)}B, ${place.locality} Residency`,
    district: place.district,
    state: place.state,
    pincode: place.pincode,
    confidence_score: 0.93,
  };
}

async function generateMockWithLLM(aadhaarLast4) {
  const base = seededProfile(aadhaarLast4);

  if (!process.env.GROQ_API_KEY) {
    return base;
  }

  const prompt = `Generate a realistic MOCK Indian Aadhaar profile for testing only.\nReturn only valid JSON with keys:\nfull_name, gender(male|female), date_of_birth(YYYY-MM-DD), year_of_birth(int), address_line, district, state, pincode(6 digits), confidence_score(0-1).\nGender MUST be only male or female. Name must match the gender.\nUse seed: ${aadhaarLast4}.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 400,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return base;

    const parsed = JSON.parse(content);
    const llmGender = String(parsed.gender || "").toLowerCase();
    const safeGender = llmGender === "female" || llmGender === "male" ? llmGender : base.gender;

    return {
      full_name: parsed.full_name || base.full_name,
      gender: safeGender,
      date_of_birth: parsed.date_of_birth || base.date_of_birth,
      year_of_birth:
        Number.isInteger(parsed.year_of_birth) && parsed.year_of_birth > 1900
          ? parsed.year_of_birth
          : base.year_of_birth,
      address_line: parsed.address_line || base.address_line,
      district: parsed.district || base.district,
      state: parsed.state || base.state,
      pincode: /^\d{6}$/.test(String(parsed.pincode || ""))
        ? String(parsed.pincode)
        : base.pincode,
      confidence_score:
        typeof parsed.confidence_score === "number"
          ? Math.max(0, Math.min(1, parsed.confidence_score))
          : base.confidence_score,
    };
  } catch (error) {
    console.error("LLM mock generation failed:", error);
    return base;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const aadhaarNumber = normalizeAadhaar(body.aadhaarNumber);
    const phoneNumber = normalizePhone(body.phoneNumber);

    if (!aadhaarNumber || aadhaarNumber.length !== 12) {
      return NextResponse.json(
        { error: "Valid 12-digit Aadhaar number is required" },
        { status: 400 }
      );
    }

    if (!phoneNumber || phoneNumber.length < 10 || phoneNumber.length > 15) {
      return NextResponse.json(
        { error: "Valid phone number is required" },
        { status: 400 }
      );
    }

    const aadhaarLast4 = aadhaarNumber.slice(-4);
    const profile = await generateMockWithLLM(aadhaarLast4);
    const supabase = await createSupabaseServerClient();
    const nowIso = new Date().toISOString();
    const aadhaarHash = hashText(aadhaarNumber);
    const docHash = hashText(`${aadhaarNumber}:${phoneNumber}:aadhaar_doc`);
    const chosenMethod = pickVerificationMethod(aadhaarLast4);
    const sourceReference = `GOV-MOCK-${aadhaarLast4}-${Date.now()}`;
    const mockFileUrl = `https://mock-gov.local/aadhaar/${aadhaarLast4}.pdf`;

    const payload = {
      complaint_id: null,
      user_id: null,
      phone_number: phoneNumber,
      full_name: profile.full_name,
      gender: profile.gender,
      date_of_birth: profile.date_of_birth,
      year_of_birth: profile.year_of_birth,
      address_line: profile.address_line,
      district: profile.district,
      state: profile.state,
      pincode: profile.pincode,
      aadhaar_last4: aadhaarLast4,
      aadhaar_masked: maskedAadhaar(aadhaarLast4),
      aadhaar_number_hash: aadhaarHash,
      is_verified: true,
      verification_method: chosenMethod,
      aadhaar_file_url: mockFileUrl,
      aadhaar_file_hash: docHash,
      extracted_by_ai: true,
      confidence_score: profile.confidence_score,
      source_system: "mock_gov_registry_llm",
      source_reference: sourceReference,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data, error } = await supabase
      .from("aadhaar_identity")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to store aadhaar identity:", error);
      return NextResponse.json(
        { error: "Failed to store Aadhaar identity" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, identity: data });
  } catch (error) {
    console.error("Aadhaar route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

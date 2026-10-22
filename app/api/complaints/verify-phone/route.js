import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizePhone(input) {
  return String(input || "").replace(/\D/g, "");
}

/**
 * POST /api/complaints/verify-phone
 *
 * Checks if a phone number exists in the system and returns associated cases.
 * 
 * Body:
 * {
 *   phone: string (required),
 *   otp: string (required - for now we mock check against "123456")
 * }
 *
 * Response:
 * {
 *   exists: boolean,
 *   cases: Array<{ caseId: string, status: string, date: string }>
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { phone, otp } = body;
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone || normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return NextResponse.json(
        { error: "A valid phone number is required" },
        { status: 400 }
      );
    }

    // Mock OTP check
    // In production, this would verify against a stored OTP (Redis/DB) sent via SMS
    if (otp !== "123456") {
       return NextResponse.json(
        { error: "Invalid OTP" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    
    // Check for existing complaints with this phone number
    const { data: existingCases, error } = await supabase
      .from("complaints")
      .select("token, status, created_at, incident_types")
      .eq("phone_number", normalizedPhone)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to check records" },
        { status: 500 }
      );
    }

    if (existingCases && existingCases.length > 0) {
      const mappedCases = existingCases.map((c) => ({
        caseId: c.token,
        status: c.status,
        date: c.created_at,
        type: c.incident_types ? c.incident_types[0] : "Complaint",
        statusUrl: `/status?caseId=${encodeURIComponent(c.token)}`,
      }));

      return NextResponse.json({
        exists: true,
        latestCaseId: mappedCases[0].caseId,
        latestStatusUrl: mappedCases[0].statusUrl,
        cases: mappedCases,
      });
    }

    return NextResponse.json({
      exists: false,
      cases: []
    });

  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
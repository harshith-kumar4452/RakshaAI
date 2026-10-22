import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateCaseId, calculateNLPTriad } from "@/lib/token-utils";
import { Groq } from "groq-sdk";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";
export const runtime = "nodejs";

function normalizePhone(input) {
  return String(input || "").replace(/\D/g, "");
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function extractJsonObject(text) {
  if (!text) return null;
  const trimmed = String(text).trim();

  // direct JSON
  const direct = safeJsonParse(trimmed, null);
  if (direct && typeof direct === "object") return direct;

  // fenced code block JSON
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const fromFence = safeJsonParse(fencedMatch[1].trim(), null);
    if (fromFence && typeof fromFence === "object") return fromFence;
  }

  // first curly object fallback
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const maybe = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = safeJsonParse(maybe, null);
    if (parsed && typeof parsed === "object") return parsed;
  }

  return null;
}

function extensionFromMime(mimeType = "") {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return ".bin";
}

async function analyzeEvidenceWithLLM({ fileBuffer, mimeType, complaintDescription }) {
  if (!process.env.GROQ_API_KEY) {
    return {
      description: "Evidence uploaded. AI analysis unavailable (missing GROQ_API_KEY).",
      ocr_text: "",
      entities: [],
      actions_committed: [],
      confidence: 0,
    };
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const base64 = fileBuffer.toString("base64");
  const preferredModel = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
  const modelCandidates = Array.from(
    new Set([
      preferredModel,
      "meta-llama/llama-4-maverick-17b-128e-instruct",
      "qwen/qwen2.5-vl-72b-instruct",
      "qwen/qwen2.5-vl-32b-instruct",
    ])
  );

  try {
    let completion = null;
    let lastError = null;

    for (const model of modelCandidates) {
      try {
        completion = await groq.chat.completions.create({
          model,
          temperature: 0.1,
          max_tokens: 600,
          messages: [
            {
              role: "system",
              content:
                "You analyze legal complaint evidence images. Return STRICT JSON only: {\"description\":string,\"ocr_text\":string,\"entities\":string[],\"actions_committed\":string[],\"confidence\":number}",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Complaint context: ${complaintDescription.slice(0, 1200)}\nExtract OCR text from the image exactly as visible. Then describe visible evidence, entities (names/orgs/locations/dates), and possible actions committed.`,
                },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${base64}` },
                },
              ],
            },
          ],
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!completion) {
      throw lastError || new Error("No compatible Groq vision model available");
    }

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const parsed = extractJsonObject(raw) || {};

    return {
      description: String(parsed.description || "Evidence uploaded and analyzed."),
      ocr_text: String(parsed.ocr_text || ""),
      entities: Array.isArray(parsed.entities) ? parsed.entities.map(String) : [],
      actions_committed: Array.isArray(parsed.actions_committed)
        ? parsed.actions_committed.map(String)
        : [],
      confidence: Number(parsed.confidence || 0),
    };
  } catch (error) {
    console.error("Evidence LLM analysis failed:", error);
    const message =
      error?.error?.error?.message ||
      error?.message ||
      "AI analysis could not be completed.";
    return {
      description: `Evidence uploaded. AI analysis could not be completed.`,
      ocr_text: `LLM_ERROR: ${String(message).slice(0, 800)}`,
      entities: [],
      actions_committed: [],
      confidence: 0,
    };
  }
}

/**
 * POST /api/complaints/submit
 *
 * Simple complaint submission - NO authentication
 * - Generates unique case ID (checks for duplicates)
 * - Stores description
 * - Calculates NLP triad score
 *
 * Body:
 * {
 *   description: string (required, min 10 chars),
 *   phone: string (required),
 *   isAnonymous?: boolean,
 *   victimName?: string,
 *   victimRole?: string,
 *   aadhaarIdentityId?: string,
 *   timeline?: Array<{date: string, description: string, place?: string | null}>
 * }
 *
 * Response:
 * {
 *   success: true,
 *   caseId: string,
 *   complaintId: string,
 *   needsFollowUp: boolean,
 *   missingFields: string[]
 * }
 */
export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let description = "";
    let phone = "";
    let isAnonymous = true;
    let victimName = null;
    let victimRole = null;
    let aadhaarIdentityId = null;
    let timeline = [];
    let evidenceFiles = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      description = String(formData.get("description") || "");
      phone = String(formData.get("phone") || "");
      isAnonymous = String(formData.get("isAnonymous") || "true") !== "false";
      victimName = formData.get("victimName") ? String(formData.get("victimName")) : null;
      victimRole = formData.get("victimRole") ? String(formData.get("victimRole")) : null;
      aadhaarIdentityId = formData.get("aadhaarIdentityId")
        ? String(formData.get("aadhaarIdentityId"))
        : null;
      timeline = safeJsonParse(String(formData.get("timeline") || "[]"), []);
      evidenceFiles = (formData.getAll("evidenceImages") || []).filter(
        (file) => file && typeof file.arrayBuffer === "function" && String(file.type || "").startsWith("image/")
      );
    } else {
      const body = await request.json();
      description = body.description;
      phone = body.phone;
      isAnonymous = body.isAnonymous ?? true;
      victimName = body.victimName ?? null;
      victimRole = body.victimRole ?? null;
      aadhaarIdentityId = body.aadhaarIdentityId ?? null;
      timeline = body.timeline ?? [];
    }

    const normalizedPhone = normalizePhone(phone);

    // Validation
    if (!description || description.trim().length < 10) {
      return NextResponse.json(
        { error: "Description must be at least 10 characters" },
        { status: 400 }
      );
    }
    
    // Validate phone for new users
    if (!normalizedPhone || normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return NextResponse.json(
        { error: "A valid phone number is required" },
        { status: 400 }
      );
    }

    if (!isAnonymous && !victimName?.trim()) {
      return NextResponse.json(
        { error: "Victim name is required for identified onboarding" },
        { status: 400 }
      );
    }

    const normalizedTimeline = Array.isArray(timeline)
      ? timeline
          .map((event) => ({
            date: String(event?.date || "").trim(),
            description: String(event?.description || "").trim(),
            place: event?.place ? String(event.place).trim() : null,
          }))
          .filter((event) => event.date && event.description)
      : [];

    // Create Supabase client
    const supabase = createSupabaseServiceRoleClient();

    // Generate unique case ID (check for duplicates)
    let caseId;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;

    while (attempts < MAX_ATTEMPTS) {
      caseId = generateCaseId();

      // Check if case ID already exists
      const { data: existing, error: checkError } = await supabase
        .from("complaints")
        .select("id")
        .eq("token", caseId)
        .maybeSingle();

      if (checkError && checkError.code !== "PGRST116") {
        console.error("Database check error:", checkError);
        return NextResponse.json(
          { error: "Failed to check case ID uniqueness" },
          { status: 500 }
        );
      }

      // If no existing case with this ID, we're good
      if (!existing) break;

      attempts++;
    }

    if (attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Failed to generate unique case ID" },
        { status: 500 }
      );
    }

    // Calculate NLP triad score
    const nlpScore = calculateNLPTriad(description);

    // Insert into complaints table
    const { data, error } = await supabase
      .from("complaints")
      .insert({
        token: caseId,
        org_id: DEMO_ORG_ID,
        description: description.trim(),
        status: "draft",
        priority_score: Math.round(nlpScore.overall * 10),
        phone_number: normalizedPhone,
        is_anonymous: Boolean(isAnonymous),
        victim_name: isAnonymous ? null : victimName?.trim() || null,
        victim_role: isAnonymous ? null : victimRole?.trim() || null,
        timeline: normalizedTimeline,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Database insert error:", error);
      return NextResponse.json(
        { error: "Failed to create complaint record" },
        { status: 500 }
      );
    }

    if (aadhaarIdentityId) {
      await supabase
        .from("aadhaar_identity")
        .update({
          complaint_id: data.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", aadhaarIdentityId);
    }

    if (evidenceFiles.length > 0) {
      const folder = path.join(process.cwd(), "public", "evidence", caseId);
      await mkdir(folder, { recursive: true });

      for (let index = 0; index < evidenceFiles.length; index++) {
        const file = evidenceFiles[index];
        const ext = extensionFromMime(file.type);
        const filename = `${Date.now()}-${index}${ext}`;
        const absolutePath = path.join(folder, filename);
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        await writeFile(absolutePath, fileBuffer);

        const publicPath = `/evidence/${caseId}/${filename}`;
        const analysis = await analyzeEvidenceWithLLM({
          fileBuffer,
          mimeType: file.type,
          complaintDescription: description,
        });

        const { error: evidenceError } = await supabase.from("evidence").insert({
          case_id: data.id,
          storage_path: publicPath,
          file_type: "screenshot",
          file_metadata: {
            filename,
            original_filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
          },
          ai_description: analysis.description,
          ai_ocr_text: analysis.ocr_text,
          ai_entities: analysis.entities,
          ai_actions: analysis.actions_committed,
        });

        if (evidenceError) {
          console.error("Evidence insert error:", evidenceError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      caseId, // JUST-XXXX
      complaintId: data.id,
      needsFollowUp: nlpScore.needsFollowUp,
      missingFields: nlpScore.missingFields,
      nlpScore: {
        temporal: nlpScore.temporal,
        location: nlpScore.location,
        specificity: nlpScore.specificity,
        overall: nlpScore.overall,
      },
    });
  } catch (error) {
    console.error("Submission error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

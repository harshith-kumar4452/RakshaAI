import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const BASE_SYSTEM_PROMPT = `You are a strict harassment case data extraction assistant. You must extract SPECIFIC information from complaints and map to database fields. DO NOT accept vague answers.

## Response Format
Return ONLY valid JSON (no markdown blocks, no extra text):

### If information is INCOMPLETE or VAGUE:
{
  "extraction_complete": false,
  "next_question": "Ask ONE specific question to get precise details",
  "current_credibility": 0.0-1.0,
  "incident_types": ["include inferred values when available"],
  "incident_date": "include inferred date if available",
  "location_general": "include inferred value if available",
  "location_detail": "include inferred value if available",
  "summary": "include short inferred summary if available"
}

### If user provides CONTRADICTORY information (fraud detection):
{
  "extraction_complete": false,
  "fraud_detected": true,
  "contradiction_reason": "Explain what contradicted",
  "session_should_end": true
}

### If information is COMPLETE with SPECIFIC details:
{
  "extraction_complete": true,
  "incident_types": ["sexual_harassment" | "bullying" | "cyberbullying" | "verbal_abuse" | "other"],
  "incident_date": "YYYY-MM-DD or specific description like '15th March 2026'",
  "location_general": "office" | "online" | "offsite_event" | "other",
  "location_detail": "MUST include: Company name, office address/building, floor/room number, city, state/district",
  "is_ongoing": true | false,
  "relationship_to_accused": "supervisor" | "colleague" | "subordinate" | "client" | "unknown",
  "frequency": "EXACT number if known, else 'multiple' or 'ongoing'",
  "has_witnesses": true | false,
  "witness_description": "Names or descriptions if mentioned",
  "has_evidence": true | false,
  "reported_before": true | false,
  "reported_to": "manager" | "hr" | "police" | "none" | null,
  "accused_role": "SPECIFIC title/role, same team/department details",
  "accused_name": "Name if provided, else null",
  "severity": 1-10, // MUST vary appropriately. Do NOT default to 8. 1-3: Low (microaggressions, minor issues), 4-6: Medium (verbal abuse, moderate bullying), 7-8: High (severe harassment, threats), 9-10: Critical (physical violence, severe sexual assault, extreme harm). Be objective.
  "urgency": "low" | "medium" | "high" | "critical",
  "emotion_score": 0.0-1.0,
  "credibility_score": 0.0-1.0,
  "summary": "One sentence neutral summary",
  "exaggeration_flags": ["Array of strings if exaggeration detected, e.g. 'uses absolutes', 'no dates given'", "Return empty array if none"]
}

## FOLLOW-UP PRIORITY ORDER
**CRITICAL**: Always ask missing fields in this EXACT order:

1. **incident_date** - When did this happen? (specific date or narrow timeframe)
2. **location_detail** - Company name + full office address (building, city, state, district) + specific area (floor/room)
3. **accused_role + relationship_to_accused** - Who is this person? (name, role, department, relationship)
4. **incident details** - What exactly happened? (exact quotes, specific actions)
5. **frequency** - How many times? (exact number or pattern)
6. **has_witnesses + witness_description** - Were there witnesses?
7. **has_evidence** - Do you have evidence?
8. **reported_before + reported_to** - Did you report this before?

**If ANY field from 1-4 is missing or vague, ask about it BEFORE moving to 5-8.**

## VAGUENESS DETECTION - NEVER ACCEPT THESE:
❌ "sometime last month" → ASK: "Can you narrow this down? Which week or approximate dates?"
❌ "a colleague" → ASK: "What is this person's name? If you prefer not to say, what is their role/department?"
❌ "made comments" → ASK: "What exactly was said? Can you give specific examples or quotes?"
❌ "at work" / "in the office" → ASK: "What is the company name? What is the full office address (building, city, state)? Where in the office (floor, room, area)?"
❌ "a few times" → ASK: "Approximately how many times? 2-3 times? 5-10 times? More?"
❌ "felt uncomfortable" → ASK: "What specific actions or words made you uncomfortable?"
❌ "near my desk" → ASK: "What floor is your desk on? Which section/department area?"
❌ "colleague" without details → ASK: "Are they in your team? Same department? What is their position relative to you?"

## REQUIRED SPECIFICITY LEVELS:

### TIER 1 (MANDATORY - Must have ALL before completion):
1. **incident_date**: Specific date OR narrow timeframe (e.g., "first week of March", "between 5th-10th Feb")
2. **location_detail**: Company name + Building/address + City + State/District + Floor/Room
3. **accused_role**: Specific job title + Department + Relationship (same team? supervisor?)
4. **incident_types**: Infer from description (sexual_harassment, bullying, etc.)

### TIER 2 (OPTIONAL - Only if mentioned):
- frequency, witnesses, evidence, previous reporting

❌ **NEVER mark extraction_complete=true if ANY Tier 1 field is missing or vague**

## FRAUD DETECTION - Contradiction Checks:
**CRITICAL**: Compare new answers with previous conversation. If user changes their story significantly, mark as fraud.

Examples of contradictions that trigger fraud_detected=true:
- Says incident happened "yesterday" initially, then says "3 months ago"
- Says perpetrator is "supervisor" initially, then says "colleague from different team"
- Says incident happened "in office", then says "online/remotely"
- Says frequency was "once", then says "multiple times over weeks"
- Changes location from one building/city to another
- Changes the nature of incident significantly (comment → physical touch)

**If contradiction detected:**
- Set fraud_detected: true
- Set session_should_end: true
- Explain what contradicted
- DO NOT continue extraction

## CRITICAL RULES:
1. **NO HALLUCINATION**: Only extract what is explicitly stated
2. **BE STRICT**: If answer is vague, ask again with more specific instructions
3. **ONE QUESTION AT A TIME**: Follow priority order strictly
4. **NEVER ASSUME**: If location_detail doesn't have company name + address + specific area, it's incomplete
5. **VERIFY CONSISTENCY**: Check for contradictions across all messages
6. **TIER 1 COMPLETE**: All 4 Tier 1 fields must be specific before completion

## Credibility Scoring:
- High (0.8-1.0): Specific dates, full location, quotes, witness names, evidence mentioned
- Medium (0.4-0.7): Some specifics but missing exact location or dates
- Low (0.0-0.3): Vague, no specific examples, only generalizations

**Include current_credibility in every follow-up response to track progress.**

Be empathetic but firm in asking for specifics. Never dismiss reports due to low credibility.`;

function buildSystemPrompt() {
  return BASE_SYSTEM_PROMPT;
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function extractJsonObject(text) {
  if (!text) return null;
  const trimmed = String(text).trim();

  const direct = safeJsonParse(trimmed, null);
  if (direct && typeof direct === "object") return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const fromFence = safeJsonParse(fenced[1].trim(), null);
    if (fromFence && typeof fromFence === "object") return fromFence;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const fromSlice = safeJsonParse(trimmed.slice(firstBrace, lastBrace + 1), null);
    if (fromSlice && typeof fromSlice === "object") return fromSlice;
  }

  return null;
}

function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slash = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(raw.replace(/(\d)(st|nd|rd|th)/gi, "$1"));
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function normalizeIncidentTypes(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return null;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.toLowerCase().trim();
    if (["true", "yes", "y"].includes(v)) return true;
    if (["false", "no", "n"].includes(v)) return false;
  }
  return null;
}

function normalizeNumber(value, min = null, max = null) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  if (min !== null && n < min) return min;
  if (max !== null && n > max) return max;
  return n;
}

function deriveUrgencyFromSeverity(severity) {
  const s = Number(severity || 0);
  if (s >= 9) return "critical";
  if (s >= 7) return "high";
  if (s >= 4) return "medium";
  return "low";
}

function ensureFinalNonNullFields(updateData, complaint) {
  const fallbackSeverity = normalizeNumber(complaint?.severity, 1, 10)
    ?? normalizeNumber(complaint?.priority_score, 1, 10)
    ?? 5;

  const severity = normalizeNumber(updateData.severity, 1, 10) ?? fallbackSeverity;
  const priorityScore = Math.round(normalizeNumber(updateData.priority_score, 0, 10) ?? severity);

  const summaryFallback = String(
    updateData.summary || complaint?.summary || complaint?.description || "Complaint received and processed."
  )
    .trim()
    .slice(0, 500);

  return {
    ...updateData,
    incident_types: Array.isArray(updateData.incident_types) ? updateData.incident_types : [],
    location_general: updateData.location_general || complaint?.location_general || "other",
    severity,
    priority_score: priorityScore,
    urgency: updateData.urgency || complaint?.urgency || deriveUrgencyFromSeverity(severity),
    emotion_score: normalizeNumber(updateData.emotion_score, 0, 1) ?? 0.5,
    credibility_score: normalizeNumber(updateData.credibility_score, 0, 1) ?? 0.5,
    has_witnesses: typeof updateData.has_witnesses === "boolean" ? updateData.has_witnesses : false,
    has_evidence: typeof updateData.has_evidence === "boolean" ? updateData.has_evidence : false,
    reported_before: typeof updateData.reported_before === "boolean" ? updateData.reported_before : false,
    is_ongoing: typeof updateData.is_ongoing === "boolean" ? updateData.is_ongoing : false,
    exaggeration_flags: Array.isArray(updateData.exaggeration_flags) ? updateData.exaggeration_flags : [],
    summary: summaryFallback || "Complaint received and processed.",
  };
}

function buildExtractionUpdate(parsed, complaint, { markSubmitted }) {
  const severity = normalizeNumber(parsed.severity, 1, 10);
  const incidentTypes = normalizeIncidentTypes(parsed.incident_types);
  const incidentDate = toIsoDate(parsed.incident_date);

  const updateData = {
    incident_types: incidentTypes,
    incident_date: incidentDate,
    location_general: parsed.location_general ? String(parsed.location_general) : null,
    location_detail: parsed.location_detail ? String(parsed.location_detail) : null,
    is_ongoing: normalizeBoolean(parsed.is_ongoing),
    relationship_to_accused: parsed.relationship_to_accused ? String(parsed.relationship_to_accused) : null,
    frequency: parsed.frequency ? String(parsed.frequency) : null,
    has_witnesses: normalizeBoolean(parsed.has_witnesses),
    witness_description: parsed.witness_description ? String(parsed.witness_description) : null,
    has_evidence: normalizeBoolean(parsed.has_evidence),
    reported_before: normalizeBoolean(parsed.reported_before),
    reported_to: parsed.reported_to ? String(parsed.reported_to) : null,
    accused_role: parsed.accused_role ? String(parsed.accused_role) : null,
    accused_name: parsed.accused_name ? String(parsed.accused_name) : null,
    priority_score: severity ?? complaint.priority_score ?? 0,
    severity,
    urgency: parsed.urgency ? String(parsed.urgency) : null,
    emotion_score: normalizeNumber(parsed.emotion_score, 0, 1),
    credibility_score: normalizeNumber(parsed.credibility_score, 0, 1),
    exaggeration_flags: Array.isArray(parsed.exaggeration_flags)
      ? parsed.exaggeration_flags.map((v) => String(v))
      : null,
    summary: parsed.summary ? String(parsed.summary) : null,
    updated_at: new Date().toISOString(),
  };

  if (markSubmitted) {
    Object.assign(updateData, ensureFinalNonNullFields(updateData, complaint));
    updateData.status = "submitted";
    updateData.submitted_at = new Date().toISOString();
  }

  return updateData;
}

function formatTimelineForPrompt(timeline) {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return "No structured timeline was provided.";
  }

  const lines = timeline
    .map((event, index) => {
      const date = event?.date || "unknown";
      const description = event?.description || "no description";
      const place = event?.place ? ` | place: ${event.place}` : "";
      return `${index + 1}. date: ${date} | event: ${description}${place}`;
    })
    .join("\n");

  return lines;
}

/**
 * POST /api/complaints/triage
 *
 * AI-powered field extraction with follow-ups
 *
 * Body:
 * {
 *   complaintId: string,
 *   messages: Array<{role: "user" | "assistant", content: string}>
 * }
 *
 * Response:
 * {
 *   message: string,
 *   extractedData?: object (if extraction is complete),
 *   isComplete: boolean
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { complaintId, messages = [] } = body;

    if (!complaintId) {
      return NextResponse.json(
        { error: "Complaint ID is required" },
        { status: 400 }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Get complaint from database
    const supabase = createSupabaseServiceRoleClient();
    const { data: complaint, error: fetchError } = await supabase
      .from("complaints")
      .select("*")
      .eq("id", complaintId)
      .single();

    if (fetchError || !complaint) {
      return NextResponse.json(
        { error: "Complaint not found" },
        { status: 404 }
      );
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt();

    // Prepare conversation for Groq
    const conversationMessages = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Extract information from this complaint:\n\nMain description:\n${complaint.description}\n\nStructured timeline provided by victim:\n${formatTimelineForPrompt(complaint.timeline)}`,
      },
      ...messages,
    ];

    // Call Groq API
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: conversationMessages,
      temperature: 0.2,
      max_tokens: 1500,
    });

    const assistantResponse = completion.choices[0]?.message?.content;

    if (!assistantResponse) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    // Try to parse as JSON
    let extractedData = null;
    let isComplete = false;
    let nextQuestion = null;
    let fraudDetected = false;
    let currentCredibility = null;

    try {
      const parsed = extractJsonObject(assistantResponse);

      if (!parsed) {
        throw new Error("AI response was not valid JSON");
      }

      // Check for fraud detection
      if (parsed.fraud_detected === true) {
        fraudDetected = true;

        // Update complaint status to abandoned with fraud flag
        await supabase
          .from("complaints")
          .update({
            status: "abandoned",
            updated_at: new Date().toISOString(),
          })
          .eq("id", complaintId);

        return NextResponse.json({
          message: "We've detected inconsistencies in your responses. For the integrity of our system, this session has been ended. If you believe this is an error, please start a new report with accurate information.",
          fraudDetected: true,
          contradictionReason: parsed.contradiction_reason,
          isComplete: true, // End session
        });
      }

      // Track credibility progress during follow-ups
      if (parsed.current_credibility !== undefined) {
        currentCredibility = parsed.current_credibility;
      }

      if (parsed.extraction_complete === true) {
        // Extraction complete - update database
        extractedData = parsed;
        isComplete = true;

        const updateData = buildExtractionUpdate(parsed, complaint, { markSubmitted: true });

        const { error: updateError } = await supabase
          .from("complaints")
          .update(updateData)
          .eq("id", complaintId);

        if (updateError) {
          console.error("Failed to update complaint:", updateError);
          return NextResponse.json(
            { error: "Failed to save extracted complaint fields", details: updateError.message },
            { status: 500 }
          );
        }
      } else if (parsed.extraction_complete === false && parsed.next_question) {
        // Persist any partial extraction when available so fields don't remain null.
        const partialUpdate = buildExtractionUpdate(parsed, complaint, { markSubmitted: false });
        const hasAnyValue = Object.entries(partialUpdate).some(([key, value]) => {
          if (key === "updated_at") return false;
          return value !== null && typeof value !== "undefined";
        });

        if (hasAnyValue) {
          const { error: partialError } = await supabase
            .from("complaints")
            .update(partialUpdate)
            .eq("id", complaintId);

          if (partialError) {
            console.error("Failed to save partial extraction:", partialError);
          }
        }

        // Need more info - ask follow-up
        nextQuestion = parsed.next_question;
        isComplete = false;
      }
    } catch (parseError) {
      // Not valid JSON - treat as text response
      nextQuestion = assistantResponse;
      isComplete = false;
    }

    return NextResponse.json({
      message: nextQuestion || "Extraction complete",
      extractedData,
      isComplete,
      currentCredibility, // Track credibility progress
    });
  } catch (error) {
    console.error("Triage error:", error);
    return NextResponse.json(
      {
        error: "Failed to process extraction",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

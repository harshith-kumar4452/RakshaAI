import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clampRounds(value) {
  const n = Number(value || 3);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(6, Math.round(n)));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonObject(text) {
  const direct = safeJsonParse(text);
  if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;

  const fenced = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = safeJsonParse(fenced[1].trim());
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  }

  const first = String(text || "").indexOf("{");
  const last = String(text || "").lastIndexOf("}");
  if (first >= 0 && last > first) {
    const parsed = safeJsonParse(String(text).slice(first, last + 1));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  }

  return null;
}

function resolvePriorityLabel({ explicitPriority, urgencyScore, casePriorityScore }) {
  if (explicitPriority) return String(explicitPriority).toLowerCase();
  if (Number(casePriorityScore || 0) >= 8) return "high";
  if (Number(casePriorityScore || 0) >= 5) return "medium";
  if (Number(urgencyScore || 0) >= 0.85) return "critical";
  if (Number(urgencyScore || 0) >= 0.65) return "high";
  if (Number(urgencyScore || 0) >= 0.4) return "medium";
  return "low";
}

function buildRoutingHierarchy({ actCode, priorityLabel, routingConfig }) {
  const levels = Array.isArray(routingConfig?.config?.levels) ? routingConfig.config.levels : [];
  const selected = levels.find((row) => String(row.priority || "").toLowerCase() === String(priorityLabel || "").toLowerCase()) || levels[0] || null;

  return {
    act_code: actCode,
    priority_label: priorityLabel,
    recommended_level: selected?.level || null,
    current_authority: selected?.authority || null,
    escalate_to: selected?.escalate_to || null,
    expected_days: selected?.days ?? null,
    hierarchy_path: levels.map((row) => ({
      level: row.level,
      priority: row.priority,
      authority: row.authority,
      escalate_to: row.escalate_to,
      days: row.days,
    })),
  };
}

function buildFallbackDebate({ question, triadRun, routingHierarchy, roundCount = 3, priorMemory = [] }) {
  const rag = triadRun?.rag_result || {};
  const route = rag?.routing || {};
  const timeline = triadRun?.timeline_result || {};
  const sentimental = triadRun?.sentimental_result || {};
  const deep = triadRun?.deep_research_result || {};

  const turnTemplate = {
    rag: {
      message: "From a legal-fit perspective, available evidence supports formal routing without delay.",
      reasoning_point: "legal_alignment",
    },
    timeline: {
      message: "Incident progression suggests increasing risk, so action should not be deferred.",
      reasoning_point: "pattern_escalation",
    },
    sentimental: {
      message: "Distress and urgency indicators support immediate safety communication and monitored follow-through.",
      reasoning_point: "human_safety_priority",
    },
    deep_research: {
      message: "Background cues support heightened supervision, while keeping conclusions evidence-bound.",
      reasoning_point: "risk_context",
    },
  };

  const turns = [];
  for (let round = 1; round <= roundCount; round += 1) {
    ["rag", "timeline", "sentimental", "deep_research"].forEach((speaker) => {
      turns.push({
        speaker,
        round,
        message: turnTemplate[speaker].message,
        reasoning_point: turnTemplate[speaker].reasoning_point,
      });
    });
  }

  const conclusion = {
    hr_question: question,
    answer_summary:
      "Council consensus: proceed with formal routing, immediate safety safeguards, and a documented inquiry path with clear ownership. The recommended department hierarchy is based on configured act routing levels.",
    route_advice: {
      authority: routingHierarchy?.current_authority || route.suggested_authority || "Police Complaint",
      act_code: routingHierarchy?.act_code || route.act_code || "BNS",
      escalation: routingHierarchy?.escalate_to || route.suggested_escalation || "Legal Cell",
    },
    routing_hierarchy: routingHierarchy,
    combined_conclusion:
      `Triad and Nyaya are aligned on routing. Current level points to ${routingHierarchy?.current_authority || "the recommended authority"}${routingHierarchy?.escalate_to ? ` with escalation to ${routingHierarchy.escalate_to}` : ""} in ${routingHierarchy?.expected_days ?? "configured"} day(s).`,
    risk_posture: timeline?.risk_projection?.risk_level || "medium",
    immediate_actions: [
      "Acknowledge complainant concerns with a clear action timeline.",
      "Secure chronology, evidence, and witness order in one working brief.",
      "Start formal review and monitor safety signals daily until stabilization.",
    ],
    confidence_score: Number(
      Math.max(0.45, Math.min(0.9, Number(sentimental?.metrics?.confidence_score || 0.65))).toFixed(2)
    ),
    supporting_notes: {
      matched_profiles: Array.isArray(deep?.matched_persons) ? deep.matched_persons.length : 0,
      inconsistency_count: Array.isArray(timeline?.inconsistencies) ? timeline.inconsistencies.length : 0,
      memory_used: Array.isArray(priorMemory) ? priorMemory.length : 0,
    },
  };

  return { turns, conclusion };
}

async function generateCouncilDebate({ groq, question, caseRow, triadRun, routingHierarchy, roundCount = 3, priorMemory = [] }) {
  if (!groq) return buildFallbackDebate({ question, triadRun, routingHierarchy, roundCount, priorMemory });

  const context = {
    case_token: caseRow?.token || caseRow?.id,
    question,
    rag: triadRun?.rag_result || {},
    timeline: triadRun?.timeline_result || {},
    sentimental: triadRun?.sentimental_result || {},
    deep_research: triadRun?.deep_research_result || {},
  };

  const prompt = [
    "You are moderating a 4-agent HR council: rag, timeline, sentimental, deep_research.",
    "HR admin has asked a question. The bots should discuss and conclude by themselves.",
    "CRITICAL: If information is unknown or unsupported by provided context, explicitly state 'insufficient evidence available' and do not invent facts.",
    "Return strict JSON object with keys:",
    `turns (array of exactly ${roundCount * 4} entries), final_conclusion_json (object).`,
    `For each turn include: speaker (rag|timeline|sentimental|deep_research), round (1..${roundCount}), message, reasoning_point.`,
    "Keep language professional, warm, plain-English, and moderately detailed.",
    "Do not over-technicalize.",
    "final_conclusion_json must include: hr_question, answer_summary, route_advice(object), routing_hierarchy(object), combined_conclusion(string), risk_posture, immediate_actions(array max 6), confidence_score(0-1), supporting_notes(object).",
    "Answer the key question: which department hierarchy should handle this, based on act routing configuration.",
    "Context:",
    JSON.stringify({ ...context, routing_hierarchy: routingHierarchy, prior_memory: priorMemory, round_count: roundCount }).slice(0, 17000),
  ].join("\n");

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
    temperature: 0.25,
    max_tokens: 1200,
    messages: [
      { role: "system", content: "Return valid JSON only." },
      { role: "user", content: prompt },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(raw);

  if (!parsed || typeof parsed !== "object") {
      return buildFallbackDebate({ question, triadRun, routingHierarchy, roundCount, priorMemory });
  }

  const allowedSpeakers = new Set(["rag", "timeline", "sentimental", "deep_research"]);

  const targetTurns = roundCount * 4;

  const turns = Array.isArray(parsed.turns)
    ? parsed.turns
        .slice(0, targetTurns)
        .map((turn) => ({
          speaker: allowedSpeakers.has(String(turn?.speaker || "")) ? String(turn.speaker) : "rag",
          round: Number(turn?.round || 1),
          message: normalizeText(turn?.message) || "No contribution generated.",
          reasoning_point: normalizeText(turn?.reasoning_point) || "general_reasoning",
        }))
    : [];

  if (turns.length < 4) {
    return buildFallbackDebate({ question, triadRun, routingHierarchy, roundCount, priorMemory });
  }

  const fallback = buildFallbackDebate({ question, triadRun, routingHierarchy, roundCount, priorMemory }).conclusion;
  const conclusion = {
    ...fallback,
    ...(parsed.final_conclusion_json && typeof parsed.final_conclusion_json === "object"
      ? parsed.final_conclusion_json
      : {}),
  };

  return {
    turns,
    conclusion: {
      hr_question: normalizeText(conclusion.hr_question) || question,
      answer_summary: normalizeText(conclusion.answer_summary) || fallback.answer_summary,
      route_advice:
        conclusion.route_advice && typeof conclusion.route_advice === "object"
          ? conclusion.route_advice
          : fallback.route_advice,
      routing_hierarchy:
        conclusion.routing_hierarchy && typeof conclusion.routing_hierarchy === "object"
          ? conclusion.routing_hierarchy
          : fallback.routing_hierarchy,
      combined_conclusion: normalizeText(conclusion.combined_conclusion) || fallback.combined_conclusion,
      risk_posture: normalizeText(conclusion.risk_posture) || fallback.risk_posture,
      immediate_actions: Array.isArray(conclusion.immediate_actions)
        ? conclusion.immediate_actions.map((x) => normalizeText(x)).filter(Boolean).slice(0, 6)
        : fallback.immediate_actions,
      confidence_score: Number(Math.max(0, Math.min(1, Number(conclusion.confidence_score || fallback.confidence_score))).toFixed(2)),
      supporting_notes:
        conclusion.supporting_notes && typeof conclusion.supporting_notes === "object"
          ? conclusion.supporting_notes
          : fallback.supporting_notes,
    },
  };
}

function buildCameraScriptFromTurns(turns = []) {
  return turns.map((turn, idx) => ({
    agent: turn.speaker,
    phase: `round_${turn.round || 1}`,
    round_title: `Round ${turn.round || 1}`,
    objective: "Council discussion",
    title: `Turn ${idx + 1}`,
    content: turn.message,
    bubble: turn.message,
    json_patch: {
      path: `hr_council.round_${turn.round || 1}.turn_${idx + 1}`,
      value: {
        speaker: turn.speaker,
        reasoning_point: turn.reasoning_point,
        message: turn.message,
      },
    },
  }));
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const caseId = String(body?.case_id || "").trim();
    const question = normalizeText(body?.question || "");
    const roundCount = clampRounds(body?.rounds);
    const parentSessionId = String(body?.session_id || "").trim();

    if (!caseId) {
      return NextResponse.json({ error: "case_id is required" }, { status: 400 });
    }

    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

    let priorMemory = [];
    if (parentSessionId) {
      const { data: parentSession } = await supabase
        .from("nyaya_council_sessions")
        .select("id, chat_json, conclusion_json")
        .eq("id", parentSessionId)
        .eq("case_id", caseId)
        .maybeSingle();

      const parentTurns = Array.isArray(parentSession?.chat_json?.turns)
        ? parentSession.chat_json.turns.slice(-8)
        : [];

      priorMemory = parentTurns.map((turn) => ({
        speaker: turn?.speaker || "agent",
        message: normalizeText(turn?.message || ""),
      })).filter((row) => row.message).slice(-8);
    }

    const [{ data: caseRow, error: caseError }, { data: triadRows, error: triadError }] = await Promise.all([
      supabase.from("cases").select("id, token, priority_score").eq("id", caseId).maybeSingle(),
      supabase.from("triad_engine_runs").select("*").eq("case_id", caseId).order("run_version", { ascending: false }).limit(1),
    ]);

    if (caseError || !caseRow) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    if (triadError) {
      return NextResponse.json({ error: "Failed to load triad run" }, { status: 500 });
    }

    const triadRun = triadRows?.[0] || null;
    if (!triadRun) {
      return NextResponse.json({ error: "Run Triad first before council Q&A." }, { status: 409 });
    }

    const actCode = triadRun?.rag_result?.routing?.act_code || "BNS";
    const priorityLabel = resolvePriorityLabel({
      explicitPriority: triadRun?.rag_result?.routing?.priority_label,
      urgencyScore: triadRun?.sentimental_result?.metrics?.urgency_score,
      casePriorityScore: caseRow?.priority_score,
    });
    const { data: routingRows } = await supabase
      .from("act_routing_config")
      .select("act_code, config")
      .eq("act_code", actCode)
      .limit(1);
    const routingHierarchy = buildRoutingHierarchy({
      actCode,
      priorityLabel,
      routingConfig: routingRows?.[0] || null,
    });

    const debate = await generateCouncilDebate({
      groq,
      question,
      caseRow,
      triadRun,
      routingHierarchy,
      roundCount,
      priorMemory,
    });

    const cameraScript = buildCameraScriptFromTurns(debate.turns);

    let savedSessionId = null;
    try {
      const { data: sessionRow } = await supabase
        .from("nyaya_council_sessions")
        .insert({
          case_id: caseRow.id,
          case_token: caseRow.token || String(caseRow.id),
          triad_run_id: triadRun.id,
          session_mode: "hr_question",
          hr_question: question,
          findings_json: {
            rag: triadRun?.rag_result || {},
            timeline: triadRun?.timeline_result || {},
            sentimental: triadRun?.sentimental_result || {},
            deep_research: triadRun?.deep_research_result || {},
            round_count: roundCount,
            prior_memory: priorMemory,
          },
          chat_json: {
            turns: debate.turns,
            camera_script: cameraScript,
            round_count: roundCount,
            parent_session_id: parentSessionId || null,
          },
          conclusion_json: debate.conclusion,
        })
        .select("id")
        .maybeSingle();

      savedSessionId = sessionRow?.id || null;
    } catch {
      // Persistence is best-effort until SQL migration is applied.
    }

    return NextResponse.json({
      success: true,
      session_id: savedSessionId,
      parent_session_id: parentSessionId || null,
      round_count: roundCount,
      max_turns: debate.turns.length,
      turns: debate.turns,
      camera_script: cameraScript,
      memory_context: priorMemory,
      final_conclusion_json: debate.conclusion,
    });
  } catch (error) {
    return NextResponse.json({
      error: "Failed to run council chat",
      details: String(error?.message || "unknown"),
    }, { status: 500 });
  }
}

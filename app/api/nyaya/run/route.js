import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function summarizeForBubble(text, max = 120) {
  const safe = normalizeText(text);
  if (!safe) return "No material signal available.";
  return safe.length <= max ? safe : `${safe.slice(0, max - 1)}...`;
}

function stableArray(value) {
  return Array.isArray(value) ? value : [];
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

function buildDeterministicSummary(sharedDocument) {
  const route = sharedDocument?.round_1_routing?.proposed_route || {};
  const metrics = sharedDocument?.sentimental_persona?.metrics || {};

  return {
    executive_summary:
      "The council observed a consistent pattern of repeated in-person stalking and rising emotional pressure over time. Signals from legal mapping, timeline reconstruction, sentiment urgency, and background context are mutually reinforcing rather than contradictory. Based on this convergence, the case should move immediately into a formal pathway with explicit ownership, evidence preservation discipline, and monitored safety safeguards. Delays may increase harm probability and reduce investigation quality.",
    final_recommended_route: {
      act_code: route.act_code || "BNS",
      authority: route.authority || "Police Complaint",
      escalation: route.escalate_to || "Legal Cell",
      rationale:
        "Legal fit, behavioral escalation, urgency indicators, and background risk markers are aligned enough to support a prompt and structured response.",
    },
    confidence_score: Number(
      Math.max(0.45, Math.min(0.92, (Number(metrics.confidence_score || 0.6) + Number(metrics.urgency_score || 0.6)) / 2)).toFixed(2)
    ),
    next_actions: [
      "Begin formal complaint processing with a clear incident timeline and responsible case owner.",
      "Secure digital evidence and witness statements, and maintain a simple evidence log.",
      "Put immediate safety safeguards in place for the complainant and immediate environment.",
      "Assign HR-legal review to confirm routing and prepare next procedural steps.",
      "Establish a date-bound escalation checkpoint aligned to routing_config days.",
      "Share victim-facing status updates whenever assignment or escalation changes.",
    ],
    hr_admin_brief:
      "Treat this as a decision-support brief, not a final verdict. Keep human judgment central, communicate clearly with the complainant, and follow policy timelines. Assign accountability to a named officer, document all transitions, and keep the escalation path visible at every step.",
    summarizer_source: "deterministic_fallback",
  };
}

async function callExternalSummarizer({ groq, sharedDocument }) {
  if (!groq) return buildDeterministicSummary(sharedDocument);

  const prompt = [
    "You are an external summarizing agent for an HR legal triage council.",
    "Return strict JSON object with keys:",
    "executive_summary (string), final_recommended_route (object), confidence_score (0-1 number), next_actions (string[] max 6), hr_admin_brief (string).",
    "Be professional, policy-safe, and human in tone.",
    "Write in plain language, avoid heavy legal jargon, and make the response substantially detailed with concrete action direction.",
    "Executive summary should be 4-6 complete sentences and include urgency, route choice, and operational accountability.",
    "Council document:",
    JSON.stringify(sharedDocument).slice(0, 18000),
  ].join("\n");

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: "system", content: "Return valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = (() => {
      try {
        return JSON.parse(raw);
      } catch {
        const m = raw.match(/\{[\s\S]*\}/);
        if (!m) return null;
        try {
          return JSON.parse(m[0]);
        } catch {
          return null;
        }
      }
    })();

    if (!parsed || typeof parsed !== "object") {
      return buildDeterministicSummary(sharedDocument);
    }

    const fallbackRoute = sharedDocument?.route_hint || {};
    return {
      executive_summary: normalizeText(parsed.executive_summary) || "No summary generated.",
      final_recommended_route:
        parsed.final_recommended_route && typeof parsed.final_recommended_route === "object"
          ? {
              ...parsed.final_recommended_route,
              act_code: parsed.final_recommended_route.act_code || fallbackRoute.act_code || "BNS",
              authority: parsed.final_recommended_route.authority || fallbackRoute.suggested_authority || "Police Complaint",
            }
          : {
              act_code: fallbackRoute.act_code || "BNS",
              authority: fallbackRoute.suggested_authority || "Police Complaint",
            },
      confidence_score: Number(Math.max(0, Math.min(1, Number(parsed.confidence_score || 0.6))).toFixed(2)),
      next_actions: stableArray(parsed.next_actions).slice(0, 6).map((x) => normalizeText(x)).filter(Boolean),
      hr_admin_brief: normalizeText(parsed.hr_admin_brief),
      summarizer_source: "external_groq_summarizer",
    };
  } catch {
    return buildDeterministicSummary(sharedDocument);
  }
}

function buildCouncilPayload({ caseRow, triadRun, legalRows, classificationRows, routingRows, summaryCard }) {
  const rag = triadRun?.rag_result || {};
  const timeline = triadRun?.timeline_result || {};
  const sentimental = triadRun?.sentimental_result || {};
  const deep = triadRun?.deep_research_result || {};

  const route = rag?.routing || {};
  const classification = rag?.classification || {};
  const legalEvidence = stableArray(rag?.legal_evidence).slice(0, 6);

  const actCode = route.act_code || "BNS";
  const routingConfig = routingRows.find((row) => row.act_code === actCode) || null;
  const priorityLabel = resolvePriorityLabel({
    explicitPriority: route.priority_label,
    urgencyScore: sentimental?.metrics?.urgency_score,
    casePriorityScore: caseRow?.priority_score,
  });
  const routingHierarchy = buildRoutingHierarchy({ actCode, priorityLabel, routingConfig });

  const triadAgentOutputs = {
    rag: {
      role: "RAG Persona",
      key_findings: [
        `Classification: ${classification.subtype_name || "not classified"}`,
        `Suggested authority: ${route.suggested_authority || "not set"}`,
        `Act code candidate: ${actCode}`,
      ],
      legal_evidence: legalEvidence,
      routing_snapshot: route,
      db_support: {
        legal_chunk_rows: legalRows.length,
        classification_rows: classificationRows.length,
        routing_rows: routingRows.length,
      },
    },
    timeline: {
      role: "Timeline Persona",
      key_findings: [
        `Predicted sequence count: ${stableArray(timeline.predicted_sequence).length}`,
        `Inconsistencies: ${stableArray(timeline.inconsistencies).length}`,
        `Projected risk level: ${timeline?.risk_projection?.risk_level || timeline?.risk_projection?.level || "unknown"}`,
      ],
      predicted_sequence: stableArray(timeline.predicted_sequence).slice(0, 8),
      inconsistencies: stableArray(timeline.inconsistencies).slice(0, 5),
      progression: timeline.likely_progression || null,
    },
    sentimental: {
      role: "Sentimental Persona",
      key_findings: [
        `Urgency score: ${sentimental?.metrics?.urgency_score ?? "n/a"}`,
        `Distress score: ${sentimental?.metrics?.distress_score ?? "n/a"}`,
        `Confidence score: ${sentimental?.metrics?.confidence_score ?? "n/a"}`,
      ],
      metrics: sentimental.metrics || {},
      interpretation: sentimental.interpretation || "No interpretation available.",
      response_tone: sentimental.recommended_response_tone || null,
    },
    deep_research: {
      role: "Deep Research Persona",
      key_findings: [
        `Matched profiles: ${stableArray(deep.matched_persons).length}`,
        `Risk flags: ${stableArray(deep.risk_flags).join(", ") || "none"}`,
        `Strategy: ${deep.match_strategy || "not specified"}`,
      ],
      matched_persons: stableArray(deep.matched_persons).slice(0, 5),
      risk_flags: stableArray(deep.risk_flags),
      narrative_summary: deep.narrative_summary || null,
      recommended_checks: stableArray(deep.recommended_checks).slice(0, 5),
    },
  };

  const round1 = {
    objective: "Decide forwarding route using legal fit, risk urgency, and evidence strength.",
    proposed_route: {
      act_code: actCode,
      authority: route.suggested_authority || classification.default_authority || "Police Complaint",
      escalate_to: route.suggested_escalation || "Legal Cell",
      expected_days: route.expected_days ?? null,
      hierarchy: routingHierarchy,
    },
    agent_inputs: {
      rag: {
        position: "Based on the strongest legal match and supporting evidence, the case should be routed through the authority best suited for immediate action and formal processing.",
        evidence_points: triadAgentOutputs.rag.key_findings,
        confidence: "high",
      },
      timeline: {
        position: "The repeated nature of incidents and signs of escalation suggest this should not stay in low-priority handling and needs timely escalation.",
        evidence_points: triadAgentOutputs.timeline.key_findings,
        confidence: "medium_high",
      },
      sentimental: {
        position: "Distress and urgency indicators suggest the complainant needs immediate protective support while the inquiry is underway.",
        evidence_points: triadAgentOutputs.sentimental.key_findings,
        confidence: "medium",
      },
      deep_research: {
        position: "Background risk indicators raise concern and support closer monitoring, tighter supervision, and controlled communication.",
        evidence_points: triadAgentOutputs.deep_research.key_findings,
        confidence: "medium",
      },
    },
    decision: "Forward to the recommended authority now, while activating immediate safety safeguards and documenting each procedural step clearly.",
  };

  const round2 = {
    objective: "Infer what likely happened first and how the incident pattern developed.",
    probable_sequence: {
      origin_hypothesis:
        "The behavior likely began with boundary-testing interactions that were initially treated as informal, then gradually shifted into repeated unwanted contact.",
      escalation_hypothesis:
        timeline.likely_progression || "Escalation pattern inferred from chronology and reported distress signals.",
      trigger_factors: [
        "Power imbalance or role proximity may have reduced early resistance",
        "Perceived low reporting risk may have encouraged repeated behavior",
        "Delayed intervention likely allowed the pattern to harden over time",
      ],
    },
    agent_inputs: {
      rag: {
        contribution: "Connected observed behavior patterns to likely legal categories so the team can act with clearer direction.",
      },
      timeline: {
        contribution: "Reconstructed event chronology, highlighted inconsistencies, and identified periods where frequency appears to increase.",
      },
      sentimental: {
        contribution: "Explained the emotional trajectory and urgency trend to help prioritize supportive interventions.",
      },
      deep_research: {
        contribution: "Added contextual background cues that may explain recurring risk behavior and escalation potential.",
      },
    },
  };

  const round3 = {
    objective: "Concluding round: agree on professional recommendation package for HR admin.",
    final_points: {
      immediate_safety: "Activate immediate protective measures and use a controlled communication channel to reduce further harm.",
      compliance: "Document legal basis, timeline integrity, and evidence handling in a format ready for audit and review.",
      investigation: "Initiate a formal inquiry with witness scheduling, role clarity, and conflict-of-interest safeguards.",
      escalation_gate: "Escalate externally when threshold criteria are met, or immediately if imminent danger indicators appear.",
    },
    council_consensus:
      "Proceed with formal routing, maintain procedural neutrality, protect evidence quality, and keep complainant safety at the center of every next step.",
  };

  const sharedDocument = {
    council_meta: {
      case_id: caseRow.id,
      token: caseRow.token || caseRow.id,
      generated_at: new Date().toISOString(),
      triad_run_id: triadRun?.id || null,
      triad_run_version: triadRun?.run_version || null,
      knowledge_sources: [
        "triad_engine_runs",
        "legal_chunks",
        "case_classifications",
        "act_routing_config",
      ],
    },
    rag_persona: triadAgentOutputs.rag,
    timeline_persona: triadAgentOutputs.timeline,
    sentimental_persona: triadAgentOutputs.sentimental,
    deep_research_persona: triadAgentOutputs.deep_research,
    round_1_routing: round1,
    round_2_reconstruction: round2,
    round_3_conclusion: round3,
    final_conclusion: summaryCard,
    hr_admin_master_document: {
      executive_summary: summaryCard.executive_summary,
      recommended_route: summaryCard.final_recommended_route,
      routing_hierarchy: summaryCard.routing_hierarchy,
      combined_conclusion: summaryCard.combined_conclusion,
      confidence_score: summaryCard.confidence_score,
      immediate_next_actions: summaryCard.next_actions,
      operational_note: summaryCard.hr_admin_brief,
    },
  };

  const rounds = [
    {
      id: "round_1",
      title: "Routing Deliberation",
      objective: round1.objective,
      turns: [
        {
          agent: "rag",
          title: "Legal route proposal",
          content: round1.agent_inputs.rag.position,
          bubble: summarizeForBubble(`${round1.agent_inputs.rag.position} ${round1.decision}`),
          json_patch: { path: "round_1_routing.agent_inputs.rag", value: round1.agent_inputs.rag },
        },
        {
          agent: "timeline",
          title: "Escalation pressure input",
          content: round1.agent_inputs.timeline.position,
          bubble: summarizeForBubble(round1.agent_inputs.timeline.position),
          json_patch: { path: "round_1_routing.agent_inputs.timeline", value: round1.agent_inputs.timeline },
        },
        {
          agent: "sentimental",
          title: "Urgency perspective",
          content: round1.agent_inputs.sentimental.position,
          bubble: summarizeForBubble(round1.agent_inputs.sentimental.position),
          json_patch: { path: "round_1_routing.agent_inputs.sentimental", value: round1.agent_inputs.sentimental },
        },
        {
          agent: "deep_research",
          title: "Background risk perspective",
          content: round1.agent_inputs.deep_research.position,
          bubble: summarizeForBubble(round1.agent_inputs.deep_research.position),
          json_patch: { path: "round_1_routing.agent_inputs.deep_research", value: round1.agent_inputs.deep_research },
        },
      ],
      round_outcome: round1.decision,
    },
    {
      id: "round_2",
      title: "What Happened First",
      objective: round2.objective,
      turns: [
        {
          agent: "timeline",
          title: "Chronology reconstruction",
          content: round2.probable_sequence.escalation_hypothesis,
          bubble: summarizeForBubble(round2.probable_sequence.escalation_hypothesis),
          json_patch: { path: "round_2_reconstruction.probable_sequence", value: round2.probable_sequence },
        },
        {
          agent: "rag",
          title: "Legal typology mapping",
          content: round2.agent_inputs.rag.contribution,
          bubble: summarizeForBubble(round2.agent_inputs.rag.contribution),
          json_patch: { path: "round_2_reconstruction.agent_inputs.rag", value: round2.agent_inputs.rag },
        },
        {
          agent: "sentimental",
          title: "Behavioral pressure reading",
          content: round2.agent_inputs.sentimental.contribution,
          bubble: summarizeForBubble(round2.agent_inputs.sentimental.contribution),
          json_patch: { path: "round_2_reconstruction.agent_inputs.sentimental", value: round2.agent_inputs.sentimental },
        },
        {
          agent: "deep_research",
          title: "Actor context correlation",
          content: round2.agent_inputs.deep_research.contribution,
          bubble: summarizeForBubble(round2.agent_inputs.deep_research.contribution),
          json_patch: { path: "round_2_reconstruction.agent_inputs.deep_research", value: round2.agent_inputs.deep_research },
        },
      ],
      round_outcome: "Likely progressive pattern with early warning signs that were not interrupted.",
    },
    {
      id: "round_3",
      title: "Concluding Round",
      objective: round3.objective,
      turns: [
        {
          agent: "rag",
          title: "Compliance anchor",
          content: round3.final_points.compliance,
          bubble: summarizeForBubble(round3.final_points.compliance),
          json_patch: { path: "round_3_conclusion.final_points.compliance", value: round3.final_points.compliance },
        },
        {
          agent: "timeline",
          title: "Investigation readiness",
          content: round3.final_points.investigation,
          bubble: summarizeForBubble(round3.final_points.investigation),
          json_patch: { path: "round_3_conclusion.final_points.investigation", value: round3.final_points.investigation },
        },
        {
          agent: "sentimental",
          title: "Safety priority",
          content: round3.final_points.immediate_safety,
          bubble: summarizeForBubble(round3.final_points.immediate_safety),
          json_patch: { path: "round_3_conclusion.final_points.immediate_safety", value: round3.final_points.immediate_safety },
        },
        {
          agent: "deep_research",
          title: "Escalation gate",
          content: round3.final_points.escalation_gate,
          bubble: summarizeForBubble(round3.final_points.escalation_gate),
          json_patch: { path: "round_3_conclusion.final_points.escalation_gate", value: round3.final_points.escalation_gate },
        },
      ],
      round_outcome: round3.council_consensus,
    },
  ];

  const openingTurns = ["rag", "timeline", "sentimental", "deep_research"].map((agent) => ({
    agent,
    phase: "triad_outputs",
    title: `${triadAgentOutputs[agent].role} output loaded`,
    content: triadAgentOutputs[agent].key_findings.join(" | "),
    bubble: summarizeForBubble(triadAgentOutputs[agent].key_findings.join(". ")),
    json_patch: { path: `${agent}_persona`, value: triadAgentOutputs[agent] },
  }));

  const cameraScript = [
    ...openingTurns,
    ...rounds.flatMap((round) =>
      round.turns.map((turn) => ({
        ...turn,
        phase: round.id,
        round_title: round.title,
        objective: round.objective,
      }))
    ),
    {
      agent: "rag",
      phase: "final_summary",
      title: "External summarizer conclusion",
      content: summaryCard.executive_summary,
      bubble: summarizeForBubble(summaryCard.executive_summary),
      json_patch: { path: "final_conclusion", value: summaryCard },
    },
  ];

  return {
    case_id: caseRow.id,
    token: caseRow.token || caseRow.id,
    triad_run_id: triadRun?.id || null,
    triad_run_version: triadRun?.run_version || null,
    triad_agent_outputs: triadAgentOutputs,
    rounds,
    camera_script: cameraScript,
    shared_document_template: {
      council_meta: sharedDocument.council_meta,
      rag_persona: {},
      timeline_persona: {},
      sentimental_persona: {},
      deep_research_persona: {},
      round_1_routing: { objective: round1.objective, agent_inputs: {} },
      round_2_reconstruction: { objective: round2.objective, agent_inputs: {} },
      round_3_conclusion: { objective: round3.objective, final_points: {} },
      final_conclusion: {},
      hr_admin_master_document: {},
    },
    shared_document: sharedDocument,
    summary_card: {
      title: "Council Final Recommendation",
      executive_summary: summaryCard.executive_summary,
      recommended_route: summaryCard.final_recommended_route,
      routing_hierarchy: routingHierarchy,
      combined_conclusion:
        `Triad legal fit points to ${actCode} with priority ${priorityLabel}. Nyaya deliberation supports routing to ${routingHierarchy.current_authority || summaryCard.final_recommended_route?.authority || "the recommended authority"}${routingHierarchy.escalate_to ? `, with escalation to ${routingHierarchy.escalate_to}` : ""}. Timeline reconstruction indicates pattern continuity and progression risk, while sentiment metrics indicate active distress and urgency that should not remain in passive monitoring. Deep research signals also justify closer supervision and strict documentation. Operationally, the case should be assigned immediately, evidence handling should remain auditable, and escalation checkpointing should follow the ${routingHierarchy.expected_days ?? "configured"}-day window.`,
      confidence_score: summaryCard.confidence_score,
      next_actions: summaryCard.next_actions,
      summarizer_source: summaryCard.summarizer_source,
    },
  };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const caseId = String(body?.case_id || "").trim();
    const requestedTriadRunId = body?.triad_run_id ? String(body.triad_run_id).trim() : null;

    if (!caseId) {
      return NextResponse.json({ error: "case_id is required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

    const [{ data: caseRow, error: caseError }, runQueryRes] = await Promise.all([
      supabase.from("cases").select("id, token, description, summary, accused_name").eq("id", caseId).maybeSingle(),
      requestedTriadRunId
        ? supabase
            .from("triad_engine_runs")
            .select("*")
            .eq("id", requestedTriadRunId)
            .eq("case_id", caseId)
            .maybeSingle()
        : supabase
            .from("triad_engine_runs")
            .select("*")
            .eq("case_id", caseId)
            .order("run_version", { ascending: false })
            .limit(1),
    ]);

    if (caseError || !caseRow) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    if (runQueryRes?.error) {
      return NextResponse.json({ error: "Failed to read triad runs" }, { status: 500 });
    }

    const triadRun = requestedTriadRunId
      ? (runQueryRes?.data || null)
      : (runQueryRes?.data?.[0] || null);
    if (!triadRun) {
      return NextResponse.json({
        error: "No triad run found. Please run Triad Engine first.",
      }, { status: 409 });
    }

    const routeActCode = triadRun?.rag_result?.routing?.act_code || "BNS";
    const evidenceActs = stableArray(triadRun?.rag_result?.legal_evidence)
      .map((e) => normalizeText(e?.act_name))
      .filter(Boolean)
      .slice(0, 8);

    const legalQuery = supabase
      .from("legal_chunks")
      .select("id, act_name, section_num, section_title, chunk_text")
      .limit(60);

    const legalScopedQuery = evidenceActs.length ? legalQuery.in("act_name", evidenceActs) : legalQuery;

    const [{ data: legalRows }, { data: classificationRows }, { data: routingRows }] = await Promise.all([
      legalScopedQuery,
      supabase
        .from("case_classifications")
        .select("type_code, type_name, subtype_code, subtype_name, description, applicable_acts, default_authority")
        .limit(120),
      supabase.from("act_routing_config").select("act_code, config").in("act_code", [routeActCode, "BNS", "IT", "POCSO", "POSH"]),
    ]);

    const sharedTemplate = {
      case_id: caseRow.id,
      token: caseRow.token || caseRow.id,
      route_hint: triadRun?.rag_result?.routing || {},
      triad_metrics: triadRun?.sentimental_result?.metrics || {},
      legal_signal_count: stableArray(legalRows).length,
      classification_signal_count: stableArray(classificationRows).length,
    };

    const summaryCard = await callExternalSummarizer({
      groq,
      sharedDocument: sharedTemplate,
    });

    const payload = buildCouncilPayload({
      caseRow,
      triadRun,
      legalRows: stableArray(legalRows),
      classificationRows: stableArray(classificationRows),
      routingRows: stableArray(routingRows),
      summaryCard,
    });

    try {
      await supabase
        .from("nyaya_council_sessions")
        .insert({
          case_id: caseRow.id,
          case_token: caseRow.token || String(caseRow.id),
          triad_run_id: triadRun.id,
          session_mode: "auto_council",
          hr_question: null,
          findings_json: {
            triad_agent_outputs: payload.triad_agent_outputs,
            rounds: payload.rounds,
          },
          chat_json: {
            camera_script: payload.camera_script,
          },
          conclusion_json: payload.summary_card,
        });
    } catch {
      // Best-effort persistence; route still succeeds if migration is not applied yet.
    }

    return NextResponse.json({ success: true, report: payload });
  } catch (error) {
    return NextResponse.json({
      error: "Failed to run Nyaya council",
      details: String(error?.message || "unknown"),
    }, { status: 500 });
  }
}

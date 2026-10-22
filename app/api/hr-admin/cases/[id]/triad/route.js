import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

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
    return safeJsonParse(trimmed.slice(firstBrace, lastBrace + 1), null);
  }

  return null;
}

function extractJsonArray(text) {
  if (!text) return null;
  const trimmed = String(text).trim();

  const direct = safeJsonParse(trimmed, null);
  if (Array.isArray(direct)) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const fromFence = safeJsonParse(fenced[1].trim(), null);
    if (Array.isArray(fromFence)) return fromFence;
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const fromSlice = safeJsonParse(trimmed.slice(firstBracket, lastBracket + 1), null);
    if (Array.isArray(fromSlice)) return fromSlice;
  }

  return null;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePersonName(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectKeywords(text, max = 30) {
  const stopwords = new Set([
    "the", "and", "for", "that", "with", "this", "from", "have", "were", "was", "are",
    "about", "there", "their", "what", "when", "where", "which", "who", "whom", "would",
    "could", "should", "been", "being", "they", "them", "into", "after", "before", "during",
    "because", "while", "your", "you", "his", "her", "she", "him", "our", "has", "had", "did",
  ]);

  const words = normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((word) => word.length >= 4 && !stopwords.has(word));

  const unique = [];
  const seen = new Set();
  for (const word of words) {
    if (seen.has(word)) continue;
    seen.add(word);
    unique.push(word);
    if (unique.length >= max) break;
  }

  return unique;
}

function computeSentimentMetrics(text, contextFacts = {}) {
  const safe = normalizeText(text).toLowerCase();
  if (!safe) {
    return {
      distress_score: 0,
      anger_score: 0,
      fear_score: 0,
      confidence_score: 0,
      urgency_score: 0,
    };
  }

  const distressLexicon = ["afraid", "scared", "cry", "panic", "unsafe", "anxious", "threat", "trauma", "fear", "shaking"];
  const angerLexicon = ["angry", "rage", "furious", "insult", "abuse", "humiliate", "harass", "bullied", "shout", "threaten"];
  const confidenceLexicon = ["date", "time", "floor", "room", "witness", "screenshot", "email", "message", "proof", "record"];

  const tokens = safe.split(/[^a-z0-9_]+/).filter(Boolean);
  const tokenCount = Math.max(tokens.length, 1);

  const countHits = (lexicon) => lexicon.reduce((sum, term) => sum + (safe.includes(term) ? 1 : 0), 0);

  const distress = Math.min(1, countHits(distressLexicon) / 4);
  const anger = Math.min(1, countHits(angerLexicon) / 4);
  const lexicalConfidence = Math.min(1, countHits(confidenceLexicon) / 4);
  const factualSignals = [
    Number(contextFacts.hasAccusedName ? 1 : 0),
    Number((contextFacts.timelineCount || 0) > 0),
    Number((contextFacts.evidenceCount || 0) > 0),
    Number((contextFacts.dateCount || 0) > 0),
    Number((contextFacts.locationHintCount || 0) > 0),
  ].reduce((a, b) => a + b, 0);
  const structuralConfidence = Math.min(
    1,
    (factualSignals / 5) * 0.85 + ((contextFacts.wordCount || 0) > 80 ? 0.15 : 0)
  );
  const confidence = Math.max(lexicalConfidence, structuralConfidence);
  const urgency = Math.min(1, (distress * 0.6) + (anger * 0.4));
  const fear = Math.min(1, (distress * 0.75) + (safe.includes("threat") ? 0.25 : 0));

  return {
    distress_score: Number(distress.toFixed(2)),
    anger_score: Number(anger.toFixed(2)),
    fear_score: Number(fear.toFixed(2)),
    confidence_score: Number(confidence.toFixed(2)),
    urgency_score: Number(urgency.toFixed(2)),
    token_count: tokenCount,
  };
}

function extractTimelineEventsFromText(text) {
  const safe = String(text || "");
  const lines = safe.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const events = [];

  const dateRegex = /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;

  for (const line of lines) {
    const match = line.match(dateRegex);
    if (match) {
      events.push({ date_hint: match[1], event: line.slice(0, 220) });
    }
  }

  return events.slice(0, 10);
}

function summarizePerson(person) {
  if (!person) return null;
  return {
    id: person.id,
    name: [person.first_name, person.middle_name, person.last_name].filter(Boolean).join(" "),
    age: person.age,
    gender: person.gender,
    occupation: person.occupation,
    department: person.department,
    location: person.occupation_location,
    home_city: person.home_city,
    home_state: person.home_state,
    has_criminal_record: person.has_criminal_record,
    criminal_record_type: person.criminal_record_type,
    criminal_record_year: person.criminal_record_year,
    number_of_cases: person.number_of_cases,
    criminal_description: person.criminal_description,
  };
}

function extractLocationHints(text) {
  const hay = normalizeText(text).toLowerCase();
  const hints = new Set();

  const commonPlaces = [
    "kota", "rajasthan", "delhi", "mumbai", "pune", "hyderabad", "bengaluru", "chennai", "kolkata", "cuttack", "ludhiana",
  ];

  commonPlaces.forEach((place) => {
    if (hay.includes(place)) hints.add(place);
  });

  return hints;
}

function scorePersonByContext(person, locationHints) {
  let score = 0;
  const fields = [
    String(person.occupation_location || "").toLowerCase(),
    String(person.home_city || "").toLowerCase(),
    String(person.home_state || "").toLowerCase(),
  ];

  for (const hint of locationHints) {
    if (fields.some((field) => field.includes(hint))) {
      score += 3;
    }
  }

  if (person.has_criminal_record) score += 1;
  score += Math.min(2, Number(person.number_of_cases || 0));

  return score;
}

function defaultQuestions(description) {
  const seed = normalizeText(description);
  if (!seed) {
    return [
      "What exactly happened during the incident?",
      "When did the key events happen?",
      "Where did each event happen?",
      "Who was present or witnessed the incident?",
      "What digital or physical evidence is available?",
      "What immediate harm or risk is currently present?",
    ];
  }

  return [
    "What is the exact sequence of events in this complaint?",
    "Which actions by the accused are explicitly described?",
    "What legal provisions could apply to these described actions?",
    "What corroborating evidence exists in screenshots, OCR, or timeline entries?",
    "Which case classification subtype is the closest fit?",
    "Which authority should review next as a recommendation?",
  ];
}

function hasCyberSignals(text) {
  const hay = normalizeText(text).toLowerCase();
  const cyberTerms = [
    "whatsapp", "instagram", "facebook", "telegram", "email", "sms", "screenshot", "fake account",
    "dox", "doxing", "leak", "upload", "post", "dm", "online", "cyber", "website", "app",
  ];
  return cyberTerms.some((term) => hay.includes(term));
}

function hasMinorSignals(text) {
  const hay = normalizeText(text).toLowerCase();
  const directSignals = [
    "minor", "child", "under 18", "underage", "school student", "pocso", "juvenile",
    "class 8", "class 9", "class 10", "class 11", "class 12",
  ];
  if (directSignals.some((term) => hay.includes(term))) return true;

  // Capture patterns like "14-year-old", "17 year old"
  const ageMatch = hay.match(/\b(\d{1,2})\s*[- ]?year\s*[- ]?old\b/);
  if (ageMatch) {
    const age = Number(ageMatch[1]);
    if (!Number.isNaN(age) && age < 18) return true;
  }

  return false;
}

function getContextSignals(caseContext) {
  const text = normalizeText(caseContext.combinedText).toLowerCase();

  const stalkingTerms = ["stalk", "follow", "followed", "chased", "waiting near", "repeated unwanted", "obsessive contact"];
  const physicalTerms = ["near", "campus", "college", "road", "public place", "approached", "walked", "in person"];

  return {
    cyber: hasCyberSignals(caseContext.combinedText),
    minor: hasMinorSignals(caseContext.combinedText),
    stalking: stalkingTerms.some((term) => text.includes(term)),
    physical: physicalTerms.some((term) => text.includes(term)),
  };
}

function scoreLegalChunks(rows, keywords, contextText) {
  const context = normalizeText(contextText).toLowerCase();
  const cyberContext = hasCyberSignals(contextText);
  const minorContext = hasMinorSignals(contextText);

  return (rows || []).map((row) => {
    const hay = normalizeText(`${row.act_name || ""} ${row.section_title || ""} ${row.chunk_text || ""}`).toLowerCase();

    const overlap = keywords.reduce((score, kw) => score + (hay.includes(kw) ? 1 : 0), 0);

    let phraseBonus = 0;
    if (context.includes("stalk") && hay.includes("stalk")) phraseBonus += 3;
    if (context.includes("follow") && hay.includes("follow")) phraseBonus += 2;
    if (context.includes("harass") && hay.includes("harass")) phraseBonus += 2;
    if (context.includes("public place") && hay.includes("public")) phraseBonus += 1;

    const isCyberChunk = ["it", "cyber"].some((term) => String(row.act_name || "").toLowerCase().includes(term));
    const cyberPenalty = !cyberContext && isCyberChunk ? 2 : 0;
    const isPocsoChunk = String(row.act_name || "").toLowerCase().includes("pocso");
    const pocsoPenalty = !minorContext && isPocsoChunk ? 8 : 0;

    return {
      ...row,
      score: overlap + phraseBonus - cyberPenalty - pocsoPenalty,
    };
  }).sort((a, b) => b.score - a.score);
}

function parseEmbeddingVector(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.map((v) => Number(v));

  const text = String(raw).trim();
  if (!text.startsWith("[") || !text.endsWith("]")) return null;

  const values = text
    .slice(1, -1)
    .split(",")
    .map((v) => Number(v.trim()));

  if (!values.length || values.some((v) => Number.isNaN(v))) return null;
  return values;
}

function meanEmbeddingFromRows(rows, maxRows = 8) {
  const vectors = (rows || [])
    .slice(0, maxRows)
    .map((row) => parseEmbeddingVector(row.embedding))
    .filter((vec) => Array.isArray(vec) && vec.length > 0);

  if (!vectors.length) return null;

  const dim = vectors[0].length;
  if (!vectors.every((vec) => vec.length === dim)) return null;

  const sum = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      sum[i] += vec[i];
    }
  }

  return sum.map((value) => Number((value / vectors.length).toFixed(8)));
}

async function fetchVectorMatches({ supabase, queryEmbedding, matchCount = 10 }) {
  if (!queryEmbedding) return [];

  try {
    const { data, error } = await supabase.rpc("match_legal_sections", {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_count: matchCount,
    });

    if (error) return [];

    return (data || []).map((row, index) => ({
      id: `vector-${index}-${String(row.act_name || "na")}-${String(row.section_no || "na")}`,
      act_name: row.act_name,
      section_num: row.section_no || null,
      section_title: row.section_title,
      chunk_text: row.chunk_text,
      vector_similarity: Number(row.similarity || 0),
      score: Number(((row.similarity || 0) * 12).toFixed(4)),
      source: "vector",
    }));
  } catch {
    return [];
  }
}

function buildHybridCandidates(lexicalRows, vectorRows) {
  const byKey = new Map();

  const ingest = (row, source) => {
    const key = [
      String(row.act_name || ""),
      String(row.section_num || row.section_no || ""),
      String(row.section_title || "").slice(0, 80),
    ].join("|");

    if (!byKey.has(key)) {
      byKey.set(key, {
        ...row,
        id: row.id || key,
        section_num: row.section_num ?? row.section_no ?? null,
        lexical_score: 0,
        vector_score: 0,
        source_flags: new Set(),
      });
    }

    const entry = byKey.get(key);
    if (source === "lexical") entry.lexical_score = Math.max(entry.lexical_score, Number(row.score || 0));
    if (source === "vector") entry.vector_score = Math.max(entry.vector_score, Number(row.score || 0));
    entry.source_flags.add(source);
    entry.score = Number((entry.lexical_score + entry.vector_score).toFixed(4));
  };

  (lexicalRows || []).forEach((row) => ingest(row, "lexical"));
  (vectorRows || []).forEach((row) => ingest(row, "vector"));

  return Array.from(byKey.values())
    .map((row) => ({
      ...row,
      source: Array.from(row.source_flags).join("+"),
    }))
    .sort((a, b) => b.score - a.score);
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

async function rerankTopChunksWithLLM({ groq, caseContext, topChunks, usageLedger }) {
  const fallback = topChunks.slice(0, 3);
  if (!groq || topChunks.length === 0) {
    return { selected: fallback, rationale: "Fallback without LLM reranking." };
  }

  const chunkPayload = topChunks.map((chunk) => ({
    id: String(chunk.id),
    act_name: chunk.act_name,
    section_no: chunk.section_num ?? chunk.section_no ?? null,
    section_title: chunk.section_title,
    preview: String(chunk.chunk_text || "").slice(0, 360),
  }));

  const rerankPrompt = [
    "You are a legal RAG reranker.",
    "Task: pick the most relevant chunk IDs for the current complaint context.",
    "Return strict JSON object with keys: selected_ids (array of chunk IDs, max 3), rationale (string).",
    "Do not infer facts not in complaint context.",
    "Complaint context:",
    caseContext.combinedText.slice(0, 8000),
    "Candidate chunks:",
    JSON.stringify(chunkPayload),
  ].join("\n");

  const rerankRes = await callGroqJson({
    groq,
    systemPrompt: "Return valid JSON only. Prefer chunks directly matching complaint facts.",
    userPrompt: rerankPrompt,
    expect: "object",
  });
  mergeUsage(usageLedger, "rag_rerank", rerankRes.usage);

  const selectedIds = Array.isArray(rerankRes.parsed?.selected_ids)
    ? rerankRes.parsed.selected_ids.map((id) => String(id))
    : [];

  const selected = topChunks.filter((chunk) => selectedIds.includes(String(chunk.id))).slice(0, 3);
  return {
    selected: selected.length > 0 ? selected : fallback,
    rationale: rerankRes.parsed?.rationale || "Selected by fallback relevance scoring.",
  };
}

async function callGroqJson({ groq, systemPrompt, userPrompt, expect = "object" }) {
  if (!groq) {
    return { parsed: null, usage: null, raw: "" };
  }

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
    temperature: 0.2,
    max_tokens: 1400,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content || "";
  const usage = completion.usage || null;

  if (expect === "array") {
    return { parsed: extractJsonArray(raw), usage, raw };
  }

  return { parsed: extractJsonObject(raw), usage, raw };
}

function mergeUsage(usageLedger, toolKey, usage) {
  if (!usage) return;

  const prompt = Number(usage.prompt_tokens || 0);
  const completion = Number(usage.completion_tokens || 0);
  const total = Number(usage.total_tokens || prompt + completion);

  usageLedger.total_prompt_tokens += prompt;
  usageLedger.total_completion_tokens += completion;
  usageLedger.total_tokens += total;

  usageLedger.by_tool[toolKey] = {
    prompt_tokens: (usageLedger.by_tool[toolKey]?.prompt_tokens || 0) + prompt,
    completion_tokens: (usageLedger.by_tool[toolKey]?.completion_tokens || 0) + completion,
    total_tokens: (usageLedger.by_tool[toolKey]?.total_tokens || 0) + total,
  };
}

function buildDashboardPayload({ run, contextMemory, usageLedger, overallStatusOverride = null }) {
  const completedCount = [
    run.rag_status,
    run.deep_research_status,
    run.timeline_status,
    run.sentimental_status,
  ].filter((status) => status === "completed").length;

  const resolvedOverallStatus = overallStatusOverride || run.overall_status;
  const timelineRiskLevel =
    run.timeline_result?.risk_projection?.risk_level
    || run.timeline_result?.risk_projection?.level
    || null;

  return {
    progress: {
      completed_tools: completedCount,
      total_tools: 4,
      percent: Math.round((completedCount / 4) * 100),
      overall_status: resolvedOverallStatus,
    },
    highlights: {
      suggested_case_classification: run.rag_result?.classification?.subtype_name || null,
      suggested_route: run.rag_result?.routing?.suggested_authority || null,
      accused_match_found: Boolean(run.deep_research_result?.matched_persons?.length),
      timeline_risk_level: timelineRiskLevel,
      sentiment_urgency_score: run.sentimental_result?.metrics?.urgency_score ?? null,
    },
    credits: usageLedger,
    context_memory: contextMemory,
    generated_at: new Date().toISOString(),
  };
}

async function getCaseBundle(supabase, caseId) {
  const [{ data: caseRow, error: caseError }, { data: evidenceRows, error: evidenceError }] = await Promise.all([
    supabase
      .from("cases")
      .select("id, token, description, summary, timeline, incident_types, accused_name, accused_role, severity, urgency, priority_score")
      .eq("id", caseId)
      .maybeSingle(),
    supabase
      .from("evidence")
      .select("id, ai_description, ai_ocr_text, ai_entities, ai_actions, file_metadata")
      .eq("case_id", caseId)
      .order("uploaded_at", { ascending: false }),
  ]);

  if (caseError || !caseRow) {
    throw new Error("Case not found for Triad Engine");
  }

  if (evidenceError) {
    throw new Error("Unable to load evidence for Triad Engine");
  }

  return {
    caseRow,
    evidenceRows: evidenceRows || [],
  };
}

async function createNewRun(supabase, caseRow, evidenceRows) {
  const { data: latestRows } = await supabase
    .from("triad_engine_runs")
    .select("run_version")
    .eq("case_id", caseRow.id)
    .order("run_version", { ascending: false })
    .limit(1);

  const runVersion = Number(latestRows?.[0]?.run_version || 0) + 1;

  const inputPayload = {
    description: caseRow.description || "",
    summary: caseRow.summary || "",
    timeline: Array.isArray(caseRow.timeline) ? caseRow.timeline : [],
    incident_types: caseRow.incident_types || [],
    accused_name: caseRow.accused_name || null,
    evidence: evidenceRows.map((item) => ({
      ai_description: item.ai_description || null,
      ai_ocr_text: item.ai_ocr_text || null,
      ai_entities: Array.isArray(item.ai_entities) ? item.ai_entities : [],
      ai_actions: Array.isArray(item.ai_actions) ? item.ai_actions : [],
    })),
  };

  const { data: createdRun, error } = await supabase
    .from("triad_engine_runs")
    .insert({
      case_id: caseRow.id,
      token: caseRow.token || String(caseRow.id),
      run_version: runVersion,
      overall_status: "running",
      input_payload: inputPayload,
      rag_status: "queued",
      deep_research_status: "queued",
      timeline_status: "queued",
      sentimental_status: "queued",
    })
    .select("*")
    .single();

  if (error || !createdRun) {
    throw new Error("Unable to create triad_engine_runs row");
  }

  return createdRun;
}

async function updateRun(supabase, runId, patch) {
  const { data, error } = await supabase
    .from("triad_engine_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Failed to update triad_engine_runs row");
  }

  return data;
}

function buildCaseContext(caseRow, evidenceRows) {
  const evidenceText = evidenceRows
    .map((item, idx) => {
      const entities = Array.isArray(item.ai_entities) ? item.ai_entities.join(", ") : "";
      const actions = Array.isArray(item.ai_actions) ? item.ai_actions.join(", ") : "";
      return [
        `Evidence ${idx + 1}:`,
        item.ai_description ? `description: ${item.ai_description}` : "",
        item.ai_ocr_text ? `ocr: ${String(item.ai_ocr_text).slice(0, 500)}` : "",
        entities ? `entities: ${entities}` : "",
        actions ? `actions: ${actions}` : "",
      ].filter(Boolean).join(" | ");
    })
    .join("\n");

  const timelineText = Array.isArray(caseRow.timeline)
    ? caseRow.timeline
        .map((event, index) => `${index + 1}. ${event?.date || "unknown"} - ${event?.description || ""}`)
        .join("\n")
    : "";

  return {
    description: caseRow.description || "",
    summary: caseRow.summary || "",
    timelineText,
    evidenceText,
    combinedText: [caseRow.description, caseRow.summary, timelineText, evidenceText].filter(Boolean).join("\n\n"),
  };
}

async function runRagTool({ supabase, groq, caseRow, caseContext, contextMemory, usageLedger }) {
  const questionPrompt = [
    "Generate exactly 6 short legal-triage research questions from this complaint context.",
    "Return strict JSON array of strings only.",
    "Context:",
    caseContext.combinedText.slice(0, 7000),
  ].join("\n");

  const qRes = await callGroqJson({
    groq,
    systemPrompt: "You generate concise legal-research prompts. Return valid JSON array only.",
    userPrompt: questionPrompt,
    expect: "array",
  });
  mergeUsage(usageLedger, "rag_questions", qRes.usage);

  const generatedQuestions = Array.isArray(qRes.parsed) && qRes.parsed.length >= 5
    ? qRes.parsed.slice(0, 6).map((q) => String(q).trim()).filter(Boolean)
    : defaultQuestions(caseRow.description);

  const keywordText = `${caseContext.combinedText}\n${generatedQuestions.join("\n")}`;
  const keywords = collectKeywords(keywordText, 35);

  const { data: chunkRows, error: chunkError } = await supabase
    .from("legal_chunks")
    .select("id, act_name, section_num, section_title, chunk_text, metadata, embedding")
    .limit(600);

  if (chunkError) {
    throw new Error(`Failed to fetch legal_chunks: ${chunkError.message}`);
  }

  const scoredChunks = scoreLegalChunks(chunkRows || [], keywords, caseContext.combinedText);
  const vectorQuery = meanEmbeddingFromRows(scoredChunks, 8);
  const vectorMatches = await fetchVectorMatches({
    supabase,
    queryEmbedding: vectorQuery,
    matchCount: 10,
  });
  const hybridCandidates = buildHybridCandidates(scoredChunks, vectorMatches);
  const topFiveForRerank = hybridCandidates.slice(0, 5);
  const reranked = await rerankTopChunksWithLLM({
    groq,
    caseContext,
    topChunks: topFiveForRerank,
    usageLedger,
  });
  const legalChunks = reranked.selected;

  const { data: classificationRows } = await supabase
    .from("case_classifications")
    .select("type_code, type_name, subtype_code, subtype_name, description, applicable_acts, severity_level, default_authority, mandatory_police_report");

  const incidentHints = Array.isArray(caseRow.incident_types) ? caseRow.incident_types.map((x) => String(x).toLowerCase()) : [];
  const signals = getContextSignals(caseContext);
  const clsScored = (classificationRows || []).map((row) => {
    const hay = normalizeText(`${row.type_name} ${row.subtype_name} ${row.description}`).toLowerCase();
    const overlap = keywords.reduce((score, kw) => score + (hay.includes(kw) ? 1 : 0), 0);
    const incidentBoost = incidentHints.some((hint) => hay.includes(hint.replaceAll("_", " "))) ? 2 : 0;
    const stalkingBoost = signals.stalking && (hay.includes("stalk") || hay.includes("obsessive contact")) ? 8 : 0;
    const physicalBoost = signals.physical && (hay.includes("physical") || hay.includes("public") || hay.includes("approach")) ? 2 : 0;
    const cyberPenalty = !signals.cyber && (hay.includes("cyber") || hay.includes("dox") || hay.includes("online")) ? 8 : 0;
    const pocsoPenalty = !signals.minor && (hay.includes("minor") || hay.includes("child") || hay.includes("pocso") || hay.includes("sjpu")) ? 10 : 0;
    return { ...row, score: overlap + incidentBoost + stalkingBoost + physicalBoost - cyberPenalty - pocsoPenalty };
  }).sort((a, b) => b.score - a.score);

  const classification = clsScored[0] || null;
  const topClassifications = clsScored.slice(0, 3).map((row) => ({
    subtype_code: row.subtype_code,
    subtype_name: row.subtype_name,
    type_name: row.type_name,
    score: row.score,
  }));

  const { data: routingRows } = await supabase
    .from("act_routing_config")
    .select("act_code, config");

  const actsFromClassification = Array.isArray(classification?.applicable_acts)
    ? classification.applicable_acts.map((act) => String(act))
    : [];

  const actsFromEvidence = legalChunks.map((chunk) => String(chunk.act_name || ""));

  const actCodeCandidates = [];
  const actSignals = [...actsFromClassification, ...actsFromEvidence];
  if (actSignals.some((act) => act.toUpperCase().includes("POSH"))) actCodeCandidates.push("POSH");
  if (actSignals.some((act) => act.toUpperCase().includes("POCSO"))) actCodeCandidates.push("POCSO");
  if (actSignals.some((act) => act.toUpperCase().includes("IT"))) actCodeCandidates.push("IT");
  if (actSignals.some((act) => act.toUpperCase().includes("BNS"))) actCodeCandidates.push("BNS");

  if (!signals.minor) {
    const nonPocsoCandidates = actCodeCandidates.filter((code) => code !== "POCSO");
    if (nonPocsoCandidates.length > 0) {
      actCodeCandidates.length = 0;
      actCodeCandidates.push(...nonPocsoCandidates);
    }
  }

  if (!signals.cyber) {
    const nonCyberCandidates = actCodeCandidates.filter((code) => code !== "IT");
    if (nonCyberCandidates.length > 0) {
      actCodeCandidates.length = 0;
      actCodeCandidates.push(...nonCyberCandidates);
    }
  }

  if (actCodeCandidates.length === 0) {
    actCodeCandidates.push(signals.cyber ? "IT" : "BNS");
  }

  const selectedActCode = actCodeCandidates[0];
  const selectedRouting = (routingRows || []).find((row) => row.act_code === selectedActCode) || null;

  const priorityNumber = Number(caseRow.priority_score || 0);
  const priorityLabel = caseRow.urgency || (priorityNumber >= 8 ? "high" : priorityNumber >= 5 ? "medium" : "low");

  const routeLevel = Array.isArray(selectedRouting?.config?.levels)
    ? selectedRouting.config.levels.find((level) => String(level.priority || "").toLowerCase() === String(priorityLabel).toLowerCase())
      || selectedRouting.config.levels[0]
    : null;

  const classificationEvidenceFallback = classification
    ? [{
        act_name: Array.isArray(classification.applicable_acts) ? classification.applicable_acts.join("; ") : null,
        section_no: null,
        section_title: `Classification reference: ${classification.subtype_name}`,
        chunk_text: classification.description || "Reference from case classification table.",
        relevance_score: classification.score,
      }]
    : [];

  const ragDraft = {
    generated_questions: generatedQuestions,
    legal_evidence: (legalChunks.length > 0 ? legalChunks.map((chunk) => ({
      act_name: chunk.act_name,
      section_no: chunk.section_num ?? chunk.section_no ?? null,
      section_title: chunk.section_title,
      chunk_text: String(chunk.chunk_text || "").slice(0, 800),
      relevance_score: chunk.score,
    })) : classificationEvidenceFallback),
    classification: classification
      ? {
          subtype_code: classification.subtype_code,
          subtype_name: classification.subtype_name,
          type_name: classification.type_name,
          severity_level: classification.severity_level,
          default_authority: classification.default_authority,
          mandatory_police_report: classification.mandatory_police_report,
        }
      : null,
    top_classifications: topClassifications,
    routing: {
      act_code: selectedActCode,
      priority_label: priorityLabel,
      suggested_authority: routeLevel?.authority || classification?.default_authority || null,
      level: routeLevel?.level || null,
      suggested_escalation: routeLevel?.escalate_to || null,
      expected_days: routeLevel?.days || null,
    },
    rag_retrieval: {
      candidate_count: scoredChunks.length,
      used_fallback: scoredChunks.length === 0,
      vector_candidate_count: vectorMatches.length,
      hybrid_candidate_count: hybridCandidates.length,
      rerank_window: topFiveForRerank.map((chunk) => ({
        id: chunk.id,
        act_name: chunk.act_name,
        section_no: chunk.section_num ?? chunk.section_no ?? null,
        section_title: chunk.section_title,
        relevance_score: chunk.score,
        source: chunk.source || "lexical",
      })),
      rerank_rationale: reranked.rationale,
    },
    detailed_document: null,
  };

  const documentPrompt = [
    "Create a detailed legal triage document in strict JSON format with keys:",
    "detailed_document (string), findings (string[]), immediate_actions (string[]), follow_up_questions (string[]).",
    "Use this precomputed context and do not invent facts.",
    JSON.stringify(ragDraft).slice(0, 12000),
  ].join("\n");

  const docRes = await callGroqJson({
    groq,
    systemPrompt: "You are a legal triage drafting assistant. Return strict JSON object only.",
    userPrompt: documentPrompt,
    expect: "object",
  });
  mergeUsage(usageLedger, "rag_document", docRes.usage);

  const ragResult = {
    ...ragDraft,
    detailed_document: docRes.parsed?.detailed_document ||
      `Case ${caseRow.token || caseRow.id} preliminary triage suggests ${classification?.subtype_name || "unclassified pattern"}. Refer legal evidence and recommended authority for manual HR/legal routing decisions.`,
    findings: Array.isArray(docRes.parsed?.findings) ? docRes.parsed.findings : [],
    immediate_actions: Array.isArray(docRes.parsed?.immediate_actions) ? docRes.parsed.immediate_actions : [],
    follow_up_questions: Array.isArray(docRes.parsed?.follow_up_questions)
      ? docRes.parsed.follow_up_questions
      : generatedQuestions,
    context_memory_snapshot: [...contextMemory],
  };

  contextMemory.push({
    tool: "rag",
    summary: `Classification ${classification?.subtype_name || "n/a"}; suggested authority ${ragResult.routing.suggested_authority || "n/a"}`,
    created_at: new Date().toISOString(),
  });

  return { ragResult, generatedQuestions };
}

async function runDeepResearchTool({ supabase, groq, caseRow, caseContext, contextMemory, usageLedger }) {
  const accused = normalizeText(caseRow.accused_name);
  if (!accused) {
    const result = {
      accused_name: null,
      matched_persons: [],
      notes: "No accused_name available for deep research lookup.",
      risk_flags: [],
      context_memory_snapshot: [...contextMemory],
    };

    contextMemory.push({
      tool: "deep_research",
      summary: "Skipped due to missing accused_name",
      created_at: new Date().toISOString(),
    });

    return result;
  }

  const accusedNormalized = normalizePersonName(accused);

  const { data: peopleRows } = await supabase
    .from("mock_persons")
    .select("*")
    .limit(200);

  const matches = (peopleRows || []).filter((person) => {
    const full = normalizePersonName(
      [person.first_name, person.middle_name, person.last_name]
        .filter(Boolean)
        .join(" ")
    );
    return full && accusedNormalized && full === accusedNormalized;
  });

  const locationHints = extractLocationHints(caseContext.combinedText);
  const rankedMatches = [...matches]
    .map((person) => ({
      ...person,
      __rank_score: scorePersonByContext(person, locationHints),
    }))
    .sort((a, b) => Number(b.__rank_score || 0) - Number(a.__rank_score || 0));

  const mapped = rankedMatches.slice(0, 5).map((person) => ({
    ...summarizePerson(person),
    contextual_rank_score: Number(person.__rank_score || 0),
  }));

  const riskFlags = mapped.flatMap((person) => {
    const flags = [];
    if (person?.has_criminal_record) flags.push("criminal_record_present");
    if (Number(person?.number_of_cases || 0) >= 2) flags.push("repeat_cases");
    return flags;
  });

  let narrative = "";
  const prompt = [
    "Given accused profile matches, produce strict JSON object with keys: summary, risk_assessment, recommended_checks.",
    `Accused name: ${accused}`,
    `Matches: ${JSON.stringify(mapped).slice(0, 10000)}`,
    `Context memory: ${JSON.stringify(contextMemory).slice(0, 4000)}`,
  ].join("\n");

  const res = await callGroqJson({
    groq,
    systemPrompt: "You are a cautious investigation assistant. Return strict JSON object only.",
    userPrompt: prompt,
    expect: "object",
  });
  mergeUsage(usageLedger, "deep_research", res.usage);

  if (res.parsed?.summary) {
    narrative = String(res.parsed.summary);
  }

  const result = {
    accused_name: accused,
    match_strategy: "exact_full_name_with_context_ranking",
    matched_persons: mapped,
    total_matches: mapped.length,
    risk_flags: Array.from(new Set(riskFlags)),
    narrative_summary: narrative || (mapped.length ? "Potential background matches found in mock_persons." : "No matching person found in mock_persons."),
    risk_assessment: res.parsed?.risk_assessment || null,
    recommended_checks: Array.isArray(res.parsed?.recommended_checks) ? res.parsed.recommended_checks : [],
    context_memory_snapshot: [...contextMemory],
  };

  contextMemory.push({
    tool: "deep_research",
    summary: `matches=${mapped.length} flags=${result.risk_flags.join(",") || "none"}`,
    created_at: new Date().toISOString(),
  });

  return result;
}

async function runTimelineTool({ groq, caseContext, caseRow, evidenceRows, contextMemory, usageLedger }) {
  const timelineBase = Array.isArray(caseRow.timeline)
    ? caseRow.timeline.map((event, index) => ({
        step: index + 1,
        date: event?.date || null,
        description: event?.description || "",
        place: event?.place || null,
      }))
    : [];

  const extractedFromEvidence = extractTimelineEventsFromText(
    evidenceRows
      .map((row) => `${row.ai_description || ""}\n${row.ai_ocr_text || ""}`)
      .join("\n")
  );

  const prompt = [
    "Analyze chronology and return strict JSON object with keys:",
    "predicted_sequence(array), inconsistencies(array), likely_progression(string), risk_projection(object).",
    `Complaint context: ${caseContext.combinedText.slice(0, 10000)}`,
    `Timeline entries: ${JSON.stringify(timelineBase).slice(0, 6000)}`,
    `Evidence timeline hints: ${JSON.stringify(extractedFromEvidence).slice(0, 3000)}`,
    `Context memory: ${JSON.stringify(contextMemory).slice(0, 3000)}`,
  ].join("\n");

  const res = await callGroqJson({
    groq,
    systemPrompt: "You infer event chronology. Return strict JSON object only.",
    userPrompt: prompt,
    expect: "object",
  });
  mergeUsage(usageLedger, "timeline", res.usage);

  const result = {
    source_timeline_count: timelineBase.length,
    evidence_time_hints_count: extractedFromEvidence.length,
    predicted_sequence: Array.isArray(res.parsed?.predicted_sequence) ? res.parsed.predicted_sequence : timelineBase,
    inconsistencies: Array.isArray(res.parsed?.inconsistencies) ? res.parsed.inconsistencies : [],
    likely_progression: res.parsed?.likely_progression || "Chronology compiled from timeline and evidence descriptions.",
    risk_projection: res.parsed?.risk_projection || {
      risk_level: caseRow.urgency || "medium",
      confidence: 0.55,
    },
    extracted_timeline_hints: extractedFromEvidence,
    context_memory_snapshot: [...contextMemory],
  };

  contextMemory.push({
    tool: "timeline",
    summary: `events=${result.predicted_sequence.length} inconsistencies=${result.inconsistencies.length}`,
    created_at: new Date().toISOString(),
  });

  return result;
}

async function runSentimentalTool({ groq, caseContext, caseRow, evidenceRows, contextMemory, usageLedger }) {
  const combined = caseContext.combinedText || "";
  const dateCount = (combined.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []).length;
  const locationHintCount = (combined.match(/\b(college|campus|road|office|floor|room|city|district|state)\b/gi) || []).length;
  const wordCount = normalizeText(combined).split(/\s+/).filter(Boolean).length;

  const heuristic = computeSentimentMetrics(caseContext.combinedText, {
    hasAccusedName: Boolean(caseRow?.accused_name),
    timelineCount: Array.isArray(caseRow?.timeline) ? caseRow.timeline.length : 0,
    evidenceCount: Array.isArray(evidenceRows) ? evidenceRows.length : 0,
    dateCount,
    locationHintCount,
    wordCount,
  });

  const prompt = [
    "Compute complaint sentiment and psychological pressure metrics.",
    "Return strict JSON object with keys: metrics(object), interpretation(string), recommended_response_tone(string).",
    `Text: ${caseContext.combinedText.slice(0, 10000)}`,
    `Heuristic baseline: ${JSON.stringify(heuristic)}`,
    `Context memory: ${JSON.stringify(contextMemory).slice(0, 3000)}`,
  ].join("\n");

  const res = await callGroqJson({
    groq,
    systemPrompt: "You are a sentiment and risk assessor for case triage. Return strict JSON object only.",
    userPrompt: prompt,
    expect: "object",
  });
  mergeUsage(usageLedger, "sentimental", res.usage);

  const mergedMetrics = {
    ...heuristic,
    ...(res.parsed?.metrics && typeof res.parsed.metrics === "object" ? res.parsed.metrics : {}),
  };

  const calibratedConfidence = Math.min(
    0.92,
    Math.max(
      0.3,
      (clamp01(mergedMetrics.confidence_score, heuristic.confidence_score) * 0.75)
        + (heuristic.confidence_score * 0.25)
    )
  );

  const result = {
    metrics: {
      distress_score: Number(clamp01(mergedMetrics.distress_score, heuristic.distress_score).toFixed(2)),
      anger_score: Number(clamp01(mergedMetrics.anger_score, heuristic.anger_score).toFixed(2)),
      fear_score: Number(clamp01(mergedMetrics.fear_score, heuristic.fear_score).toFixed(2)),
      urgency_score: Number(clamp01(mergedMetrics.urgency_score, heuristic.urgency_score).toFixed(2)),
      confidence_score: Number(calibratedConfidence.toFixed(2)),
      token_count: Number(mergedMetrics.token_count || heuristic.token_count || 0),
    },
    interpretation: res.parsed?.interpretation || "Emotion and urgency markers suggest careful human review.",
    recommended_response_tone: res.parsed?.recommended_response_tone || "empathetic, clear, non-judgmental",
    context_memory_snapshot: [...contextMemory],
  };

  contextMemory.push({
    tool: "sentimental",
    summary: `urgency=${result.metrics.urgency_score} distress=${result.metrics.distress_score}`,
    created_at: new Date().toISOString(),
  });

  return result;
}

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Case ID is required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();

    const [{ data: caseRow, error: caseError }, { data: runRows, error: runError }, nyayaSessionsRes] = await Promise.all([
      supabase
        .from("cases")
        .select("id, token, status, priority_score, accused_name, incident_types, created_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("triad_engine_runs")
        .select("*")
        .eq("case_id", id)
        .order("run_version", { ascending: false })
        .limit(20),
      supabase
        .from("nyaya_council_sessions")
        .select("id, triad_run_id, session_mode, hr_question, conclusion_json, created_at")
        .eq("case_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (caseError || !caseRow) {
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }

    if (runError) {
      return NextResponse.json({ error: "Failed to fetch triad runs." }, { status: 500 });
    }

    const nyayaRows = nyayaSessionsRes?.data || [];
    const nyayaByRunId = (nyayaRows || []).reduce((acc, row) => {
      const key = row?.triad_run_id ? String(row.triad_run_id) : "unlinked";
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const latestRun = runRows?.[0] || null;

    return NextResponse.json({
      success: true,
      case: caseRow,
      latestRun,
      runs: runRows || [],
      nyayaSessions: nyayaRows,
      nyayaByRunId,
    });
  } catch (error) {
    return NextResponse.json({ error: "Unexpected error while fetching triad run." }, { status: 500 });
  }
}

export async function POST(_request, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Case ID is required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

    const { caseRow, evidenceRows } = await getCaseBundle(supabase, id);

    let run = await createNewRun(supabase, caseRow, evidenceRows);

    const contextMemory = [
      {
        tool: "seed",
        summary: `Case ${caseRow.token || caseRow.id} started for triad processing`,
        created_at: new Date().toISOString(),
      },
    ];

    const usageLedger = {
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      total_tokens: 0,
      by_tool: {},
    };

    const caseContext = buildCaseContext(caseRow, evidenceRows);

    run = await updateRun(supabase, run.id, {
      rag_status: "running",
      overall_status: "running",
    });

    try {
      const { ragResult, generatedQuestions } = await runRagTool({
        supabase,
        groq,
        caseRow,
        caseContext,
        contextMemory,
        usageLedger,
      });

      run = await updateRun(supabase, run.id, {
        rag_status: "completed",
        rag_questions: generatedQuestions,
        rag_result: ragResult,
        rag_completed_at: new Date().toISOString(),
      });
    } catch (error) {
      run = await updateRun(supabase, run.id, {
        rag_status: "failed",
        error_log: [...(Array.isArray(run.error_log) ? run.error_log : []), {
          tool: "rag",
          message: String(error?.message || "RAG tool failed"),
          at: new Date().toISOString(),
        }],
      });
    }

    run = await updateRun(supabase, run.id, {
      deep_research_status: "running",
      dashboard_result: buildDashboardPayload({ run, contextMemory, usageLedger }),
    });

    try {
      const deepResearchResult = await runDeepResearchTool({
        supabase,
        groq,
        caseRow,
        caseContext,
        contextMemory,
        usageLedger,
      });

      run = await updateRun(supabase, run.id, {
        deep_research_status: "completed",
        deep_research_result: deepResearchResult,
        deep_research_completed_at: new Date().toISOString(),
      });
    } catch (error) {
      run = await updateRun(supabase, run.id, {
        deep_research_status: "failed",
        error_log: [...(Array.isArray(run.error_log) ? run.error_log : []), {
          tool: "deep_research",
          message: String(error?.message || "Deep research tool failed"),
          at: new Date().toISOString(),
        }],
      });
    }

    run = await updateRun(supabase, run.id, {
      timeline_status: "running",
      dashboard_result: buildDashboardPayload({ run, contextMemory, usageLedger }),
    });

    try {
      const timelineResult = await runTimelineTool({
        groq,
        caseContext,
        caseRow,
        evidenceRows,
        contextMemory,
        usageLedger,
      });

      run = await updateRun(supabase, run.id, {
        timeline_status: "completed",
        timeline_result: timelineResult,
        timeline_completed_at: new Date().toISOString(),
      });
    } catch (error) {
      run = await updateRun(supabase, run.id, {
        timeline_status: "failed",
        error_log: [...(Array.isArray(run.error_log) ? run.error_log : []), {
          tool: "timeline",
          message: String(error?.message || "Timeline tool failed"),
          at: new Date().toISOString(),
        }],
      });
    }

    run = await updateRun(supabase, run.id, {
      sentimental_status: "running",
      dashboard_result: buildDashboardPayload({ run, contextMemory, usageLedger }),
    });

    try {
      const sentimentalResult = await runSentimentalTool({
        groq,
        caseContext,
        caseRow,
        evidenceRows,
        contextMemory,
        usageLedger,
      });

      run = await updateRun(supabase, run.id, {
        sentimental_status: "completed",
        sentimental_result: sentimentalResult,
        sentimental_completed_at: new Date().toISOString(),
      });
    } catch (error) {
      run = await updateRun(supabase, run.id, {
        sentimental_status: "failed",
        error_log: [...(Array.isArray(run.error_log) ? run.error_log : []), {
          tool: "sentimental",
          message: String(error?.message || "Sentimental tool failed"),
          at: new Date().toISOString(),
        }],
      });
    }

    const allStatuses = [run.rag_status, run.deep_research_status, run.timeline_status, run.sentimental_status];
    const allCompleted = allStatuses.every((status) => status === "completed");
    const anyFailed = allStatuses.some((status) => status === "failed");

    const finalOverallStatus = allCompleted ? "completed" : anyFailed ? "partial" : "running";

    run = await updateRun(supabase, run.id, {
      overall_status: finalOverallStatus,
      dashboard_result: buildDashboardPayload({ run, contextMemory, usageLedger, overallStatusOverride: finalOverallStatus }),
      completed_at: new Date().toISOString(),
      input_payload: {
        ...(run.input_payload || {}),
        execution_context: {
          context_memory: contextMemory,
          credits: usageLedger,
          model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
        },
      },
    });

    return NextResponse.json({
      success: true,
      run,
      credits: usageLedger,
    });
  } catch (error) {
    return NextResponse.json({
      error: "Triad Engine run failed unexpectedly.",
      details: String(error?.message || "Unknown error"),
    }, { status: 500 });
  }
}

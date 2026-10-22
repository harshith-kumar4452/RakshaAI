import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, readdir, stat, writeFile } from "fs/promises";
import path from "path";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const GENERATED_ROOT = path.join(process.cwd(), "public", "generated", "brief");

function safeSegment(value = "") {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function buildDir(caseId, sessionId) {
  return path.join(GENERATED_ROOT, safeSegment(caseId), safeSegment(sessionId));
}

function toUrl(caseId, sessionId, filename) {
  return `/generated/brief/${safeSegment(caseId)}/${safeSegment(sessionId)}/${filename}`;
}

async function listFiles(caseId, sessionId) {
  const dir = buildDir(caseId, sessionId);
  try {
    const entries = await readdir(dir);
    const mapped = await Promise.all(
      entries
        .filter((name) => name.endsWith(".pdf") || name.endsWith(".json"))
        .map(async (name) => {
          const details = await stat(path.join(dir, name));
          return {
            name,
            type: name.endsWith(".pdf") ? "pdf" : "json",
            url: toUrl(caseId, sessionId, name),
            modifiedAt: details.mtime.toISOString(),
            size: details.size,
          };
        })
    );
    return mapped.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  } catch {
    return [];
  }
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function fallbackReport({ caseRow, triadRun, sessionRow }) {
  const rag = triadRun?.rag_result || {};
  const timeline = triadRun?.timeline_result || {};
  const sentimental = triadRun?.sentimental_result || {};
  const deep = triadRun?.deep_research_result || {};
  const conclusion = sessionRow?.conclusion_json || {};

  return {
    title: "Nyaya Consolidated Case Brief",
    executive_summary:
      "This report combines FIR context, triad outputs, and Nyaya deliberation to provide an actionable next-step package for assignment and escalation.",
    final_conclusion:
      conclusion?.combined_conclusion
      || conclusion?.executive_summary
      || conclusion?.answer_summary
      || "No final conclusion was available. Use triad findings and routing hierarchy for manual review.",
    key_pairs: [
      { key: "Case Token", value: caseRow?.token || caseRow?.id || "n/a" },
      { key: "Current Status", value: caseRow?.status || "submitted" },
      { key: "Act Code", value: conclusion?.routing_hierarchy?.act_code || rag?.routing?.act_code || "BNS" },
      { key: "Recommended Authority", value: conclusion?.recommended_route?.authority || rag?.routing?.suggested_authority || "Police Complaint" },
      { key: "Escalation", value: conclusion?.recommended_route?.escalation || rag?.routing?.suggested_escalation || "FIR" },
      { key: "Urgency Score", value: String(sentimental?.metrics?.urgency_score ?? "n/a") },
    ],
    tool_findings: {
      rag: [
        `Classification: ${rag?.classification?.subtype_name || "n/a"}`,
        `Suggested authority: ${rag?.routing?.suggested_authority || "n/a"}`,
      ],
      timeline: [
        `Predicted events: ${Array.isArray(timeline?.predicted_sequence) ? timeline.predicted_sequence.length : 0}`,
        `Risk level: ${timeline?.risk_projection?.risk_level || "n/a"}`,
      ],
      sentimental: [
        `Distress: ${sentimental?.metrics?.distress_score ?? "n/a"}`,
        `Urgency: ${sentimental?.metrics?.urgency_score ?? "n/a"}`,
      ],
      deep_research: [
        `Matches found: ${Array.isArray(deep?.matched_persons) ? deep.matched_persons.length : 0}`,
        `Risk flags: ${Array.isArray(deep?.risk_flags) ? deep.risk_flags.join(", ") : "none"}`,
      ],
      nyaya_chat: Array.isArray(sessionRow?.chat_json?.camera_script)
        ? sessionRow.chat_json.camera_script.slice(0, 6).map((row) => `${row?.agent || row?.speaker || "agent"}: ${normalizeText(row?.content || row?.message || "")}`)
        : [],
    },
    recommendations: [
      "Assign a responsible authority immediately and confirm acceptance.",
      "Preserve evidence and maintain documented chain of actions.",
      "Update complainant-facing status at each stage change.",
      "Escalate according to configured hierarchy and timeline thresholds.",
    ],
  };
}

async function generateReportWithLlm({ groq, fallback }) {
  if (!groq) return fallback;

  const prompt = [
    "Create a detailed consolidated HR legal case report as strict JSON.",
    "Required keys:",
    "title (string), executive_summary (string, 4-6 sentences), final_conclusion (string, 5-8 sentences),",
    "key_pairs (array of {key, value}),",
    "tool_findings (object with rag, timeline, sentimental, deep_research, nyaya_chat arrays),",
    "recommendations (array of 6 short items).",
    "Use provided data only. Keep language professional and practical.",
    JSON.stringify(fallback).slice(0, 18000),
  ].join("\n");

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        { role: "system", content: "Return valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(raw);
      return {
        ...fallback,
        ...parsed,
      };
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return fallback;
      try {
        const parsed = JSON.parse(m[0]);
        return {
          ...fallback,
          ...parsed,
        };
      } catch {
        return fallback;
      }
    }
  } catch {
    return fallback;
  }
}

function wrapLines(text, maxChars = 96) {
  const words = normalizeText(text).split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function buildPdf(report) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 48;
  const marginTop = 790;
  let y = marginTop;

  function ensureSpace(lines = 1, size = 11) {
    const required = lines * (size + 4);
    if (y - required < 48) {
      page = pdfDoc.addPage([595, 842]);
      y = marginTop;
    }
  }

  function drawHeading(text) {
    ensureSpace(2, 16);
    page.drawText(text, {
      x: marginX,
      y,
      size: 16,
      font: bold,
      color: rgb(0.06, 0.17, 0.4),
    });
    y -= 24;
  }

  function drawParagraph(text, size = 11) {
    const lines = wrapLines(text, 98);
    ensureSpace(lines.length + 1, size);
    for (const line of lines) {
      page.drawText(line, { x: marginX, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= size + 4;
    }
    y -= 4;
  }

  function drawKeyPair(key, value) {
    const line = `${key}: ${value}`;
    const lines = wrapLines(line, 94);
    ensureSpace(lines.length + 1, 11);
    lines.forEach((row, idx) => {
      page.drawText(row, {
        x: marginX + (idx === 0 ? 0 : 12),
        y,
        size: 11,
        font: idx === 0 ? bold : font,
        color: rgb(0.08, 0.08, 0.08),
      });
      y -= 15;
    });
  }

  drawHeading(report.title || "Nyaya Consolidated Case Brief");
  drawParagraph(report.executive_summary || "");

  drawHeading("Final Conclusion");
  drawParagraph(report.final_conclusion || "");

  drawHeading("Case Key Details");
  (Array.isArray(report.key_pairs) ? report.key_pairs : []).forEach((item) => {
    drawKeyPair(item?.key || "Key", item?.value || "n/a");
  });

  drawHeading("Findings By Tool");
  const toolFindings = report.tool_findings || {};
  Object.entries(toolFindings).forEach(([tool, rows]) => {
    drawParagraph(`${tool.toUpperCase()}`, 11);
    const list = Array.isArray(rows) ? rows : [];
    list.forEach((row) => drawParagraph(`- ${row}`, 10));
    y -= 2;
  });

  drawHeading("Recommendations");
  (Array.isArray(report.recommendations) ? report.recommendations : []).forEach((row, idx) => {
    drawParagraph(`${idx + 1}. ${row}`, 11);
  });

  return pdfDoc.save();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const caseId = String(searchParams.get("caseId") || "").trim();
  const sessionId = String(searchParams.get("sessionId") || "").trim();

  if (!caseId || !sessionId) {
    return NextResponse.json({ error: "caseId and sessionId are required." }, { status: 400 });
  }

  const files = await listFiles(caseId, sessionId);
  return NextResponse.json({ files });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const caseId = String(body?.caseId || "").trim();
    const sessionId = String(body?.sessionId || "").trim();

    if (!caseId || !sessionId) {
      return NextResponse.json({ error: "caseId and sessionId are required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

    const [{ data: caseRow }, { data: sessionRow }] = await Promise.all([
      supabase.from("cases").select("*").eq("id", caseId).maybeSingle(),
      supabase.from("nyaya_council_sessions").select("*").eq("id", sessionId).eq("case_id", caseId).maybeSingle(),
    ]);

    if (!caseRow || !sessionRow) {
      return NextResponse.json({ error: "Case or Nyaya session not found." }, { status: 404 });
    }

    let triadRun = null;
    if (sessionRow?.triad_run_id) {
      const { data } = await supabase
        .from("triad_engine_runs")
        .select("*")
        .eq("id", sessionRow.triad_run_id)
        .maybeSingle();
      triadRun = data || null;
    }

    const fallback = fallbackReport({ caseRow, triadRun, sessionRow });
    const report = await generateReportWithLlm({ groq, fallback });

    const dir = buildDir(caseId, sessionId);
    await mkdir(dir, { recursive: true });

    const stamp = `${Date.now()}`;
    const jsonName = `brief_${stamp}.json`;
    const pdfName = `brief_${stamp}.pdf`;
    const jsonPath = path.join(dir, jsonName);
    const pdfPath = path.join(dir, pdfName);

    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

    const pdfBytes = await buildPdf(report);
    await writeFile(pdfPath, Buffer.from(pdfBytes));

    const files = await listFiles(caseId, sessionId);

    return NextResponse.json({
      success: true,
      report,
      created: {
        json: { name: jsonName, url: toUrl(caseId, sessionId, jsonName) },
        pdf: { name: pdfName, url: toUrl(caseId, sessionId, pdfName) },
      },
      files,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || "Failed to generate case brief.") }, { status: 500 });
  }
}

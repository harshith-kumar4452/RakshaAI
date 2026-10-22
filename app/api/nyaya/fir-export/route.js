import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { mkdir, readdir, stat, writeFile } from "fs/promises";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const GENERATED_ROOT = path.join(process.cwd(), "public", "generated", "fir");

function getPandocCandidates() {
  const candidates = [];
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;

  if (process.env.PANDOC_PATH) {
    candidates.push(process.env.PANDOC_PATH);
  }

  candidates.push("pandoc");

  if (localAppData) {
    candidates.push(path.join(localAppData, "Pandoc", "pandoc.exe"));
  }

  if (programFiles) {
    candidates.push(path.join(programFiles, "Pandoc", "pandoc.exe"));
  }

  return Array.from(new Set(candidates));
}

async function runPandoc(texPath, docxPath) {
  const attempts = [];

  for (const command of getPandocCandidates()) {
    try {
      await execFileAsync(command, [texPath, "-o", docxPath], {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { ok: true, command };
    } catch (error) {
      attempts.push({
        command,
        message: error?.message || "Unknown pandoc execution error",
      });
    }
  }

  return {
    ok: false,
    attempts,
  };
}

function safeSegment(value = "") {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

function buildSessionDir(caseId, sessionId) {
  return path.join(GENERATED_ROOT, safeSegment(caseId), safeSegment(sessionId));
}

function toPublicUrl(caseId, sessionId, filename) {
  return `/generated/fir/${safeSegment(caseId)}/${safeSegment(sessionId)}/${filename}`;
}

async function listArtifacts(caseId, sessionId) {
  const dir = buildSessionDir(caseId, sessionId);

  try {
    const entries = await readdir(dir);
    const files = await Promise.all(
      entries
        .filter((name) => name.endsWith(".docx") || name.endsWith(".tex"))
        .map(async (name) => {
          const full = path.join(dir, name);
          const details = await stat(full);
          return {
            name,
            type: name.endsWith(".docx") ? "docx" : "tex",
            modifiedAt: details.mtime.toISOString(),
            size: details.size,
            url: toPublicUrl(caseId, sessionId, name),
          };
        })
    );

    return files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  } catch {
    return [];
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get("caseId");
  const sessionId = searchParams.get("sessionId");

  if (!caseId || !sessionId) {
    return NextResponse.json({ error: "caseId and sessionId are required." }, { status: 400 });
  }

  const files = await listArtifacts(caseId, sessionId);
  return NextResponse.json({ files });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const latex = body?.latex;
    const caseId = body?.caseId;
    const sessionId = body?.sessionId;

    if (!latex || !caseId || !sessionId) {
      return NextResponse.json(
        { error: "latex, caseId, and sessionId are required." },
        { status: 400 }
      );
    }

    const dir = buildSessionDir(caseId, sessionId);
    await mkdir(dir, { recursive: true });

    const stamp = `${Date.now()}`;
    const texName = `fir_${stamp}.tex`;
    const docxName = `fir_${stamp}.docx`;
    const texPath = path.join(dir, texName);
    const docxPath = path.join(dir, docxName);

    await writeFile(texPath, latex, "utf8");

    const conversion = await runPandoc(texPath, docxPath);

    if (!conversion.ok) {
      return NextResponse.json(
        {
          error:
            "Pandoc conversion failed. Set PANDOC_PATH or install Pandoc in PATH (or default Windows locations).",
          details: conversion.attempts,
        },
        { status: 500 }
      );
    }

    const files = await listArtifacts(caseId, sessionId);

    try {
      const supabase = createSupabaseServiceRoleClient();
      const { data: sessionRow } = await supabase
        .from("nyaya_council_sessions")
        .select("id, conclusion_json")
        .eq("id", sessionId)
        .eq("case_id", caseId)
        .maybeSingle();

      if (sessionRow?.id) {
        await supabase
          .from("nyaya_council_sessions")
          .update({
            conclusion_json: {
              ...(sessionRow.conclusion_json || {}),
              fir_generated_at: new Date().toISOString(),
              fir_docx_url: toPublicUrl(caseId, sessionId, docxName),
              fir_tex_url: toPublicUrl(caseId, sessionId, texName),
            },
          })
          .eq("id", sessionId);
      }
    } catch {
      // Best-effort metadata update.
    }

    return NextResponse.json({
      message: "FIR files generated successfully.",
      created: {
        tex: { name: texName, url: toPublicUrl(caseId, sessionId, texName) },
        docx: { name: docxName, url: toPublicUrl(caseId, sessionId, docxName) },
      },
      pandocCommand: conversion.command,
      files,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate FIR files." },
      { status: 500 }
    );
  }
}

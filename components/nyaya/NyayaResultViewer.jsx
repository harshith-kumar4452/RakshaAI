"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function PrettyJsonLike({ value }) {
  const rows = useMemo(() => {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value);
  }, [value]);

  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No details available.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="rounded-md border bg-muted/20 p-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p>
          <p className="mt-1 text-sm">
            {typeof v === "string" || typeof v === "number" || typeof v === "boolean"
              ? String(v)
              : Array.isArray(v)
                ? `${v.length} item(s)`
                : `${Object.keys(v || {}).length} field(s)`}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function NyayaResultViewer({ caseId, session, caseToken, triadRun }) {
  const [briefFiles, setBriefFiles] = useState([]);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState("");

  const findings = session?.findings_json || {};
  const chat = session?.chat_json || {};
  const conclusion = session?.conclusion_json || {};

  const turns = Array.isArray(chat?.turns)
    ? chat.turns
    : Array.isArray(chat?.camera_script)
      ? chat.camera_script
      : [];

  useEffect(() => {
    async function loadBriefs() {
      try {
        const response = await fetch(`/api/nyaya/case-brief?caseId=${encodeURIComponent(caseId)}&sessionId=${encodeURIComponent(session?.id || "")}`);
        const payload = await response.json();
        setBriefFiles(Array.isArray(payload?.files) ? payload.files : []);
      } catch {
        setBriefFiles([]);
      }
    }

    if (caseId && session?.id) {
      loadBriefs();
    }
  }, [caseId, session?.id]);

  async function handleGenerateBrief() {
    setBriefBusy(true);
    setBriefError("");

    try {
      const response = await fetch("/api/nyaya/case-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          sessionId: session?.id,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setBriefError(payload?.error || "Failed to generate brief PDF.");
        return;
      }

      setBriefFiles(Array.isArray(payload?.files) ? payload.files : []);
    } catch {
      setBriefError("Failed to generate brief PDF.");
    } finally {
      setBriefBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Nyaya Result</CardTitle>
            <p className="text-sm text-muted-foreground">Case {caseToken || caseId} · Session {session?.id} {triadRun?.run_version ? `· Triad v${triadRun.run_version}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href={`/cases/${caseId}/nyaya/results/${session?.id}/fir`}>FIR Option</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/cases/${caseId}/nyaya/results/${session?.id}/assign`}>Assign Case</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/cases/${caseId}/nyaya/chats`}>All Chat Sessions</Link>
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consolidated Case Brief (PDF)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Generates a longer LLM summary combining FIR context, triad findings, Nyaya discussion, and actionable recommendations.
          </p>
          {briefError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{briefError}</p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button onClick={handleGenerateBrief} disabled={briefBusy}>
              {briefBusy ? "Generating..." : "Generate Full Brief PDF"}
            </Button>
          </div>
          {briefFiles.length > 0 ? (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Generated Files</p>
              {briefFiles.map((file) => (
                <a
                  key={file.url}
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-blue-600 underline underline-offset-2"
                >
                  {file.name}
                </a>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <details open>
        <summary className="cursor-pointer rounded-md border bg-background px-3 py-2 text-sm font-semibold">Final Conclusion</summary>
        <div className="mt-2 rounded-md border p-3">
          <p className="text-sm">{conclusion?.executive_summary || conclusion?.answer_summary || "No summary available."}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded border p-2">
              <p className="text-xs text-muted-foreground">Authority</p>
              <p className="text-sm font-semibold">{conclusion?.recommended_route?.authority || conclusion?.route_advice?.authority || "n/a"}</p>
            </div>
            <div className="rounded border p-2">
              <p className="text-xs text-muted-foreground">Act</p>
              <p className="text-sm font-semibold">{conclusion?.recommended_route?.act_code || conclusion?.route_advice?.act_code || "n/a"}</p>
            </div>
          </div>
          {conclusion?.combined_conclusion ? (
            <div className="mt-3 rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Combined Triad + Nyaya Conclusion</p>
              <p className="mt-1 text-sm leading-relaxed">{conclusion.combined_conclusion}</p>
            </div>
          ) : null}
          {conclusion?.routing_hierarchy ? (
            <div className="mt-3 rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Department Hierarchy Routing (act_routing_config)</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded border p-2">
                  <p className="text-xs text-muted-foreground">Act</p>
                  <p className="text-sm font-semibold">{conclusion.routing_hierarchy.act_code || "n/a"}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-xs text-muted-foreground">Priority</p>
                  <p className="text-sm font-semibold">{conclusion.routing_hierarchy.priority_label || "n/a"}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-xs text-muted-foreground">Current Authority</p>
                  <p className="text-sm font-semibold">{conclusion.routing_hierarchy.current_authority || "n/a"}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-xs text-muted-foreground">Escalate To</p>
                  <p className="text-sm font-semibold">{conclusion.routing_hierarchy.escalate_to || "n/a"}</p>
                </div>
              </div>
              {Array.isArray(conclusion?.routing_hierarchy?.hierarchy_path) && conclusion.routing_hierarchy.hierarchy_path.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {conclusion.routing_hierarchy.hierarchy_path.map((row, idx) => (
                    <div key={`hierarchy-${idx}`} className="rounded border bg-muted/20 p-2 text-sm">
                      Level {row.level} ({row.priority}) · {row.authority} · {row.days} day(s){row.escalate_to ? ` · escalate to ${row.escalate_to}` : ""}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>

      <details>
        <summary className="cursor-pointer rounded-md border bg-background px-3 py-2 text-sm font-semibold">Discussion / Bot Conversation</summary>
        <div className="mt-2 space-y-2 rounded-md border p-3">
          {turns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No discussion turns found.</p>
          ) : (
            turns.map((turn, idx) => (
              <div key={`turn-${idx}`} className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {turn.speaker || turn.agent || "agent"}
                </p>
                <p className="mt-1 text-sm">{turn.message || turn.content || "-"}</p>
              </div>
            ))
          )}
        </div>
      </details>

      <details>
        <summary className="cursor-pointer rounded-md border bg-background px-3 py-2 text-sm font-semibold">Findings (Collapsible)</summary>
        <div className="mt-2 rounded-md border p-3">
          <PrettyJsonLike value={findings} />
        </div>
      </details>

      <Card>
        <CardHeader>
          <CardTitle>Open Nyaya 3D Question Mode</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Open manual HR-question mode in 3D Nyaya. Nothing runs until you type a prompt and click Ask.
          </p>
          <Button asChild variant="outline">
            <Link href={`/cases/${caseId}/nyaya?mode=hr-council${triadRun?.id ? `&triadRunId=${encodeURIComponent(triadRun.id)}` : ""}`}>
              Open Nyaya Question Mode
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

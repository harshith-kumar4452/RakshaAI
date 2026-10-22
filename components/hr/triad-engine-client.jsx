"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function StatusBadge({ status }) {
  const normalized = String(status || "queued").toLowerCase();

  if (normalized === "completed") {
    return <Badge variant="outline">completed</Badge>;
  }
  if (normalized === "running") {
    return <Badge className="bg-blue-600 text-white hover:bg-blue-600">running</Badge>;
  }
  if (normalized === "failed") {
    return <Badge variant="destructive">failed</Badge>;
  }
  if (normalized === "partial") {
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500">partial</Badge>;
  }

  return <Badge variant="outline">{normalized}</Badge>;
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </div>
  );
}

function KeyValue({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value ?? "n/a"}</span>
    </div>
  );
}

export default function TriadEngineClient({ caseId }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [caseRow, setCaseRow] = useState(null);
  const [run, setRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [nyayaByRunId, setNyayaByRunId] = useState({});
  const [hrQuestion, setHrQuestion] = useState("");
  const [councilRunning, setCouncilRunning] = useState(false);
  const [councilTurns, setCouncilTurns] = useState([]);
  const [councilConclusion, setCouncilConclusion] = useState(null);
  const [councilError, setCouncilError] = useState("");

  const fetchStatus = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/hr-admin/cases/${caseId}/triad`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to load triad status");
        return;
      }
      setCaseRow(data.case || null);
      setRun(data.latestRun || null);
      setRuns(Array.isArray(data.runs) ? data.runs : []);
      setNyayaByRunId(data.nyayaByRunId || {});
      if (!selectedRunId && data.latestRun?.id) {
        setSelectedRunId(data.latestRun.id);
      }
    } catch (err) {
      setError("Failed to load triad status");
    } finally {
      setLoading(false);
    }
  }, [caseId, selectedRunId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleStart() {
    setRunning(true);
    setError("");

    try {
      const response = await fetch(`/api/hr-admin/cases/${caseId}/triad`, {
        method: "POST",
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to run Triad Engine");
        return;
      }

      setRun(data.run || null);
      if (data.run?.id) setSelectedRunId(data.run.id);
    } catch (err) {
      setError("Failed to run Triad Engine");
    } finally {
      setRunning(false);
      fetchStatus();
    }
  }

  const selectedRun = runs.find((item) => item.id === selectedRunId) || run;
  const selectedRunNyaya = selectedRun?.id ? (nyayaByRunId[String(selectedRun.id)] || []) : [];
  const latestNyaya = selectedRunNyaya?.[0] || null;
  const rag = selectedRun?.rag_result || {};
  const timeline = selectedRun?.timeline_result || {};
  const sentimental = selectedRun?.sentimental_result || {};
  const deep = selectedRun?.deep_research_result || {};
  const dashboard = selectedRun?.dashboard_result || {};

  async function handleCouncilQuestion() {
    const question = String(hrQuestion || "").trim();
    if (!question) return;

    const selectedRunParam = selectedRun?.id ? `&triadRunId=${encodeURIComponent(selectedRun.id)}` : "";
    router.push(`/cases/${caseId}/nyaya?mode=hr-council${selectedRunParam}&prompt=${encodeURIComponent(question)}`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Triad Engine Orchestrator</CardTitle>
            <CardDescription>
              Runs RAG, Deep Research, Timeline, and Sentimental tools sequentially with shared context memory.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={run?.overall_status || "queued"} />
            <Button variant="outline" onClick={fetchStatus} disabled={loading || running}>Refresh</Button>
            <Button onClick={handleStart} disabled={running}>
              {running ? "Running..." : "Start Triad Engine"}
            </Button>
            {run ? (
              <Button asChild variant="secondary">
                <Link href={`/cases/${caseId}/nyaya${selectedRun?.id ? `?triadRunId=${selectedRun.id}` : ""}`}>Run Nyaya</Link>
              </Button>
            ) : (
              <Button variant="secondary" disabled>
                Run Nyaya
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">RAG Tool</p>
              <div className="mt-2"><StatusBadge status={run?.rag_status || "queued"} /></div>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Deep Research Tool</p>
              <div className="mt-2"><StatusBadge status={run?.deep_research_status || "queued"} /></div>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Timeline Tool</p>
              <div className="mt-2"><StatusBadge status={run?.timeline_status || "queued"} /></div>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Sentimental Tool</p>
              <div className="mt-2"><StatusBadge status={run?.sentimental_status || "queued"} /></div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Case</p>
              <p className="mt-1 text-sm font-medium">{caseRow?.token || caseRow?.id || caseId}</p>
              <p className="mt-1 text-xs text-muted-foreground">Accused: {caseRow?.accused_name || "n/a"}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Credits</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Total tokens: {run?.dashboard_result?.credits?.total_tokens ?? 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {run ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Triad Run History</CardTitle>
              <CardDescription>
                Pick a specific run. Nyaya will start from the selected run only, so case consistency is maintained.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {runs.map((item) => {
                const itemNyaya = nyayaByRunId[String(item.id)] || [];
                const itemNyayaLatest = itemNyaya[0] || null;
                const isActive = selectedRunId === item.id;

                return (
                  <div key={item.id} className={`rounded-md border p-3 ${isActive ? "border-blue-500 bg-blue-50/50" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">Run v{item.run_version}</p>
                        <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={item.overall_status} />
                        <Button size="sm" variant={isActive ? "default" : "outline"} onClick={() => setSelectedRunId(item.id)}>
                          {isActive ? "Selected" : "Select"}
                        </Button>
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/cases/${caseId}/nyaya?triadRunId=${item.id}`}>Start New Nyaya</Link>
                        </Button>
                        {itemNyayaLatest ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/cases/${caseId}/nyaya/results/${itemNyayaLatest.id}`}>View Nyaya Result</Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="RAG Analysis"
              subtitle="Readable legal routing summary from the selected triad run."
            >
              {selectedRun?.id ? (
                <div className="flex justify-end">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/hr-admin/cases/${caseId}/triad/run/${selectedRun.id}/rag`}>View Full Page</Link>
                  </Button>
                </div>
              ) : null}
              <KeyValue label="Classification" value={rag?.classification?.subtype_name} />
              <KeyValue label="Authority" value={rag?.routing?.suggested_authority} />
              <KeyValue label="Act" value={rag?.routing?.act_code} />
              {Array.isArray(rag?.legal_evidence) && rag.legal_evidence.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Top Legal Pointers</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {rag.legal_evidence.slice(0, 3).map((row, idx) => (
                      <li key={`rag-row-${idx}`}>{row.act_name} - {row.section_title || "section"}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Timeline Analysis"
              subtitle="Chronology and escalation understanding."
            >
              {selectedRun?.id ? (
                <div className="flex justify-end">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/hr-admin/cases/${caseId}/triad/run/${selectedRun.id}/timeline`}>View Full Page</Link>
                  </Button>
                </div>
              ) : null}
              <KeyValue label="Risk Level" value={timeline?.risk_projection?.risk_level || timeline?.risk_projection?.level} />
              <p>{timeline?.likely_progression || "No progression narrative available."}</p>
              {Array.isArray(timeline?.inconsistencies) && timeline.inconsistencies.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Inconsistencies</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {timeline.inconsistencies.slice(0, 4).map((item, idx) => (
                      <li key={`timeline-inc-${idx}`}>{String(item)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Sentimental Analysis"
              subtitle="Emotional pressure and urgency interpretation."
            >
              {selectedRun?.id ? (
                <div className="flex justify-end">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/hr-admin/cases/${caseId}/triad/run/${selectedRun.id}/sentimental`}>View Full Page</Link>
                  </Button>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border p-2 text-center"><p className="text-xs text-muted-foreground">Urgency</p><p className="text-lg font-semibold">{sentimental?.metrics?.urgency_score ?? "n/a"}</p></div>
                <div className="rounded border p-2 text-center"><p className="text-xs text-muted-foreground">Distress</p><p className="text-lg font-semibold">{sentimental?.metrics?.distress_score ?? "n/a"}</p></div>
                <div className="rounded border p-2 text-center"><p className="text-xs text-muted-foreground">Fear</p><p className="text-lg font-semibold">{sentimental?.metrics?.fear_score ?? "n/a"}</p></div>
                <div className="rounded border p-2 text-center"><p className="text-xs text-muted-foreground">Confidence</p><p className="text-lg font-semibold">{sentimental?.metrics?.confidence_score ?? "n/a"}</p></div>
              </div>
              <p>{sentimental?.interpretation || "No interpretation available."}</p>
            </SectionCard>

            <SectionCard
              title="Deep Research"
              subtitle="Background indicators and risk context."
            >
              {selectedRun?.id ? (
                <div className="flex justify-end">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/hr-admin/cases/${caseId}/triad/run/${selectedRun.id}/deep-research`}>View Full Page</Link>
                  </Button>
                </div>
              ) : null}
              <KeyValue label="Matched Profiles" value={Array.isArray(deep?.matched_persons) ? deep.matched_persons.length : 0} />
              <KeyValue label="Risk Flags" value={Array.isArray(deep?.risk_flags) ? deep.risk_flags.join(", ") : "none"} />
              <p>{deep?.narrative_summary || "No narrative summary available."}</p>
            </SectionCard>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>HR Admin In-Council Prompt</CardTitle>
              <CardDescription>
                Ask one focused question. The four personas discuss in limited turns and produce a second conclusion JSON.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {councilError ? <p className="text-sm text-red-600">{councilError}</p> : null}
              <textarea
                value={hrQuestion}
                onChange={(event) => setHrQuestion(event.target.value)}
                placeholder="Example: Should we escalate externally now or begin internal inquiry first?"
                className="min-h-[88px] w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-2">
                <Button onClick={handleCouncilQuestion} disabled={councilRunning || !hrQuestion.trim()}>
                  {councilRunning ? "Opening..." : "Open 3D Council"}
                </Button>
                <p className="text-xs text-muted-foreground">Prompt opens Nyaya 3D mode where you choose rounds and ask follow-ups.</p>
              </div>

              {councilTurns.length > 0 ? (
                <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Council Discussion</p>
                  {councilTurns.map((turn, idx) => (
                    <div key={`${turn.speaker || "agent"}-${idx}`} className="rounded-md border bg-background p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {String(turn.speaker || "agent")}
                      </p>
                      <p className="mt-1 text-sm">{turn.message}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {councilConclusion ? (
                <SectionCard title="Second Council Conclusion" subtitle="Generated from bounded multi-agent discussion">
                  <p>{councilConclusion.answer_summary || "No summary available."}</p>
                  <KeyValue label="Authority" value={councilConclusion?.route_advice?.authority} />
                  <KeyValue label="Act" value={councilConclusion?.route_advice?.act_code} />
                  <KeyValue label="Risk posture" value={councilConclusion?.risk_posture} />
                  <KeyValue label="Confidence" value={councilConclusion?.confidence_score} />
                  {Array.isArray(councilConclusion?.immediate_actions) && councilConclusion.immediate_actions.length > 0 ? (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Immediate actions</p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                        {councilConclusion.immediate_actions.slice(0, 6).map((step, idx) => (
                          <li key={`council-action-${idx}`}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </SectionCard>
              ) : null}
            </CardContent>
          </Card>

          <SectionCard title="Nyaya Status" subtitle="For selected triad run">
            <KeyValue label="Nyaya sessions" value={selectedRunNyaya.length} />
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href={`/cases/${caseId}/nyaya?triadRunId=${selectedRun?.id}`}>Start New Nyaya</Link>
              </Button>
              {latestNyaya ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/cases/${caseId}/nyaya/results/${latestNyaya.id}`}>View Latest Nyaya Result</Link>
                </Button>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Dashboard Snapshot" subtitle="Aggregated highlights">
            {selectedRun?.id ? (
              <div className="flex justify-end">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/hr-admin/cases/${caseId}/triad/run/${selectedRun.id}/dashboard`}>View Full Page</Link>
                </Button>
              </div>
            ) : null}
            <KeyValue label="Suggested route" value={dashboard?.highlights?.suggested_route} />
            <KeyValue label="Classification" value={dashboard?.highlights?.suggested_case_classification} />
            <KeyValue label="Timeline risk" value={dashboard?.highlights?.timeline_risk_level} />
            <KeyValue label="Urgency score" value={dashboard?.highlights?.sentiment_urgency_score} />
          </SectionCard>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No Triad run yet for this case.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

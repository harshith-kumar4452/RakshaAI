import Link from "next/link";
import { notFound } from "next/navigation";

import HrShell from "@/components/hr/hr-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import NyayaCourtroom from "@/components/nyaya/NyayaCourtroom";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export default async function NyayaPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const triadRunId = query?.triadRunId ? String(query.triadRunId) : null;
  const mode = query?.mode ? String(query.mode).toLowerCase().trim() : "auto";
  const prompt = query?.prompt ? String(query.prompt) : "";
  const sessionId = query?.sessionId ? String(query.sessionId) : null;
  const shouldStart = String(query?.start || "") === "1";

  const supabase = createSupabaseServiceRoleClient();

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id, token")
    .eq("id", id)
    .maybeSingle();

  if (caseError || !caseRow) {
    notFound();
  }

  const triadQuery = triadRunId
    ? supabase.from("triad_engine_runs").select("id, run_version, created_at").eq("id", triadRunId).eq("case_id", id).maybeSingle()
    : supabase.from("triad_engine_runs").select("id, run_version, created_at").eq("case_id", id).order("run_version", { ascending: false }).limit(1);

  const triadRes = await triadQuery;
  const selectedTriadRun = Array.isArray(triadRes?.data) ? triadRes.data?.[0] : triadRes?.data;

  if (!selectedTriadRun) {
    return (
      <HrShell currentPath="/hr-admin/cases" heading={`Nyaya Council: ${caseRow.token || caseRow.id}`}>
        <Card>
          <CardHeader>
            <CardTitle>No Triad Run Selected</CardTitle>
            <CardDescription>Run Triad first, then start Nyaya on a specific run to keep the same case context.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link href={`/hr-admin/cases/${id}/triad`}>Go To Triad Engine</Link></Button>
          </CardContent>
        </Card>
      </HrShell>
    );
  }

  const { data: sessions } = await supabase
    .from("nyaya_council_sessions")
    .select("id, session_mode, hr_question, created_at")
    .eq("case_id", id)
    .eq("triad_run_id", selectedTriadRun.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (shouldStart || !sessions?.length || mode === "hr-council") {
    return (
      <NyayaCourtroom
        caseId={id}
        triadRunId={selectedTriadRun.id}
        mode={mode === "hr-council" ? "hr-council" : "auto"}
        initialPrompt={prompt}
        initialSessionId={sessionId}
      />
    );
  }

  const latest = sessions[0];

  return (
    <HrShell currentPath="/hr-admin/cases" heading={`Nyaya Council: ${caseRow.token || caseRow.id}`}>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Nyaya Session Already Exists</CardTitle>
          <CardDescription>
            Run version v{selectedTriadRun.run_version} already has Nyaya results. You can view them or start a fresh Nyaya run.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/cases/${id}/nyaya/results/${latest.id}`}>View Latest Nyaya Result</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/cases/${id}/nyaya/chats`}>View Nyaya Chat Sessions</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/cases/${id}/nyaya?triadRunId=${selectedTriadRun.id}&start=1`}>Start New Nyaya</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/hr-admin/cases/${id}/triad`}>Back To Triad</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Previous Nyaya Sessions</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link href={`/cases/${id}/nyaya/chats`}>Open Full Chat Session Page</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessions.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{row.session_mode === "hr_question" ? "HR Question Session" : "Auto Council Session"}</p>
                <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
                {row.hr_question ? <p className="mt-1 text-xs">Question: {row.hr_question}</p> : null}
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/cases/${id}/nyaya/results/${row.id}`}>Open Result</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </HrShell>
  );
}

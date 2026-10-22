import Link from "next/link";
import { notFound } from "next/navigation";

import HrShell from "@/components/hr/hr-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

function normalizeTurns(chatJson) {
  if (Array.isArray(chatJson?.turns)) {
    return chatJson.turns.map((turn, idx) => ({
      id: `turn-${idx + 1}`,
      speaker: turn?.speaker || turn?.agent || "agent",
      round: turn?.round || null,
      message: turn?.message || turn?.content || "-",
    }));
  }

  if (Array.isArray(chatJson?.camera_script)) {
    return chatJson.camera_script.map((turn, idx) => ({
      id: `cam-${idx + 1}`,
      speaker: turn?.agent || turn?.speaker || "agent",
      round: turn?.round || null,
      message: turn?.content || turn?.bubble || "-",
    }));
  }

  return [];
}

export default async function NyayaChatsPage({ params }) {
  const { id } = await params;
  const supabase = createSupabaseServiceRoleClient();

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id, token")
    .eq("id", id)
    .maybeSingle();

  if (caseError || !caseRow) {
    notFound();
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("nyaya_council_sessions")
    .select("id, triad_run_id, session_mode, hr_question, created_at, chat_json, conclusion_json")
    .eq("case_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (sessionsError) {
    return (
      <HrShell currentPath="/hr-admin/cases" heading={`Nyaya Chat Sessions: ${caseRow.token || caseRow.id}`}>
        <Card>
          <CardHeader>
            <CardTitle>Unable To Load Nyaya Sessions</CardTitle>
            <CardDescription>{String(sessionsError.message || "Unknown database error")}</CardDescription>
          </CardHeader>
        </Card>
      </HrShell>
    );
  }

  return (
    <HrShell currentPath="/hr-admin/cases" heading={`Nyaya Chat Sessions: ${caseRow.token || caseRow.id}`}>
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Stored Nyaya Discussions</CardTitle>
            <CardDescription>
              Full chat history from nyaya_council_sessions.chat_json is shown below, including auto council and HR follow-up sessions.
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link href={`/cases/${id}/nyaya`}>Back To Nyaya</Link>
          </Button>
        </CardHeader>
      </Card>

      <div className="space-y-4">
        {(sessions || []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No Nyaya sessions found for this case yet.
            </CardContent>
          </Card>
        ) : (
          (sessions || []).map((session) => {
            const turns = normalizeTurns(session.chat_json);
            const conclusion = session?.conclusion_json || {};

            return (
              <Card key={session.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        {session.session_mode === "hr_question" ? "HR Question Session" : "Auto Council Session"}
                      </CardTitle>
                      <CardDescription>
                        Session {session.id} · {new Date(session.created_at).toLocaleString()} · Triad {session.triad_run_id || "n/a"}
                      </CardDescription>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/cases/${id}/nyaya/results/${session.id}`}>Open Result</Link>
                    </Button>
                  </div>
                  {session.hr_question ? (
                    <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm">Question: {session.hr_question}</p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Conclusion Snapshot</p>
                    <p className="mt-1 text-sm">
                      {conclusion?.answer_summary || conclusion?.executive_summary || "No summary generated."}
                    </p>
                  </div>

                  <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Full Discussion Transcript</p>
                    {turns.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No discussion turns available in chat_json.</p>
                    ) : (
                      turns.map((turn, idx) => (
                        <div key={turn.id} className="rounded-md border bg-background p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            #{idx + 1} · {turn.speaker}{turn.round ? ` · Round ${turn.round}` : ""}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed">{turn.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </HrShell>
  );
}

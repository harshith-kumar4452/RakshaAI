import { notFound } from "next/navigation";

import HrShell from "@/components/hr/hr-shell";
import NyayaResultViewer from "@/components/nyaya/NyayaResultViewer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export default async function NyayaResultPage({ params }) {
  const { id, sessionId } = await params;
  const supabase = createSupabaseServiceRoleClient();

  const [{ data: caseRow, error: caseError }, { data: sessionRow, error: sessionError }] = await Promise.all([
    supabase.from("cases").select("id, token").eq("id", id).maybeSingle(),
    supabase
      .from("nyaya_council_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("case_id", id)
      .maybeSingle(),
  ]);

  if (caseError || !caseRow || sessionError || !sessionRow) {
    notFound();
  }

  let triadRun = null;
  if (sessionRow?.triad_run_id) {
    const { data } = await supabase.from("triad_engine_runs").select("id, run_version").eq("id", sessionRow.triad_run_id).maybeSingle();
    triadRun = data || null;
  }

  return (
    <HrShell currentPath="/hr-admin/cases" heading={`Nyaya Result: ${caseRow.token || caseRow.id}`}>
      <NyayaResultViewer caseId={id} caseToken={caseRow.token} session={sessionRow} triadRun={triadRun} />
    </HrShell>
  );
}

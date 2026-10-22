import { notFound } from "next/navigation";

import HrShell from "@/components/hr/hr-shell";
import TriadEngineClient from "@/components/hr/triad-engine-client";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export default async function HrCaseTriadPage({ params }) {
  const { id } = await params;
  const supabase = createSupabaseServiceRoleClient();

  const { data: caseRow, error } = await supabase
    .from("cases")
    .select("id, token")
    .eq("id", id)
    .maybeSingle();

  if (error || !caseRow) {
    notFound();
  }

  return (
    <HrShell currentPath="/hr-admin/cases" heading={`Triad Engine: ${caseRow.token || caseRow.id}`}>
      <TriadEngineClient caseId={caseRow.id} />
    </HrShell>
  );
}

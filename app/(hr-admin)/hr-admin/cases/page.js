import HrDashboardClient from "@/components/hr/hr-dashboard-client";
import HrShell from "@/components/hr/hr-shell";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const metadata = {
  title: "HR Cases | Justra",
};

export default async function HrCasesPage() {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("cases")
    .select("id, token, status, priority_score, description, summary, created_at")
    .order("created_at", { ascending: false });

  return (
    <HrShell currentPath="/hr-admin/cases" heading="All Cases">
      <HrDashboardClient cases={data || []} />
    </HrShell>
  );
}

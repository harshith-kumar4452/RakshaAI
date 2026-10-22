import HrDashboardClient from "@/components/hr/hr-dashboard-client";
import HrShell from "@/components/hr/hr-shell";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const metadata = {
  title: "HR Dashboard | Justra",
};

export default async function HrDashboardPage() {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("cases")
    .select("id, token, status, priority_score, description, summary, created_at, is_anonymous, victim_name")
    .order("created_at", { ascending: false });

  const caseIds = (data || []).map((row) => row.id).filter(Boolean);

  let identityByComplaintId = new Map();
  if (caseIds.length > 0) {
    const { data: identityRows } = await supabase
      .from("aadhaar_identity")
      .select(
        "complaint_id, full_name, gender, district, state, aadhaar_masked, is_verified, verification_method, updated_at"
      )
      .in("complaint_id", caseIds)
      .order("updated_at", { ascending: false });

    identityByComplaintId = new Map();
    (identityRows || []).forEach((row) => {
      if (!row?.complaint_id) return;
      if (!identityByComplaintId.has(row.complaint_id)) {
        identityByComplaintId.set(row.complaint_id, row);
      }
    });
  }

  const enrichedCases = (data || []).map((row) => {
    const identity = identityByComplaintId.get(row.id) || null;
    return {
      ...row,
      aadhaar_identity: identity,
    };
  });

  return (
    <HrShell currentPath="/hr-admin/dashboard" heading="Case Management Dashboard">
      <HrDashboardClient cases={enrichedCases} />
    </HrShell>
  );
}

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/complaints/status?caseId=JUST-XXXX
 *
 * Fetches complaint status details for a given public Case ID token.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = (searchParams.get("caseId") || "").trim();

    if (!caseId) {
      return NextResponse.json(
        { error: "Case ID is required" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("complaints")
      .select("id, token, status, created_at, updated_at, submitted_at, summary, is_anonymous, victim_name, victim_role")
      .eq("token", caseId)
      .maybeSingle();

    if (error) {
      console.error("Status fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch case status" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404 }
      );
    }

    const [caseByTokenRes, caseByIdRes, workflowRes] = await Promise.all([
      supabase
        .from("cases")
        .select("id, token, status, routed_to, escalated_to, priority_score, updated_at")
        .eq("token", caseId)
        .maybeSingle(),
      data?.id
        ? supabase
            .from("cases")
            .select("id, token, status, routed_to, escalated_to, priority_score, updated_at")
            .eq("id", data.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("case_status_workflow")
        .select("status, step_order, next_status, default_eta_days, label")
        .order("step_order", { ascending: true }),
    ]);

    const caseRow = caseByTokenRes?.data || caseByIdRes?.data || null;
    const workflowRows = workflowRes?.data || [];

    const effectiveStatus = caseRow?.status || data.status;
    const currentWorkflow = workflowRows.find((row) => row.status === effectiveStatus);

    let identifiedProfile = null;
    if (data.id) {
      const { data: aadhaarRow } = await supabase
        .from("aadhaar_identity")
        .select(
          "full_name, gender, date_of_birth, year_of_birth, address_line, district, state, pincode, aadhaar_masked, is_verified"
        )
        .eq("complaint_id", data.id)
        .maybeSingle();

      if (aadhaarRow) {
        identifiedProfile = aadhaarRow;
      }
    }

    return NextResponse.json({
      success: true,
      case: {
        caseId: data.token,
        status: effectiveStatus,
        routedTo: caseRow?.routed_to || null,
        escalatedTo: caseRow?.escalated_to || null,
        priorityScore: caseRow?.priority_score ?? null,
        etaDays: currentWorkflow?.default_eta_days ?? null,
        nextStatus: currentWorkflow?.next_status ?? null,
        workflow: workflowRows.map((row) => ({
          status: row.status,
          label: row.label,
          stepOrder: row.step_order,
        })),
        summary: data.summary,
        createdAt: data.created_at,
        updatedAt: caseRow?.updated_at || data.updated_at,
        submittedAt: data.submitted_at,
        isAnonymous: data.is_anonymous,
        victimName: data.victim_name,
        victimRole: data.victim_role,
        identifiedProfile,
      },
    });
  } catch (error) {
    console.error("Status route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

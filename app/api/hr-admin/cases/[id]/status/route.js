import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { note = "", channel = "sms" } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Case ID is required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();

    const { data: caseRow, error: caseError } = await supabase
      .from("cases")
      .select("id, token, status, routed_to, phone_number")
      .eq("id", id)
      .maybeSingle();

    if (caseError || !caseRow) {
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }

    const { data: currentStep, error: currentStepError } = await supabase
      .from("case_status_workflow")
      .select("next_status")
      .eq("status", caseRow.status)
      .maybeSingle();

    if (currentStepError) {
      return NextResponse.json({ error: "Unable to read status workflow." }, { status: 500 });
    }

    const nextStatus = currentStep?.next_status;
    if (!nextStatus) {
      return NextResponse.json(
        { error: "Case is already at final status. No further status can be sent." },
        { status: 400 }
      );
    }

    const { data: nextStepMeta } = await supabase
      .from("case_status_workflow")
      .select("default_eta_days")
      .eq("status", nextStatus)
      .maybeSingle();

    const etaDays = nextStepMeta?.default_eta_days ?? null;

    const { error: updateError } = await supabase
      .from("cases")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update case status." }, { status: 500 });
    }

    await supabase.from("case_status_history").insert({
      case_id: id,
      previous_status: caseRow.status,
      new_status: nextStatus,
      routed_to: caseRow.routed_to,
      eta_days: etaDays,
      note: String(note || ""),
      changed_by: "mock_hr",
    });

    const message = `Case ${caseRow.token || caseRow.id} is now ${nextStatus}. Routed to ${caseRow.routed_to || "pending"}. Estimated ${etaDays ?? "N/A"} day(s).`;

    await supabase.from("case_status_notifications").insert({
      case_id: id,
      case_status: nextStatus,
      recipient_phone: caseRow.phone_number,
      channel,
      message,
      send_state: "sent",
      sent_at: new Date().toISOString(),
      provider_response: { mode: "mock" },
    });

    return NextResponse.json({
      success: true,
      status: nextStatus,
      routedTo: caseRow.routed_to,
      etaDays,
      message,
    });
  } catch (error) {
    return NextResponse.json({ error: "Unexpected error while sending status." }, { status: 500 });
  }
}

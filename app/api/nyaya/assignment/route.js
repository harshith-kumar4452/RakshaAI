import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

function priorityFromScore(score) {
  const n = Number(score || 0);
  if (n >= 9) return "critical";
  if (n >= 7) return "high";
  if (n >= 5) return "medium";
  return "low";
}

function getRoutingContext({ caseRow, sessionRow, triadRun, routingRow }) {
  const conclusion = sessionRow?.conclusion_json || {};
  const hierarchy = conclusion?.routing_hierarchy || {};
  const routeAdvice = conclusion?.recommended_route || conclusion?.route_advice || triadRun?.rag_result?.routing || {};

  const actCode = hierarchy?.act_code || routeAdvice?.act_code || triadRun?.rag_result?.routing?.act_code || "BNS";
  const priorityLabel = String(
    hierarchy?.priority_label
      || routeAdvice?.priority_label
      || triadRun?.rag_result?.routing?.priority_label
      || priorityFromScore(caseRow?.priority_score)
  ).toLowerCase();

  const levels = Array.isArray(routingRow?.config?.levels) ? routingRow.config.levels : [];
  const selected = levels.find((row) => String(row?.priority || "").toLowerCase() === priorityLabel) || levels[0] || null;

  return {
    actCode,
    priorityLabel,
    levels,
    selectedAuthority: selected?.authority || routeAdvice?.authority || routeAdvice?.suggested_authority || null,
    selectedEscalation: selected?.escalate_to || routeAdvice?.escalation || routeAdvice?.suggested_escalation || null,
    selectedLevel: selected?.level || null,
    selectedDays: selected?.days ?? null,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = String(searchParams.get("caseId") || "").trim();
    const sessionId = String(searchParams.get("sessionId") || "").trim();

    if (!caseId || !sessionId) {
      return NextResponse.json({ error: "caseId and sessionId are required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const [{ data: caseRow }, { data: sessionRow }] = await Promise.all([
      supabase.from("cases").select("id, token, status, priority_score, routed_to, escalated_to").eq("id", caseId).maybeSingle(),
      supabase.from("nyaya_council_sessions").select("id, triad_run_id, conclusion_json").eq("id", sessionId).eq("case_id", caseId).maybeSingle(),
    ]);

    if (!caseRow || !sessionRow) {
      return NextResponse.json({ error: "Case or Nyaya session not found." }, { status: 404 });
    }

    let triadRun = null;
    if (sessionRow?.triad_run_id) {
      const { data } = await supabase
        .from("triad_engine_runs")
        .select("id, rag_result")
        .eq("id", sessionRow.triad_run_id)
        .maybeSingle();
      triadRun = data || null;
    }

    const baseActCode =
      sessionRow?.conclusion_json?.routing_hierarchy?.act_code
      || sessionRow?.conclusion_json?.recommended_route?.act_code
      || triadRun?.rag_result?.routing?.act_code
      || "BNS";

    const { data: routingRow } = await supabase
      .from("act_routing_config")
      .select("act_code, config")
      .eq("act_code", baseActCode)
      .maybeSingle();

    const context = getRoutingContext({ caseRow, sessionRow, triadRun, routingRow });

    const officerOptions = Array.from(new Set(
      (context.levels || []).flatMap((level) => [level?.authority, level?.escalate_to]).filter(Boolean)
    ));

    const assignment = sessionRow?.conclusion_json?.assignment || null;

    return NextResponse.json({
      success: true,
      case: caseRow,
      suggested: {
        act_code: context.actCode,
        priority_label: context.priorityLabel,
        authority: context.selectedAuthority,
        escalate_to: context.selectedEscalation,
        level: context.selectedLevel,
        expected_days: context.selectedDays,
      },
      levels: context.levels,
      officerOptions,
      assignment,
      current: {
        routed_to: caseRow.routed_to || null,
        escalated_to: caseRow.escalated_to || null,
        status: caseRow.status || "submitted",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || "Failed to load assignment data.") }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const caseId = String(body?.caseId || "").trim();
    const sessionId = String(body?.sessionId || "").trim();
    const selectedAuthority = String(body?.selectedAuthority || "").trim();
    const escalateTo = body?.escalateTo == null ? null : String(body.escalateTo).trim() || null;
    const note = String(body?.note || "").trim();

    if (!caseId || !sessionId || !selectedAuthority) {
      return NextResponse.json({ error: "caseId, sessionId, and selectedAuthority are required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();

    const [{ data: caseRow }, { data: sessionRow }] = await Promise.all([
      supabase.from("cases").select("id, token, status").eq("id", caseId).maybeSingle(),
      supabase.from("nyaya_council_sessions").select("id, conclusion_json").eq("id", sessionId).eq("case_id", caseId).maybeSingle(),
    ]);

    if (!caseRow || !sessionRow) {
      return NextResponse.json({ error: "Case or Nyaya session not found." }, { status: 404 });
    }

    const previousStatus = caseRow.status || "submitted";
    const nextStatus = "assigned";

    const { error: caseUpdateError } = await supabase
      .from("cases")
      .update({
        routed_to: selectedAuthority,
        escalated_to: escalateTo,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId);

    if (caseUpdateError) {
      return NextResponse.json({ error: "Failed to update case assignment." }, { status: 500 });
    }

    // Best-effort: mirror status into complaints using both possible keys.
    const complaintPatch = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from("complaints")
      .update(complaintPatch)
      .eq("id", caseId);

    if (caseRow.token) {
      await supabase
        .from("complaints")
        .update(complaintPatch)
        .eq("token", caseRow.token);
    }

    await supabase.from("case_status_history").insert({
      case_id: caseId,
      previous_status: previousStatus,
      new_status: nextStatus,
      routed_to: selectedAuthority,
      eta_days: null,
      note: note || "Assigned from Nyaya FIR flow",
      changed_by: "hr_admin",
    });

    const updatedConclusion = {
      ...(sessionRow.conclusion_json || {}),
      assignment: {
        selected_authority: selectedAuthority,
        escalate_to: escalateTo,
        note: note || null,
        updated_at: new Date().toISOString(),
        source: "hr_override_or_auto",
      },
    };

    await supabase
      .from("nyaya_council_sessions")
      .update({
        conclusion_json: updatedConclusion,
      })
      .eq("id", sessionId);

    return NextResponse.json({
      success: true,
      message: "Case assignment updated.",
      assignment: updatedConclusion.assignment,
      case_status: nextStatus,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error?.message || "Failed to update assignment.") }, { status: 500 });
  }
}

import Link from "next/link";
import { notFound } from "next/navigation";

import HrShell from "@/components/hr/hr-shell";
import FirTemplateViewer from "@/components/nyaya/FirTemplateViewer";
import { Button } from "@/components/ui/button";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

function buildFirLatex({ caseRow, sessionRow, triadRun }) {
  const summary = sessionRow?.conclusion_json?.executive_summary
    || sessionRow?.conclusion_json?.answer_summary
    || caseRow?.summary
    || caseRow?.description
    || "Details to be completed.";

  const timeline = Array.isArray(caseRow?.timeline)
    ? caseRow.timeline.map((event, idx) => `${idx + 1}. ${event?.date || "Unknown date"} - ${event?.description || ""}`).join("\\n")
    : "Timeline not available.";

  const acts = triadRun?.rag_result?.routing?.act_code || "BNS";
  const occurrence = Array.isArray(caseRow?.timeline) && caseRow.timeline[0]
    ? `${caseRow.timeline[0]?.date || "[DD/MM/YYYY]"}`
    : "[DD/MM/YYYY - HH:MM]";

  const place = Array.isArray(caseRow?.timeline) && caseRow.timeline[0]?.place
    ? caseRow.timeline[0].place
    : "[Location Details]";

  const accused = caseRow?.accused_name || "Unknown";
  const risk = triadRun?.timeline_result?.risk_projection?.risk_level || "Medium";
  const priority = caseRow?.priority_score != null ? String(caseRow.priority_score) : "[Low / Medium / High]";

  return `\\documentclass[11pt, a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{titlesec}
\\usepackage{booktabs}
\\usepackage{setspace}

% Title formatting
\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]
\\titlespacing{\\section}{0pt}{12pt}{8pt}

\\title{\\textbf{FIRST INFORMATION REPORT (FIR)}\\\\ \\large (Under Section 154 Cr.P.C.)}
\\author{Police Department}
\\date{\\today}

\\begin{document}

\\maketitle
\\onehalfspacing

%--- Case Information Header ---
\\section{Case Details}
\\begin{tabular}{llp{8cm}}
    \\textbf{FIR No:} & 0000/2026 & \\
    \\textbf{Date:} & \\today & \\
    \\textbf{District:} & [Enter District] & \\
    \\textbf{Police Station:} & [Enter Station] & \\
    \\textbf{Acts/Sections:} & ${acts} & (or as applicable) \\
\\end{tabular}

%--- Complainant ---
\\section{1. Complainant / Informant}
\\begin{tabular}{ll}
    \\textbf{Name:} & ${caseRow?.victim_name || "[Name of Complainant]"} \\
    \\textbf{Father/Spouse Name:} & [Name] \\
    \\textbf{Address:} & ${caseRow?.victim_address || "[Full Address]"} \\
    \\textbf{Contact No:} & ${caseRow?.victim_phone || "[Phone Number]"} \\
\\end{tabular}

%--- Victim ---
\\section{2. Victim Details (if applicable)}
\\begin{tabular}{ll}
    \\textbf{Name:} & ${caseRow?.victim_name || "[Victim Name]"} \\
    \\textbf{Age:} & ${caseRow?.victim_age || "[Age]"} \\
    \\textbf{Gender:} & ${caseRow?.victim_gender || "[Male/Female/Other]"} \\
    \\textbf{Address:} & ${caseRow?.victim_address || "[Full Address]"} \\
\\end{tabular}

%--- Incident Details ---
\\section{3. Details of Incident}
\\begin{tabular}{ll}
    \\textbf{Date/Time of Occurrence:} & ${occurrence} \\
    \\textbf{Place of Occurrence:} & ${place} \\
    \\textbf{Distance from PS:} & [e.g., 2 km East] \\
\\end{tabular}

%--- Complaint ---
\\section{4. Nature of Information / Complaint}
${summary}

%--- Detailed Description ---
\\section{5. Detailed Description of Incident}
${timeline}

%--- Accused ---
\\section{6. Particulars of Accused (if known)}
\\begin{itemize}
    \\item Name: ${accused}
    \\item Address / Description: [To be completed]
\\end{itemize}

%--- Property ---
\\section{7. Property / Evidence Details}
\\begin{tabular}{lll}
    \\textbf{Item} & \\textbf{Description} & \\textbf{Estimated Value} \\
    [Evidence Item] & [Details from uploads / screenshots / OCR] & [\\textbackslash rupee Amount] \\
\\end{tabular}

%--- Attachments ---
\\section{8. Documents Attached}
\\begin{itemize}
    \\item Identity Proof
    \\item Photos / Screenshots
    \\item Bills / Receipts
    \\item Other evidence
\\end{itemize}

%--- Metadata ---
\\section{9. System Metadata}
\\begin{tabular}{ll}
    \\textbf{Case ID:} & ${caseRow?.id || "[Auto-generated ID]"} \\
    \\textbf{Status:} & ${caseRow?.status || "[Open / Under Investigation / Closed]"} \\
    \\textbf{Priority:} & ${priority} \\
    \\textbf{Risk Level:} & ${risk} \\
\\end{tabular}

%--- Signatures ---
\\vspace{1cm}
\\noindent
\\begin{tabular}{@{}p{0.5\\textwidth}p{0.5\\textwidth}@{}}
    \\rule{6cm}{0.4pt} & \\rule{6cm}{0.4pt} \\
    Signature of Complainant & Signature of Duty Officer \\
    & \\
    Date: & Police Station Seal: \\
\\end{tabular}

\\end{document}`;
}

function buildInitialFields({ caseRow, sessionRow, triadRun }) {
  const conclusion = sessionRow?.conclusion_json || {};
  const route = conclusion?.recommended_route || conclusion?.route_advice || triadRun?.rag_result?.routing || {};
  const timeline = Array.isArray(caseRow?.timeline) ? caseRow.timeline : [];
  const firstEvent = timeline[0] || {};
  const predictedSequence = Array.isArray(triadRun?.timeline_result?.predicted_sequence)
    ? triadRun.timeline_result.predicted_sequence
    : [];
  const timelineEvents = timeline
    .map((event) => ({
      date: event?.date || "Unknown",
      description: (event?.description || "").trim(),
    }))
    .filter((event) => event.description.length > 0 || event.date !== "Unknown");
  const predictedEvents = predictedSequence
    .map((event) => ({
      date: event?.date || event?.date_hint || "Unknown",
      description: (event?.description || event?.event || "").trim(),
    }))
    .filter((event) => event.description.length > 0);

  const timelineLines = timelineEvents.map((event, idx) => `${idx + 1}. ${event.date} - ${event.description}`);
  const predictedLines = predictedEvents.map((event, idx) => `${idx + 1 + timelineLines.length}. ${event.date} - ${event.description}`);
  const progression = triadRun?.timeline_result?.likely_progression
    ? `Progression Note: ${triadRun.timeline_result.likely_progression}`
    : "";
  const ragFindings = Array.isArray(triadRun?.rag_result?.findings)
    ? triadRun.rag_result.findings.map((item, idx) => `Finding ${idx + 1}: ${item}`)
    : [];

  const detailedDescription = [
    ...timelineLines,
    ...predictedLines,
    progression,
    ...ragFindings,
  ].filter(Boolean).join("\n");

  const legalSections = Array.isArray(triadRun?.rag_result?.legal_evidence)
    ? triadRun.rag_result.legal_evidence
        .map((row) => `${row?.act_name || "Act"}${row?.section_title ? ` - ${row.section_title}` : ""}`)
        .filter(Boolean)
    : [];
  const actsText = route?.act_code
    ? `${route.act_code}${legalSections.length ? `; ${legalSections.slice(0, 3).join("; ")}` : ""}`
    : (legalSections.slice(0, 3).join("; ") || "IPC 379/411");

  return {
    firNo: "0000/2026",
    district: caseRow?.victim_district || "[Enter District]",
    policeStation: "[Enter Station]",
    acts: actsText,
    complainantName: caseRow?.victim_name || "[Name of Complainant]",
    guardianName: "[Name]",
    complainantAddress: caseRow?.victim_address || "[Full Address]",
    complainantPhone: caseRow?.victim_phone || "[Phone Number]",
    victimName: caseRow?.victim_name || "[Victim Name]",
    victimAge: caseRow?.victim_age || "[Age]",
    victimGender: caseRow?.victim_gender || "[Male/Female/Other]",
    victimAddress: caseRow?.victim_address || "[Full Address]",
    occurrenceDateTime: firstEvent?.date || "[DD/MM/YYYY - HH:MM]",
    occurrencePlace: firstEvent?.place || "[Location Details]",
    distanceFromPs: "[e.g., 2 km East]",
    complaintSummary:
      conclusion?.executive_summary
      || conclusion?.answer_summary
      || caseRow?.summary
      || caseRow?.description
      || "[Brief description of the incident]",
    detailedDescription: detailedDescription || "[Chronological explanation of events, sequence, actions, etc.]",
    accusedName: caseRow?.accused_name || "Unknown",
    accusedDescription: "[Address / Description]",
    evidenceItem: "[Evidence Item]",
    evidenceDescription: "[Details from uploads / screenshots / OCR]",
    evidenceValue: "[₹ Amount]",
    attachments: "Identity Proof, Photos / Screenshots, Bills / Receipts, Other evidence",
    caseId: caseRow?.id || "[Auto-generated ID]",
    sessionId: sessionRow?.id || "",
    caseStatus: caseRow?.status || "[Open / Under Investigation / Closed]",
    priority: caseRow?.priority_score != null ? String(caseRow.priority_score) : "[Low / Medium / High]",
    routeAuthority: route?.authority || route?.suggested_authority || "Police Complaint",
    routeEscalateTo: route?.escalation || route?.suggested_escalation || "FIR",
  };
}

export default async function NyayaFirPage({ params }) {
  const { id, sessionId } = await params;
  const supabase = createSupabaseServiceRoleClient();

  const [{ data: caseRow, error: caseError }, { data: sessionRow, error: sessionError }] = await Promise.all([
    supabase.from("cases").select("*").eq("id", id).maybeSingle(),
    supabase.from("nyaya_council_sessions").select("*").eq("id", sessionId).eq("case_id", id).maybeSingle(),
  ]);

  if (caseError || !caseRow || sessionError || !sessionRow) {
    notFound();
  }

  let triadRun = null;
  if (sessionRow?.triad_run_id) {
    const { data } = await supabase.from("triad_engine_runs").select("*").eq("id", sessionRow.triad_run_id).maybeSingle();
    triadRun = data || null;
  }

  const initialFields = buildInitialFields({ caseRow, sessionRow, triadRun });
  const initialLatex = buildFirLatex({ caseRow, sessionRow, triadRun });

  return (
    <HrShell currentPath="/hr-admin/cases" heading={`FIR Draft: ${caseRow.token || caseRow.id}`}>
      <div className="mb-3 flex items-center justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={`/cases/${id}/nyaya/results/${sessionId}`}>Back To Nyaya Result</Link>
        </Button>
      </div>
      <FirTemplateViewer
        initialFields={initialFields}
        initialLatex={initialLatex}
        assignmentUrl={`/cases/${id}/nyaya/results/${sessionId}/assign`}
      />
    </HrShell>
  );
}

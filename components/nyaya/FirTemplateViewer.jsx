"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function escapeLatex(value) {
  return String(value || "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function generateLatex(fields) {
  const attachments = String(fields.attachments || "Identity Proof, Photos / Screenshots, Bills / Receipts, Other evidence")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

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

\\section{Case Details}
\\begin{tabular}{llp{8cm}}
  \\textbf{FIR No:} & ${escapeLatex(fields.firNo || "0000/2026")} & \\\\
  \\textbf{Date:} & \\today & \\\\
  \\textbf{District:} & ${escapeLatex(fields.district || "[Enter District]")} & \\\\
  \\textbf{Police Station:} & ${escapeLatex(fields.policeStation || "[Enter Station]")} & \\\\
  \\textbf{Acts/Sections:} & ${escapeLatex(fields.acts || "IPC 379/411")} & (or as applicable) \\\\
\\end{tabular}

\\section{1. Complainant / Informant}
\\begin{tabular}{ll}
  \\textbf{Name:} & ${escapeLatex(fields.complainantName || "[Name of Complainant]")} \\\\
  \\textbf{Father/Spouse Name:} & ${escapeLatex(fields.guardianName || "[Name]")} \\\\
  \\textbf{Address:} & ${escapeLatex(fields.complainantAddress || "[Full Address]")} \\\\
  \\textbf{Contact No:} & ${escapeLatex(fields.complainantPhone || "[Phone Number]")} \\\\
\\end{tabular}

\\section{2. Victim Details (if applicable)}
\\begin{tabular}{ll}
  \\textbf{Name:} & ${escapeLatex(fields.victimName || "[Victim Name]")} \\\\
  \\textbf{Age:} & ${escapeLatex(fields.victimAge || "[Age]")} \\\\
  \\textbf{Gender:} & ${escapeLatex(fields.victimGender || "[Male/Female/Other]")} \\\\
  \\textbf{Address:} & ${escapeLatex(fields.victimAddress || "[Full Address]")} \\\\
\\end{tabular}

\\section{3. Details of Incident}
\\begin{tabular}{ll}
  \\textbf{Date/Time of Occurrence:} & ${escapeLatex(fields.occurrenceDateTime || "[DD/MM/YYYY - HH:MM]")} \\\\
  \\textbf{Place of Occurrence:} & ${escapeLatex(fields.occurrencePlace || "[Location Details]")} \\\\
  \\textbf{Distance from PS:} & ${escapeLatex(fields.distanceFromPs || "[e.g., 2 km East]")} \\\\
\\end{tabular}

\\section{4. Nature of Information / Complaint}
${escapeLatex(fields.complaintSummary || "[Brief description of the incident]")}

\\section{5. Detailed Description of Incident}
${escapeLatex(fields.detailedDescription || "[Chronological explanation of events, sequence, actions, etc.]")}

\\section{6. Particulars of Accused (if known)}
\\begin{itemize}
  \\item ${escapeLatex(fields.accusedName || "Name / Unknown")}
  \\item ${escapeLatex(fields.accusedDescription || "Address / Description")}
\\end{itemize}

\\section{7. Property / Evidence Details}
\\begin{tabular}{lll}
  \\textbf{Item} & \\textbf{Description} & \\textbf{Estimated Value} \\\\
  ${escapeLatex(fields.evidenceItem || "[Item]")} & ${escapeLatex(fields.evidenceDescription || "[Details]")} & ${escapeLatex(fields.evidenceValue || "[INR Amount]")} \\\\
\\end{tabular}

\\section{8. Documents Attached}
\\begin{itemize}
${attachments.map((item) => `  \\item ${escapeLatex(item)}`).join("\n")}
\\end{itemize}

\\section{9. System Metadata}
\\begin{tabular}{ll}
  \\textbf{Case ID:} & ${escapeLatex(fields.caseId || "[Auto-generated ID]")} \\\\
  \\textbf{Status:} & ${escapeLatex(fields.caseStatus || "[Open / Under Investigation / Closed]")} \\\\
  \\textbf{Priority:} & ${escapeLatex(fields.priority || "[Low / Medium / High]")} \\\\
\\end{tabular}

\\vspace{1cm}
\\noindent
\\begin{tabular}{@{}p{0.5\\textwidth}p{0.5\\textwidth}@{}}
  \\rule{6cm}{0.4pt} & \\rule{6cm}{0.4pt} \\\\
  Signature of Complainant & Signature of Duty Officer \\\\
  & \\\\
  Date: & Police Station Seal: \\\\
\\end{tabular}

\\end{document}`;
}

export default function FirTemplateViewer({ initialFields, initialLatex, assignmentUrl }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [fields, setFields] = useState(initialFields || {});
  const [latex, setLatex] = useState(initialLatex || "");
  const [artifacts, setArtifacts] = useState([]);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    setLatex(generateLatex(fields));
  }, [fields]);

  const caseId = fields.caseId || "";
  const sessionId = fields.sessionId || "";

  useEffect(() => {
    async function loadArtifacts() {
      if (!caseId || !sessionId) {
        setArtifacts([]);
        return;
      }

      try {
        const response = await fetch(`/api/nyaya/fir-export?caseId=${encodeURIComponent(caseId)}&sessionId=${encodeURIComponent(sessionId)}`);
        const payload = await response.json();
        setArtifacts(Array.isArray(payload?.files) ? payload.files : []);
      } catch {
        setArtifacts([]);
      }
    }

    loadArtifacts();
  }, [caseId, sessionId]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(latex || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function handleGenerateDocx() {
    if (!caseId || !sessionId) {
      setExportError("Case ID or session ID missing. Unable to generate document.");
      return;
    }

    setExportBusy(true);
    setExportError("");

    try {
      const response = await fetch("/api/nyaya/fir-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latex,
          caseId,
          sessionId,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setExportError(payload?.error || "Failed to generate document with Pandoc.");
        return;
      }

      setArtifacts(Array.isArray(payload?.files) ? payload.files : []);

      if (assignmentUrl) {
        setTimeout(() => {
          router.push(assignmentUrl);
        }, 450);
      }
    } catch {
      setExportError("Failed to contact document generation service.");
    } finally {
      setExportBusy(false);
    }
  }

  function updateField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>FIR Editor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[ 
            ["firNo", "FIR No"],
            ["district", "District"],
            ["policeStation", "Police Station"],
            ["acts", "Acts/Sections"],
            ["complainantName", "Complainant Name"],
            ["complainantPhone", "Complainant Phone"],
            ["complainantAddress", "Complainant Address"],
            ["victimName", "Victim Name"],
            ["occurrenceDateTime", "Occurrence Date/Time"],
            ["occurrencePlace", "Occurrence Place"],
            ["accusedName", "Accused Name"],
            ["routeAuthority", "Route Authority"],
            ["routeEscalateTo", "Escalate To"],
          ].map(([key, label]) => (
            <div key={key}>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={fields[key] || ""}
                onChange={(event) => updateField(key, event.target.value)}
              />
            </div>
          ))}

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Complaint Summary</p>
            <textarea className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm" value={fields.complaintSummary || ""} onChange={(event) => updateField("complaintSummary", event.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Detailed Description</p>
            <textarea className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm" value={fields.detailedDescription || ""} onChange={(event) => updateField("detailedDescription", event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle>LaTeX (Auto-updating)</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleGenerateDocx} disabled={exportBusy}>
              {exportBusy ? "Generating..." : "Generate .docx (Pandoc)"}
            </Button>
            <Button onClick={handleCopy}>{copied ? "Copied" : "Copy LaTeX"}</Button>
          </div>
        </CardHeader>
        <CardContent>
          {exportError ? (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {exportError}
            </p>
          ) : null}

          {assignmentUrl ? (
            <p className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              After FIR generation, you will be redirected to officer assignment.
            </p>
          ) : null}

          {artifacts.length ? (
            <div className="mb-3 rounded-md border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Stored Local Files
              </p>
              <div className="grid gap-1 text-xs">
                {artifacts.map((file) => (
                  <a
                    key={file.url}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline underline-offset-2"
                  >
                    {file.name}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <textarea
            className="min-h-[75vh] w-full rounded-md border bg-muted/20 p-3 text-xs"
            value={latex}
            onChange={(event) => setLatex(event.target.value)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

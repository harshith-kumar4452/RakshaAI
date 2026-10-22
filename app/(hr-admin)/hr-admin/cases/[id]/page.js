import Link from "next/link";
import { notFound } from "next/navigation";

import CaseTechnicalMetadata from "@/components/hr/case-technical-metadata";
import CaseStatusPanel from "@/components/hr/case-status-panel";
import CaseTimeline from "@/components/hr/case-timeline";
import EvidenceInsightsGrid from "@/components/hr/evidence-insights-grid";
import HrShell from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

function displayValue(value) {
  if (value === null || typeof value === "undefined" || value === "") return "";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function hasDisplayValue(value) {
  if (value === null || typeof value === "undefined") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function InfoItem({ label, value }) {
  if (!hasDisplayValue(value)) return null;

  return (
    <div className="rounded-md border bg-background/70 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium break-words">{displayValue(value)}</p>
    </div>
  );
}

export default async function HrCaseDetailsPage({ params }) {
  const { id } = await params;
  const supabase = createSupabaseServiceRoleClient();

  const [{ data: caseRow, error }, { data: evidenceRows }, { data: nyayaSession }] = await Promise.all([
    supabase
      .from("cases")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("evidence")
      .select("id, storage_path, file_type, file_metadata, ai_description, ai_ocr_text, ai_entities, ai_actions, uploaded_at")
      .eq("case_id", id)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("nyaya_council_sessions")
      .select("id, created_at, conclusion_json")
      .eq("case_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (error || !caseRow) {
    notFound();
  }

  const excludedKeys = new Set([
    "id",
    "token",
    "status",
    "priority_score",
    "description",
    "summary",
    "timeline",
  ]);

  const remainingEntries = Object.entries(caseRow).filter(
    ([key, value]) => !excludedKeys.has(key) && hasDisplayValue(value)
  );

  const technicalEntries = remainingEntries.map(([key, value]) => ({
    key,
    value: typeof value === "object" ? JSON.stringify(value) : String(value),
  }));

  return (
    <HrShell currentPath="/hr-admin/cases" heading={`Case Details: ${caseRow.token || caseRow.id}`}>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button asChild>
            <Link href={`/hr-admin/cases/${caseRow.id}/triad`}>Triad Engine</Link>
          </Button>
        </div>

        <CaseStatusPanel
          caseId={caseRow.id}
          token={caseRow.token}
          currentStatus={caseRow.status || "submitted"}
          routedTo={caseRow.routed_to}
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Overview</CardTitle>
              <CardDescription>Priority-oriented case summary for HR review.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{caseRow.status || "submitted"}</Badge>
              <Badge>Priority {Number(caseRow.priority_score || 0)}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <InfoItem label="Case ID" value={caseRow.id} />
              <InfoItem label="Token" value={caseRow.token} />
              <InfoItem label="Routed To" value={caseRow.routed_to} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nyaya / FIR Pipeline</CardTitle>
            <CardDescription>Assignment status after FIR generation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <InfoItem label="Assigned To" value={caseRow.routed_to || "Pending"} />
              <InfoItem label="Escalation" value={caseRow.escalated_to || "Pending"} />
              <InfoItem label="Pipeline Status" value={caseRow.status || "submitted"} />
            </div>
            {nyayaSession?.id && nyayaSession?.conclusion_json?.fir_generated_at ? (
              <Button asChild variant="outline">
                <Link href={`/cases/${caseRow.id}/nyaya/results/${nyayaSession.id}/assign`}>Open Assignment View</Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Generate FIR first, then assignment workflow will appear here.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Narrative</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {hasDisplayValue(caseRow.summary) ? (
                <div className="rounded-md border bg-background/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Summary</p>
                  <p className="mt-1 text-sm">{caseRow.summary}</p>
                </div>
              ) : null}
              {hasDisplayValue(caseRow.description) ? (
                <div className="rounded-md border bg-background/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Description</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{caseRow.description}</p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Incident and Parties</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoItem label="Incident Types" value={caseRow.incident_types} />
                <InfoItem label="Incident Date" value={caseRow.incident_date} />
                <InfoItem label="Location (General)" value={caseRow.location_general} />
                <InfoItem label="Location (Detail)" value={caseRow.location_detail} />
                <InfoItem label="Accused Name" value={caseRow.accused_name} />
                <InfoItem label="Accused Role" value={caseRow.accused_role} />
                <InfoItem label="Victim Name" value={caseRow.victim_name} />
                <InfoItem label="Victim Role" value={caseRow.victim_role} />
                <InfoItem label="Anonymous" value={caseRow.is_anonymous} />
                <InfoItem label="Phone Number" value={caseRow.phone_number} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Risk and Scores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoItem label="Severity" value={caseRow.severity} />
                <InfoItem label="Urgency" value={caseRow.urgency} />
                <InfoItem label="Emotion Score" value={caseRow.emotion_score} />
                <InfoItem label="Credibility Score" value={caseRow.credibility_score} />
                <InfoItem label="Escalated To" value={caseRow.escalated_to} />
                <InfoItem label="Exaggeration Flags" value={caseRow.exaggeration_flags} />
              </div>
            </CardContent>
          </Card>
        </div>

        <CaseTimeline timeline={caseRow.timeline} />

        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
            <CardDescription>Uploaded files with AI-generated evidence insights.</CardDescription>
          </CardHeader>
          <CardContent>
            {Array.isArray(evidenceRows) && evidenceRows.length > 0 ? (
              <EvidenceInsightsGrid evidenceRows={evidenceRows} />
            ) : (
              <p className="text-sm text-muted-foreground">No evidence uploaded for this case.</p>
            )}
          </CardContent>
        </Card>

        <CaseTechnicalMetadata entries={technicalEntries} />
      </div>
    </HrShell>
  );
}

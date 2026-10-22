import Link from "next/link";
import { notFound } from "next/navigation";

import HrShell from "@/components/hr/hr-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const SECTION_MAP = {
  rag: {
    title: "RAG Analysis",
    key: "rag_result",
    description:
      "Complete legal retrieval, classification, routing, and supporting legal evidence from this specific triad run.",
  },
  timeline: {
    title: "Timeline Analysis",
    key: "timeline_result",
    description:
      "Full chronology reconstruction, inconsistency detection, progression, and risk projection details.",
  },
  sentimental: {
    title: "Sentimental Analysis",
    key: "sentimental_result",
    description:
      "Detailed emotional pressure metrics, urgency scores, interpretation, and recommended response posture.",
  },
  "deep-research": {
    title: "Deep Research",
    key: "deep_research_result",
    description:
      "Matched profile details, risk flags, checks, and narrative risk context from background intelligence.",
  },
  dashboard: {
    title: "Dashboard Snapshot",
    key: "dashboard_result",
    description:
      "Aggregated triad highlight view, progress, and route-oriented executive dashboard signals.",
  },
};

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-background p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-right text-sm font-medium">{value || "n/a"}</p>
    </div>
  );
}

function BulletBlock({ title, items }) {
  const list = safeArray(items).filter(Boolean);
  if (!list.length) return null;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
          {list.map((item, idx) => (
            <li key={`${title}-${idx}`}>{String(item)}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RAGView({ payload }) {
  return (
    <>
      <Card className="mb-4">
        <CardHeader><CardTitle>Routing Recommendation</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <InfoRow label="Authority" value={payload?.routing?.suggested_authority} />
          <InfoRow label="Act" value={payload?.routing?.act_code} />
          <InfoRow label="Escalation" value={payload?.routing?.suggested_escalation} />
          <InfoRow label="Expected Days" value={payload?.routing?.expected_days != null ? String(payload.routing.expected_days) : "n/a"} />
          <InfoRow label="Priority" value={payload?.routing?.priority_label} />
          <InfoRow label="Level" value={payload?.routing?.level != null ? String(payload.routing.level) : "n/a"} />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle>Classification</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <InfoRow label="Type" value={payload?.classification?.type_name} />
          <InfoRow label="Subtype" value={payload?.classification?.subtype_name} />
          <InfoRow label="Severity" value={payload?.classification?.severity_level} />
          <InfoRow label="Default Authority" value={payload?.classification?.default_authority} />
          <InfoRow label="Mandatory Police Report" value={String(payload?.classification?.mandatory_police_report ?? "n/a")} />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle>Legal Pointers</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {safeArray(payload?.legal_evidence).slice(0, 12).map((row, idx) => (
            <div key={`legal-${idx}`} className="rounded-md border p-3">
              <p className="text-sm font-semibold">{row?.act_name || "Act"}</p>
              <p className="text-xs text-muted-foreground">{row?.section_title || "Section"}</p>
              {row?.chunk_text ? <p className="mt-2 text-sm leading-relaxed">{String(row.chunk_text)}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {payload?.detailed_document ? (
        <Card className="mb-4">
          <CardHeader><CardTitle>Detailed Interpretation</CardTitle></CardHeader>
          <CardContent><p className="text-sm leading-relaxed">{payload.detailed_document}</p></CardContent>
        </Card>
      ) : null}

      <BulletBlock title="Key Findings" items={payload?.findings} />
      <BulletBlock title="Immediate Actions" items={payload?.immediate_actions} />
      <BulletBlock title="Follow-up Questions" items={payload?.follow_up_questions} />
    </>
  );
}

function TimelineView({ payload }) {
  return (
    <>
      <Card className="mb-4">
        <CardHeader><CardTitle>Risk Projection</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <InfoRow label="Risk Level" value={payload?.risk_projection?.risk_level || payload?.risk_projection?.level} />
          <InfoRow label="Confidence" value={payload?.risk_projection?.confidence != null ? String(payload.risk_projection.confidence) : "n/a"} />
          <InfoRow label="Predicted Events" value={String(safeArray(payload?.predicted_sequence).length)} />
          <InfoRow label="Inconsistencies" value={String(safeArray(payload?.inconsistencies).length)} />
        </CardContent>
      </Card>

      {payload?.likely_progression ? (
        <Card className="mb-4">
          <CardHeader><CardTitle>Likely Progression</CardTitle></CardHeader>
          <CardContent><p className="text-sm leading-relaxed">{payload.likely_progression}</p></CardContent>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardHeader><CardTitle>Predicted Sequence</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {safeArray(payload?.predicted_sequence).map((row, idx) => (
            <div key={`seq-${idx}`} className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Step {row?.step || idx + 1}</p>
              <p className="mt-1 text-sm font-medium">{row?.date || row?.date_hint || "Date not specified"}</p>
              <p className="mt-1 text-sm">{row?.description || row?.event || "No description"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <BulletBlock title="Inconsistencies" items={payload?.inconsistencies} />
    </>
  );
}

function SentimentalView({ payload }) {
  return (
    <>
      <Card className="mb-4">
        <CardHeader><CardTitle>Emotional and Urgency Scores</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["Urgency", payload?.metrics?.urgency_score],
            ["Distress", payload?.metrics?.distress_score],
            ["Fear", payload?.metrics?.fear_score],
            ["Anger", payload?.metrics?.anger_score],
            ["Confidence", payload?.metrics?.confidence_score],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border p-3 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value ?? "n/a"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle>Interpretation</CardTitle></CardHeader>
        <CardContent><p className="text-sm leading-relaxed">{payload?.interpretation || "No interpretation available."}</p></CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle>Recommended Response Tone</CardTitle></CardHeader>
        <CardContent><p className="text-sm leading-relaxed">{payload?.recommended_response_tone || "No tone recommendation available."}</p></CardContent>
      </Card>
    </>
  );
}

function DeepResearchView({ payload }) {
  return (
    <>
      <Card className="mb-4">
        <CardHeader><CardTitle>Match Summary</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <InfoRow label="Accused Name" value={payload?.accused_name} />
          <InfoRow label="Total Matches" value={String(payload?.total_matches ?? safeArray(payload?.matched_persons).length)} />
          <InfoRow label="Match Strategy" value={payload?.match_strategy} />
          <InfoRow label="Risk Flags" value={safeArray(payload?.risk_flags).join(", ") || "none"} />
        </CardContent>
      </Card>

      {payload?.narrative_summary ? (
        <Card className="mb-4">
          <CardHeader><CardTitle>Narrative Summary</CardTitle></CardHeader>
          <CardContent><p className="text-sm leading-relaxed">{payload.narrative_summary}</p></CardContent>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardHeader><CardTitle>Matched Profiles</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {safeArray(payload?.matched_persons).map((person, idx) => (
            <div key={`person-${idx}`} className="rounded-md border p-3">
              <p className="text-sm font-semibold">{person?.name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground">{person?.occupation || "Occupation n/a"} · {person?.location || person?.home_city || "Location n/a"}</p>
              <p className="mt-1 text-sm">Criminal record: {String(person?.has_criminal_record ?? false)} · Cases: {person?.number_of_cases ?? 0}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <BulletBlock title="Recommended Checks" items={payload?.recommended_checks} />
    </>
  );
}

function DashboardView({ payload }) {
  return (
    <>
      <Card className="mb-4">
        <CardHeader><CardTitle>Progress Snapshot</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <InfoRow label="Completed Tools" value={`${payload?.progress?.completed_tools ?? "n/a"}/${payload?.progress?.total_tools ?? "n/a"}`} />
          <InfoRow label="Percent" value={payload?.progress?.percent != null ? `${payload.progress.percent}%` : "n/a"} />
          <InfoRow label="Overall Status" value={payload?.progress?.overall_status} />
          <InfoRow label="Generated At" value={payload?.generated_at} />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle>Highlights</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <InfoRow label="Suggested Classification" value={payload?.highlights?.suggested_case_classification} />
          <InfoRow label="Suggested Route" value={payload?.highlights?.suggested_route} />
          <InfoRow label="Accused Match Found" value={String(payload?.highlights?.accused_match_found ?? "n/a")} />
          <InfoRow label="Timeline Risk" value={payload?.highlights?.timeline_risk_level} />
          <InfoRow label="Urgency Score" value={payload?.highlights?.sentiment_urgency_score != null ? String(payload.highlights.sentiment_urgency_score) : "n/a"} />
        </CardContent>
      </Card>
    </>
  );
}

export default async function TriadSectionFullPage({ params }) {
  const { id, runId, section } = await params;
  const sectionConfig = SECTION_MAP[section];

  if (!sectionConfig) {
    notFound();
  }

  const supabase = createSupabaseServiceRoleClient();

  const [{ data: caseRow, error: caseError }, { data: runRow, error: runError }] = await Promise.all([
    supabase.from("cases").select("id, token").eq("id", id).maybeSingle(),
    supabase
      .from("triad_engine_runs")
      .select("*")
      .eq("id", runId)
      .eq("case_id", id)
      .maybeSingle(),
  ]);

  if (caseError || !caseRow || runError || !runRow) {
    notFound();
  }

  const payload = runRow?.[sectionConfig.key] || {};

  let body = null;
  if (section === "rag") body = <RAGView payload={payload} />;
  if (section === "timeline") body = <TimelineView payload={payload} />;
  if (section === "sentimental") body = <SentimentalView payload={payload} />;
  if (section === "deep-research") body = <DeepResearchView payload={payload} />;
  if (section === "dashboard") body = <DashboardView payload={payload} />;

  return (
    <HrShell currentPath="/hr-admin/cases" heading={`${sectionConfig.title}: ${caseRow.token || caseRow.id}`}>
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{sectionConfig.title}</CardTitle>
            <p className="text-sm text-muted-foreground">Run v{runRow.run_version} · {sectionConfig.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href={`/hr-admin/cases/${id}/triad`}>Back To Triad</Link>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {body || (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No formatted view is available for this section.</p>
          </CardContent>
        </Card>
      )}
    </HrShell>
  );
}

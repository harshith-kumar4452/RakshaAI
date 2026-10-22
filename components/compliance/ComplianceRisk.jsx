"use client"

import ComplianceSharedLayout from "./ComplianceSharedLayout"

export default function ComplianceRisk() {
  const signalData = [
    { title: "Serial Reporting Cluster", text: "4 independent complaints filed against 'Director of Strategy' within a 9-week window.", entity: "Individual (Anonymized)", severity: "critical", badge: "Immediate Review" },
    { title: "Team Silence Risk", text: "Zero HR/compliance reports lodged by Finance (-80 employees) in the last 14 months despite company average of 4%.", entity: "Finance Department", severity: "high", badge: "Desert Risk" },
    { title: "Temporal Escalation", text: "Complaints referencing 'hostile environment' in Engineering have risen 400% since Q3 2025 organizational restructure.", entity: "Engineering Dept", severity: "high", badge: "Trend Spike" },
    { title: "Language Pattern Match", text: "3 separate POSH complaints use exact identical framing and date ranges. Possible coordinated or copy-cat filing.", entity: "System Match", severity: "medium", badge: "Integrity Flag" },
    { title: "Off-Platform Signals", text: "Glassdoor sentiment drop (-1.2 stars) correlates strongly with current 6-week spike in internal bullying reports.", entity: "External Correlation", severity: "low", badge: "External Data" },
  ]

  return (
    <ComplianceSharedLayout title="AI Risk Signals">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Automated NYAYA Intelligence</div>
            <div className="card-sub">Signals derived from metadata analysis and temporal clustering across 100% of cases</div>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gap: 14 }}>
            {signalData.map((s, i) => (
              <div key={i} style={{ 
                padding: "16px 20px", borderRadius: 12, borderLeft: `4px solid ${s.severity === "critical" ? "var(--red)" : s.severity === "high" ? "var(--amber)" : s.severity === "medium" ? "var(--teal-dark)" : "var(--muted)"}`,
                background: s.severity === "critical" ? "var(--red-light)" : s.severity === "high" ? "var(--amber-light)" : "var(--bg)",
                border: "1px solid var(--border)", borderLeftWidth: 4
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontWeight: 600, color: "var(--ink2)", fontSize: 13 }}>{s.title}</div>
                    <div style={{ 
                      fontSize: 10, padding: "2px 6px", borderRadius: 10, fontWeight: 600, display: "inline-block",
                      background: s.severity === "critical" ? "var(--red)" : s.severity === "high" ? "var(--amber)" : "var(--bg)",
                      color: s.severity === "critical" || s.severity === "high" ? "#fff" : "var(--ink2)"
                    }}>{s.badge}</div>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>Target: {s.entity}</div>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.5 }}>{s.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ComplianceSharedLayout>
  )
}

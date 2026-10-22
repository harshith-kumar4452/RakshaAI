"use client"

import ComplianceSharedLayout from "./ComplianceSharedLayout"

export default function ComplianceCulture() {
  const courageDepts = [
    { name: "Product Design", pct: 78, level: "high" },
    { name: "HR & Admin", pct: 71, level: "high" },
    { name: "Legal & Compliance", pct: 68, level: "high" },
    { name: "Marketing", pct: 58, level: "mid" },
    { name: "Sales & BD", pct: 52, level: "mid" },
    { name: "Engineering", pct: 38, level: "mid" },
    { name: "Operations", pct: 32, level: "low" },
    { name: "Customer Support", pct: 26, level: "low" },
    { name: "IT Support", pct: 19, level: "low" },
    { name: "Finance", pct: 9, level: "low" },
  ]

  const metrics = [
    { label: "Company-Wide Courage Index", value: "64%", delta: "+11 pts", dir: "up" },
    { label: "Anonymous Reporting Rate", value: "28%", delta: "-4 pts", dir: "up" }, // Down is good here (more trust to give ID)
    { label: "Average Time to Report", value: "8 days", delta: "-3 days", dir: "up" }, // Faster = better
    { label: "Post-Resolution Satisfaction", value: "4.2/5", delta: "+0.3", dir: "up" },
  ]

  return (
    <ComplianceSharedLayout title="Culture Trends & Reporting Indexes">
      <div className="metrics-grid">
        {metrics.map((m, i) => (
          <div key={i} className="metric-card c-teal">
            <div className="metric-label">{m.label}</div>
            <div className="metric-value">{m.value}</div>
            <div className={`metric-delta delta-${m.dir}`}>{m.delta} vs Q4 2025</div>
          </div>
        ))}
      </div>

      <div className="row row-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Reporting Courage Index</div>
              <div className="card-sub">Ratio of reports filed vs estimated incidents (industry benchmark)</div>
            </div>
          </div>
          <div className="card-body">
            <div className="courage-list" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {courageDepts.map((d, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "var(--ink2)", fontWeight: 500 }}>{d.name}</span>
                    <span style={{ color: "var(--muted)" }}>{d.pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 3, width: `${d.pct}%`, transition: "width .8s ease",
                      background: d.level === "high" ? "var(--teal)" : d.level === "mid" ? "var(--amber)" : "var(--red)"
                    }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Anonymous vs Identified Outcomes</div>
              <div className="card-sub">Tracking resolution bias and retaliation fears</div>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 500, minWidth: 100 }}>Verified ID</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500, minWidth: 60 }}>31</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>days to resolution (avg)</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 500, minWidth: 100 }}>Anonymous</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500, minWidth: 60 }}>52</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>days to resolution (avg)</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--red)", background: "var(--red-light)", padding: "2px 8px", borderRadius: 20 }}>+21 day gap</div>
              </div>
            </div>
            <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 8, background: "var(--red-light)", fontSize: 12, color: "#991b1b", lineHeight: 1.5 }}>
              <strong>AI INSIGHT:</strong> Anonymous victims wait 68% longer for resolution. Recommend reviewing investigator assignment protocols or blind-review systems to reduce processing bias.
            </div>
          </div>
        </div>
      </div>
    </ComplianceSharedLayout>
  )
}

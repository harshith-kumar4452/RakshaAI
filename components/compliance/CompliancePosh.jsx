"use client"

import ComplianceSharedLayout from "./ComplianceSharedLayout"
import { useComplianceData } from "./useComplianceData"

export default function CompliancePosh() {
  const dbData = useComplianceData()

  const rawStats = [
    { label: "Total POSH complaints received", count: 86 },
    { label: "Total POSH complaints disposed of", count: 74 },
    { label: "Total POSH complaints pending > 90 days", count: 2 },
    { label: "Workshops & awareness programs conducted", count: 18 },
    { label: "Nature of action taken", count: 12 },
  ]

  const rawBreakdown = [
    { type: "Written Apology", count: 22 },
    { type: "Warning Issued", count: 18 },
    { type: "Reprimand & Probation", count: 14 },
    { type: "Withholding Promotion", count: 8 },
    { type: "Termination", count: 12 },
  ]

  const annualStats = dbData?.poshStats || rawStats
  const actionBreakdown = dbData?.poshBreakdown || rawBreakdown

  return (
    <ComplianceSharedLayout title="POSH Annual Report">
      <div className="row row-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Statutory Requirements Tracker</div>
              <div className="card-sub">Data formatting aligns with Section 21 of the POSH Act, 2013</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="shared-table">
              <tbody>
                {annualStats.map((s, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500, color: "var(--ink2)" }}>{s.label}</td>
                    <td style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Action Breakdown</div>
              <div className="card-sub">Penalties logged by the internal committee (IC)</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="shared-table">
              <tbody>
                {actionBreakdown.map((a, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500, color: "var(--ink2)" }}>{a.type}</td>
                    <td style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>{a.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ComplianceSharedLayout>
  )
}

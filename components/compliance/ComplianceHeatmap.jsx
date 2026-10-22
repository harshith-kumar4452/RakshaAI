"use client"

import ComplianceSharedLayout from "./ComplianceSharedLayout"
import { useComplianceData } from "./useComplianceData"

export default function ComplianceHeatmap() {
  const dbData = useComplianceData()

  const rawDepartments = [
    { name: "Engineering", reports: 34, risk: "High", trend: "+12%" },
    { name: "Sales & BD", reports: 22, risk: "Medium", trend: "+4%" },
    { name: "Operations", reports: 18, risk: "Medium", trend: "-2%" },
    { name: "Marketing", reports: 11, risk: "Low", trend: "+1%" },
    { name: "Product Design", reports: 8, risk: "Low", trend: "0%" },
    { name: "Customer Support", reports: 29, risk: "High", trend: "+18%" },
    { name: "HR & Admin", reports: 3, risk: "Low", trend: "-5%" },
    { name: "Finance", reports: 0, risk: "Desert", trend: "N/A" },
    { name: "Legal & Compliance", reports: 1, risk: "Low", trend: "0%" },
    { name: "IT Support", reports: 14, risk: "Medium", trend: "+2%" }
  ]

  const departments = dbData?.heatmapDepts || rawDepartments

  return (
    <ComplianceSharedLayout title="Department Heatmap">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Incident Heatmap by Department</div>
            <div className="card-sub">Visualizing reporting volumes and silence risks</div>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="shared-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Volume (Q1)</th>
                <th>Quarter over Quarter Trend</th>
                <th>Calculated Risk Profile</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500, color: "var(--ink2)" }}>{d.name}</td>
                  <td>{d.reports}</td>
                  <td style={{ color: d.trend.startsWith('+') ? "var(--red)" : "var(--teal)" }}>{d.trend}</td>
                  <td>
                    <span style={{ 
                      display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: d.risk === "High" ? "var(--red-light)" : d.risk === "Desert" ? "var(--ink2)" : d.risk === "Medium" ? "var(--amber-light)" : "var(--teal-light)",
                      color: d.risk === "High" ? "var(--red)" : d.risk === "Desert" ? "#fff" : d.risk === "Medium" ? "var(--amber)" : "var(--teal-dark)"
                    }}>
                      {d.risk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ComplianceSharedLayout>
  )
}

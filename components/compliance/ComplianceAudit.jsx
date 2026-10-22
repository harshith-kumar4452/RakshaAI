"use client"

import ComplianceSharedLayout from "./ComplianceSharedLayout"
import { useComplianceData } from "./useComplianceData"

export default function ComplianceAudit() {
  const dbData = useComplianceData()

  const rawLogs = [
    { timestamp: "2026-03-24 18:42:11", user: "Priya Rajan (CCO)", action: "Exported POSH Annual Report", case: "System", type: "system_export" },
    { timestamp: "2026-03-24 16:15:00", user: "Alex P. (Investigator)", action: "Added evidence file to case", case: "JUST-0115", type: "document_upload" },
    { timestamp: "2026-03-24 14:02:44", user: "Sarah L. (Investigator)", action: "Closed cyberbullying investigation", case: "JUST-0078", type: "status_change" },
    { timestamp: "2026-03-23 09:22:18", user: "Priya Rajan (CCO)", action: "Viewed NYAYA Intelligence Signal", case: "JUST-4829", type: "intelligence_access" },
    { timestamp: "2026-03-23 08:14:02", user: "Systems (Automated)", action: "Triggered 7-day SLA Warning", case: "JUST-0119", type: "system_trigger" },
    { timestamp: "2026-03-22 17:05:01", user: "Systems (Automated)", action: "Archived resolved cases (Q4 2025)", case: "Batch", type: "system_archive" },
    { timestamp: "2026-03-22 11:34:55", user: "Ravi K. (Investigator)", action: "Updated Subject findings document", case: "JUST-0145", type: "document_edit" },
    { timestamp: "2026-03-21 14:12:00", user: "Priya Rajan (CCO)", action: "Exported Q1 Heatmap Data", case: "System", type: "system_export" },
    { timestamp: "2026-03-20 18:00:12", user: "Ahmed M. (Investigator)", action: "Opened initial inquiry", case: "JUST-0128", type: "status_change" },
    { timestamp: "2026-03-19 10:44:22", user: "Sarah L. (Investigator)", action: "Requested extension on investigation", case: "JUST-0130", type: "process_flag" },
  ]

  const logs = dbData?.auditLogs || rawLogs

  return (
    <ComplianceSharedLayout title="System Audit Logs">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Access and Action Log</div>
            <div className="card-sub">Immutable ledger of platform interactions for legal compliance</div>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: "11px", padding: "4px 10px" }}>Download CSV</button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="shared-table">
            <thead>
              <tr>
                <th>Timestamp (IST)</th>
                <th>Actor</th>
                <th>Action Description</th>
                <th>Target Object</th>
                <th>Event Type</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>{log.timestamp}</td>
                  <td style={{ fontWeight: 500 }}>{log.user}</td>
                  <td>{log.action}</td>
                  <td style={{ fontFamily: "var(--font-mono)", color: "var(--teal-dark)" }}>{log.case}</td>
                  <td>
                    <span style={{ 
                      fontSize: 10, background: "var(--bg)", color: "var(--ink2)", padding: "2px 6px", borderRadius: 4, 
                      fontFamily: "var(--font-mono)", border: "1px solid var(--border)"
                    }}>
                      {log.type}
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

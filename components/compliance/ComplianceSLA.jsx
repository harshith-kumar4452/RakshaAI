"use client"

import ComplianceSharedLayout from "./ComplianceSharedLayout"
import { useComplianceData } from "./useComplianceData"

export default function ComplianceSLA() {
  const dbData = useComplianceData()

  const rawSlaCases = [
    { id: "JUST-0092", cat: "Sexual Harassment", location: "Bengaluru", status: "breach", days: "+8 days", investigator: "Alex P." },
    { id: "JUST-0078", cat: "Cyberbullying", location: "Mumbai", status: "breach", days: "+3 days", investigator: "Sarah L." },
    { id: "JUST-0101", cat: "Verbal Abuse", location: "Delhi", status: "breach", days: "+1 day", investigator: "Ravi K." },
    { id: "JUST-0115", cat: "Workplace Bullying", location: "Hyderabad", status: "risk", days: "7 days left", investigator: "Alex P." },
    { id: "JUST-0119", cat: "Sexual Harassment", location: "Pune", status: "risk", days: "12 days left", investigator: "Priya R." },
    { id: "JUST-0128", cat: "Discrimination", location: "Chennai", status: "risk", days: "14 days left", investigator: "Ahmed M." },
    { id: "JUST-0130", cat: "Retaliation", location: "Kolkata", status: "ok", days: "42 days left", investigator: "Sarah L." },
    { id: "JUST-0145", cat: "Verbal Abuse", location: "Mumbai", status: "ok", days: "65 days left", investigator: "Ravi K." },
    { id: "JUST-0149", cat: "Sexual Harassment", location: "Bengaluru", status: "ok", days: "70 days left", investigator: "Priya R." },
    { id: "JUST-0152", cat: "Cyberbullying", location: "Hyderabad", status: "ok", days: "81 days left", investigator: "Ahmed M." },
  ]

  const slaCases = dbData?.slaTracker || rawSlaCases

  return (
    <ComplianceSharedLayout title="SLA Tracker">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">All Active Cases by SLA Status</div>
            <div className="card-sub">Tracking against the 90-day POSH resolution limit</div>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="shared-table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Category</th>
                <th>Location</th>
                <th>Investigator</th>
                <th>SLA Status</th>
              </tr>
            </thead>
            <tbody>
              {slaCases.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{c.id}</td>
                  <td>{c.cat}</td>
                  <td>{c.location}</td>
                  <td>{c.investigator}</td>
                  <td>
                    <span style={{ 
                      fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                      background: c.status === "breach" ? "var(--red-light)" : c.status === "risk" ? "var(--amber-light)" : "var(--teal-light)",
                      color: c.status === "breach" ? "var(--red)" : c.status === "risk" ? "var(--amber)" : "var(--teal-dark)"
                    }}>
                      {c.days}
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

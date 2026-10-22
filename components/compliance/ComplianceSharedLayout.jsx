"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export default function ComplianceSharedLayout({ children, title, period = "Q1 2026 · Jan – Mar" }) {
  const pathname = usePathname()

  const tabs = [
    { section: "Overview" },
    { name: "Dashboard", href: "/dashboard", icon: "◈" },
    { name: "SLA Tracker", href: "/sla-tracker", icon: "⊕" },
    { name: "Heatmap", href: "/heatmap", icon: "◉" },
    { section: "Reports" },
    { name: "POSH Annual Report", href: "/posh-report", icon: "↓" },
    { name: "Audit Logs", href: "/audit-logs", icon: "≡" },
    { section: "Insights" },
    { name: "Knowledge Graph", href: "/knowledge-graph", icon: "❖" },
    { name: "Culture Trends", href: "/culture-trends", icon: "◎" },
    { name: "Risk Signals", href: "/risk-signals", icon: "△" },
  ]

  return (
    <>
      <style>{`
        :root {
          --teal: #0d9e75; --teal-light: #e6f7f2; --teal-dark: #076b4f;
          --amber: #d97706; --amber-light: #fef3c7;
          --red: #dc2626; --red-light: #fee2e2;
          --ink: #0f1a14; --ink2: #2d3d35;
          --muted: #6b7c74; --border: #dce8e2;
          --bg: #f4f8f6; --card: #ffffff;
          --font-display: 'DM Serif Display', serif;
          --font-body: 'DM Sans', sans-serif;
          --font-mono: 'DM Mono', monospace;
        }

        .justra-dashboard {
          font-family: var(--font-body); background: var(--bg); color: var(--ink);
          min-height: 100vh; font-size: 14px;
        }

        /* SIDEBAR */
        .sidebar {
          position: fixed; left: 0; top: 0; bottom: 0; width: 220px;
          background: var(--ink); display: flex; flex-direction: column;
          z-index: 100; padding: 0;
        }
        .sidebar-logo { padding: 24px 20px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .logo-mark { font-family: var(--font-display); font-size: 22px; color: #fff; letter-spacing: -0.5px; }
        .logo-mark span { color: var(--teal); }
        .logo-sub { font-size: 10px; color: rgba(255,255,255,0.35); letter-spacing: .12em; text-transform: uppercase; margin-top: 2px; }
        .sidebar-nav { flex: 1; padding: 16px 12px; display: flex; flex-direction: column; gap: 2px; }
        .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; color: rgba(255,255,255,0.5); font-size: 13px; font-weight: 500; cursor: pointer; transition: all .15s; text-decoration: none; }
        .nav-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.85); }
        .nav-item.active { background: var(--teal); color: #fff; }
        .nav-icon { font-size: 15px; width: 18px; text-align: center; }
        .nav-section-label { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,0.2); padding: 14px 12px 6px; font-weight: 500; }
        
        .sidebar-profile { padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 10px; }
        .profile-avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--teal); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; color: #fff; flex-shrink: 0; }
        .profile-name { font-size: 13px; color: rgba(255,255,255,0.85); font-weight: 500; }
        .profile-role { font-size: 11px; color: rgba(255,255,255,0.35); }

        /* MAIN */
        .main { margin-left: 220px; min-height: 100vh; display: flex; flex-direction: column; }
        .topbar { background: var(--card); border-bottom: 1px solid var(--border); padding: 0 28px; height: 58px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 90; }
        .topbar-left { display: flex; align-items: baseline; gap: 10px; }
        .topbar-title { font-family: var(--font-display); font-size: 20px; color: var(--ink); }
        .topbar-period { font-size: 12px; color: var(--muted); background: var(--bg); padding: 3px 10px; border-radius: 20px; border: 1px solid var(--border); }
        .topbar-right { display: flex; align-items: center; gap: 10px; }
        .btn { padding: 7px 16px; border-radius: 8px; font-size: 13px; font-family: var(--font-body); font-weight: 500; cursor: pointer; border: none; transition: all .15s; }
        .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
        .btn-ghost:hover { background: var(--bg); color: var(--ink); }
        .btn-primary { background: var(--teal); color: #fff; }
        .btn-primary:hover { background: var(--teal-dark); }
        .alert-badge { background: var(--red); color: #fff; border-radius: 20px; font-size: 11px; font-weight: 600; padding: 2px 8px; }

        /* SHARED GLOBAL STYLES FOR CONTENT */
        .content { padding: 24px 28px; flex: 1; }
        .row { display: grid; gap: 14px; margin-bottom: 20px; }
        .row-2 { grid-template-columns: 1fr 1fr; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .card-header { padding: 16px 20px 0; display: flex; align-items: center; justify-content: space-between; }
        .card-title { font-size: 13px; font-weight: 600; color: var(--ink); }
        .card-sub { font-size: 11px; color: var(--muted); margin-top: 1px; }
        .card-body { padding: 16px 20px; }
        
        /* TABLE */
        .shared-table { width: 100%; border-collapse: collapse; }
        .shared-table th { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
        .shared-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
        .shared-table tr:last-child td { border-bottom: none; }
        .shared-table tr:hover td { background: var(--bg); }

        .content-footer { padding: 12px 28px; border-top: 1px solid var(--border); background: var(--card); display: flex; justify-content: space-between; align-items: center; }
        .footer-text { font-size: 11px; color: var(--muted); }
        .report-cta { background: var(--ink); color: #fff; padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; display: flex; align-items: center; gap: 6px; transition: background .15s; }
        .report-cta:hover { background: var(--ink2); }

        /* MULTI-COMPONENT DASHBOARD STYLES */
        .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
        .metric-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; position: relative; overflow: hidden; }
        .metric-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
        .metric-card.c-teal::before { background: var(--teal); }
        .metric-card.c-amber::before { background: var(--amber); }
        .metric-card.c-red::before { background: var(--red); }
        .metric-card.c-ink::before { background: var(--ink2); }
        .metric-label { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 8px; }
        .metric-value { font-family: var(--font-display); font-size: 32px; color: var(--ink); line-height: 1; margin-bottom: 6px; }
        .metric-delta { font-size: 12px; display: flex; align-items: center; gap: 4px; }
        .delta-up { color: var(--teal); }
        .delta-down { color: var(--red); }
        .delta-neutral { color: var(--muted); }

        .row-3 { grid-template-columns: 2fr 1fr 1fr; }
        .row-map { grid-template-columns: 1.4fr 1fr; }

        .india-map { height: 380px; border-radius: 0 0 12px 12px; z-index: 10; }

        .dept-table { width: 100%; border-collapse: collapse; }
        .dept-table th { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
        .dept-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--border); }
        .dept-table tr:last-child td { border-bottom: none; }
        .dept-table tr:hover td { background: var(--bg); }
        .silence-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
        .health-pill { font-size: 11px; font-weight: 500; padding: 2px 10px; border-radius: 20px; display: inline-block; }
        .h-green { background: #dcfce7; color: #15803d; }
        .h-amber { background: var(--amber-light); color: #92400e; }
        .h-red { background: var(--red-light); color: #991b1b; }

        .sla-list { display: flex; flex-direction: column; gap: 8px; }
        .sla-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); }
        .sla-id { font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--ink2); min-width: 80px; }
        .sla-cat { font-size: 12px; color: var(--muted); flex: 1; }
        .sla-days { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
        .days-breach { background: var(--red-light); color: var(--red); }
        .days-risk { background: var(--amber-light); color: var(--amber); }
        .days-ok { background: var(--teal-light); color: var(--teal-dark); }

        .courage-list { display: flex; flex-direction: column; gap: 10px; }
        .courage-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
        .courage-dept { color: var(--ink2); font-weight: 500; }
        .courage-pct { color: var(--muted); }
        .courage-bar-bg { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
        .courage-bar-fill { height: 100%; border-radius: 3px; background: var(--teal); transition: width .8s ease; }
        .courage-bar-fill.low { background: var(--red); }
        .courage-bar-fill.mid { background: var(--amber); }

        .act-list { display: flex; flex-direction: column; gap: 8px; }
        .act-item { display: flex; align-items: center; gap: 10px; }
        .act-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .act-name { font-size: 12px; color: var(--ink2); flex: 1; font-weight: 500; }
        .act-count { font-size: 12px; color: var(--muted); }
        .act-bar-bg { height: 4px; border-radius: 2px; background: var(--border); flex: 1; overflow: hidden; }
        .act-bar-fill { height: 100%; border-radius: 2px; }

        .repeat-card { border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; border-left: 3px solid var(--amber); background: var(--amber-light); }
        .repeat-card.critical { border-left-color: var(--red); background: var(--red-light); }
        .repeat-role { font-size: 12px; font-weight: 600; color: var(--ink); }
        .repeat-dept { font-size: 11px; color: var(--muted); margin-top: 1px; }
        .repeat-count { font-size: 11px; color: var(--amber); font-weight: 500; margin-top: 4px; }
        .repeat-count.critical { color: var(--red); }

        .fairness-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
        .fairness-row:last-child { border-bottom: none; }
        .fairness-type { font-size: 12px; font-weight: 500; color: var(--ink); min-width: 90px; }
        .fairness-days { font-family: var(--font-mono); font-size: 20px; font-weight: 500; color: var(--ink); min-width: 50px; }
        .fairness-label { font-size: 11px; color: var(--muted); }
        .fairness-gap { font-size: 11px; font-weight: 500; color: var(--red); background: var(--red-light); padding: 2px 8px; border-radius: 20px; }

        .chart-wrap { position: relative; padding: 12px 16px 16px; }

        .leaflet-container { font-family: var(--font-body); background: #eef4f0; }
        .case-popup { font-family: var(--font-body); }
        .case-popup strong { color: var(--ink); font-size: 13px; }
        .case-popup p { color: var(--muted); font-size: 12px; margin-top: 3px; }
      `}</style>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      
      <div className="justra-dashboard">
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">Justr<span>a</span></div>
            <div className="logo-sub">Compliance Portal</div>
          </div>
          <div className="sidebar-nav">
            {tabs.map((tab, i) => {
              if (tab.section) {
                return <div key={i} className="nav-section-label">{tab.section}</div>
              }
              const isActive = pathname === tab.href
              return (
                <Link key={i} href={tab.href} className={`nav-item ${isActive ? "active" : ""}`}>
                  <span className="nav-icon">{tab.icon}</span> {tab.name}
                </Link>
              )
            })}
          </div>
          <div className="sidebar-profile">
            <div className="profile-avatar">PR</div>
            <div>
              <div className="profile-name">Priya Rajan</div>
              <div className="profile-role">Chief Compliance Officer</div>
            </div>
          </div>
        </nav>

        <div className="main">
          <div className="topbar">
            <div className="topbar-left">
              <span className="topbar-title">{title || "Compliance Dashboard"}</span>
              <span className="topbar-period">{period}</span>
            </div>
            <div className="topbar-right">
              <span className="alert-badge">3 SLA Breaches</span>
              <button className="btn btn-ghost">Filter</button>
              <button className="btn btn-primary">Export POSH Report</button>
            </div>
          </div>

          <div className="content">
            {children}
          </div>

          <div className="content-footer">
            <div className="footer-text">Justra v1.0 · All data anonymized · Individual cases never accessible on this view · POSH Act §16 compliant</div>
            <button className="report-cta">↓ Generate POSH Annual Report PDF</button>
          </div>
        </div>
      </div>
    </>
  )
}

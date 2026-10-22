"use client"

import { useEffect, useRef } from "react"
import Head from "next/head"
import ComplianceSharedLayout from "./ComplianceSharedLayout"
import { useComplianceData } from "./useComplianceData"

export default function ComplianceDashboard() {
  const dbData = useComplianceData()

  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const trendChartRef = useRef(null)
  const trendChartInstance = useRef(null)
  const donutChartRef = useRef(null)
  const donutChartInstance = useRef(null)

  useEffect(() => {
    if (!dbData) return

    let L
    let Chart
    
    // Dynamic import to avoid SSR window issues
    Promise.all([
      import("leaflet"),
      import("chart.js/auto")
    ]).then(([leafletMod, chartMod]) => {
      L = leafletMod.default || leafletMod
      Chart = chartMod.default || chartMod

      initMap(L)
      initCharts(Chart)
    })

    function initMap(L) {
      if (!mapRef.current || mapInstance.current) return
      
      const map = L.map(mapRef.current, {
        center: [20.5937, 78.9629],
        zoom: 4.5,
        zoomControl: true,
        scrollWheelZoom: false,
      })
      mapInstance.current = map

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      const cases = dbData.mapCases || []

      const colorMap = { high: "#dc2626", medium: "#d97706", low: "#0d9e75" }

      cases.forEach(c => {
        const r = Math.max(14, Math.min(38, c.count * 1.1))
        const circle = L.circleMarker([c.lat, c.lng], {
          radius: r,
          fillColor: colorMap[c.severity],
          color: "#fff",
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.55,
        }).addTo(map)

        circle.bindPopup(`
          <div class="case-popup">
            <strong>${c.city}</strong>
            <p>${c.count} cases · ${c.type}</p>
            <p style="margin-top:4px;font-size:10px;color:#999">No individual data shown</p>
          </div>
        `)
      })

      const legend = L.control({ position: 'bottomright' })
      legend.onAdd = () => {
        const div = L.DomUtil.create('div')
        div.style.cssText = 'background:#fff;padding:10px 12px;border-radius:8px;border:1px solid #dce8e2;font-family:DM Sans,sans-serif;font-size:11px;line-height:1.8'
        div.innerHTML = `
          <div style="font-weight:600;margin-bottom:4px;color:#0f1a14">Severity</div>
          <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#dc2626;margin-right:6px"></span>High</div>
          <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#d97706;margin-right:6px"></span>Medium</div>
          <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#0d9e75;margin-right:6px"></span>Low</div>
          <div style="margin-top:4px;color:#999">Circle size = case volume</div>
        `
        return div
      }
      legend.addTo(map)
    }

    function initCharts(Chart) {
      if (trendChartRef.current && !trendChartInstance.current) {
        const ctx = trendChartRef.current.getContext('2d')
        trendChartInstance.current = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
            datasets: [
              { label: 'Sexual Harassment', data: [12, 15, 10, 18, 16, 21], backgroundColor: '#dc262688', borderRadius: 4 },
              { label: 'Cyberbullying', data: [8, 9, 7, 11, 14, 13], backgroundColor: '#7c3aed88', borderRadius: 4 },
              { label: 'Verbal Abuse', data: [6, 4, 8, 7, 5, 9], backgroundColor: '#d9770688', borderRadius: 4 },
              { label: 'Bullying', data: [3, 5, 4, 6, 8, 7], backgroundColor: '#0d9e7588', borderRadius: 4 },
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 11 }, boxWidth: 10, padding: 12 } },
            },
            scales: {
              x: { stacked: false, grid: { display: false }, ticks: { font: { family: 'DM Sans', size: 11 } } },
              y: { grid: { color: '#f0f0f0' }, ticks: { font: { family: 'DM Sans', size: 11 } } }
            }
          }
        })
      }

      if (donutChartRef.current && !donutChartInstance.current) {
        const ctx = donutChartRef.current.getContext('2d')
        donutChartInstance.current = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Resolved', 'Escalated', 'Withdrawn', 'Pending'],
            datasets: [{
              data: [61, 18, 9, 12],
              backgroundColor: ['#0d9e75', '#2563eb', '#d97706', '#6b7c74'],
              borderWidth: 0,
              hoverOffset: 4,
            }]
          },
          options: {
            responsive: false,
            cutout: '68%',
            plugins: {
              legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 11 }, boxWidth: 10, padding: 10 } },
            }
          }
        })
      }
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
      if (trendChartInstance.current) {
        trendChartInstance.current.destroy()
        trendChartInstance.current = null
      }
      if (donutChartInstance.current) {
        donutChartInstance.current.destroy()
        donutChartInstance.current = null
      }
    }
  }, [dbData])

  return (
    <ComplianceSharedLayout title="Compliance Dashboard">
      {/* METRICS */}
            <div className="metrics-grid">
              <div className="metric-card c-teal">
                <div className="metric-label">Total Reports</div>
                <div className="metric-value">{dbData?.totalCases || 147}</div>
                <div className="metric-delta delta-up">Derived dynamically from Supabase</div>
              </div>
              <div className="metric-card c-amber">
                <div className="metric-label">Avg. Resolution Time</div>
                <div className="metric-value">38<span style={{fontSize:"18px",color:"var(--muted)"}}>d</span></div>
                <div className="metric-delta delta-neutral">POSH limit: 90 days — within range</div>
              </div>
              <div className="metric-card c-red">
                <div className="metric-label">SLA Breaches</div>
                <div className="metric-value">3</div>
                <div className="metric-delta delta-down">↑ 2 new this week — action required</div>
              </div>
              <div className="metric-card c-ink">
                <div className="metric-label">Reporting Courage Index</div>
                <div className="metric-value">64<span style={{fontSize:"18px",color:"var(--muted)"}}>%</span></div>
                <div className="metric-delta delta-up">↑ 11pts vs last quarter</div>
              </div>
            </div>

            {/* MAP + SLA ROW */}
            <div className="row row-map">
              {/* MAP */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Case Distribution — India</div>
                    <div className="card-sub">147 cases · anonymized locations · tap a marker for cluster info</div>
                  </div>
                  <div style={{display:"flex",gap:"6px"}}>
                    <button className="btn btn-ghost" style={{fontSize:"11px",padding:"4px 10px"}}>All types</button>
                    <button className="btn btn-ghost" style={{fontSize:"11px",padding:"4px 10px"}}>This quarter</button>
                  </div>
                </div>
                <div ref={mapRef} className="india-map"></div>
              </div>

              {/* RIGHT COLUMN */}
              <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
                {/* SLA BREACHES */}
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">SLA Breach Alerts</div>
                      <div className="card-sub">Cases at or past 90-day limit</div>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="sla-list">
                      <div className="sla-item">
                        <div className="sla-id">JUST-0092</div>
                        <div className="sla-cat">Sexual Harassment · Bengaluru</div>
                        <div className="sla-days days-breach">+8 days</div>
                      </div>
                      <div className="sla-item">
                        <div className="sla-id">JUST-0078</div>
                        <div className="sla-cat">Cyberbullying · Mumbai</div>
                        <div className="sla-days days-breach">+3 days</div>
                      </div>
                      <div className="sla-item">
                        <div className="sla-id">JUST-0101</div>
                        <div className="sla-cat">Verbal Abuse · Delhi</div>
                        <div className="sla-days days-breach">+1 day</div>
                      </div>
                      <div className="sla-item">
                        <div className="sla-id">JUST-0115</div>
                        <div className="sla-cat">Workplace Bullying · Hyderabad</div>
                        <div className="sla-days days-risk">7 days left</div>
                      </div>
                      <div className="sla-item">
                        <div className="sla-id">JUST-0119</div>
                        <div className="sla-cat">Sexual Harassment · Pune</div>
                        <div className="sla-days days-risk">12 days left</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* REPEAT OFFENDER SIGNALS */}
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Repeat Offender Signals</div>
                      <div className="card-sub">Role patterns · no identities shown</div>
                    </div>
                  </div>
                  <div className="card-body" style={{paddingTop:"12px"}}>
                    <div className="repeat-card critical">
                      <div className="repeat-role">Senior Manager · Engineering</div>
                      <div className="repeat-dept">Hyderabad office — 4th floor</div>
                      <div className="repeat-count critical">Appears in 4 cases this quarter</div>
                    </div>
                    <div className="repeat-card">
                      <div className="repeat-role">Faculty · Computer Science Dept</div>
                      <div className="repeat-dept">Campus — Block C</div>
                      <div className="repeat-count">Appears in 3 cases this quarter</div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* CHARTS ROW */}
            <div className="row row-3">
              {/* INCIDENT TREND */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Incident Categories · 6-Month Trend</div>
                    <div className="card-sub">Monthly breakdown by type</div>
                  </div>
                </div>
                <div className="chart-wrap">
                  <canvas ref={trendChartRef} height="170"></canvas>
                </div>
              </div>

              {/* RESOLUTION OUTCOMES */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Resolution Outcomes</div>
                    <div className="card-sub">Q1 2026 closed cases</div>
                  </div>
                </div>
                <div className="chart-wrap" style={{display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <canvas ref={donutChartRef} height="170" width="170"></canvas>
                </div>
              </div>

              {/* ACT DISTRIBUTION */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Acts Cited · RAG Output</div>
                    <div className="card-sub">Most referenced laws this quarter</div>
                  </div>
                </div>
                <div className="card-body">
                  <div className="act-list">
                    <div className="act-item">
                      <div className="act-dot" style={{background:"#0d9e75"}}></div>
                      <div className="act-name">POSH Act 2013</div>
                      <div className="act-bar-bg"><div className="act-bar-fill" style={{width:"82%",background:"#0d9e75"}}></div></div>
                      <div className="act-count">82</div>
                    </div>
                    <div className="act-item">
                      <div className="act-dot" style={{background:"#2563eb"}}></div>
                      <div className="act-name">BNS 2023</div>
                      <div className="act-bar-bg"><div className="act-bar-fill" style={{width:"64%",background:"#2563eb"}}></div></div>
                      <div className="act-count">64</div>
                    </div>
                    <div className="act-item">
                      <div className="act-dot" style={{background:"#7c3aed"}}></div>
                      <div className="act-name">IT Act 2000</div>
                      <div className="act-bar-bg"><div className="act-bar-fill" style={{width:"41%",background:"#7c3aed"}}></div></div>
                      <div className="act-count">41</div>
                    </div>
                    <div className="act-item">
                      <div className="act-dot" style={{background:"#dc2626"}}></div>
                      <div className="act-name">POCSO Act 2012</div>
                      <div className="act-bar-bg"><div className="act-bar-fill" style={{width:"14%",background:"#dc2626"}}></div></div>
                      <div className="act-count">14</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* BOTTOM ROW */}
            <div className="row row-2">
              {/* DEPARTMENT TABLE */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Department Risk Overview</div>
                    <div className="card-sub">Silence risk flagged if zero reports for 60+ days</div>
                  </div>
                </div>
                <div className="card-body" style={{padding:0}}>
                  <table className="dept-table">
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th>Headcount</th>
                        <th>Reports</th>
                        <th>Silence Risk</th>
                        <th>Culture Health</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Engineering</td>
                        <td>280</td>
                        <td>34</td>
                        <td><span className="silence-dot" style={{background:"#dc2626"}}></span>High</td>
                        <td><span className="health-pill h-amber">At Risk</span></td>
                      </tr>
                      <tr>
                        <td>Sales & BD</td>
                        <td>140</td>
                        <td>22</td>
                        <td><span className="silence-dot" style={{background:"#d97706"}}></span>Medium</td>
                        <td><span className="health-pill h-amber">At Risk</span></td>
                      </tr>
                      <tr>
                        <td>HR & Admin</td>
                        <td>45</td>
                        <td>3</td>
                        <td><span className="silence-dot" style={{background:"#15803d"}}></span>Low</td>
                        <td><span className="health-pill h-green">Healthy</span></td>
                      </tr>
                      <tr>
                        <td>Finance</td>
                        <td>60</td>
                        <td>0</td>
                        <td><span className="silence-dot" style={{background:"#dc2626"}}></span>Desert</td>
                        <td><span className="health-pill h-red">Investigate</span></td>
                      </tr>
                      <tr>
                        <td>Product Design</td>
                        <td>55</td>
                        <td>8</td>
                        <td><span className="silence-dot" style={{background:"#15803d"}}></span>Low</td>
                        <td><span className="health-pill h-green">Healthy</span></td>
                      </tr>
                      <tr>
                        <td>Legal & Compliance</td>
                        <td>28</td>
                        <td>1</td>
                        <td><span className="silence-dot" style={{background:"#15803d"}}></span>Low</td>
                        <td><span className="health-pill h-green">Healthy</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* RIGHT BOTTOM COLUMN */}
              <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
                {/* REPORTING COURAGE BY DEPT */}
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Reporting Courage Index</div>
                      <div className="card-sub">Reports filed vs estimated incidents · by dept</div>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="courage-list">
                      <div className="courage-item">
                        <div className="courage-row"><span className="courage-dept">Product Design</span><span className="courage-pct">78%</span></div>
                        <div className="courage-bar-bg"><div className="courage-bar-fill" style={{width:"78%"}}></div></div>
                      </div>
                      <div className="courage-item">
                        <div className="courage-row"><span className="courage-dept">HR & Admin</span><span className="courage-pct">71%</span></div>
                        <div className="courage-bar-bg"><div className="courage-bar-fill" style={{width:"71%"}}></div></div>
                      </div>
                      <div className="courage-item">
                        <div className="courage-row"><span className="courage-dept">Sales & BD</span><span className="courage-pct">52%</span></div>
                        <div className="courage-bar-bg"><div className="courage-bar-fill mid" style={{width:"52%"}}></div></div>
                      </div>
                      <div className="courage-item">
                        <div className="courage-row"><span className="courage-dept">Engineering</span><span className="courage-pct">38%</span></div>
                        <div className="courage-bar-bg"><div className="courage-bar-fill mid" style={{width:"38%"}}></div></div>
                      </div>
                      <div className="courage-item">
                        <div className="courage-row"><span className="courage-dept">Finance</span><span className="courage-pct">9%</span></div>
                        <div className="courage-bar-bg"><div className="courage-bar-fill low" style={{width:"9%"}}></div></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RESOLUTION FAIRNESS */}
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Resolution Fairness Index</div>
                      <div className="card-sub">Avg. days to resolve by victim type</div>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="fairness-row">
                      <div className="fairness-type">Verified ID</div>
                      <div className="fairness-days">31</div>
                      <div className="fairness-label">days avg.</div>
                    </div>
                    <div className="fairness-row">
                      <div className="fairness-type">Anonymous</div>
                      <div className="fairness-days">52</div>
                      <div className="fairness-label">days avg.</div>
                      <div className="fairness-gap">+21 day gap</div>
                    </div>
                    <div style={{marginTop:"10px",padding:"8px 10px",borderRadius:"8px",background:"var(--red-light)",fontSize:"11px",color:"#991b1b"}}>
                      Anonymous victims are waiting 68% longer. Review investigator assignment bias.
                    </div>
                  </div>
                </div>
              </div>
            </div>
    </ComplianceSharedLayout>
  )
}

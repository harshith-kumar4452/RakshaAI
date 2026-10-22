"use client"

import { useEffect, useRef, useState } from "react"
import ComplianceSharedLayout from "./ComplianceSharedLayout"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

export default function ComplianceGraph() {
  const containerRef = useRef(null)
  const graphInst = useRef(null)
  const [stats, setStats] = useState({ chunks: 0, entities: 0, relationships: 0 })
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState("rag") // "rag" or "classification"
  
  // Store fetched Supabase graph data so we don't refetch on toggle
  const [ragGraphData, setRagGraphData] = useState(null)

  useEffect(() => {
    let ForceGraph3D;
    
    // Dynamically load the 3D graph library via script tag to avoid Next.js module errors
    if (!window.ForceGraph3D) {
      const script = document.createElement("script")
      script.src = "https://unpkg.com/3d-force-graph"
      script.onload = () => {
        ForceGraph3D = window.ForceGraph3D
        loadGraphData()
      }
      document.head.appendChild(script)
    } else {
      ForceGraph3D = window.ForceGraph3D
      ForceGraph3D = window.ForceGraph3D
      if (mode === "rag" && !ragGraphData) {
        loadGraphData()
      } else if (mode === "classification") {
        loadStaticGraph()
      } else if (mode === "rag" && ragGraphData) {
        renderGraph(ragGraphData)
      }
    }

    async function loadGraphData() {
      try {
        const sb = createSupabaseBrowserClient()
        const { data, error } = await sb.from("legal_chunks").select("act_name,section_num,section_title,metadata").limit(500)
        
        if (error) throw error

        const nodes = []
        const links = []
        const nodeIds = new Set()

        if (data && data.length > 0) {
          data.forEach(row => {
            const metadata = row.metadata || {}
            const entities = metadata.entities || []
            const relationships = metadata.relationships || []

            const section_id = `${row.act_name}:${row.section_num}`
            if (!nodeIds.has(section_id)) {
              nodes.push({
                id: section_id,
                name: `${row.act_name} - Sec ${row.section_num}`,
                group: 'Section'
              })
              nodeIds.add(section_id)
            }

            entities.forEach(entity => {
              const entity_id = entity.id
              if (entity_id && !nodeIds.has(entity_id)) {
                nodes.push({
                  id: entity_id,
                  name: entity.name || entity_id,
                  group: entity.label || 'Entity'
                })
                nodeIds.add(entity_id)
              }
              // Link section to entity
              links.push({
                source: section_id,
                target: entity.id,
                name: "CONTAINS"
              })
            })

            relationships.forEach(rel => {
              if (rel.from_id && rel.to_id && nodeIds.has(rel.from_id) && nodeIds.has(rel.to_id)) {
                 links.push({
                   source: rel.from_id,
                   target: rel.to_id,
                   name: rel.type || "RELATED_TO"
                 })
              }
            })
          })
        }

        setStats({
           chunks: data ? data.length : 0,
           entities: nodes.length,
           relationships: links.length
        })

        const resData = { nodes, links }
        setRagGraphData(resData)
        renderGraph(resData)
      } catch (err) {
        console.error("Failed to load knowledge graph data", err)
      } finally {
        setLoading(false)
      }
    }

    function loadStaticGraph() {
      const RAW_CLASSIFICATIONS = [
        { type: "Sexual Harassment", subtype: "Quid pro quo", acts: ["POSH Act 2013", "BNS 2023"], authority: "ICC", severity: 5, cyber: false },
        { type: "Sexual Harassment", subtype: "Hostile work environment", acts: ["POSH Act 2013", "BNS 2023"], authority: "ICC", severity: 4, cyber: false },
        { type: "Sexual Harassment", subtype: "Unwanted physical contact", acts: ["POSH Act 2013", "BNS 2023"], authority: "ICC", severity: 5, cyber: false },
        { type: "Sexual Harassment", subtype: "Voyeurism", acts: ["BNS 2023", "IT Act 2000"], authority: "Police", severity: 5, cyber: true },
        { type: "Sexual Harassment", subtype: "Sexually explicit communication", acts: ["POSH Act 2013", "IT Act 2000", "BNS 2023"], authority: "ICC", severity: 3, cyber: true },
        { type: "Sexual Harassment", subtype: "Non-consensual image sharing", acts: ["IT Act 2000", "BNS 2023"], authority: "Police", severity: 5, cyber: true },
        
        { type: "Stalking", subtype: "Physical stalking", acts: ["BNS 2023"], authority: "Legal", severity: 4, cyber: false },
        { type: "Stalking", subtype: "Digital stalking", acts: ["BNS 2023", "IT Act 2000"], authority: "Legal", severity: 4, cyber: true },
        { type: "Stalking", subtype: "Obsessive contact", acts: ["BNS 2023"], authority: "HR", severity: 3, cyber: true },
        { type: "Stalking", subtype: "Identity impersonation", acts: ["IT Act 2000", "BNS 2023"], authority: "Police", severity: 4, cyber: true },
      
        { type: "Cyber Harassment", subtype: "Cyberbullying", acts: ["IT Act 2000", "BNS 2023"], authority: "HR", severity: 3, cyber: true },
        { type: "Cyber Harassment", subtype: "Doxing", acts: ["IT Act 2000", "BNS 2023"], authority: "Police", severity: 4, cyber: true },
        { type: "Cyber Harassment", subtype: "Online threats and intimidation", acts: ["BNS 2023", "IT Act 2000"], authority: "Police", severity: 5, cyber: true },
        { type: "Cyber Harassment", subtype: "Hacking and data theft", acts: ["IT Act 2000"], authority: "Police", severity: 4, cyber: true },
        { type: "Cyber Harassment", subtype: "Defamation online", acts: ["BNS 2023", "IT Act 2000"], authority: "Legal", severity: 3, cyber: true },
        { type: "Cyber Harassment", subtype: "Deepfake or AI-generated content", acts: ["IT Act 2000", "BNS 2023"], authority: "Police", severity: 5, cyber: true },
        
        { type: "Bullying and Ragging", subtype: "Institutional ragging", acts: ["UGC Anti-Ragging Regulations 2009", "BNS 2023"], authority: "HR", severity: 4, cyber: false },
        { type: "Bullying and Ragging", subtype: "Workplace bullying by peer", acts: ["BNS 2023"], authority: "HR", severity: 3, cyber: false },
        { type: "Bullying and Ragging", subtype: "Workplace bullying by superior", acts: ["BNS 2023", "POSH Act 2013"], authority: "ICC", severity: 4, cyber: false },
        { type: "Bullying and Ragging", subtype: "Verbal abuse and slurs", acts: ["BNS 2023", "SC/ST Atrocities Act 1989"], authority: "HR", severity: 3, cyber: false },
        { type: "Bullying and Ragging", subtype: "Social exclusion and ostracism", acts: ["BNS 2023"], authority: "HR", severity: 2, cyber: false },
      
        { type: "Discrimination", subtype: "Gender-based discrimination", acts: ["Constitution of India", "POSH Act 2013"], authority: "ICC", severity: 3, cyber: false },
        { type: "Discrimination", subtype: "Caste-based discrimination", acts: ["SC/ST Atrocities Act 1989", "Constitution of India"], authority: "Legal", severity: 4, cyber: false },
        { type: "Discrimination", subtype: "Religion-based discrimination", acts: ["Constitution of India", "BNS 2023"], authority: "Legal", severity: 3, cyber: false },
        { type: "Discrimination", subtype: "Disability-based discrimination", acts: ["RPwD Act 2016"], authority: "HR", severity: 3, cyber: false },
        { type: "Discrimination", subtype: "Pregnancy and maternity discrimination", acts: ["Maternity Benefit Act 1961", "POSH Act 2013"], authority: "Legal", severity: 4, cyber: false },
      
        { type: "Physical Violence", subtype: "Physical assault", acts: ["BNS 2023"], authority: "Police", severity: 5, cyber: false },
        { type: "Physical Violence", subtype: "Domestic violence", acts: ["DV Act 2005"], authority: "Police", severity: 5, cyber: false },
        { type: "Physical Violence", subtype: "Eve teasing", acts: ["BNS 2023"], authority: "Legal", severity: 3, cyber: false },
        { type: "Physical Violence", subtype: "Acid attack", acts: ["BNS 2023"], authority: "Police", severity: 5, cyber: false },
        { type: "Physical Violence", subtype: "Wrongful confinement", acts: ["BNS 2023"], authority: "Police", severity: 4, cyber: false },
      
        { type: "Minor Involved", subtype: "Sexual assault on minor", acts: ["POCSO Act 2012", "BNS 2023"], authority: "SJPU", severity: 5, cyber: false },
        { type: "Minor Involved", subtype: "Online grooming of minor", acts: ["POCSO Act 2012", "IT Act 2000"], authority: "SJPU", severity: 5, cyber: true },
        { type: "Minor Involved", subtype: "Child pornography", acts: ["POCSO Act 2012", "IT Act 2000"], authority: "SJPU", severity: 5, cyber: true },
        { type: "Minor Involved", subtype: "Non-sexual child abuse", acts: ["Juvenile Justice Act 2015", "BNS 2023"], authority: "SJPU", severity: 5, cyber: false },
      
        { type: "Retaliation and Institutional Abuse", subtype: "Retaliation after reporting", acts: ["POSH Act 2013", "Whistle Blowers Act 2014"], authority: "ICC", severity: 4, cyber: false },
        { type: "Retaliation and Institutional Abuse", subtype: "Malicious false complaint", acts: ["POSH Act 2013", "BNS 2023"], authority: "ICC", severity: 3, cyber: false },
        { type: "Retaliation and Institutional Abuse", subtype: "Coercion by authority", acts: ["BNS 2023", "POSH Act 2013"], authority: "Legal", severity: 4, cyber: false },
        { type: "Retaliation and Institutional Abuse", subtype: "Negligence in duty of care", acts: ["POSH Act 2013"], authority: "Legal", severity: 3, cyber: false }
      ]

      const nodes = []
      const links = []
      const nodeIds = new Set()
      
      const addNode = (id, name, group) => {
        if (!nodeIds.has(id)) {
          nodes.push({ id, name, group })
          nodeIds.add(id)
        }
      }

      RAW_CLASSIFICATIONS.forEach(cls => {
        const typeId = `T_${cls.type}`
        addNode(typeId, cls.type, 'Category')
        
        const subId = `S_${cls.subtype}`
        addNode(subId, cls.subtype, 'Subcategory')
        links.push({ source: typeId, target: subId, name: 'INCLUDES' })

        cls.acts.forEach(act => {
          const actId = `A_${act}`
          addNode(actId, act, 'Act')
          links.push({ source: subId, target: actId, name: 'GOVERNED_BY' })
        })

        const authId = `AUTH_${cls.authority}`
        addNode(authId, cls.authority, 'Authority')
        links.push({ source: subId, target: authId, name: 'REPORT_TO' })
      })

      setStats({
        chunks: "Static DB",
        entities: nodes.length,
        relationships: links.length
      })

      renderGraph({ nodes, links })
    }

    function renderGraph(graphData) {
      if (!containerRef.current) return
      
      if (!graphInst.current) {
        graphInst.current = ForceGraph3D()(containerRef.current)
      }
      
      const colorGroups = {
        'Section': '#667eea',
        'Offence': '#f44336',
        'Punishment': '#ff9800',
        'Authority': '#4caf50',
        'Victim': '#2196f3',
        'Platform': '#9c27b0',
        'Act': '#607d8b',
        'Category': '#e91e63',
        'Subcategory': '#03a9f4'
      }

      graphInst.current
        .graphData(graphData)
        .nodeLabel('name')
        .nodeAutoColorBy('group')
        .nodeColor(node => colorGroups[node.group] || '#cccccc')
        .nodeRelSize(5)
        .linkDirectionalArrowLength(3.5)
        .linkDirectionalArrowRelPos(1)
        .linkColor(() => 'rgba(255,255,255,0.2)')
        .backgroundColor('#0f1a14') 
        
      setTimeout(() => {
        graphInst.current.cameraPosition({ z: mode === "rag" ? 600 : 800 }, null, 2000)
      }, 500)
      
      setLoading(false)
    }

    return () => {
      // Cleanup hook if component unmounts
      if (graphInst.current) {
         graphInst.current = null
         if (containerRef.current) containerRef.current.innerHTML = ''
      }
    }
  }, [mode]) // Add mode to dependencies to trigger re-render on toggle

  const handleZoom = (dir) => {
    if (!graphInst.current) return
    const pos = graphInst.current.cameraPosition()
    graphInst.current.cameraPosition({ z: pos.z * (dir === 'in' ? 0.7 : 1.4) }, null, 400)
  }

  const handlePan = (dx, dy) => {
    if (!graphInst.current) return
    const pos = graphInst.current.cameraPosition()
    // By convention, to pan, we move both the camera and the lookAt target identically
    graphInst.current.cameraPosition(
      { x: pos.x + dx, y: pos.y + dy, z: pos.z },
      { x: pos.x + dx, y: pos.y + dy, z: 0 },
      400
    )
  }

  const handleReset = () => {
    if (!graphInst.current) return
    // Reset to dead center matching the init depth
    graphInst.current.cameraPosition({ x: 0, y: 0, z: mode === "rag" ? 600 : 800 }, { x: 0, y: 0, z: 0 }, 1000)
  }

  return (
    <ComplianceSharedLayout title="Legal Knowledge Graph">
      <div className="row row-3">
        <div className="metric-card c-teal" style={{background: 'var(--ink)', border: '1px solid rgba(255,255,255,0.1)'}}>
          <div className="metric-label" style={{color: 'rgba(255,255,255,0.5)'}}>Total Chunks</div>
          <div className="metric-value" style={{color: '#fff'}}>{stats.chunks}</div>
        </div>
        <div className="metric-card c-amber" style={{background: 'var(--ink)', border: '1px solid rgba(255,255,255,0.1)'}}>
          <div className="metric-label" style={{color: 'rgba(255,255,255,0.5)'}}>Neural Entities</div>
          <div className="metric-value" style={{color: '#fff'}}>{stats.entities}</div>
        </div>
        <div className="metric-card c-red" style={{background: 'var(--ink)', border: '1px solid rgba(255,255,255,0.1)'}}>
          <div className="metric-label" style={{color: 'rgba(255,255,255,0.5)'}}>Relationships</div>
          <div className="metric-value" style={{color: '#fff'}}>{stats.relationships}</div>
        </div>
      </div>
      
      <div className="card" style={{ background: '#0f1a14', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <div className="card-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title" style={{ color: '#fff' }}>{mode === "rag" ? "Legal RAG Store (Supabase)" : "Case Classification Taxonomy"}</div>
            <div className="card-sub" style={{ color: 'rgba(255,255,255,0.5)' }}>Interactive clustering visualizer. Drag nodes to rotate/explore physics.</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px' }}>
             <button 
               onClick={() => { setLoading(true); setMode('rag') }} 
               style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer', border: 'none', background: mode === 'rag' ? 'var(--teal)' : 'transparent', color: '#fff' }}>
               Live RAG DB
             </button>
             <button 
               onClick={() => { setLoading(true); setMode('classification') }} 
               style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer', border: 'none', background: mode === 'classification' ? 'var(--teal)' : 'transparent', color: '#fff' }}>
               Static Classifications
             </button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0, position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'rgba(255,255,255,0.5)', zIndex: 10 }}>
              Initiating 3D Render Engine...
            </div>
          )}
          
          <div style={{ position: 'absolute', right: '16px', bottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10 }}>
            {/* PAN CONTROLS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px' }}>
               <div />
               <button onClick={() => handlePan(0, 100)} style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↑</button>
               <div />
               <button onClick={() => handlePan(-100, 0)} style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
               <button onClick={handleReset} style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>⟲</button>
               <button onClick={() => handlePan(100, 0)} style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>→</button>
               <div />
               <button onClick={() => handlePan(0, -100)} style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↓</button>
               <div />
            </div>
            
            {/* ZOOM CONTROLS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px' }}>
               <button onClick={() => handleZoom('in')} style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>+</button>
               <button onClick={() => handleZoom('out')} style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>-</button>
            </div>
          </div>
          
          <div ref={containerRef} style={{ width: '100%', height: '550px' }}></div>
        </div>
      </div>
    </ComplianceSharedLayout>
  )
}

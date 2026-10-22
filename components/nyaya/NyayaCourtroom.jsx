"use client"

import { useEffect, useRef, useState } from "react"
import { createSeatedPerson, createChair, buildCourtroom } from "./buildScene3D.js"

const AGENTS = [
  { name:"rag",           label:"RAG Persona",           position:[-3,0,0], cameraPos:[-8,3.5,0],  color:"#1D9E75" },
  { name:"timeline",      label:"Timeline Persona",      position:[0,0,3],  cameraPos:[0,3.5,8],   color:"#BA7517" },
  { name:"sentimental",   label:"Sentimental Persona",   position:[3,0,0],  cameraPos:[8,3.5,0],   color:"#534AB7" },
  { name:"deep_research", label:"Deep Research Persona", position:[0,0,-3], cameraPos:[0,3.5,-8],  color:"#D85A30" },
]

function setNestedValue(source, path, value) {
  const next = structuredClone(source || {})
  const keys = String(path || "").split(".").filter(Boolean)
  if (!keys.length) return next

  let cursor = next
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (!cursor[k] || typeof cursor[k] !== "object") {
      cursor[k] = {}
    }
    cursor = cursor[k]
  }

  cursor[keys[keys.length - 1]] = value
  return next
}

function previewPatchValue(value) {
  if (value == null) return []
  if (typeof value === "string") return [value]
  if (typeof value === "number" || typeof value === "boolean") return [String(value)]
  if (Array.isArray(value)) {
    return value.slice(0, 4).map((item) => typeof item === "string" ? item : JSON.stringify(item))
  }

  const entries = Object.entries(value)
    .slice(0, 6)
    .map(([k, v]) => {
      if (typeof v === "string") return `${k}: ${v}`
      if (typeof v === "number" || typeof v === "boolean") return `${k}: ${String(v)}`
      if (Array.isArray(v)) return `${k}: [${v.length} items]`
      if (v && typeof v === "object") return `${k}: {${Object.keys(v).length} fields}`
      return `${k}: null`
    })

  return entries
}

export default function NyayaCourtroom({
  caseId,
  triadRunId = null,
  onComplete,
  mode = "auto",
  initialPrompt = "",
  initialSessionId = null,
}) {
  const canvasRef = useRef(null)
  const threeRef  = useRef(null)
  const councilActionRef = useRef({ start: null })
  const [reportSections, setReportSections] = useState([])
  const [sharedDocument, setSharedDocument] = useState({})
  const [summaryCard, setSummaryCard] = useState(null)
  const [rounds, setRounds] = useState([])
  const [triadOutputs, setTriadOutputs] = useState({})
  const [statusText, setStatusText]             = useState("NYAYA SESSION INITIATING...")
  const [isComplete, setIsComplete]             = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [promptText, setPromptText] = useState(initialPrompt || "")
  const [roundCount, setRoundCount] = useState(3)
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId || null)
  const [councilError, setCouncilError] = useState("")
  const reportScrollRef = useRef(null)
  const scrollTweenRef = useRef(null)
  const normalizedMode = String(mode || "auto").toLowerCase().trim()
  const isHrCouncilMode = normalizedMode === "hr-council"

  function smoothScrollReportToBottom(durationMs = 900) {
    const node = reportScrollRef.current
    if (!node) return

    const startTop = node.scrollTop
    const targetTop = node.scrollHeight - node.clientHeight
    if (targetTop <= startTop + 2) return

    if (scrollTweenRef.current) {
      cancelAnimationFrame(scrollTweenRef.current)
      scrollTweenRef.current = null
    }

    const startAt = performance.now()
    const animate = (now) => {
      const progress = Math.min(1, (now - startAt) / durationMs)
      // Ease-out cubic for a slow, accurate descent while new turns stream in.
      const eased = 1 - Math.pow(1 - progress, 3)
      node.scrollTop = startTop + (targetTop - startTop) * eased
      if (progress < 1) {
        scrollTweenRef.current = requestAnimationFrame(animate)
      } else {
        scrollTweenRef.current = null
      }
    }

    scrollTweenRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    smoothScrollReportToBottom(1100)
  }, [reportSections.length, rounds.length, Boolean(summaryCard), isComplete])

  useEffect(() => {
    return () => {
      if (scrollTweenRef.current) {
        cancelAnimationFrame(scrollTweenRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!canvasRef.current) return
    let cancelled = false
    const rootContainer = canvasRef.current

    async function init() {
      const THREE   = await import("three")
      const { gsap } = await import("gsap")
      const { CSS2DRenderer, CSS2DObject } =
        await import("three/addons/renderers/CSS2DRenderer.js")
      const { OrbitControls } =
        await import("three/addons/controls/OrbitControls.js")

      if (cancelled) return
      const container = rootContainer
      const W = container.clientWidth, H = container.clientHeight

      // Inject bubble styles once
      if (!document.getElementById("nyaya-styles")) {
        const s = document.createElement("style")
        s.id = "nyaya-styles"
        s.textContent = `
          .nb { background:rgba(255,255,255,0.97); border-radius:10px;
            padding:10px 13px; max-width:220px; pointer-events:none;
            box-shadow:0 6px 24px rgba(0,0,0,0.28); border-width:2px; border-style:solid;
            animation:nbPop .3s cubic-bezier(.34,1.56,.64,1) both;
            font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
          .nb-h { font-weight:700; font-size:10px; text-transform:uppercase;
            letter-spacing:.8px; margin-bottom:5px; }
          .nb-c { color:#1a1a2e; line-height:1.5; font-size:12px; }
          @keyframes nbPop { from{opacity:0;transform:scale(.7) translateY(8px)}
                              to{opacity:1;transform:scale(1) translateY(0)} }
          @keyframes nyIn { from{opacity:0;transform:translateY(12px)}
                             to{opacity:1;transform:translateY(0)} }
        `
        document.head.appendChild(s)
      }

      // Scene
      const scene = new THREE.Scene()
      scene.background = new THREE.Color("#0a0a18")
      scene.fog = new THREE.FogExp2("#0a0a18", 0.032)

      // Camera
      const camera = new THREE.PerspectiveCamera(55, W/H, 0.1, 100)
      camera.position.set(0, 22, 0)
      camera.lookAt(0, 0, 0)

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias:true })
      renderer.setSize(W, H)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      container.appendChild(renderer.domElement)

      // CSS2D overlay
      const css2d = new CSS2DRenderer()
      css2d.setSize(W, H)
      css2d.domElement.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;"
      container.appendChild(css2d.domElement)

      // OrbitControls — disabled during session, enabled on complete
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, 0.5, 0)
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.minDistance = 3
      controls.maxDistance = 22
      controls.maxPolarAngle = Math.PI * 0.82
      controls.enabled = false

      // Resize
      const onResize = () => {
        const w = container.clientWidth, h = container.clientHeight
        camera.aspect = w/h; camera.updateProjectionMatrix()
        renderer.setSize(w,h); css2d.setSize(w,h)
      }
      window.addEventListener("resize", onResize)

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.30))
      const dir = new THREE.DirectionalLight(0xfff8e8, 0.85)
      dir.position.set(4, 8, 4); dir.castShadow = true
      dir.shadow.mapSize.set(1024, 1024); scene.add(dir)
      const fill = new THREE.DirectionalLight(0x2244aa, 0.25)
      fill.position.set(-6, 3, -6); scene.add(fill)

      // Environment + table
      const tableGroup = buildCourtroom(THREE, scene)

      // Agent figures
      const agentGroups = [], agentLights = []

      AGENTS.forEach((ag, i) => {
        const group = new THREE.Group()
        group.visible = false

        const person = createSeatedPerson(THREE, ag.color, i)
        group.add(person)

        // Chair behind person (-z in local space = away from center after lookAt)
        const chair = createChair(THREE, ag.color)
        chair.position.z = -0.30
        group.add(chair)

        group.position.set(...ag.position)
        group.lookAt(0, group.position.y, 0)
        scene.add(group)
        agentGroups.push(group)

        const light = new THREE.PointLight(ag.color, 0, 5)
        light.position.set(ag.position[0], 1.8, ag.position[2])
        scene.add(light)
        agentLights.push(light)
      })

      // Holographic plane (center, initially invisible)
      const holoGeo = new THREE.PlaneGeometry(2.4, 1.4)
      const holoCanvas = document.createElement("canvas")
      holoCanvas.width = 512; holoCanvas.height = 288
      const hCtx = holoCanvas.getContext("2d")
      hCtx.fillStyle = "rgba(0,180,130,0.1)"; hCtx.fillRect(0,0,512,288)
      hCtx.strokeStyle = "rgba(0,220,160,0.5)"; hCtx.lineWidth = 2
      hCtx.strokeRect(8,8,496,272)
      hCtx.fillStyle = "#00e5a0"; hCtx.font = "bold 30px sans-serif"
      hCtx.textAlign = "center"; hCtx.fillText("COLLECTIVE SIGNALS", 256, 100)
      hCtx.font = "16px sans-serif"; hCtx.fillStyle = "rgba(0,220,160,.7)"
      hCtx.fillText("ASSEMBLING...", 256, 150)
      const holoTex = new THREE.CanvasTexture(holoCanvas)
      const holoMat = new THREE.MeshBasicMaterial({ map:holoTex, transparent:true, opacity:0, side:THREE.DoubleSide })
      const holoPlane = new THREE.Mesh(holoGeo, holoMat)
      holoPlane.rotation.x = -Math.PI/2; holoPlane.position.y = 0.15; scene.add(holoPlane)

      // Render loop
      const clock = new THREE.Clock()
      let rafId
      const animate = () => {
        rafId = requestAnimationFrame(animate)
        const t = clock.getElapsedTime()
        agentGroups.forEach((g, i) => {
          if (g.visible) g.position.y = Math.sin(t*1.5 + i*1.2) * 0.03
        })
        if (controls.enabled) controls.update()
        renderer.render(scene, camera)
        css2d.render(scene, camera)
      }
      animate()

      threeRef.current = { rafId:() => rafId, renderer, css2d, controls, container, onResize }

      // Camera tween
      function tweenCam(pos, look, dur=1.2) {
        return new Promise(res => {
          gsap.to(camera.position, {
            x:pos[0], y:pos[1], z:pos[2], duration:dur, ease:"power2.inOut",
            onUpdate: () => camera.lookAt(...look),
            onComplete: res,
          })
        })
      }

      // Speech bubbles
      let activeBubble=null, activeBubbleIdx=null
      function showBubble(i, text, color) {
        hideBubble()
        const div = document.createElement("div")
        div.className = "nb"; div.style.borderColor = color
        div.innerHTML = `<div class="nb-h" style="color:${color}">${AGENTS[i].label}</div>
          <div class="nb-c">${text}</div>`
        activeBubble = new CSS2DObject(div)
        activeBubble.position.set(0, 1.7, 0)
        agentGroups[i].add(activeBubble)
        activeBubbleIdx = i
      }
      function hideBubble() {
        if (activeBubble != null) {
          agentGroups[activeBubbleIdx].remove(activeBubble)
          activeBubble = null; activeBubbleIdx = null
        }
      }

      async function playScript(script = []) {
        for (const step of script) {
          const idx = AGENTS.findIndex((ag) => ag.name === step.agent)
          if (idx < 0) continue

          const ag = AGENTS[idx]
          const phase = String(step.phase || "").replaceAll("_", " ").toUpperCase()
          setStatusText(`${phase}: ${ag.label.toUpperCase()} SPEAKING`)

          await tweenCam(ag.cameraPos, [0,0,0], 1.1)

          gsap.to(agentGroups[idx].scale, { x:1.15,y:1.15,z:1.15, duration:0.28 })
          gsap.to(agentLights[idx], { intensity:2.0, duration:0.28 })

          showBubble(idx, step.bubble || step.content || step.title || "", ag.color)

          setReportSections((prev) => [...prev, {
            agent: step.agent,
            phase: step.phase || "discussion",
            round_title: step.round_title || null,
            task: step.title || null,
            content: step.content || "",
            flags: step.objective ? [step.objective] : [],
            json_path: step.json_patch?.path || null,
            json_value: step.json_patch?.value ?? null,
          }])

          if (step.json_patch?.path) {
            setSharedDocument((prev) => setNestedValue(prev, step.json_patch.path, step.json_patch.value))
          }

          await new Promise(r => setTimeout(r, 2400))

          hideBubble()
          gsap.to(agentGroups[idx].scale, { x:1,y:1,z:1, duration:0.28 })
          gsap.to(agentLights[idx], { intensity:0, duration:0.28 })
          await new Promise(r => setTimeout(r, 220))
        }
      }

      // ── NYAYA SESSION ──────────────────────────────────────
      async function runAutoSession() {
        setIsRunning(true)
        setCouncilError("")
        setStatusText("NYAYA SESSION INITIATED")

        gsap.to(tableGroup.scale, { x:1,y:1,z:1, duration:1.0, ease:"back.out(1.4)" })
        await tweenCam([0,7,10], [0,0,0], 2.0)

        agentGroups.forEach((g, i) => setTimeout(() => {
          g.visible = true
          g.scale.set(0,0,0)
          gsap.to(g.scale, { x:1,y:1,z:1, duration:0.5, ease:"back.out(1.6)" })
        }, i * 300))

        const apiReport = await fetch("/api/nyaya/run", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ case_id: caseId, triad_run_id: triadRunId })
        }).then(r => r.json()).catch(() => ({ success:false }))

        await new Promise(r => setTimeout(r, 1400))
        setStatusText("LOADING TRIAD REPORTS + DB KNOWLEDGE SOURCES")

        const report = apiReport?.success ? apiReport.report : getMockReport(caseId)
        if (cancelled) return

        setRounds(report.rounds || [])
        setTriadOutputs(report.triad_agent_outputs || {})
        setSharedDocument(report.shared_document_template || {})

        const script = Array.isArray(report.camera_script) ? report.camera_script : []
        await playScript(script)

        setStatusText("ASSEMBLING FINAL HR ADMIN BRIEF")
        await tweenCam([0,7,10], [0,0,0], 1.2)
        await new Promise(r => setTimeout(r, 500))

        agentLights.forEach(l => gsap.to(l, { intensity:0.45, duration:0.5 }))
        gsap.to(holoPlane.position, { y:1.5, duration:1.1, ease:"power2.out" })
        gsap.to(holoMat, { opacity:0.9, duration:1.1 })

        setSummaryCard(report.summary_card || null)
        setSharedDocument(report.shared_document || {})

        await new Promise(r => setTimeout(r, 2000))

        agentLights.forEach(l => gsap.to(l, { intensity:0, duration:0.5 }))
        setStatusText("COUNCIL COMPLETE · DRAG TO EXPLORE")
        controls.target.set(0, 0.5, 0)
        controls.update()
        controls.enabled = true
        setIsComplete(true)
        setIsRunning(false)
        onComplete?.(report)
      }

      async function runCouncilSession(question, roundsToRun, parentSessionId = null) {
        const cleanQ = String(question || "").trim()
        const cleanRounds = Math.max(1, Math.min(6, Number(roundsToRun || 3)))
        if (!cleanQ) {
          setCouncilError("Please enter a prompt for council discussion.")
          return
        }

        setIsRunning(true)
        setCouncilError("")
        setIsComplete(false)
        setStatusText("HR COUNCIL SESSION INITIATED")

        gsap.to(tableGroup.scale, { x:1,y:1,z:1, duration:0.7, ease:"back.out(1.4)" })
        await tweenCam([0,7,10], [0,0,0], 1.2)

        agentGroups.forEach((g, i) => {
          g.visible = true
          if (g.scale.x === 0 && g.scale.y === 0 && g.scale.z === 0) {
            g.scale.set(0,0,0)
            gsap.to(g.scale, { x:1,y:1,z:1, duration:0.45, delay:i*0.08, ease:"back.out(1.5)" })
          }
        })

        const apiRes = await fetch("/api/nyaya/council-chat", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            case_id: caseId,
            question: cleanQ,
            rounds: cleanRounds,
            session_id: parentSessionId || undefined,
          }),
        }).then((r) => r.json()).catch(() => ({ success:false }))

        if (!apiRes?.success) {
          setCouncilError(apiRes?.error || "Unable to run council discussion.")
          setIsRunning(false)
          return
        }

        if (apiRes?.session_id) {
          setActiveSessionId(apiRes.session_id)
        }

        const script = Array.isArray(apiRes.camera_script) ? apiRes.camera_script : []
        await playScript(script)

        const conclusion = apiRes.final_conclusion_json || {}
        setSummaryCard({
          title: "HR Council Conclusion",
          executive_summary: conclusion.answer_summary || "No summary available.",
          recommended_route: conclusion.route_advice || {},
          confidence_score: conclusion.confidence_score,
          next_actions: Array.isArray(conclusion.immediate_actions) ? conclusion.immediate_actions : [],
        })

        setSharedDocument((prev) => ({
          ...(prev || {}),
          hr_council: {
            question: cleanQ,
            round_count: apiRes.round_count || cleanRounds,
            memory_context: apiRes.memory_context || [],
            final_conclusion_json: conclusion,
          },
        }))

        setStatusText("COUNCIL COMPLETE · FOLLOW-UP QUESTIONS ENABLED")
        controls.enabled = true
        setIsComplete(true)
        setIsRunning(false)
      }

      councilActionRef.current.start = runCouncilSession

      if (isHrCouncilMode) {
        setStatusText("ENTER A PROMPT TO START HR COUNCIL")
        setIsRunning(false)
        setIsComplete(false)
      } else {
        runAutoSession()
      }
    }

    init()

    return () => {
      cancelled = true
      if (threeRef.current) {
        cancelAnimationFrame(threeRef.current.rafId())
        threeRef.current.controls?.dispose()
        threeRef.current.renderer.dispose()
        window.removeEventListener("resize", threeRef.current.onResize)
        if (rootContainer) rootContainer.innerHTML = ""
      }
    }
  }, [caseId, triadRunId, onComplete, isHrCouncilMode])

  // ── JSX ───────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", background:"#0a0a18", overflow:"hidden" }}>

      {/* 3D Canvas */}
      <div style={{ position:"relative", width:"60%", height:"100%", flexShrink:0 }}>
        <div ref={canvasRef} style={{ width:"100%", height:"100%", position:"relative" }} />

        {/* NYAYA logo */}
        <div style={{ position:"absolute", top:20, left:20, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:9,
            background:"linear-gradient(135deg,#1D9E75,#534AB7)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontWeight:800, fontSize:14, color:"#fff" }}>N</div>
          <div>
            <div style={{ color:"#fff", fontWeight:700, fontSize:14, letterSpacing:1 }}>NYAYA</div>
            <div style={{ color:"rgba(255,255,255,.4)", fontSize:10, fontFamily:"monospace" }}>
              CASE {caseId?.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div style={{ position:"absolute", bottom:28, left:"50%", transform:"translateX(-50%)",
          background:"rgba(0,0,0,.78)", color: isComplete ? "#aad4ff" : "#00e5a0",
          fontFamily:"'SF Mono',monospace", fontSize:12,
          padding:"8px 22px", borderRadius:6, letterSpacing:1.5,
          border:`1px solid ${isComplete ? "rgba(170,212,255,.35)" : "rgba(0,229,160,.4)"}`,
          whiteSpace:"nowrap", backdropFilter:"blur(6px)",
          boxShadow:`0 0 20px ${isComplete ? "rgba(170,212,255,.12)" : "rgba(0,229,160,.15)"}` }}>
          <span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%",
            background: isComplete ? "#aad4ff" : "#00e5a0", marginRight:8,
            animation: isComplete ? "none" : "nyPulse 1.2s ease-in-out infinite" }} />
          {statusText}
        </div>

        {/* Orbit hint — shown only when controls are active */}
        {isComplete && (
          <div style={{ position:"absolute", top:20, right:16,
            background:"rgba(0,0,0,.55)", color:"rgba(255,255,255,.5)",
            fontSize:10, fontFamily:"monospace", padding:"5px 10px",
            borderRadius:5, letterSpacing:.8, border:"1px solid rgba(255,255,255,.1)" }}>
            🖱 Drag · Scroll · Right-drag pan
          </div>
        )}

        <style>{`
          @keyframes nyPulse {
            0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.8)}
          }
        `}</style>
      </div>

      {/* Report Panel */}
      <div ref={reportScrollRef} style={{ width:"40%", height:"100%", overflowY:"auto",
        background:"#f8f8fc", borderLeft:"1px solid rgba(0,0,0,.08)",
        display:"flex", flexDirection:"column" }}>

        {/* Header */}
        <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid #eeeef4",
          background:"#fff", position:"sticky", top:0, zIndex:10,
          boxShadow:"0 1px 0 rgba(0,0,0,.04)" }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#999", letterSpacing:1.5,
            textTransform:"uppercase", marginBottom:4 }}>Case Intelligence Report</div>
          <div style={{ fontSize:17, fontWeight:700, color:"#1a1a2e" }}>NYAYA Analysis</div>
          <div style={{ fontSize:12, color:"#aaa", marginTop:2, fontFamily:"monospace" }}>{caseId}</div>
        </div>

        <div style={{ padding:"20px 24px", flex:1 }}>
          {reportSections.length === 0 && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", paddingTop:60, color:"#bbb", textAlign:"center" }}>
              <div style={{ width:48, height:48, borderRadius:"50%", border:"2px solid #e0e0e0",
                display:"flex", alignItems:"center", justifyContent:"center",
                marginBottom:16, background:"#f5f5f5" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div style={{ fontSize:14, fontWeight:500, color:"#aaa" }}>Awaiting agent analysis...</div>
              <div style={{ fontSize:12, color:"#ccc", marginTop:6 }}>
                Sections appear as each agent presents
              </div>
            </div>
          )}

          {reportSections.map((section, sectionIndex) => {
            const ag = AGENTS.find(a => a.name === section.agent)
            return (
              <div key={`${section.agent}-${section.phase}-${sectionIndex}`} style={{ marginBottom:24, background:"#fff",
                borderRadius:10, border:"1px solid #eeeef4", overflow:"hidden",
                boxShadow:"0 1px 4px rgba(0,0,0,.04)", animation:"nyIn 0.5s ease both" }}>
                <div style={{ background:ag?.color, padding:"8px 14px",
                  display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%",
                    background:"rgba(255,255,255,.55)" }} />
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.2,
                    textTransform:"uppercase", color:"#fff" }}>{ag?.label}</div>
                </div>
                <div style={{ padding:"12px 14px" }}>
                  {section.round_title && (
                    <div style={{ fontSize:10, color:"#7c7c90", marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>
                      {section.round_title}
                    </div>
                  )}
                  {section.task && (
                    <div style={{ fontSize:11, color:"#888", marginBottom:8, fontStyle:"italic" }}>
                      {section.task}
                    </div>
                  )}
                  <div style={{ fontSize:13, color:"#2a2a3e", lineHeight:1.65,
                    marginBottom: section.flags?.length ? 10 : 0 }}>
                    {section.content}
                  </div>
                  {section.flags?.length > 0 && (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {section.flags.map((f, fi) => (
                        <span key={fi} style={{ fontSize:11, padding:"3px 9px",
                          borderRadius:5, background:`${ag?.color}18`,
                          color:ag?.color, border:`1px solid ${ag?.color}33`,
                          fontWeight:500 }}>{f}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {rounds.length > 0 && (
            <div style={{ marginTop:8, marginBottom:24, padding:"14px 16px", background:"#fff",
              borderRadius:10, border:"1px solid #eeeef4" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#777", letterSpacing:1.3, textTransform:"uppercase", marginBottom:8 }}>
                Deliberation Rounds
              </div>
              {rounds.map((round) => (
                <div key={round.id} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"#1a1a2e" }}>{round.title}</div>
                  <div style={{ fontSize:11, color:"#86869a" }}>{round.objective}</div>
                </div>
              ))}
            </div>
          )}

          {summaryCard && (
            <div style={{ marginTop:8, marginBottom:24, padding:"16px 18px",
              background:"linear-gradient(140deg,#e8f9f3,#e8efff)",
              border:"1px solid #1D9E75", borderRadius:12,
              animation:"nyIn 0.6s ease both" }}>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5,
                color:"#1D9E75", marginBottom:10, textTransform:"uppercase" }}>
                Final Summary Card
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:"#1a1a2e", marginBottom:6 }}>
                {summaryCard.title || "Council Final Recommendation"}
              </div>
              <div style={{ fontSize:12, color:"#2f2f46", lineHeight:1.6, marginBottom:10 }}>
                {summaryCard.executive_summary}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                <div style={{ fontSize:11, color:"#777" }}>Route</div>
                <div style={{ fontSize:11, fontWeight:600, color:"#1a1a2e" }}>
                  {summaryCard.recommended_route?.authority || "n/a"}
                </div>
                <div style={{ fontSize:11, color:"#777" }}>Act</div>
                <div style={{ fontSize:11, fontWeight:600, color:"#1a1a2e" }}>
                  {summaryCard.recommended_route?.act_code || "n/a"}
                </div>
                <div style={{ fontSize:11, color:"#777" }}>Confidence</div>
                <div style={{ fontSize:11, fontWeight:600, color:"#1a1a2e" }}>
                  {summaryCard.confidence_score ?? "n/a"}
                </div>
              </div>
              {Array.isArray(summaryCard.next_actions) && summaryCard.next_actions.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:"#777", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Immediate Next Actions</div>
                  {summaryCard.next_actions.map((item, idx) => (
                    <div key={`next-action-${idx}`} style={{ fontSize:12, color:"#2f2f46", marginBottom:4 }}>
                      {idx + 1}. {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {Object.keys(triadOutputs || {}).length > 0 && (
            <div style={{ marginBottom:24, padding:"14px 16px", background:"#fff", border:"1px solid #eeeef4", borderRadius:10 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#777", letterSpacing:1.3, textTransform:"uppercase", marginBottom:8 }}>
                Components (Triad Outputs)
              </div>
              {Object.entries(triadOutputs).map(([key, value]) => (
                <div key={key} style={{ marginBottom:8, padding:"8px 10px", borderRadius:8, background:"#f7f7fb", border:"1px solid #ededf5" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#303049", marginBottom:4 }}>{value?.role || key}</div>
                  <div style={{ fontSize:11, color:"#777" }}>
                    {Array.isArray(value?.key_findings) ? value.key_findings.join(" | ") : "No findings."}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom:18, padding:"14px 16px", background:"#ffffff", borderRadius:10, border:"1px solid #ececf4" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#6b6b80", letterSpacing:1.2, textTransform:"uppercase", marginBottom:10 }}>
              Council Document Builder (Live JSON Contributions)
            </div>

            {reportSections.filter((item) => item.json_path).length === 0 && (
              <div style={{ fontSize:12, color:"#8f8fa3" }}>
                Agent contributions will appear here as structured cards.
              </div>
            )}

            {reportSections
              .filter((item) => item.json_path)
              .map((section, idx) => {
                const agent = AGENTS.find((a) => a.name === section.agent)
                const lines = previewPatchValue(section.json_value)

                return (
                  <div key={`patch-${idx}`} style={{
                    marginBottom:10,
                    padding:"11px 12px",
                    background:`linear-gradient(145deg, ${agent?.color || "#3b3f5a"}12, #f8f8fc)`,
                    border:`1px solid ${agent?.color || "#3b3f5a"}33`,
                    borderRadius:9,
                  }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:6 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:agent?.color || "#2e3248" }}>
                        {agent?.label || section.agent}
                      </div>
                      <div style={{ fontSize:10, color:"#777a8d", textTransform:"uppercase", letterSpacing:.8 }}>
                        {String(section.phase || "discussion").replaceAll("_", " ")}
                      </div>
                    </div>

                    <div style={{
                      fontSize:10,
                      color:"#54576b",
                      background:"rgba(255,255,255,.8)",
                      border:"1px dashed rgba(80,80,110,.28)",
                      borderRadius:6,
                      padding:"5px 7px",
                      marginBottom:7,
                      fontFamily:"monospace",
                    }}>
                      {section.json_path}
                    </div>

                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {lines.map((line, lineIdx) => (
                        <span key={`line-${lineIdx}`} style={{
                          fontSize:11,
                          color:"#2f3350",
                          background:"rgba(255,255,255,.86)",
                          border:"1px solid rgba(110,110,145,.25)",
                          borderRadius:999,
                          padding:"3px 9px",
                        }}>
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {isComplete && (
          <div style={{ padding:"14px 24px", borderTop:"1px solid #eeeef4",
            background:"#fff", display:"flex", alignItems:"center", gap:8,
            animation:"nyIn 0.5s ease both" }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#1D9E75" }} />
            <div style={{ fontSize:12, color:"#1D9E75", fontWeight:600, letterSpacing:.5 }}>
              NYAYA Council Complete: Final document ready for HR Admin
            </div>
          </div>
        )}

        <div style={{
          position:"sticky",
          bottom:10,
          margin:"0 16px 12px",
          background:"rgba(255,255,255,.68)",
          backdropFilter:"blur(10px)",
          border:"1px solid rgba(124,130,170,.28)",
          borderRadius:14,
          boxShadow:"0 10px 34px rgba(30,36,66,.12)",
          padding:"8px 10px",
          zIndex:20,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <textarea
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              placeholder="Ask Nyaya council."
              style={{
                width:"100%",
                minHeight:38,
                maxHeight:96,
                borderRadius:10,
                border:"1px solid rgba(150,155,190,.35)",
                padding:"8px 10px",
                fontSize:12,
                lineHeight:1.4,
                outline:"none",
                resize:"none",
                overflowY:"auto",
                background:"rgba(255,255,255,.84)",
              }}
            />
            <select
              value={roundCount}
              onChange={(event) => setRoundCount(Number(event.target.value) || 3)}
              style={{
                height:36,
                borderRadius:8,
                border:"1px solid rgba(150,155,190,.4)",
                padding:"0 8px",
                fontSize:12,
                background:"rgba(255,255,255,.9)",
              }}
            >
              {[1,2,3,4,5,6].map((value) => (
                <option key={`r-${value}`} value={value}>{value}R</option>
              ))}
            </select>
            <button
              disabled={isRunning || !promptText.trim()}
              onClick={() => councilActionRef.current.start?.(promptText, roundCount, activeSessionId)}
              style={{
                border:"none",
                borderRadius:8,
                padding:"8px 10px",
                minWidth:102,
                fontSize:11,
                fontWeight:700,
                color:"#fff",
                background:isRunning || !promptText.trim() ? "#9aa0b8" : "#2f64ff",
                cursor:isRunning || !promptText.trim() ? "not-allowed" : "pointer",
              }}
            >
              {isRunning ? "Running..." : activeSessionId ? "Follow-up" : "Ask"}
            </button>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, gap:10 }}>
            {councilError ? (
              <div style={{ fontSize:11, color:"#c13737" }}>{councilError}</div>
            ) : (
              <div style={{ fontSize:10, color:"#6f7391" }}></div>
            )}
            {activeSessionId ? (
              <div style={{ fontSize:10, color:"#6f7391", whiteSpace:"nowrap" }}>Session memory active</div>
            ) : null}
          </div>
        </div>

        <style>{`@keyframes nyIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      </div>
    </div>
  )
}

function getMockReport(caseId) {
  return {
    case_id: caseId,
    triad_agent_outputs: {
      rag: {
        role: "RAG Persona",
        key_findings: [
          "Classification: Physical stalking",
          "Suggested authority: Police Complaint",
          "Act code candidate: BNS",
        ],
      },
      timeline: {
        role: "Timeline Persona",
        key_findings: [
          "Predicted sequence count: 4",
          "Inconsistencies: 1",
          "Projected risk level: high",
        ],
      },
      sentimental: {
        role: "Sentimental Persona",
        key_findings: [
          "Urgency score: 0.76",
          "Distress score: 0.72",
          "Confidence score: 0.81",
        ],
      },
      deep_research: {
        role: "Deep Research Persona",
        key_findings: [
          "Matched profiles: 1",
          "Risk flags: repeat_cases",
          "Strategy: exact_full_name_with_context_ranking",
        ],
      },
    },
    rounds: [
      { id: "round_1", title: "Routing Deliberation", objective: "Decide forwarding route using legal fit, risk urgency, and evidence strength." },
      { id: "round_2", title: "What Happened First", objective: "Infer what likely happened first and how pattern developed." },
      { id: "round_3", title: "Concluding Round", objective: "Finalize recommendation package for HR admin." },
    ],
    camera_script: [
      {
        agent: "rag",
        phase: "triad_outputs",
        title: "RAG output loaded",
        content: "Classification and legal route loaded from triad engine.",
        bubble: "RAG evidence mapped. Physical stalking pattern points to BNS route.",
        json_patch: { path: "rag_persona", value: { status: "loaded" } },
      },
      {
        agent: "timeline",
        phase: "round_1",
        round_title: "Routing Deliberation",
        objective: "Decide forwarding route using legal fit, risk urgency, and evidence strength.",
        title: "Escalation pattern",
        content: "Sequence suggests escalating behaviour and shrinking interval between incidents.",
        bubble: "Pattern escalation supports fast routing.",
        json_patch: { path: "round_1_routing.agent_inputs.timeline", value: { confidence: "medium_high" } },
      },
      {
        agent: "sentimental",
        phase: "round_2",
        round_title: "What Happened First",
        objective: "Infer what likely happened first and how pattern developed.",
        title: "Pressure trajectory",
        content: "Distress and urgency rise as incidents repeat, indicating delayed intervention.",
        bubble: "Emotional pressure trend indicates repeated exposure.",
        json_patch: { path: "round_2_reconstruction.agent_inputs.sentimental", value: { contribution: "pressure trend" } },
      },
      {
        agent: "deep_research",
        phase: "round_3",
        round_title: "Concluding Round",
        objective: "Finalize recommendation package for HR admin.",
        title: "Background risk note",
        content: "Background indicators require stricter supervision during inquiry.",
        bubble: "Background context supports caution and tighter monitoring.",
        json_patch: { path: "round_3_conclusion.final_points.escalation_gate", value: "Escalate if threat indicators increase." },
      },
    ],
    summary_card: {
      title: "Council Final Recommendation",
      executive_summary: "The council aligns on formal routing with immediate safeguards and documented legal review.",
      recommended_route: {
        authority: "Police Complaint",
        act_code: "BNS",
      },
      confidence_score: 0.79,
      next_actions: [
        "Open formal inquiry workflow.",
        "Preserve all evidence and witness records.",
        "Apply immediate safety controls.",
      ],
    },
    shared_document_template: {
      rag_persona: {},
      timeline_persona: {},
      sentimental_persona: {},
      deep_research_persona: {},
      round_1_routing: { agent_inputs: {} },
      round_2_reconstruction: { agent_inputs: {} },
      round_3_conclusion: { final_points: {} },
      final_conclusion: {},
      hr_admin_master_document: {},
    },
    shared_document: {
      rag_persona: { status: "loaded" },
      timeline_persona: { status: "loaded" },
      sentimental_persona: { status: "loaded" },
      deep_research_persona: { status: "loaded" },
      round_1_routing: { decision: "Forward to Police Complaint" },
      round_2_reconstruction: { origin_hypothesis: "Boundary-testing behavior escalated over time" },
      round_3_conclusion: { council_consensus: "Route formally and preserve evidence integrity" },
      final_conclusion: { executive_summary: "Council consensus captured" },
      hr_admin_master_document: { status: "ready" },
    },
  }
}

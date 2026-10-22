// buildScene3D.js — NYAYA Courtroom scene helpers
// All functions receive THREE as first arg (avoids top-level import issues)

const FEATURES = [
  { skin: "#C68642", hair: "#1a0f08" }, // medium
  { skin: "#7B4A2A", hair: "#110a04" }, // darker
  { skin: "#F0C8A0", hair: "#3a2010" }, // fair
  { skin: "#A0654A", hair: "#141008" }, // medium-dark
]

export function createSeatedPerson(THREE, agentColor, idx) {
  const { skin, hair } = FEATURES[idx % 4]
  const g = new THREE.Group()
  const M = (geo, col) => new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col }))

  const suit = "#16202e", shirt = "#f8f8f8"

  // Shoes
  ;[-0.1, 0.1].forEach(x => {
    const s = M(new THREE.BoxGeometry(0.1, 0.06, 0.22), "#111")
    s.position.set(x, 0.04, 0.06); g.add(s)
  })
  // Lower legs
  ;[-0.1, 0.1].forEach(x => {
    const l = M(new THREE.CylinderGeometry(0.055, 0.06, 0.38, 10), suit)
    l.position.set(x, 0.25, 0.04); g.add(l)
  })
  // Thighs (horizontal, -z = toward chair back)
  ;[-0.1, 0.1].forEach(x => {
    const t = M(new THREE.CylinderGeometry(0.065, 0.07, 0.44, 10), suit)
    t.rotation.x = Math.PI / 2; t.position.set(x, 0.44, -0.14); g.add(t)
  })
  // Hips
  const hips = M(new THREE.BoxGeometry(0.30, 0.12, 0.44), suit)
  hips.position.set(0, 0.44, -0.14); g.add(hips)
  // Torso
  const torso = M(new THREE.BoxGeometry(0.36, 0.44, 0.20), suit)
  torso.position.set(0, 0.74, 0); g.add(torso)
  // Shirt
  const shirtM = M(new THREE.PlaneGeometry(0.09, 0.26), shirt)
  shirtM.position.set(0, 0.74, 0.102); g.add(shirtM)
  // Tie
  const tie = M(new THREE.PlaneGeometry(0.048, 0.22), agentColor)
  tie.position.set(0, 0.72, 0.103); g.add(tie)
  // Lapels
  ;[[-0.065, 0.10], [0.065, -0.10]].forEach(([x, rz]) => {
    const lap = M(new THREE.PlaneGeometry(0.09, 0.20), "#121820")
    lap.position.set(x, 0.85, 0.102); lap.rotation.z = rz; g.add(lap)
  })
  // Shoulders
  const sho = M(new THREE.BoxGeometry(0.46, 0.10, 0.22), suit)
  sho.position.set(0, 0.99, 0); g.add(sho)
  // Arms
  ;[[-0.24, 0.13], [0.24, -0.13]].forEach(([x, rz]) => {
    const arm = M(new THREE.CylinderGeometry(0.054, 0.05, 0.40, 10), suit)
    arm.position.set(x, 0.77, -0.04); arm.rotation.z = rz; g.add(arm)
  })
  // Hands
  ;[-0.30, 0.30].forEach(x => {
    const h = M(new THREE.SphereGeometry(0.058, 10, 10), skin)
    h.position.set(x, 0.60, -0.04); g.add(h)
  })
  // Neck
  const neck = M(new THREE.CylinderGeometry(0.065, 0.072, 0.13, 12), skin)
  neck.position.set(0, 1.05, 0); g.add(neck)
  // Head
  const head = M(new THREE.SphereGeometry(0.18, 22, 22), skin)
  head.scale.y = 1.14; head.position.set(0, 1.245, 0); g.add(head)
  // Hair dome
  const hairM = M(new THREE.SphereGeometry(0.198, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), hair)
  hairM.position.set(0, 1.255, 0); g.add(hairM)
  // Side hair
  const sideH = M(new THREE.BoxGeometry(0.37, 0.11, 0.16), hair)
  sideH.position.set(0, 1.20, 0); g.add(sideH)
  // Eyes
  ;[-0.062, 0.062].forEach(x => {
    const ew = M(new THREE.SphereGeometry(0.026, 8, 8), "#fff")
    ew.position.set(x, 1.25, 0.163); g.add(ew)
    const ep = M(new THREE.SphereGeometry(0.014, 6, 6), "#111")
    ep.position.set(x, 1.25, 0.176); g.add(ep)
  })
  // Nose
  const nose = M(new THREE.SphereGeometry(0.020, 8, 8), skin)
  nose.scale.x = 1.3; nose.position.set(0, 1.215, 0.178); g.add(nose)
  // Ears
  ;[-0.183, 0.183].forEach(x => {
    const ear = M(new THREE.SphereGeometry(0.034, 8, 8), skin)
    ear.scale.set(0.65, 1.2, 0.45); ear.position.set(x, 1.236, 0.02); g.add(ear)
  })
  return g
}

export function createChair(THREE, accentColor) {
  const g = new THREE.Group()
  const wood = new THREE.MeshLambertMaterial({ color: "#3a1800" })
  const lthr = new THREE.MeshLambertMaterial({ color: "#111827" })
  const acct = new THREE.MeshLambertMaterial({ color: accentColor })
  const M = (geo, mat) => new THREE.Mesh(geo, mat)

  // Seat cushion + frame
  const seat = M(new THREE.BoxGeometry(0.52, 0.08, 0.50), lthr); seat.position.set(0, 0.46, 0); g.add(seat)
  const sFrame = M(new THREE.BoxGeometry(0.56, 0.055, 0.54), wood); sFrame.position.set(0, 0.41, 0); g.add(sFrame)
  // Backrest
  const bk = M(new THREE.BoxGeometry(0.50, 0.56, 0.08), lthr); bk.position.set(0, 0.77, -0.23); g.add(bk)
  const bkF = M(new THREE.BoxGeometry(0.54, 0.62, 0.09), wood); bkF.position.set(0, 0.77, -0.245); g.add(bkF)
  // Accent top bar
  const acc = M(new THREE.BoxGeometry(0.52, 0.04, 0.05), acct); acc.position.set(0, 1.065, -0.238); g.add(acc)
  // Legs
  ;[[-0.22,0.22],[0.22,0.22],[-0.22,-0.22],[0.22,-0.22]].forEach(([x,z]) => {
    const leg = M(new THREE.CylinderGeometry(0.024, 0.024, 0.40, 8), wood)
    leg.position.set(x, 0.20, z); g.add(leg)
  })
  // Armrests
  ;[-0.27, 0.27].forEach(x => {
    const ar = M(new THREE.BoxGeometry(0.055, 0.055, 0.44), wood)
    ar.position.set(x, 0.60, 0); g.add(ar)
  })
  return g
}

export function buildCourtroom(THREE, scene) {
  const R = 14, H = 8
  const mat = (col, opts={}) => new THREE.MeshLambertMaterial({ color: col, ...opts })
  const mesh = (geo, col, opts) => new THREE.Mesh(geo, mat(col, opts))

  // Floor — marble
  const floor = mesh(new THREE.PlaneGeometry(R*2, R*2), "#d8d2c0")
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor)

  // Carpet
  const carpet = mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.018, 80), "#0f1428")
  carpet.position.y = 0.005; scene.add(carpet)
  ;[5.5, 4.6].forEach(r => {
    const ring = mesh(new THREE.TorusGeometry(r, 0.07, 8, 80), "#c9a84c")
    ring.rotation.x = Math.PI/2; ring.position.y = 0.016; scene.add(ring)
  })

  // Walls + wainscoting
  ;[
    [0, H/2, -R, 0], [0, H/2, R, Math.PI],
    [-R, H/2, 0, Math.PI/2], [R, H/2, 0, -Math.PI/2]
  ].forEach(([x,y,z,ry]) => {
    const wall = mesh(new THREE.BoxGeometry(R*2, H, 0.25), "#e2d8c8")
    wall.position.set(x,y,z); wall.rotation.y = ry; scene.add(wall)
    const wain = mesh(new THREE.BoxGeometry(R*2, 2.5, 0.32), "#2a1005")
    wain.position.set(x, 1.25, z); wain.rotation.y = ry; scene.add(wain)
    const cap = mesh(new THREE.BoxGeometry(R*2, 0.10, 0.38), "#4a2510")
    cap.position.set(x, 2.55, z); cap.rotation.y = ry; scene.add(cap)
    const crown = mesh(new THREE.BoxGeometry(R*2, 0.22, 0.38), "#4a2510")
    crown.position.set(x, H-0.11, z); crown.rotation.y = ry; scene.add(crown)
  })

  // Ceiling + coffers
  const ceil = mesh(new THREE.PlaneGeometry(R*2, R*2), "#ede8dc")
  ceil.rotation.x = Math.PI/2; ceil.position.y = H; scene.add(ceil)
  ;[-6, 0, 6].forEach(v => {
    const bx = mesh(new THREE.BoxGeometry(0.28, 0.22, R*2), "#4a2510")
    bx.position.set(v, H-0.11, 0); scene.add(bx)
    const bz = mesh(new THREE.BoxGeometry(R*2, 0.22, 0.28), "#4a2510")
    bz.position.set(0, H-0.11, v); scene.add(bz)
  })
  ;[2.1, 1.1].forEach(r => {
    const m = mesh(new THREE.TorusGeometry(r, 0.12, 8, 80), "#c9a84c")
    m.rotation.x = Math.PI/2; m.position.y = H-0.01; scene.add(m)
  })

  // Columns
  ;[[-7,-7],[7,-7],[-7,7],[7,7],[0,-10],[0,10],[-10,0],[10,0]].forEach(([x,z]) => {
    const col = mesh(new THREE.CylinderGeometry(0.28, 0.32, H, 16), "#ddd9cc")
    col.position.set(x, H/2, z); col.castShadow = true; scene.add(col)
    const cap = mesh(new THREE.BoxGeometry(0.8, 0.28, 0.8), "#ddd9cc")
    cap.position.set(x, H-0.14, z); scene.add(cap)
    const base = mesh(new THREE.BoxGeometry(0.76, 0.22, 0.76), "#ddd9cc")
    base.position.set(x, 0.11, z); scene.add(base)
  })

  // Chandelier
  const cg = new THREE.Group()
  const gld = mat("#c9a84c")
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, H-1.5, 8), gld)
  rod.position.y = (H-1.5)/2; cg.add(rod)
  cg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 0.65, 16), gld))
  for (let i=0; i<6; i++) {
    const a = (i/6)*Math.PI*2, sx=Math.sin(a), cz=Math.cos(a)
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,1.1,6), gld)
    arm.rotation.z=Math.PI/2; arm.position.set(sx*0.5,-0.1,cz*0.5); arm.rotation.y=a; cg.add(arm)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065,8,8),
      new THREE.MeshLambertMaterial({ color:"#fff8e0", emissive:"#fff0a0", emissiveIntensity:0.9 }))
    bulb.position.set(sx*1.05,-0.32,cz*1.05); cg.add(bulb)
    for(let j=0;j<3;j++){
      const cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.038),
        new THREE.MeshLambertMaterial({ color:"#ddeeff", transparent:true, opacity:0.7 }))
      cry.position.set(sx*(0.7+j*0.1),-0.42-j*0.08,cz*(0.7+j*0.1)); cg.add(cry)
    }
  }
  cg.position.y = H-0.3; scene.add(cg)
  const chanLight = new THREE.PointLight(0xfff5cc, 1.4, 22)
  chanLight.position.set(0, H-1.8, 0); scene.add(chanLight)

  // Wall sconces
  ;[[-R+0.32,3.6,0],[R-0.32,3.6,0],[0,3.6,-R+0.32],[0,3.6,R-0.32]].forEach(([x,y,z]) => {
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.18,0.28,0.28), gld)
    br.position.set(x,y,z); scene.add(br)
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.16,0.28,12),
      new THREE.MeshLambertMaterial({ color:"#e8d090", transparent:true, opacity:0.8 }))
    sh.position.set(x,y+0.22,z); scene.add(sh)
    const sl = new THREE.PointLight(0xffeedd, 0.55, 7)
    sl.position.set(x,y+0.3,z); scene.add(sl)
  })

  // Court seal (north wall)
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,0.1,48), gld)
  seal.rotation.x=Math.PI/2; seal.position.set(0,5.5,-R+0.38); scene.add(seal)
  const sealI = new THREE.Mesh(new THREE.CylinderGeometry(0.72,0.72,0.12,48), mat("#0f1428"))
  sealI.rotation.x=Math.PI/2; sealI.position.set(0,5.5,-R+0.40); scene.add(sealI)
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), gld)
  star.position.set(0,5.5,-R+0.46); scene.add(star)

  // Bookshelf (east wall)
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(5,3.2,0.44), mat("#2a1005"))
  shelf.position.set(R-0.5, 2.8, -1); scene.add(shelf)
  ;[1.35,2.25,3.15].forEach(y => {
    const div = new THREE.Mesh(new THREE.BoxGeometry(5,0.05,0.44), mat("#4a2510"))
    div.position.set(R-0.5, y, -1); scene.add(div)
  })
  const bkCols = ["#8b1a1a","#1a4a8b","#1a6a1a","#6b1a6b","#8b6b1a","#1a6b6b","#7a3a0a","#2a1a6b"]
  for(let row=0;row<3;row++) for(let col=0;col<17;col++){
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.6-row*0.04,0.22),
      mat(bkCols[(row*6+col)%bkCols.length]))
    bk.position.set(R-0.52+(col-8)*0.27, 1.38+row*0.88, -1)
    bk.rotation.y=(Math.random()-0.5)*0.06; scene.add(bk)
  }

  // Spectator benches (south)
  ;[9.5, 11.2].forEach(z => {
    const bn = new THREE.Mesh(new THREE.BoxGeometry(10,0.16,0.58), mat("#2a1005"))
    bn.position.set(0,0.54,z); scene.add(bn)
    const bkr = new THREE.Mesh(new THREE.BoxGeometry(10,0.52,0.1), mat("#2a1005"))
    bkr.position.set(0,0.85,z+0.28); scene.add(bkr)
    ;[-4,0,4].forEach(x => {
      const lg = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.54,0.52), mat("#2a1005"))
      lg.position.set(x,0.27,z); scene.add(lg)
    })
  })

  // Table (top surface at y=0.72)
  const tableGroup = new THREE.Group()
  tableGroup.scale.set(0.01,0.01,0.01)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2,2,0.14,72), mat("#2a1005"))
  top.position.y=0.65; top.castShadow=true; top.receiveShadow=true; tableGroup.add(top)
  ;[1.88,0.88].forEach(r => {
    const tr = new THREE.Mesh(new THREE.TorusGeometry(r,0.038,8,80), mat("#c9a84c"))
    tr.rotation.x=Math.PI/2; tr.position.y=0.73; tableGroup.add(tr)
  })
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.28,0.60,16), mat("#2a1005"))
  ped.position.y=0.30; tableGroup.add(ped)
  const pedBase = new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.66,0.08,16), mat("#2a1005"))
  pedBase.position.y=0.04; tableGroup.add(pedBase)
  scene.add(tableGroup)

  return tableGroup
}

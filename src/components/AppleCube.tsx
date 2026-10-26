import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { crateFill } from '../accounts'

const FISH_COLORS = [0xff7a3c, 0xffd23f, 0x3ec6c6, 0xff5d8f, 0x7dce6a, 0x6aa8ff]

export interface TankLevel {
  name: string
  carried: number
  goal: number
}

export function FishTank({ levels }: { levels: TankLevel[] }) {
  const host = useRef<HTMLDivElement>(null)
  const live = useRef({ levels, halfWidth: 4, lookY: 1.15 })
  live.current = { levels, halfWidth: live.current.halfWidth, lookY: live.current.lookY }

  useEffect(() => {
    const el = host.current
    if (!el) return
    const node: HTMLDivElement = el
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    node.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x8a9148)
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 80)
    camera.position.set(0, 1.15, 14)
    const hemi = new THREE.HemisphereLight(0xeaf6ff, 0x6d8a48, 0.95)
    const sun = new THREE.DirectionalLight(0xfff3df, 1.15)
    sun.position.set(-4, 8, 16)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 50
    sun.shadow.camera.left = -10
    sun.shadow.camera.right = 10
    sun.shadow.camera.top = 10
    sun.shadow.camera.bottom = -10
    scene.add(hemi, sun)

    const world = new THREE.Group()
    scene.add(world)
    let built = ''
    let frame = 0
    const swimmers: Swimmer[] = []
    const fronds: Frond[] = []
    const bubbles: Bubble[] = []

    function resize() {
      const width = node.clientWidth || 640
      const height = node.clientHeight || 520
      renderer.setSize(width, height, false)
      const aspect = width / Math.max(1, height)
      const view = Math.max(1.85, live.current.halfWidth / Math.max(0.85, aspect))
      camera.left = -view * aspect
      camera.right = view * aspect
      camera.top = view
      camera.bottom = -view
      camera.updateProjectionMatrix()
    }

    const observer = new ResizeObserver(resize)

    function tick(time: number) {
      const rows = live.current.levels
      const key = rows.map((level) => `${level.name}:${level.carried}:${level.goal}`).join('|')
      if (key !== built) {
        disposeContents(world)
        swimmers.length = 0
        fronds.length = 0
        bubbles.length = 0
        const frameFit = buildTanks(world, rows, swimmers, fronds, bubbles)
        live.current.halfWidth = frameFit.halfWidth
        live.current.lookY = frameFit.lookY
        built = key
        resize()
      }
      const seconds = time * 0.001
      for (const swimmer of swimmers) {
        const t = seconds
        const x = swimmer.ox + Math.sin(t * swimmer.sx + swimmer.phase) * swimmer.ax
        const y = swimmer.oy + Math.sin(t * swimmer.sy + swimmer.phase * 1.3) * swimmer.ay
        const dx = x - swimmer.mesh.position.x
        swimmer.mesh.position.set(x, y, swimmer.oz)
        const face = dx === 0 ? Math.sign(swimmer.mesh.scale.x) || 1 : Math.sign(dx)
        swimmer.mesh.scale.set(swimmer.base * face, swimmer.base, swimmer.base)
        swimmer.tail.rotation.z = Math.sin(t * 8 + swimmer.phase) * 0.4
      }
      for (const frond of fronds) {
        frond.mesh.rotation.z = frond.base + Math.sin(seconds * frond.speed + frond.phase) * frond.amount
      }
      for (const bubble of bubbles) {
        const cycle = (seconds * bubble.speed + bubble.phase) % 1
        bubble.mesh.position.set(
          bubble.x + Math.sin(seconds * 1.5 + bubble.phase * 5) * 0.03,
          bubble.base + cycle * (bubble.top - bubble.base),
          bubble.z,
        )
        bubble.mesh.scale.setScalar(bubble.size * (0.7 + cycle * 0.55))
      }
      const surfaces = world.userData.surfaces as THREE.Mesh[] | undefined
      for (const surface of surfaces ?? []) {
        surface.position.y = surface.userData.baseY + Math.sin(seconds * 1.7 + surface.userData.phase) * 0.008
      }
      camera.position.set(0, live.current.lookY, 14)
      camera.lookAt(0, live.current.lookY, 0)
      renderer.render(scene, camera)
      frame = requestAnimationFrame(tick)
    }

    resize()
    observer.observe(node)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      disposeContents(world)
      renderer.dispose()
      node.removeChild(renderer.domElement)
    }
  }, [])

  const label = levels.length === 0 ? 'Pecera vacía' : levels.map((level) => `${level.name}, ${level.carried} de ${level.goal}`).join('. ')
  return <div ref={host} className="crate" role="img" aria-label={label} />
}

interface Frond {
  mesh: THREE.Object3D
  phase: number
  speed: number
  amount: number
  base: number
}

interface Bubble {
  mesh: THREE.Object3D
  x: number
  z: number
  base: number
  top: number
  speed: number
  phase: number
  size: number
}

interface Swimmer {
  mesh: THREE.Group
  tail: THREE.Object3D
  ox: number
  oy: number
  oz: number
  ax: number
  ay: number
  az: number
  sx: number
  sy: number
  sz: number
  phase: number
  base: number
}

function buildTanks(
  root: THREE.Group,
  levels: TankLevel[],
  swimmers: Swimmer[],
  fronds: Frond[],
  bubbles: Bubble[],
): { halfWidth: number; lookY: number } {
  const shown = levels.length > 0 ? levels : [{ name: '', carried: 0, goal: 3000 }]
  const big = shown.length === 1
  const width = big ? 3.7 : 1.62
  const gap = big ? 0 : 0.96
  const step = width + gap
  const surfaces: THREE.Mesh[] = []
  root.userData.surfaces = surfaces
  shown.forEach((level, index) => {
    const tank = new THREE.Group()
    tank.position.x = (index - (shown.length - 1) / 2) * step
    root.add(tank)
    buildOne(tank, level, index, big, levels.length > 0, swimmers, surfaces, fronds, bubbles)
  })
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 40),
    new THREE.MeshStandardMaterial({ color: 0x8a9148, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  root.add(ground)
  const halfWidth = big ? 4.6 : ((shown.length - 1) * step) / 2 + width / 2 + 0.9
  return { halfWidth, lookY: big ? 1.25 : 1.35 }
}

function buildOne(
  root: THREE.Group,
  level: TankLevel,
  index: number,
  big: boolean,
  withFish: boolean,
  swimmers: Swimmer[],
  surfaces: THREE.Mesh[],
  fronds: Frond[],
  bubbles: Bubble[],
) {
  const fill = crateFill(level.carried, level.goal)
  const W = big ? 3.7 : 1.62
  const D = big ? 2.15 : 1.2
  const H = big ? 2.65 : 2.45
  const t = big ? 0.055 : 0.04
  const glass = new THREE.MeshStandardMaterial({
    color: 0xc5e9f8,
    transparent: true,
    opacity: 0.22,
    roughness: 0.08,
    metalness: 0.02,
    depthWrite: false,
  })
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x8fd0ea, roughness: 0.35, metalness: 0.05 })
  const gravelMat = new THREE.MeshStandardMaterial({ color: 0xc6a36a, roughness: 0.95 })
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x083e6b,
    transparent: true,
    opacity: 0.78,
    roughness: 0.25,
    depthWrite: false,
  })
  const skin = new THREE.MeshStandardMaterial({
    color: 0x0c5a92,
    transparent: true,
    opacity: 0.92,
    roughness: 0.08,
    depthWrite: false,
  })

  const pane = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.renderOrder = 3
    root.add(mesh)
  }

  pane(W, t, D, 0, t / 2, 0, rimMat)
  pane(t, H, D, -W / 2, t + H / 2, 0, glass)
  pane(t, H, D, W / 2, t + H / 2, 0, glass)
  pane(W, H, t, 0, t + H / 2, -D / 2, glass)
  pane(W, H, t, 0, t + H / 2, D / 2, glass)
  pane(W + 0.06, 0.06, 0.06, 0, t + H, -D / 2, rimMat)
  pane(W + 0.06, 0.06, 0.06, 0, t + H, D / 2, rimMat)
  pane(0.06, 0.06, D, -W / 2, t + H, 0, rimMat)
  pane(0.06, 0.06, D, W / 2, t + H, 0, rimMat)

  const innerW = W - t * 2 - 0.06
  const innerD = D - t * 2 - 0.06
  const gravelH = big ? 0.14 : 0.1
  const gravel = new THREE.Mesh(new THREE.BoxGeometry(innerW, gravelH, innerD), gravelMat)
  gravel.position.y = t + gravelH / 2
  gravel.receiveShadow = true
  root.add(gravel)

  const waterRoom = H - gravelH - 0.1
  const waterBase = t + gravelH
  if (fill > 0) {
    const waterH = waterRoom * fill
    const water = new THREE.Mesh(new THREE.BoxGeometry(innerW, waterH, innerD), waterMat)
    water.position.y = waterBase + waterH / 2
    water.renderOrder = 1
    root.add(water)
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(innerW * 0.98, innerD * 0.98), skin)
    surface.rotation.x = -Math.PI / 2
    surface.position.y = waterBase + waterH
    surface.userData.baseY = surface.position.y
    surface.userData.phase = index
    surface.renderOrder = 2
    root.add(surface)
    surfaces.push(surface)
  }

  const rulerH = waterRoom * 0.98
  const rulerW = rulerH * (RULER_TEX_W / RULER_TEX_H)
  const ruler = new THREE.Mesh(
    new THREE.PlaneGeometry(rulerW, rulerH),
    new THREE.MeshBasicMaterial({ map: rulerTexture(level.goal), transparent: true }),
  )
  ruler.position.set(-W / 2 - rulerW / 2 - 0.1, waterBase + waterRoom / 2, D / 2 + 0.08)
  ruler.renderOrder = 5
  root.add(ruler)

  if (level.name) {
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(big ? 2.35 : W * 1.02, big ? 0.56 : 0.5),
      new THREE.MeshBasicMaterial({ map: nameTexture(level.name, level.carried), transparent: true }),
    )
    plaque.position.set(0, t + H + (big ? 0.34 : 0.28), 0)
    plaque.renderOrder = 5
    root.add(plaque)
  }

  const depth = waterRoom * fill
  const fitted = depth <= 0 ? 0.42 : Math.min(1, depth / (big ? 1.45 : 1.15))
  const lifeScale = (big ? 1.25 : 1) * Math.max(0.42, fitted)
  addReef(root, index, waterBase, lifeScale, fill > 0.08 ? waterBase + waterRoom * fill : 0, big ? 2.1 : 1, fronds, bubbles)

  if (!withFish) return

  const waterTop = waterBase + waterRoom * Math.max(fill, 0.12)
  const swimLow = waterBase + 0.12
  const swimHigh = Math.max(swimLow + 0.1, waterTop - 0.1)
  const midY = (swimLow + swimHigh) / 2
  const ampY = (swimHigh - swimLow) / 2 * 0.8
  const fish = makeFish(FISH_COLORS[index % FISH_COLORS.length])
  const base = big ? 1.25 : 0.9
  fish.mesh.scale.setScalar(base)
  fish.mesh.traverse((obj) => {
    obj.renderOrder = 4
  })
  const phase = index * 1.37
  fish.mesh.position.set(0, midY, 0.12)
  root.add(fish.mesh)
  swimmers.push({
    mesh: fish.mesh,
    tail: fish.tail,
    ox: 0,
    oy: midY,
    oz: 0.12,
    ax: big ? 0.85 : 0.28,
    ay: ampY,
    az: 0,
    sx: 0.55 + (index % 3) * 0.08,
    sy: 0.4,
    sz: 0.2,
    phase,
    base,
  })
}


function paper(ctx: CanvasRenderingContext2D, width: number, height: number, radius: number) {
  const inset = 18
  ctx.clearRect(0, 0, width, height)
  ctx.beginPath()
  ctx.roundRect(inset, inset, width - inset * 2, height - inset * 2, radius)
  ctx.fillStyle = '#f4ecdf'
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = '#12100e'
  ctx.stroke()
}

function nameTexture(name: string, carried: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 980
  canvas.height = 320
  const ctx = canvas.getContext('2d')
  if (ctx) {
    paper(ctx, 980, 320, 40)
    ctx.fillStyle = '#12100e'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '400 108px Anton, Impact, sans-serif'
    const title = name.length > 18 ? name.slice(0, 17) + '…' : name
    ctx.fillText(title, 490, 118)
    ctx.font = '700 92px Barlow, "Segoe UI", sans-serif'
    const sign = carried < 0 ? '-' : ''
    ctx.fillText(sign + '$' + Math.abs(Math.round(carried)).toLocaleString('en-US'), 490, 228)
  }
  return sharpTexture(canvas)
}

const RULER_TEX_W = 560
const RULER_TEX_H = 1500

function rulerTexture(goal: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = RULER_TEX_W
  canvas.height = RULER_TEX_H
  const ctx = canvas.getContext('2d')
  const top = goal > 0 ? goal : 3000
  if (ctx) {
    paper(ctx, RULER_TEX_W, RULER_TEX_H, 32)
    ctx.fillStyle = '#12100e'
    ctx.strokeStyle = '#12100e'
    ctx.font = '700 104px Barlow, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 8
    for (let step = 0; step <= 4; step += 1) {
      const y = 1340 - (step / 4) * 1180
      const value = Math.round((top / 4) * step)
      ctx.fillText(value.toLocaleString('en-US'), 250, y)
      ctx.beginPath()
      ctx.moveTo(430, y)
      ctx.lineTo(510, y)
      ctx.stroke()
    }
  }
  return sharpTexture(canvas)
}

function sharpTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 16
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  return tex
}

function makeFish(color: number): { mesh: THREE.Group; tail: THREE.Object3D } {
  const mesh = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.38, side: THREE.DoubleSide })
  const ink = new THREE.MeshStandardMaterial({ color: 0x1c1915, roughness: 0.3 })
  const white = new THREE.MeshStandardMaterial({ color: 0xfffaf3, roughness: 0.25 })
  const extrude = { depth: 0.07, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.016, bevelSegments: 1 }
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(bodyShape(), extrude), bodyMat)
  body.position.z = -0.035
  body.castShadow = true
  const tail = new THREE.Mesh(new THREE.ExtrudeGeometry(tailShape(), extrude), bodyMat)
  tail.position.set(-0.05, 0, -0.035)
  tail.castShadow = true
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(dorsalShape(), extrude), bodyMat)
  fin.position.z = -0.035
  const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), white)
  eyeWhite.scale.z = 0.55
  eyeWhite.position.set(0.2, 0.035, 0.05)
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), ink)
  pupil.position.set(0.22, 0.035, 0.07)
  mesh.add(body, tail, fin, eyeWhite, pupil)
  return { mesh, tail }
}

function bodyShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(0.4, 0)
  shape.bezierCurveTo(0.3, 0.16, 0.05, 0.17, -0.08, 0.08)
  shape.bezierCurveTo(-0.04, 0.03, -0.04, -0.03, -0.08, -0.07)
  shape.bezierCurveTo(0.05, -0.15, 0.28, -0.13, 0.4, 0)
  return shape
}

function tailShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(0.02, 0.015)
  shape.lineTo(-0.15, 0.13)
  shape.lineTo(-0.06, 0)
  shape.lineTo(-0.15, -0.11)
  shape.lineTo(0.02, -0.015)
  shape.closePath()
  return shape
}

function dorsalShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(0.02, 0.1)
  shape.lineTo(0.08, 0.2)
  shape.lineTo(0.16, 0.08)
  shape.closePath()
  return shape
}

const CORALS = [0xff4f78, 0xff7a3c, 0xd946ef, 0xff5d8f, 0xffb020]
const WEEDS = [0x1f9d55, 0x147a3f, 0x2fbf71, 0x0e8a52, 0x67b83a]
const ACCENTS = [0xc084fc, 0x38bdf8, 0xfb7185, 0xf59e0b, 0xe879f9]
const LIFE_EXTRUDE = { depth: 0.055, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1 }

function addReef(
  root: THREE.Group,
  index: number,
  floor: number,
  scale: number,
  surface: number,
  spread: number,
  fronds: Frond[],
  bubbles: Bubble[],
) {
  const reef = new THREE.Group()
  reef.position.y = floor
  reef.scale.setScalar(scale * 1.6)
  root.add(reef)

  const rock = cutout(rockShape(), 0x9a7348)
  rock.position.set(-0.34, 0, -0.02)
  reef.add(rock)
  const rock2 = cutout(rockShape(), 0xb08960)
  rock2.position.set(0.38, 0, -0.04)
  rock2.scale.set(0.8, 0.7, 1)
  reef.add(rock2)

  const coralColor = CORALS[index % CORALS.length]
  const coral = index % 2 === 0 ? cutout(coralShape(), coralColor) : cutout(moundShape(), coralColor)
  coral.position.set(-0.42, 0, 0.04)
  reef.add(coral)
  fronds.push({ mesh: coral, phase: index, speed: 0.55, amount: 0.035, base: 0 })

  const weed = seaweed(WEEDS[index % WEEDS.length], index * 0.7, fronds)
  weed.position.set(0.4, 0, 0)
  reef.add(weed)

  const accent = ACCENTS[index % ACCENTS.length]
  const middle = index % 3 === 0 ? anemone(accent, index, fronds) : index % 3 === 1 ? seaFan(accent, index, fronds) : sponge(accent)
  middle.position.set(index % 2 === 0 ? 0.02 : -0.08, 0, 0.08)
  reef.add(middle)

  const star = cutout(starShape(), 0xff7a2f)
  star.position.set(0.16, 0.015, 0.16)
  star.scale.setScalar(0.9)
  reef.add(star)

  const clam = cutout(clamShape(), 0xf3e2c4)
  clam.position.set(-0.12, 0.01, 0.14)
  reef.add(clam)

  reef.traverse((obj) => {
    obj.renderOrder = 4
  })

  if (surface <= floor + 0.12) return
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0xe7f7ff,
    transparent: true,
    opacity: 0.8,
    roughness: 0.12,
    depthWrite: false,
  })
  const spots = [-0.22, 0.08, 0.3]
  spots.forEach((spotX, spot) => {
    const x = spotX * spread
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), bubbleMat)
    mesh.renderOrder = 4
    mesh.position.set(x, floor + 0.08, 0.2)
    root.add(mesh)
    bubbles.push({
      mesh,
      x,
      z: 0.2,
      base: floor + 0.08,
      top: surface - 0.04,
      speed: 0.16 + spot * 0.05,
      phase: index * 0.37 + spot * 0.31,
      size: 0.75 + (spot % 2) * 0.35,
    })
  })
}

function cutout(shape: THREE.Shape, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, LIFE_EXTRUDE),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48, side: THREE.DoubleSide }),
  )
  mesh.position.z = -0.028
  mesh.castShadow = true
  return mesh
}

function seaweed(color: number, phase: number, fronds: Frond[]): THREE.Group {
  const group = new THREE.Group()
  const leans = [-0.1, 0.02, 0.12]
  leans.forEach((lean, i) => {
    const blade = cutout(bladeShape(), i === 1 ? color : shade(color, i === 0 ? 0.75 : 1.15))
    blade.position.x = (i - 1) * 0.07
    blade.scale.y = 0.82 + i * 0.14
    group.add(blade)
    fronds.push({ mesh: blade, phase: phase + i * 0.8, speed: 1.15 + i * 0.2, amount: 0.07, base: lean })
  })
  return group
}

function anemone(color: number, index: number, fronds: Frond[]): THREE.Group {
  const group = new THREE.Group()
  const foot = cutout(moundShape(), shade(color, 0.7))
  foot.scale.set(0.55, 0.4, 1)
  group.add(foot)
  for (let i = 0; i < 5; i += 1) {
    const arm = cutout(tentacleShape(), i % 2 === 0 ? color : shade(color, 1.2))
    arm.position.x = (i - 2) * 0.045
    group.add(arm)
    fronds.push({
      mesh: arm,
      phase: index + i,
      speed: 1.4,
      amount: 0.12,
      base: (i - 2) * 0.16,
    })
  }
  return group
}

function seaFan(color: number, index: number, fronds: Frond[]): THREE.Group {
  const group = new THREE.Group()
  const fan = cutout(fanShape(), color)
  group.add(fan)
  fronds.push({ mesh: fan, phase: index * 1.2, speed: 0.7, amount: 0.05, base: -0.04 })
  return group
}

function sponge(color: number): THREE.Group {
  const group = new THREE.Group()
  const tube = cutout(spongeShape(), color)
  const lip = cutout(spongeShape(), shade(color, 1.25))
  lip.scale.set(0.72, 0.72, 1)
  lip.position.x = 0.1
  group.add(tube, lip)
  return group
}

function shade(color: number, mix: number): number {
  const src = new THREE.Color(color)
  src.offsetHSL(0, 0, (mix - 1) * 0.35)
  return src.getHex()
}

function rockShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(-0.2, 0)
  shape.bezierCurveTo(-0.22, 0.1, -0.08, 0.16, 0.02, 0.11)
  shape.bezierCurveTo(0.12, 0.17, 0.24, 0.09, 0.2, 0)
  shape.closePath()
  return shape
}

function coralShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(-0.07, 0)
  shape.lineTo(-0.1, 0.16)
  shape.lineTo(-0.2, 0.36)
  shape.lineTo(-0.11, 0.39)
  shape.lineTo(-0.05, 0.2)
  shape.lineTo(-0.01, 0.46)
  shape.lineTo(0.08, 0.48)
  shape.lineTo(0.05, 0.2)
  shape.lineTo(0.2, 0.34)
  shape.lineTo(0.22, 0.24)
  shape.lineTo(0.09, 0.14)
  shape.lineTo(0.08, 0)
  shape.closePath()
  return shape
}

function moundShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(-0.16, 0)
  shape.bezierCurveTo(-0.18, 0.16, -0.08, 0.3, 0, 0.28)
  shape.bezierCurveTo(0.12, 0.32, 0.2, 0.16, 0.16, 0)
  shape.closePath()
  return shape
}

function bladeShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(0.05, 0.16, -0.04, 0.34, 0.02, 0.58)
  shape.bezierCurveTo(0.06, 0.34, 0.09, 0.16, 0.045, 0)
  shape.closePath()
  return shape
}

function fanShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(-0.015, 0.12)
  shape.quadraticCurveTo(-0.2, 0.2, -0.16, 0.4)
  shape.quadraticCurveTo(0, 0.5, 0.16, 0.4)
  shape.quadraticCurveTo(0.2, 0.2, 0.015, 0.12)
  shape.closePath()
  return shape
}

function tentacleShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.05)
  shape.bezierCurveTo(0.03, 0.12, 0.045, 0.18, 0.01, 0.28)
  shape.bezierCurveTo(0.04, 0.18, 0.03, 0.1, 0.028, 0.05)
  shape.closePath()
  return shape
}

function spongeShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(-0.06, 0)
  shape.lineTo(-0.07, 0.22)
  shape.lineTo(-0.11, 0.32)
  shape.lineTo(0.11, 0.32)
  shape.lineTo(0.07, 0.22)
  shape.lineTo(0.06, 0)
  shape.closePath()
  return shape
}

function starShape(): THREE.Shape {
  const shape = new THREE.Shape()
  const spikes = 5
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? 0.09 : 0.04
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius + 0.09
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

function clamShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(-0.08, 0.01)
  shape.quadraticCurveTo(-0.09, 0.08, 0, 0.09)
  shape.quadraticCurveTo(0.09, 0.08, 0.08, 0.01)
  shape.quadraticCurveTo(0, 0.035, -0.08, 0.01)
  shape.closePath()
  return shape
}

function disposeContents(group: THREE.Group) {
  const materials = new Set<THREE.Material>()
  const geometries = new Set<THREE.BufferGeometry>()
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((item) => materials.add(item))
    else if (mat) materials.add(mat)
  })
  geometries.forEach((item) => item.dispose())
  materials.forEach((item) => item.dispose())
  group.clear()
}

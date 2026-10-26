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
        const frameFit = buildTanks(world, rows, swimmers)
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

function buildTanks(root: THREE.Group, levels: TankLevel[], swimmers: Swimmer[]): { halfWidth: number; lookY: number } {
  const shown = levels.length > 0 ? levels : [{ name: '', carried: 0, goal: 3000 }]
  const big = shown.length === 1
  const width = big ? 3.7 : 1.78
  const gap = big ? 0 : 0.36
  const step = width + gap
  const surfaces: THREE.Mesh[] = []
  root.userData.surfaces = surfaces
  shown.forEach((level, index) => {
    const tank = new THREE.Group()
    tank.position.x = (index - (shown.length - 1) / 2) * step
    root.add(tank)
    buildOne(tank, level, index, big, levels.length > 0, swimmers, surfaces)
  })
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 40),
    new THREE.MeshStandardMaterial({ color: 0x8a9148, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  root.add(ground)
  const halfWidth = big ? 3.7 : (shown.length * step) / 2 + 0.15
  return { halfWidth, lookY: big ? 1.15 : 0.95 }
}

function buildOne(
  root: THREE.Group,
  level: TankLevel,
  index: number,
  big: boolean,
  withFish: boolean,
  swimmers: Swimmer[],
  surfaces: THREE.Mesh[],
) {
  const fill = crateFill(level.carried, level.goal)
  const W = big ? 3.7 : 1.78
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

  const rulerW = big ? 1.05 : 0.62
  const ruler = new THREE.Mesh(
    new THREE.PlaneGeometry(rulerW, waterRoom),
    new THREE.MeshBasicMaterial({ map: rulerTexture(level.goal), transparent: true }),
  )
  ruler.position.set(-W / 2 + rulerW * 0.62, waterBase + waterRoom / 2, D / 2 + 0.08)
  ruler.renderOrder = 5
  root.add(ruler)

  if (level.name) {
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(big ? 1.8 : 1.35, big ? 0.42 : 0.34),
      new THREE.MeshBasicMaterial({ map: nameTexture(level.name, level.carried), transparent: true }),
    )
    plaque.position.set(W * 0.12, t + H + (big ? 0.28 : 0.22), 0)
    plaque.renderOrder = 5
    root.add(plaque)
  }

  if (!withFish) return

  const waterTop = waterBase + waterRoom * Math.max(fill, 0.12)
  const swimLow = waterBase + 0.12
  const swimHigh = Math.max(swimLow + 0.1, waterTop - 0.1)
  const midY = (swimLow + swimHigh) / 2
  const ampY = (swimHigh - swimLow) / 2 * 0.8
  const fish = makeFish(FISH_COLORS[index % FISH_COLORS.length])
  const base = big ? 1.35 : 1.05
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
    ox: big ? 0.15 : 0.22,
    oy: midY,
    oz: 0.12,
    ax: big ? 0.55 : 0.2,
    ay: ampY,
    az: 0,
    sx: 0.55 + (index % 3) * 0.08,
    sy: 0.4,
    sz: 0.2,
    phase,
    base,
  })
}


function nameTexture(name: string, carried: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#f6efe2'
    ctx.fillRect(0, 0, 512, 160)
    ctx.strokeStyle = '#6e4e2c'
    ctx.lineWidth = 10
    ctx.strokeRect(6, 6, 500, 148)
    ctx.fillStyle = '#2a2118'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 58px Impact, Arial Black, sans-serif'
    const title = name.length > 16 ? name.slice(0, 15) + '…' : name
    ctx.fillText(title, 256, 58)
    ctx.font = '700 48px Impact, Arial Black, sans-serif'
    const sign = carried < 0 ? '-' : ''
    ctx.fillText(sign + '$' + Math.abs(Math.round(carried)).toLocaleString('en-US'), 256, 114)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function rulerTexture(goal: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 280
  canvas.height = 720
  const ctx = canvas.getContext('2d')
  const top = goal > 0 ? goal : 3000
  if (ctx) {
    ctx.fillStyle = '#f6efe2'
    ctx.fillRect(0, 0, 280, 720)
    ctx.strokeStyle = '#6e4e2c'
    ctx.lineWidth = 10
    ctx.strokeRect(8, 8, 264, 704)
    ctx.fillStyle = '#2a2118'
    ctx.font = '700 64px Impact, Arial Black, sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 8
    for (let step = 0; step <= 4; step += 1) {
      const y = 680 - (step / 4) * 640
      const value = Math.round((top / 4) * step)
      ctx.beginPath()
      ctx.moveTo(168, y)
      ctx.lineTo(250, y)
      ctx.stroke()
      ctx.fillText(value.toLocaleString('en-US'), 158, y)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
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

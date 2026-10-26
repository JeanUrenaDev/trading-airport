import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { crateFill } from '../accounts'

export function CashCrate({ carried, goal }: { carried: number; goal: number }) {
  const host = useRef<HTMLDivElement>(null)
  const live = useRef({ carried, goal, span: 5.4 })
  live.current = { carried, goal, span: live.current.span }

  useEffect(() => {
    const el = host.current
    if (!el) return
    const node: HTMLDivElement = el
    const renderer = new THREE.WebGLRenderer({ antialias: true })
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
    camera.position.set(8.5, 5.8, 11)
    const hemi = new THREE.HemisphereLight(0xfff6ea, 0x6d8a48, 0.9)
    const sun = new THREE.DirectionalLight(0xfff3df, 1.35)
    sun.position.set(-14, 22, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 60
    sun.shadow.camera.left = -12
    sun.shadow.camera.right = 12
    sun.shadow.camera.top = 12
    sun.shadow.camera.bottom = -12
    scene.add(hemi, sun)

    const world = new THREE.Group()
    scene.add(world)
    let built = ''
    let frame = 0

    function resize() {
      const width = node.clientWidth || 640
      const height = node.clientHeight || 520
      renderer.setSize(width, height, false)
      const aspect = width / Math.max(1, height)
      const view = live.current.span
      camera.left = -view * aspect
      camera.right = view * aspect
      camera.top = view
      camera.bottom = -view
      camera.updateProjectionMatrix()
    }

    const observer = new ResizeObserver(resize)

    function tick(time: number) {
      const key = `${live.current.carried}|${live.current.goal}`
      if (key !== built) {
        disposeContents(world)
        live.current.span = buildCrate(world, live.current.carried, live.current.goal)
        built = key
        resize()
      }
      const seconds = time * 0.001
      world.traverse((obj) => {
        if (obj.userData.bob) obj.position.y = obj.userData.baseY + Math.sin(seconds * 2.2 + obj.userData.phase) * 0.025
      })
      camera.lookAt(0, 1.05, 0)
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

  return <div ref={host} className="crate" role="img" aria-label={`${carried} de ${goal}`} />
}

function stamp(goal: number): string {
  return Math.round(goal).toLocaleString('en-US')
}

function plaqueTexture(goal: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 220
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#c4a06a'
    ctx.fillRect(0, 0, 512, 220)
    ctx.strokeStyle = '#6e4e2c'
    ctx.lineWidth = 18
    ctx.strokeRect(14, 14, 484, 192)
    ctx.fillStyle = '#2a2118'
    ctx.font = '700 148px Impact, Arial Black, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = stamp(goal)
    ctx.font = `700 ${label.length > 6 ? 112 : 148}px Impact, Arial Black, sans-serif`
    ctx.fillText(label, 256, 118)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function buildCrate(root: THREE.Group, carried: number, goal: number): number {
  const fill = crateFill(carried, goal)
  const wood = new THREE.MeshStandardMaterial({ color: 0xc4a06a, roughness: 0.82 })
  const edge = new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.7 })
  const cash = new THREE.MeshStandardMaterial({ color: 0x1b8a46, roughness: 0.58 })
  const band = new THREE.MeshStandardMaterial({ color: 0xe6d7a2, roughness: 0.45 })
  const ink = new THREE.MeshStandardMaterial({ color: 0x143d22, roughness: 0.5 })

  const W = 3.6
  const D = 2.8
  const H = 2.55
  const t = 0.16
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
    return mesh
  }

  box(W + 0.08, t, D + 0.08, 0, t / 2, 0, wood)
  box(t, H, D, -W / 2, t + H / 2, 0, wood)
  box(t, H, D, W / 2, t + H / 2, 0, wood)
  box(W, H, t, 0, t + H / 2, -D / 2, wood)
  box(W, H * 0.22, t, 0, t + H * 0.11, D / 2, edge)

  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.72, H * 0.3),
    new THREE.MeshBasicMaterial({ map: plaqueTexture(goal) }),
  )
  plaque.position.set(0, t + H * 0.2, D / 2 + 0.09)
  root.add(plaque)

  const innerW = W - t * 2 - 0.12
  const innerD = D - t * 2 - 0.12
  const innerH = H - 0.18
  if (fill > 0) {
    const moneyH = innerH * fill
    const layers = Math.max(1, Math.round(10 * fill))
    const slot = moneyH / layers
    const stacks = 3
    const gap = 0.08
    const sw = (innerW - gap * (stacks - 1)) / stacks
    for (let layer = 0; layer < layers; layer += 1) {
      for (let stack = 0; stack < stacks; stack += 1) {
        const y = t + slot * (layer + 0.5)
        const x = -innerW / 2 + sw / 2 + stack * (sw + gap)
        box(sw * 0.92, slot * 0.82, innerD * 0.9, x, y, 0, layer % 2 === 0 ? cash : ink)
        if (layer === layers - 1) box(sw * 0.34, slot * 0.9, innerD * 0.92, x, y + slot * 0.08, 0, band)
      }
    }
  }

  if (goal > 0 && carried > goal) {
    const extra = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.36), cash)
    extra.position.set(-0.4, t + innerH + 0.16, 0.2)
    extra.rotation.set(0.15, -0.5, 0.2)
    extra.castShadow = true
    root.add(extra)
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x8a9148, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  root.add(ground)

  return 2.35
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
  materials.forEach((item) => {
    const mapped = item as THREE.MeshStandardMaterial
    if (mapped.map) mapped.map.dispose()
    item.dispose()
  })
  group.clear()
}

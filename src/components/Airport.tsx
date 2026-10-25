import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { formName } from '../domain'

type Mat = { metal?: number; rough?: number; emi?: number; eint?: number; opacity?: number }

type Live = {
  flyer?: THREE.Group
  prop?: THREE.Object3D
  rotor?: THREE.Object3D
  trucks: THREE.Object3D[]
  birds: THREE.Object3D[]
  clouds: THREE.Object3D[]
  traffic: THREE.Object3D[]
  sock?: THREE.Object3D
  lights: THREE.Object3D[]
}

export function Airport({ day }: { day: number }) {
  const host = useRef<HTMLDivElement>(null)
  const dayRef = useRef(day)
  dayRef.current = day

  useEffect(() => {
    const el = host.current
    if (!el) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 400)
    camera.position.set(36, 30, 36)
    const root = new THREE.Group()
    scene.add(root)

    const sun = new THREE.DirectionalLight(0xfff3df, 1.35)
    sun.position.set(-18, 28, 12)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 120
    sun.shadow.camera.left = -40
    sun.shadow.camera.right = 40
    sun.shadow.camera.top = 40
    sun.shadow.camera.bottom = -40
    scene.add(sun)
    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6d8a4a, 0.85)
    scene.add(hemi)
    const fill = new THREE.DirectionalLight(0xffe1b0, 0.25)
    fill.position.set(10, 8, -16)
    scene.add(fill)

    const view = { zoom: 1.05, x: 0, z: 2 }
    const drag = { on: false, x: 0, y: 0 }
    const resize = () => {
      const w = el.clientWidth || 640
      const h = el.clientHeight || 520
      renderer.setSize(w, h, false)
      const aspect = w / Math.max(h, 1)
      const frustum = 26 / view.zoom
      camera.left = -frustum * aspect
      camera.right = frustum * aspect
      camera.top = frustum
      camera.bottom = -frustum
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el)

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      view.zoom = Math.min(2.4, Math.max(0.55, view.zoom * (event.deltaY > 0 ? 0.92 : 1.08)))
      resize()
    }
    const onDown = (event: PointerEvent) => {
      drag.on = true
      drag.x = event.clientX
      drag.y = event.clientY
      el.setPointerCapture(event.pointerId)
    }
    const onMove = (event: PointerEvent) => {
      if (!drag.on) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      drag.x = event.clientX
      drag.y = event.clientY
      const scale = 0.045 / view.zoom
      view.x += (-dx + dy) * scale
      view.z += (dx + dy) * scale
    }
    const onUp = () => {
      drag.on = false
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)

    const live: Live = { trucks: [], birds: [], clouds: [], traffic: [], lights: [] }
    let built = -1
    let frame = 0
    const clock = new THREE.Clock()
    const sky = new THREE.Color()
    const daySky = new THREE.Color(0x8ec8ef)
    const nightSky = new THREE.Color(0x10182e)
    const fog = new THREE.Fog(0x8ec8ef, 78, 220)
    scene.fog = fog

    const tick = () => {
      frame = requestAnimationFrame(tick)
      const time = clock.getElapsedTime()
      const current = dayRef.current
      if (current !== built) {
        built = current
        disposeGroup(root)
        live.trucks = []
        live.birds = []
        live.clouds = []
        live.traffic = []
        live.lights = []
        live.flyer = undefined
        live.prop = undefined
        live.rotor = undefined
        live.sock = undefined
        buildAirport(root, current, live)
      }
      const cycle = 1
      sky.copy(nightSky).lerp(daySky, cycle)
      scene.background = sky
      fog.color.copy(sky)
      sun.intensity = 0.18 + cycle * 1.25
      hemi.intensity = 0.22 + cycle * 0.7
      if (live.flyer) fly(live.flyer, current, time)
      if (live.prop) live.prop.rotation.z = time * 28
      if (live.rotor) live.rotor.rotation.y = time * 18
      live.trucks.forEach((truck, index) => loopTruck(truck, time, index))
      live.birds.forEach((bird, index) => {
        bird.position.x = -22 + ((time * 3.2 + index * 11) % 54) - 6
        bird.position.y = 14 + Math.sin(time * 1.4 + index) * 0.8
        bird.position.z = -16 + index * 4
        const wings = bird.userData.wings as THREE.Object3D[] | undefined
        if (wings) {
          const flap = Math.sin(time * 9 + index) * 0.55
          wings[0].rotation.z = 0.35 + flap
          wings[1].rotation.z = -0.35 - flap
        }
      })
      live.clouds.forEach((cloud, index) => {
        cloud.position.x = ((time * (0.6 + index * 0.15) + index * 14) % 70) - 35
      })
      live.traffic.forEach((plane) => {
        const dir = plane.userData.dir as number
        const phase = plane.userData.phase as number
        const span = 130
        const x = (((time * 5.2 * dir + phase) % span) + span) % span - span / 2
        plane.position.x = x
        plane.position.y = (plane.userData.laneY as number) + Math.sin(time * 0.18 + phase) * 0.18
        plane.position.z = plane.userData.laneZ as number
      })
      if (live.sock) live.sock.rotation.z = Math.sin(time * 1.6) * 0.35
      const glow = 0.15 + (1 - cycle) * 0.9
      live.lights.forEach((light, index) => {
        const mesh = light as THREE.Mesh
        const material = mesh.material as THREE.MeshStandardMaterial
        const blink = index % 5 === 0 ? (Math.sin(time * 6) > 0 ? 1 : 0.15) : 1
        material.emissiveIntensity = glow * blink
      })
      camera.position.set(36 + view.x, 30, 36 + view.z)
      camera.lookAt(view.x, 0, view.z)
      renderer.render(scene, camera)
    }
    resize()
    tick()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      disposeGroup(root)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div className="airport" ref={host} role="img" aria-label={`Día ${day}. ${formName(day)}. Aeropuerto isométrico.`}>
      <p className="map-hint">Arrastra para moverte. Rueda para acercar.</p>
    </div>
  )
}

function runwayHalf(day: number) {
  if (day >= 241) return 34
  if (day >= 91) return 28
  if (day >= 61) return 22
  if (day >= 32) return 16
  return 10
}

function fly(group: THREE.Group, day: number, time: number) {
  const half = runwayHalf(day)
  const u = (time % 26) / 26
  const points: Array<[number, number, number]> = [
    [-6, 0, 8],
    [-half + 3, 0, 1.2],
    [-half + 3, 0, 0],
    [half * 0.45, 0, 0],
    [half * 0.85, 4.2, -3],
    [4, 8, -14],
    [-half * 0.35, 3.2, -2],
    [-4, 0, 0],
    [-6, 0, 8],
  ]
  const marks = [0, 0.12, 0.18, 0.4, 0.55, 0.72, 0.84, 0.93, 1]
  let index = 0
  while (index < marks.length - 2 && u > marks[index + 1]) index += 1
  const span = marks[index + 1] - marks[index]
  const t = span === 0 ? 0 : (u - marks[index]) / span
  const a = points[index]
  const b = points[index + 1]
  const x = a[0] + (b[0] - a[0]) * t
  const y = a[1] + (b[1] - a[1]) * t
  const z = a[2] + (b[2] - a[2]) * t
  group.position.set(x, y, z)
  group.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2])
  group.rotation.x = -(b[1] - a[1]) * 0.15
}

function loopTruck(truck: THREE.Object3D, time: number, index: number) {
  const u = ((time * 0.08 + index * 0.33) % 1)
  const length = 22
  const width = 6
  const lap = u * (length + width) * 2
  let x = -8
  let z = 11
  let yaw = 0
  if (lap < length) {
    x = -8 + lap
    yaw = Math.PI / 2
  } else if (lap < length + width) {
    x = -8 + length
    z = 11 - (lap - length)
    yaw = Math.PI
  } else if (lap < length * 2 + width) {
    x = -8 + length - (lap - length - width)
    z = 11 - width
    yaw = -Math.PI / 2
  } else {
    x = -8
    z = 11 - width + (lap - length * 2 - width)
    yaw = 0
  }
  truck.position.set(x, 0, z)
  truck.rotation.y = yaw
}

function buildAirport(root: THREE.Group, day: number, live: Live) {
  const half = runwayHalf(day)
  const paved = day >= 61
  const grass = day >= 113 ? 0x67a84a : day >= 31 ? 0x7d9a46 : 0x8a9a52
  box(root, 200, 0.12, 170, 0, -0.28, 0, 0x7a8454, { rough: 1 })
  box(root, 92, 0.2, 78, 0, -0.2, 2, grass, { rough: 0.95 })
  if (day < 61) box(root, half * 2 + 4, 0.03, 5.2, 0, 0.01, 0, 0xc4a06a, { rough: 1 })
  if (day >= 9) box(root, 6, 0.05, 16, -8, 0.02, 16, day >= 112 ? 0x9a9a96 : 0x8d7048)
  const woods: Array<[number, number]> = [[-20, 12], [-16, -10], [18, 12], [22, -6], [-22, 1], [14, -14], [-10, 16], [4, 14]]
  woods.forEach(([x, z], index) => tree(root, x, z, 1.35 + (index % 3) * 0.28))

  const runwayColor = paved ? 0x3e4650 : 0x9a7a48
  box(root, half * 2, 0.08, paved ? 3.4 : 2.6, 0, 0, 0, runwayColor, { rough: paved ? 0.72 : 0.95 })
  if (day >= 17 || paved) {
    for (let x = -half + 2; x < half; x += 4) box(root, 1.4, 0.02, 0.18, x, 0.08, 0, 0xf4ecdf)
  }
  if (day >= 33) {
    box(root, 1.6, 0.02, 2.2, -half + 1.2, 0.09, 0, 0xf4ecdf)
    box(root, 0.28, 0.02, 2.2, half - 2, 0.09, 0, 0xf4ecdf)
  }
  if (day >= 64) {
    for (let x = -half; x <= half; x += 3.2) {
      live.lights.push(lamp(root, x, -1.55))
      live.lights.push(lamp(root, x, 1.55))
    }
  }
  if (day >= 65) {
    for (let i = 1; i <= 5; i += 1) live.lights.push(lamp(root, -half - i * 1.4, 0))
  }
  if (day >= 66) box(root, 2.2, 0.06, 8, -half + 4, 0.02, 4.5, 0x4a545f)
  if (day >= 67) box(root, Math.min(26, 8 + day / 20), 0.07, 7, 0, 0.03, 8, 0x59636e, { rough: 0.8 })
  if (day >= 92) box(root, 2.2, 0.06, 10, half - 6, 0.02, 5, 0x4a545f)
  if (day >= 154) box(root, half * 1.7, 0.06, 1.6, 0, 0.02, -4.2, 0x4a545f)
  if (day >= 272) {
    box(root, half * 1.7, 0.08, 3.2, 2, 0.02, -16, 0x3e4650)
    if (day >= 273) {
      for (let x = -half + 4; x <= half - 2; x += 4) {
        live.lights.push(lamp(root, x, -17.4))
        live.lights.push(lamp(root, x, -14.6))
      }
    }
  }
  if (day > 365) box(root, 24, 0.08, 2.6, 8, 0.02, -24, 0x3e4650)

  if (day >= 2) shack(root, day)
  if (day >= 3) sign(root, day >= 365 ? '365 HITOS' : 'AERODROMO', -10.5, 0, 13.5, day >= 365 ? 3.2 : 1.5)
  if (day >= 8) flag(root, -9.2, 14.6)
  if (day >= 10) fence(root, day)
  if (day >= 16) windsock(root, live, half - 1, -3)
  if (day >= 36) tower(root, 12, 13, day >= 96 ? 7.5 : 3.2, day >= 96)
  if (day >= 165) radar(root, 16, 11)
  if (day >= 281) tower(root, -18, -8, 11, true)

  if (day >= 60) terminal(root, day)
  if (day >= 70 && day < 181) box(root, 10, 2.4, 4.5, 2, 0, 14, 0xf7f4ee, { rough: 0.82 })
  if (day >= 104) jetBridge(root, 2, 11.2)
  if (day >= 134) jetBridge(root, 6, 11.2)
  if (day >= 244) jetBridge(root, -2, 11.2)
  if (day >= 245) jetBridge(root, 10, 11.2)
  if (day >= 82) box(root, 2.2, 1.3, 1.6, -6, 0, 15.5, 0xff8a3d)
  if (day >= 87) truck(root, 14, 6, 0xc1121f, 2.4)
  if (day >= 114) hangar(root, -20, 12, 6, 0xd9d3c8)
  if (day >= 148) hangar(root, -20, 6, 8, 0xcfd6de)
  if (day >= 167) box(root, 4, 2.2, 3, 18, 0, 6, 0xc1121f)
  if (day >= 176) box(root, 6, 4.5, 5, 16, 0, 18, 0xd5d8de)
  if (day >= 186) box(root, 5, 2.2, 3.2, 8, 0, 18, 0xf3eee6)
  if (day >= 205) box(root, 6, 2.4, 4, -16, 0, 18, 0xe7e2d8)
  if (day >= 214) hangar(root, -24, 16, 7, 0xf7f4ee)
  if (day >= 261) box(root, 8, 2.6, 5, 22, 0, -2, 0xd7c4a4)
  if (day >= 278) box(root, 12, 3.4, 5, 6, 0, -10, 0xf4efe8)
  if (day >= 291) {
    for (let i = 0; i < 4; i += 1) box(root, 1.4, 0.08, 2.2, 20 + i * 1.6, 0.2, 14, 0x163a66, { metal: 0.4, eint: 0.05, emi: 0x163a66 })
  }
  if (day >= 296) box(root, 4, day >= 338 ? 8 : 5.5, 3.5, -8, 0, 20, 0xf7f1e6)
  if (day >= 299) box(root, 7, 2.2, 3, 0, 0, 20, 0xfff6ea)
  if (day >= 312) box(root, 5, 2.8, 3, -22, 0, -4, 0xe7eef4)
  if (day >= 321) box(root, 7, 2.6, 4, -14, 0, -12, 0xf8f4ec)
  if (day >= 328) {
    cyl(root, 2.2, 0.08, 18, 0, -12, 0x9aa3ab, { metal: 0.3 })
    live.rotor = heli(root, 18, -12)
  }
  if (day >= 331) box(root, 14, 4.2, 6, -4, 0, 22, 0xf7fbff, { metal: 0.15, rough: 0.35 })
  if (day >= 335) {
    tree(root, -8, 21, 1.4)
    tree(root, -6, 22, 1.1)
    tree(root, -9, 23, 1.2)
  }
  if (day >= 362) box(root, 5, 2.4, 3, 12, 0, 22, 0xe8d7b0)
  if (day >= 365) {
    sign(root, '365 HITOS DE DISCIPLINA', 0, 0, 26, 4.4)
    cyl(root, 0.7, 0.3, 0, 0, 24.2, 0xe8e0d2)
  }
  if (day > 365) {
    const extra = Math.min(6, Math.floor((day - 365) / 2))
    for (let i = 0; i < extra; i += 1) box(root, 3.2, 3 + i * 0.4, 2.6, -22 + i * 3.4, 0, -18, 0xdfe6ee)
  }

  form(root, half, paved)
  overhead(root, live)
  parkFleet(root, day, live)
  for (let i = 0; i < 3; i += 1) live.clouds.push(cloud(root, i))
  for (let i = 0; i < 4; i += 1) live.birds.push(bird(root, i))
  if (day >= 41) {
    live.trucks.push(truck(root, -8, 11, 0xf5c451, 1.8))
    if (day >= 86) live.trucks.push(truck(root, -4, 11, 0xf7f4ee, 2.2))
    if (day >= 112) live.trucks.push(truck(root, 2, 11, 0xff4d1c, 2))
  }
}


function form(root: THREE.Group, half: number, paved: boolean) {
  const tone = paved ? 0x4a545f : 0xb08960
  box(root, half * 2, 0.045, 1.35, 0, 0.015, -6.6, tone, { rough: 0.9 })
  box(root, Math.min(26, half * 1.5), 0.045, 6.2, 0, 0.015, 8.6, paved ? 0x59636e : 0xc6b08a, { rough: 0.88 })
  box(root, 1.5, 0.045, 4.6, -half * 0.4, 0.015, 3.6, tone, { rough: 0.9 })
  elevado(root)
  box(root, 150, 0.06, 36, 0, -0.22, -62, 0x738050, { rough: 1 })
  const walls = [0xe7dcc8, 0xd5dde4, 0xcfc6b8, 0xb7a08a]
  const roofs = [0x5c4638, 0x3e4650, 0x6b4e36, 0x4a5560]
  for (let i = 0; i < 16; i += 1) {
    if (i % 5 === 0) continue
    const floors = 2 + (i % 4)
    story(root, -52 + i * 7, -74, floors, walls[i % walls.length], roofs[i % roofs.length])
  }
}

function elevado(root: THREE.Group) {
  const deckY = 1.7
  const z = 27
  const length = 36
  box(root, 46, 0.04, 2.3, 4, 0.02, z, 0x3a3e3a, { rough: 0.92 })
  box(root, length, 0.16, 2.5, -2, deckY, z, 0x4e545b, { rough: 0.78 })
  box(root, length, 0.32, 0.08, -2, deckY + 0.16, z - 1.2, 0xe4ddd2)
  box(root, length, 0.32, 0.08, -2, deckY + 0.16, z + 1.2, 0xe4ddd2)
  box(root, length - 2, 0.02, 0.06, -2, deckY + 0.16, z, 0xf4ecdf)
  for (let x = -length / 2; x < length / 2 - 2; x += 4.2) {
    cyl(root, 0.2, deckY, x - 2, 0, z - 0.75, 0x8d8880, { rough: 0.72 })
    cyl(root, 0.2, deckY, x - 2, 0, z + 0.75, 0x8d8880, { rough: 0.72 })
  }
  const rampLen = 10
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.16, 2.5), material(0x4e545b, { rough: 0.78 }))
  ramp.position.set(length / 2 - 2 + rampLen / 2 - 0.2, deckY / 2 + 0.04, z)
  ramp.rotation.z = -Math.atan2(deckY, rampLen)
  ramp.castShadow = true
  ramp.receiveShadow = true
  root.add(ramp)
  const rail = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.22, 0.08), material(0xe4ddd2, { rough: 0.8 }))
  rail.position.set(ramp.position.x, deckY * 0.55, z - 1.2)
  rail.rotation.z = ramp.rotation.z
  root.add(rail)
  const railB = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.22, 0.08), material(0xe4ddd2, { rough: 0.8 }))
  railB.position.set(ramp.position.x, deckY * 0.55, z + 1.2)
  railB.rotation.z = ramp.rotation.z
  root.add(railB)
  box(root, 2.2, 0.04, 16, 8, 0.02, z - 6, 0x3a3e3a, { rough: 0.92 })
}

function story(root: THREE.Group, x: number, z: number, floors: number, wall: number, roof: number) {
  const w = floors > 6 ? 3.6 : 2.8
  const d = floors > 6 ? 2.6 : 2.2
  const floorH = 0.62
  const h = floors * floorH
  box(root, w, h, d, x, -0.1, z, wall, { rough: 0.8 })
  box(root, w + 0.22, 0.12, d + 0.22, x, h - 0.16, z, roof, { rough: 0.74 })
  const glass = 0x243038
  for (let floor = 0; floor < floors; floor += 1) {
    const yy = 0.18 + floor * floorH
    box(root, w * 0.72, 0.1, 0.05, x, yy, z + d / 2, glass, { metal: 0.25, rough: 0.28 })
    box(root, 0.05, 0.1, d * 0.62, x + w / 2, yy, z, glass, { metal: 0.25, rough: 0.28 })
  }
}

function overhead(root: THREE.Group, live: Live) {
  const lanes: Array<{ z: number; y: number; color: number; scale: number; dir: number; phase: number }> = [
    { z: -4, y: 44, color: 0xf7f4ee, scale: 0.5, dir: 1, phase: 18 },
    { z: 12, y: 52, color: 0xd5dee8, scale: 0.38, dir: -1, phase: 78 },
  ]
  lanes.forEach((lane) => {
    const plane = aircraft(root, 'jet', 0, lane.z, lane.color, lane.scale)
    plane.rotation.y = lane.dir === 1 ? Math.PI / 2 : -Math.PI / 2
    plane.position.y = lane.y
    plane.userData.laneY = lane.y
    plane.userData.laneZ = lane.z
    plane.userData.dir = lane.dir
    plane.userData.phase = lane.phase
    const trail = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.025, 9),
      material(0xfffdf8, { opacity: 0.35, rough: 1 }),
    )
    trail.position.set(0, 0.15, -6.2)
    plane.add(trail)
    live.traffic.push(plane)
  })
}

function parkFleet(root: THREE.Group, day: number, live: Live) {
  if (day >= 11) {
    const old = aircraft(root, day >= 117 ? 'jet' : 'prop', -8, 7.2, day >= 58 ? 0xf7f4ee : 0xc47a3a, day >= 117 ? 1 : 0.72)
    live.flyer = old
    live.prop = old.userData.prop as THREE.Object3D | undefined
  }
  if (day >= 27) aircraft(root, 'prop', -4, 6.4, 0xe7e2d8, 0.7)
  if (day >= 59) aircraft(root, 'prop', 1, 6.6, 0xf4f1ea, 0.95)
  if (day >= 89) aircraft(root, 'prop', 5, 6.2, 0xd5dde4, 1)
  if (day >= 116) aircraft(root, 'jet', 8, 7.4, 0xff4d1c, 0.85)
  if (day >= 117) aircraft(root, 'jet', -12, 8.4, 0xf7f4ee, 1.15)
  if (day >= 149) aircraft(root, 'jet', 12, 8.2, 0x1c2832, 1.15)
  if (day >= 178) aircraft(root, 'jet', -16, 5, 0xf4ecdf, 1.05)
  if (day >= 179) aircraft(root, 'jet', 16, 4, 0x163a66, 1.35)
  if (day >= 208) aircraft(root, 'jet', -18, 16, 0xf8f4ec, 0.7)
  if (day >= 209) aircraft(root, 'jet', -14, 15, 0xe8e0d2, 0.85)
  if (day >= 212) aircraft(root, 'jet', -10, 16.5, 0xffffff, 0.75)
  if (day >= 213) aircraft(root, 'jet', -22, 10, 0x1c1f24, 1.05)
  if (day >= 253) aircraft(root, 'wide', 0, 9.2, 0xf7f4ee, 1.35)
  if (day >= 256) aircraft(root, 'wide', 20, -4, 0xd7c4a4, 1.2)
  if (day >= 306) aircraft(root, 'jet', -18, -10, 0xf5c451, 0.9)
  if (day >= 308) {
    for (let i = 0; i < 4; i += 1) aircraft(root, 'prop', -6 + i * 3.2, -6, 0xe7eef4, 0.62)
  }
  if (day >= 344) aircraft(root, 'jet', 14, -12, 0xf8f4ec, 1.1)
}

function shack(root: THREE.Group, day: number) {
  box(root, 2.4, 1.5, 1.8, -11, 0, 12, day >= 28 ? 0xd7c4a4 : 0x8a6244, { rough: 0.9 })
  box(root, 2.8, 0.2, 2.2, -11, 1.5, 12, 0x6a3a2a)
  if (day >= 4) box(root, 0.35, 0.4, 0.35, -10.2, 0, 13.2, 0xf2f0ea)
  if (day >= 5) box(root, 0.7, 0.35, 0, -11.6, 0, 13.1, 0x6b4e36)
  if (day >= 6) box(root, 0.12, 0.7, 0.12, -10.4, 0.35, 13.1, 0x2a241c)
  if (day >= 7) box(root, 0.28, 0.16, 0.18, -11.6, 0.35, 13.1, 0x1c2832, { emi: 0x9ec4d4, eint: 0.3 })
  if (day >= 19) box(root, 0.16, 0.4, 0.16, -12.2, 0, 12.6, 0xc1121f)
  if (day >= 21) box(root, 0.7, 1.1, 0.7, -12.4, 0, 11.2, 0xd9d3c8)
  if (day >= 24) box(root, 1.1, 0.35, 0.35, -9.4, 0, 13.4, 0x8a6244)
  if (day >= 28) {
    cyl(root, 0.12, 0.9, -9.6, 0, 12.2, 0x3a4250)
    sphere(root, 0.16, -9.6, 0.95, 12.2, 0xd7b89a)
  }
}

function terminal(root: THREE.Group, day: number) {
  const modern = day >= 122
  const vip = day >= 181
  const w = day >= 331 ? 22 : day >= 121 ? 16 : day >= 90 ? 12 : 8
  const h = vip ? 3.4 : modern ? 2.8 : 2.2
  const color = vip ? 0xf7f4ee : modern ? 0xf3f6f8 : 0xe7d7c4
  box(root, w, h, 4.2, 1, 0, 15, color, { rough: modern ? 0.45 : 0.8, metal: modern ? 0.12 : 0.02 })
  box(root, w + 0.4, 0.25, 4.6, 1, h, 15, modern ? 0x2a3138 : 0x8a4a3a)
  const glass = modern ? 0x9ec8ea : 0xc5d4de
  for (let i = 0; i < 4; i += 1) {
    box(root, 1.1, 0.8, 0.08, -w / 2 + 2 + i * (w / 5), 0.8, 17.15, glass, { emi: glass, eint: day >= 95 ? 0.35 : 0.12, metal: 0.2, rough: 0.15 })
  }
  if (day >= 75) box(root, 1.6, 0.7, 0.08, 0, 1.6, 17.2, 0x102033, { emi: 0x7eb6dc, eint: 0.55 })
}

function tower(root: THREE.Group, x: number, z: number, height: number, glass: boolean) {
  box(root, 1.3, height, 1.3, x, 0, z, 0xe7e2d8)
  box(root, 2.1, 0.9, 2.1, x, height, z, glass ? 0x9ec8ea : 0xd5dde4, { emi: 0x9ec8ea, eint: glass ? 0.25 : 0, metal: 0.2, rough: 0.2 })
  cyl(root, 0.05, 1.4, x, height + 0.9, z, 0x2a241c)
}

function radar(root: THREE.Group, x: number, z: number) {
  cyl(root, 0.15, 2.2, x, 0, z, 0xd5dde4, { metal: 0.4 })
  sphere(root, 0.55, x, 2.4, z, 0xf7f4ee)
}

function hangar(root: THREE.Group, x: number, z: number, width: number, color: number) {
  box(root, width, 2.4, 4, x, 0, z, color, { rough: 0.75 })
  box(root, width, 1.4, 0.08, x, 0.2, z + 2.02, 0x2a3138, { metal: 0.3 })
}

function jetBridge(root: THREE.Group, x: number, z: number) {
  box(root, 0.8, 0.35, 3.2, x, 1.6, z, 0xe7e2d8)
  box(root, 1.1, 1.5, 0.8, x, 0, z + 1.4, 0xd5dde4)
}

function fence(root: THREE.Group, day: number) {
  const span = day >= 10 ? 14 : 8
  box(root, span, 0.7, 0.08, -6, 0, 17.5, 0x8a6244)
  box(root, 0.08, 0.7, 6, -6 - span / 2, 0, 14.5, 0x8a6244)
  if (day >= 23) box(root, 1.2, 0.9, 0.1, -6, 0, 17.5, 0x6b4e36)
  if (day >= 39) box(root, 1.4, 0.15, 0.15, -8, 0.4, 18.5, 0xf4ecdf)
}

function flag(root: THREE.Group, x: number, z: number) {
  cyl(root, 0.04, 2.2, x, 0, z, 0xf4ecdf)
  box(root, 0.7, 0.4, 0.05, x + 0.4, 1.7, z, 0xff4d1c)
}

function windsock(root: THREE.Group, live: Live, x: number, z: number) {
  cyl(root, 0.05, 2.4, x, 0, z, 0xf7f4ee)
  const sock = box(root, 0.9, 0.22, 0.22, x + 0.4, 2.3, z, 0xff4d1c)
  sock.geometry.translate(0.45, 0, 0)
  live.sock = sock
}

function lamp(root: THREE.Group, x: number, z: number) {
  cyl(root, 0.04, 0, x, 0, z, 0xd5dde4, { metal: 0.5 })
  return sphere(root, 0.08, x, 0.5, z, 0xfff1c4, { emi: 0xfff1c4, eint: 0.2 })
}

function sign(root: THREE.Group, text: string, x: number, y: number, z: number, width: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 180
  const g = canvas.getContext('2d')
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  if (g) {
    g.fillStyle = '#12100e'
    g.fillRect(0, 0, 1024, 180)
    g.fillStyle = '#f5c451'
    g.font = '700 78px Arial'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 512, 90)
    tex.needsUpdate = true
  }
  cyl(root, 0.06, 1.4, x - width / 2 + 0.2, y, z, 0xf4ecdf)
  cyl(root, 0.06, 1.4, x + width / 2 - 0.2, y, z, 0xf4ecdf)
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, width * 0.28, 0.08),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }),
  )
  mesh.position.set(x, y + 1.5, z)
  mesh.castShadow = true
  root.add(mesh)
}

function truck(root: THREE.Group, x: number, z: number, color: number, length: number) {
  const group = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(length, 0.7, 1), material(color, { metal: 0.35, rough: 0.4 }))
  body.position.y = 0.55
  body.castShadow = true
  group.add(body)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0, 0.9), material(0x1c2832, { metal: 0.2, rough: 0.3 }))
  cab.position.set(length / 2 - 0.15, 0.95, 0)
  group.add(cab)
  group.position.set(x, 0, z)
  root.add(group)
  return group
}

function bird(root: THREE.Group, index: number) {
  const group = new THREE.Group()
  const feather = material(0x5c6770, { rough: 0.85 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), material(0x2f383f, { rough: 0.8 }))
  body.scale.set(0.75, 0.65, 1.7)
  group.add(body)
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.07), feather)
  left.geometry.translate(-0.1, 0, 0.01)
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.07), feather)
  right.geometry.translate(0.1, 0, 0.01)
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.07), feather)
  tail.position.set(0, 0, -0.07)
  group.add(left, right, tail)
  group.userData.wings = [left, right]
  group.position.set(-12 + index * 5, 14, -14)
  root.add(group)
  return group
}

function tree(root: THREE.Group, x: number, z: number, h: number) {
  const trunkH = Math.max(1.35, h)
  cyl(root, 0.28, trunkH, x, 0, z, 0x5a3b24)
  cone(root, 0.95, trunkH * 1.05, x, trunkH * 0.38, z, 0x2c6a3c)
  cone(root, 0.66, trunkH * 0.72, x, trunkH * 0.92, z, 0x3c8148)
}

function cloud(root: THREE.Group, index: number) {
  const group = new THREE.Group()
  const puff = material(0xfffdf8, { rough: 1, opacity: 0.92 })
  const parts: Array<[number, number, number, number]> = [
    [0, 0, 0, 1.15],
    [1.05, 0.12, 0.08, 0.78],
    [-0.95, 0.08, -0.06, 0.72],
    [0.28, 0.28, -0.18, 0.55],
  ]
  for (const [x, y, z, radius] of parts) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), puff)
    mesh.position.set(x, y, z)
    group.add(mesh)
  }
  group.position.set(-18 + index * 18, 18 + index * 0.6, -24 - index * 3)
  root.add(group)
  return group
}

function heli(root: THREE.Group, x: number, z: number) {
  const group = new THREE.Group()
  const paint = material(0xf7f4ee, { metal: 0.35, rough: 0.32 })
  const dark = material(0x1c242c, { metal: 0.45, rough: 0.4 })
  const glass = material(0x16324a, { metal: 0.65, rough: 0.16, emi: 0x0c2236, eint: 0.3 })
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), paint)
  cabin.scale.set(1.15, 0.85, 1.7)
  cabin.position.y = 0.48
  cabin.castShadow = true
  group.add(cabin)
  const window = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), glass)
  window.scale.set(1.1, 0.7, 0.9)
  window.position.set(0, 0.62, 0.28)
  group.add(window)
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.5, 8), paint)
  boom.rotation.x = Math.PI / 2
  boom.position.set(0, 0.5, -1.15)
  boom.castShadow = true
  group.add(boom)
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.32), paint)
  fin.position.set(0, 0.72, -1.8)
  group.add(fin)
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.06), dark)
  tailRotor.position.set(0.1, 0.78, -1.82)
  group.add(tailRotor)
  const skidGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6)
  skidGeo.rotateX(Math.PI / 2)
  const skidL = new THREE.Mesh(skidGeo, dark)
  skidL.position.set(-0.28, 0.1, 0.05)
  const skidR = new THREE.Mesh(skidGeo.clone(), dark)
  skidR.position.set(0.28, 0.1, 0.05)
  group.add(skidL, skidR)
  const rotor = new THREE.Group()
  rotor.position.y = 0.95
  const bladeGeo = new THREE.BoxGeometry(2.8, 0.035, 0.16)
  const bladeA = new THREE.Mesh(bladeGeo, dark)
  const bladeB = new THREE.Mesh(bladeGeo.clone(), dark)
  bladeB.rotation.y = Math.PI / 2
  rotor.add(bladeA, bladeB)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), dark)
  mast.position.y = -0.08
  rotor.add(mast)
  group.add(rotor)
  group.position.set(x, 0, z)
  root.add(group)
  return rotor
}

function aircraft(root: THREE.Group, kind: 'prop' | 'jet' | 'wide', x: number, z: number, color: number, scale: number) {
  const group = new THREE.Group()
  const s = scale * 1.35
  const spec = kind === 'wide'
    ? { len: 6.6, rad: 0.46, span: 6.4, chord: 1.25, fin: 1.35, engines: 4, sweep: 0.42, wingY: -0.08 }
    : kind === 'jet'
      ? { len: 4.8, rad: 0.32, span: 4.8, chord: 0.95, fin: 1.05, engines: 2, sweep: 0.5, wingY: -0.06 }
      : { len: 3.2, rad: 0.2, span: 3.8, chord: 0.62, fin: 0.72, engines: 0, sweep: 0.08, wingY: 0.16 }
  const paint = material(color, { metal: kind === 'prop' ? 0.15 : 0.42, rough: kind === 'prop' ? 0.48 : 0.3 })
  const dark = material(0x1b2228, { metal: 0.55, rough: 0.35 })
  const glass = material(0x173044, { metal: 0.72, rough: 0.12, emi: 0x10283c, eint: 0.35 })
  const bodyY = (spec.rad + 0.34) * s

  const fuse = new THREE.Mesh(
    new THREE.CylinderGeometry(spec.rad * s, spec.rad * s * 0.78, spec.len * s * 0.78, 18),
    paint,
  )
  fuse.rotation.x = Math.PI / 2
  fuse.position.y = bodyY
  fuse.castShadow = true
  group.add(fuse)

  const nose = new THREE.Mesh(new THREE.SphereGeometry(spec.rad * s * 0.96, 16, 12), paint)
  nose.scale.set(1, 0.92, 1.45)
  nose.position.set(0, bodyY, spec.len * s * 0.34)
  nose.castShadow = true
  group.add(nose)

  const tailCap = new THREE.Mesh(new THREE.SphereGeometry(spec.rad * s * 0.62, 14, 10), paint)
  tailCap.scale.set(1, 0.86, 1.5)
  tailCap.position.set(0, bodyY + spec.rad * s * 0.05, -spec.len * s * 0.36)
  group.add(tailCap)

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(spec.rad * s * 0.62, 12, 8), glass)
  cockpit.scale.set(0.92, 0.72, 1.35)
  cockpit.position.set(0, bodyY + spec.rad * s * 0.62, spec.len * s * 0.22)
  group.add(cockpit)

  const stripeGeo = new THREE.BoxGeometry(0.04 * s, spec.rad * s * 0.28, spec.len * s * 0.62)
  const stripeR = new THREE.Mesh(stripeGeo, glass)
  stripeR.position.set(spec.rad * s * 0.92, bodyY + spec.rad * s * 0.18, -spec.len * s * 0.02)
  const stripeL = new THREE.Mesh(stripeGeo.clone(), glass)
  stripeL.position.set(-spec.rad * s * 0.92, stripeR.position.y, stripeR.position.z)
  group.add(stripeR, stripeL)

  const wingY = bodyY + spec.wingY * s
  const wingZ = spec.len * s * 0.02
  const halfSpan = spec.span * s * 0.5
  const wingThick = Math.max(0.16, 0.22 * s)
  for (const side of [1, -1]) {
    const geo = new THREE.BoxGeometry(halfSpan, wingThick, spec.chord * s)
    geo.translate(side * halfSpan * 0.5, 0, -spec.chord * s * 0.08)
    const wing = new THREE.Mesh(geo, paint)
    wing.position.set(0, wingY, wingZ)
    wing.rotation.y = side * spec.sweep
    wing.rotation.z = side * (kind === 'prop' ? 0.05 : 0.07)
    wing.castShadow = true
    group.add(wing)
    if (kind !== 'prop') {
      const letGeo = new THREE.BoxGeometry(0.07 * s, 0.42 * s, spec.chord * s * 0.42)
      const winglet = new THREE.Mesh(letGeo, paint)
      const tipBack = Math.sin(spec.sweep) * halfSpan
      winglet.position.set(side * halfSpan * 0.96, wingY + 0.22 * s, wingZ - tipBack * 0.85)
      winglet.rotation.z = side * -0.25
      winglet.castShadow = true
      group.add(winglet)
    }
  }

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, spec.fin * s, spec.chord * s * 0.72), paint)
  fin.position.set(0, bodyY + spec.rad * s * 0.35 + spec.fin * s * 0.35, -spec.len * s * 0.4)
  fin.rotation.x = -0.18
  fin.castShadow = true
  group.add(fin)
  const stabSpan = spec.span * s * 0.18
  for (const side of [1, -1]) {
    const geo = new THREE.BoxGeometry(stabSpan, wingThick * 0.8, spec.chord * s * 0.48)
    geo.translate(side * stabSpan * 0.5, 0, 0)
    const stab = new THREE.Mesh(geo, paint)
    stab.position.set(0, bodyY + spec.rad * s * 0.15, -spec.len * s * 0.42)
    stab.rotation.y = side * 0.35
    stab.castShadow = true
    group.add(stab)
  }

  const engineSlots = kind === 'wide' ? [0.22, 0.4] : kind === 'jet' ? [0.32] : []
  for (const slot of engineSlots) {
    for (const side of [1, -1]) {
      const nacelle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16 * s, 0.13 * s, 0.85 * s, 14),
        dark,
      )
      nacelle.rotation.x = Math.PI / 2
      nacelle.position.set(side * spec.span * s * slot, wingY - 0.2 * s, wingZ + 0.05 * s)
      nacelle.castShadow = true
      const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * s, 0.15 * s, 0.1 * s, 14), dark)
      intake.rotation.x = Math.PI / 2
      intake.position.set(nacelle.position.x, nacelle.position.y, nacelle.position.z + 0.42 * s)
      group.add(nacelle, intake)
    }
  }

  if (kind === 'prop') {
    const hub = new THREE.Group()
    hub.position.set(0, bodyY, spec.len * s * 0.5)
    const bladeGeo = new THREE.BoxGeometry(0.07 * s, spec.rad * s * 2.5, 0.035 * s)
    const bladeA = new THREE.Mesh(bladeGeo, dark)
    const bladeB = new THREE.Mesh(bladeGeo.clone(), dark)
    bladeB.rotation.z = Math.PI / 2
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(spec.rad * s * 0.38, 0.28 * s, 12), paint)
    spinner.rotation.x = Math.PI / 2
    spinner.position.z = 0.12 * s
    hub.add(bladeA, bladeB, spinner)
    group.add(hub)
    group.userData.prop = hub
  }

  const gearY = 0.16 * s
  const legs: Array<[number, number]> = [
    [0, spec.len * s * 0.22],
    [-spec.span * s * 0.16, -spec.len * s * 0.02],
    [spec.span * s * 0.16, -spec.len * s * 0.02],
  ]
  for (const [gx, gz] of legs) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.32 * s, 6), dark)
    leg.position.set(gx, gearY, gz)
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.09 * s, 0.07 * s, 10), dark)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(gx, 0.08 * s, gz)
    group.add(leg, wheel)
  }

  group.position.set(x, 0, z)
  root.add(group)
  return group
}

function box(root: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, color: number, mat: Mat = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color, mat))
  mesh.position.set(x, y + h / 2, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)
  return mesh
}

function cyl(root: THREE.Group, radius: number, h: number, x: number, y: number, z: number, color: number, mat: Mat = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 12), material(color, mat))
  mesh.position.set(x, y + h / 2, z)
  mesh.castShadow = true
  root.add(mesh)
  return mesh
}

function cone(root: THREE.Group, radius: number, h: number, x: number, y: number, z: number, color: number) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, h, 8), material(color, { rough: 0.85 }))
  mesh.position.set(x, y + h / 2, z)
  mesh.castShadow = true
  root.add(mesh)
}

function sphere(root: THREE.Group, radius: number, x: number, y: number, z: number, color: number, mat: Mat = {}) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 10), material(color, mat))
  mesh.position.set(x, y, z)
  root.add(mesh)
  return mesh
}

function material(color: number, mat: Mat) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: mat.rough ?? 0.7,
    metalness: mat.metal ?? 0.04,
    emissive: mat.emi ?? 0x000000,
    emissiveIntensity: mat.eint ?? (mat.emi ? 0.45 : 0),
    transparent: (mat.opacity ?? 1) < 1,
    opacity: mat.opacity ?? 1,
  })
}

function disposeGroup(group: THREE.Group) {
  group.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh
    mesh.geometry?.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material?.dispose()
  })
  group.clear()
}

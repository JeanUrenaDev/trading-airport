import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export function AppleCube({ apples, people, ugly }: { apples: number; people: number; ugly: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const live = useRef({ apples, people, ugly, span: 12 })
  live.current = { apples, people, ugly, span: live.current.span }

  useEffect(() => {
    const el = host.current
    if (!el) return
    const node: HTMLDivElement = el
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    node.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x8ec8ef)
    const camera = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 200)
    camera.position.set(32, 26, 32)
    const hemi = new THREE.HemisphereLight(0xfff6ea, 0x6d8a48, 0.95)
    const sun = new THREE.DirectionalLight(0xfff3df, 1.45)
    sun.position.set(-18, 28, 12)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 80
    sun.shadow.camera.left = -24
    sun.shadow.camera.right = 24
    sun.shadow.camera.top = 24
    sun.shadow.camera.bottom = -24
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
      const key = `${live.current.apples}|${live.current.people}|${live.current.ugly}`
      if (key !== built) {
        disposeContents(world)
        live.current.span = buildOrchard(world, live.current.apples, live.current.people, live.current.ugly)
        scene.background = new THREE.Color(live.current.ugly ? 0xc5d0b4 : 0x8ec8ef)
        built = key
        resize()
      }
      const seconds = time * 0.001
      world.traverse((obj) => {
        if (obj.userData.bob) obj.position.y = obj.userData.baseY + Math.sin(seconds * 2 + obj.userData.phase) * 0.04
      })
      camera.lookAt(0, 0.4, 0.6)
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
      renderer.domElement.remove()
    }
  }, [])

  const tone = ugly ? 'El cubo está feo.' : 'El cubo está fresco.'
  return <div className="airport" ref={host} role="img" aria-label={`${apples} manzanas y ${people} personas. ${tone}`} />
}

function buildOrchard(world: THREE.Group, apples: number, people: number, ugly: boolean) {
  const shownApples = Math.min(Math.max(0, apples), 64)
  const shownPeople = Math.min(Math.max(0, people), 40)
  const gap = 1.12
  const side = Math.max(1, Math.ceil(Math.cbrt(Math.max(shownApples, 1))))
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 60), standard(ugly ? 0x6d7348 : 0x8a9a52, 0.95))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  world.add(ground)

  const span = Math.max(1.6, side * gap)
  const wood = standard(ugly ? 0x3a2e24 : 0xc4a06a, 0.84)
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(span + 0.7, 0.16, span + 0.7), wood)
  pallet.position.y = 0.08
  pallet.receiveShadow = true
  pallet.castShadow = true
  world.add(pallet)

  if (shownApples === 0) emptyCrate(world, ugly)
  else {
    for (const [x, y, z] of cubeSpots(shownApples, gap)) {
      const fruit = apple(ugly)
      fruit.position.set(x, 0.42 + y, z)
      world.add(fruit)
    }
  }
  if (ugly) mold(world, span)

  const cols = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(Math.max(shownPeople, 1)))))
  const front = span / 2 + 1.35
  for (let index = 0; index < shownPeople; index += 1) {
    const col = index % cols
    const row = Math.floor(index / cols)
    const figure = person(ugly ? 0x6d6458 : [0xff4d1c, 0xf4ecdf, 0x163a66, 0xf5c451, 0x1c1915][index % 5], ugly)
    figure.scale.setScalar(0.78)
    figure.position.set((col - (cols - 1) / 2) * 1.05, 0, front + row * 1.05)
    figure.rotation.y = Math.PI / 4
    if (ugly) figure.rotation.z = index % 2 === 0 ? 0.12 : -0.12
    figure.userData.bob = true
    figure.userData.baseY = 0
    figure.userData.phase = index * 0.6
    world.add(figure)
  }

  const rows = Math.ceil(shownPeople / cols)
  const reach = Math.max(span, front + Math.max(0, rows - 1) * 1.05 + 1.4, cols * 0.55 + 2)
  return Math.max(9, reach * 1.22)
}

function cubeSpots(count: number, gap: number): Array<[number, number, number]> {
  const side = Math.ceil(Math.cbrt(count))
  const spots: Array<[number, number, number]> = []
  for (let y = 0; y < side && spots.length < count; y += 1) {
    for (let z = 0; z < side && spots.length < count; z += 1) {
      for (let x = 0; x < side && spots.length < count; x += 1) {
        spots.push([(x - (side - 1) / 2) * gap, y * gap, (z - (side - 1) / 2) * gap])
      }
    }
  }
  return spots
}

function apple(ugly: boolean) {
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 18, 14),
    standard(ugly ? 0x6a5a28 : 0xc1121f, ugly ? 0.8 : 0.42),
  )
  body.scale.set(1.05, 0.9, 1)
  body.castShadow = true
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 6), standard(0x5a3b24, 0.8))
  stem.position.y = 0.4
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), standard(ugly ? 0x6a7030 : 0x2f6b3a, 0.7))
  leaf.scale.set(1.5, 0.32, 0.75)
  leaf.position.set(0.12, 0.44, 0.02)
  group.add(body, stem, leaf)
  return group
}

function emptyCrate(world: THREE.Group, ugly: boolean) {
  const paint = standard(ugly ? 0x241c16 : 0xd7c4a3, 0.8)
  const size = 2.2
  const half = size / 2
  for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as Array<[number, number]>) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, size, 0.14), paint)
    post.position.set(x * half, size / 2 + 0.16, z * half)
    post.castShadow = true
    world.add(post)
  }
}

function mold(world: THREE.Group, span: number) {
  const goo = standard(0x31402c, 0.9)
  for (const [x, z] of [[-0.35, 0.2], [0.4, -0.25], [0.05, 0.4]] as Array<[number, number]>) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), goo)
    blob.scale.set(1.4, 0.4, 1)
    blob.position.set(x * span, 0.22, z * span)
    world.add(blob)
  }
}

function person(shirt: number, ugly: boolean) {
  const group = new THREE.Group()
  const skin = standard(ugly ? 0xc2b29a : 0xf0c9a0, 0.72)
  const cloth = standard(shirt, 0.78)
  const ink = standard(ugly ? 0x2a241c : 0x1c1915, 0.8)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), skin)
  head.position.y = 1.16
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.168, 12, 8), ink)
  hair.scale.set(1.05, 0.55, 1.05)
  hair.position.y = 1.25
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.18), cloth)
  torso.position.y = 0.82
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.18), ink)
  hips.position.y = 0.54
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.4, 0.12), ink)
  legL.position.set(-0.08, 0.26, 0)
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.4, 0.12), ink)
  legR.position.set(0.08, 0.26, 0)
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.1), cloth)
  armL.position.set(-0.23, 0.84, 0)
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.1), cloth)
  armR.position.set(0.23, 0.84, 0)
  group.add(head, hair, torso, hips, legL, legR, armL, armR)
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh) mesh.castShadow = true
  })
  return group
}

function standard(color: number, rough: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.04 })
}

function disposeContents(group: THREE.Group) {
  const nodes: THREE.Object3D[] = []
  group.traverse((obj) => nodes.push(obj))
  for (const obj of nodes) {
    const mesh = obj as THREE.Mesh
    mesh.geometry?.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material?.dispose()
  }
  group.clear()
}

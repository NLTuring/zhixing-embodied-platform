import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { Box3, Mesh, Object3D, SkinnedMesh, Triangle, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { DEFAULT_SCENE, generatePlan, getDuration } from './domain'
import { sampleMotion } from './motion'
import { applyRobotPose, createRobotRig } from './robotPose'
import { CABINET, TABLE, cabinetPanels, panelBounds, type Panel } from './sceneLayout'

let robot: Object3D
beforeAll(async () => {
  const bytes = readFileSync(new URL('../public/models/zhixing-robot.glb', import.meta.url))
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  robot = gltf.scene
})

// Cache the deformed world-space vertices once per frame, not once per panel.
function posedMesh(mesh: Mesh) {
  if (mesh instanceof SkinnedMesh) mesh.skeleton.update()
  const positions = new Float32Array(mesh.geometry.attributes.position.count * 3)
  const bounds = new Box3()
  const vertex = new Vector3()
  for (let i = 0; i < positions.length / 3; i++) {
    mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld)
    vertex.toArray(positions, i * 3)
    bounds.expandByPoint(vertex)
  }
  return { positions, bounds, indices: mesh.geometry.index }
}

// Independent triangle-vs-solid-box narrow phase, using the deformed GLB surface.
function intersects(surface: ReturnType<typeof posedMesh>, panel: Panel) {
  const { box, matrix } = panelBounds(panel, -0.005)
  const worldBox = box.clone().applyMatrix4(matrix)
  if (!surface.bounds.intersectsBox(worldBox)) return false
  const { positions, indices } = surface
  const inverse = matrix.invert()
  const tri = new Triangle(new Vector3(), new Vector3(), new Vector3())
  const count = indices ? indices.count : positions.length / 3
  for (let i = 0; i < count; i += 3) {
    const a = (indices ? indices.getX(i) : i) * 3,
      b = (indices ? indices.getX(i + 1) : i + 1) * 3,
      c = (indices ? indices.getX(i + 2) : i + 2) * 3
    if (
      Math.max(positions[a], positions[b], positions[c]) < worldBox.min.x ||
      Math.min(positions[a], positions[b], positions[c]) > worldBox.max.x ||
      Math.max(positions[a + 1], positions[b + 1], positions[c + 1]) < worldBox.min.y ||
      Math.min(positions[a + 1], positions[b + 1], positions[c + 1]) > worldBox.max.y ||
      Math.max(positions[a + 2], positions[b + 2], positions[c + 2]) < worldBox.min.z ||
      Math.min(positions[a + 2], positions[b + 2], positions[c + 2]) > worldBox.max.z
    )
      continue
    tri.a.fromArray(positions, a).applyMatrix4(inverse)
    tri.b.fromArray(positions, b).applyMatrix4(inverse)
    tri.c.fromArray(positions, c).applyMatrix4(inverse)
    if (box.intersectsTriangle(tri)) return true
  }
  return false
}

describe('实际机器人网格与柜体的运动净空', () => {
  it.each([
    ['蓝杯', '把蓝色杯子放进柜子，避开障碍，最后关好柜门', 0, false, 0.1],
    ['白杯', '把白色杯子放进柜子，避开障碍，最后关好柜门', 0, false, 0.1],
    ['双杯', '把两个杯子放进柜子，避开障碍，最后关好柜门', 0, false, 0.1],
    ['目标左边界', '把两个杯子放进柜子，避开障碍，最后关好柜门', -CABINET.maxOffset, false, 0.1],
    ['目标右边界', '把两个杯子放进柜子，避开障碍，最后关好柜门', CABINET.maxOffset, false, 0.1],
    ['初始已开门', '把两个杯子放进柜子，避开障碍，最后关好柜门', 0, true, 0.1],
    ['最高接近点', '把两个杯子放进柜子，避开障碍，最后关好柜门', 0, false, 0.3],
    [
      '最高点与左边界',
      '把两个杯子放进柜子，避开障碍，最后关好柜门',
      -CABINET.maxOffset,
      false,
      0.3,
    ],
    ['最高点与右边界', '把两个杯子放进柜子，避开障碍，最后关好柜门', CABINET.maxOffset, false, 0.3],
    ['低位接近', '把两个杯子放进柜子，最后关好柜门', 0, false, 0],
  ] as const)(
    '%s：全程不穿柜板或桌面，手腕实际到达目标',
    (_, task, targetOffset, cabinetOpen, clearance) => {
      const model = clone(robot),
        rig = createRobotRig(model)
      const plan = generatePlan(task).plan!
      plan.steps.forEach((step) => {
        step.params.clearance = clearance
      })
      const scene = { ...DEFAULT_SCENE, targetOffset, cabinetOpen }
      const meshes: Mesh[] = []
      model.traverse((node) => {
        if (node instanceof Mesh) meshes.push(node)
      })
      const collisions: string[] = []
      const byPanel: Record<string, { first: number; last: number; frames: number }> = {}
      const unreachable: number[] = []
      for (let t = 0; t <= getDuration(plan); t += 0.06) {
        const frame = sampleMotion(plan, t, scene)
        applyRobotPose(model, rig, frame)
        model.updateMatrixWorld(true)
        if (rig.hand.getWorldPosition(new Vector3()).distanceTo(new Vector3(...frame.hand)) > 0.003)
          unreachable.push(t)
        const surfaces = meshes.map((mesh) => ({ name: mesh.name, ...posedMesh(mesh) }))
        for (const panel of [...cabinetPanels(frame.door), { name: '桌面', ...TABLE }]) {
          for (const surface of surfaces)
            if (intersects(surface, panel)) {
              collisions.push(`${t.toFixed(2)}s ${surface.name} / ${panel.name}`)
              byPanel[panel.name] ??= { first: t, last: t, frames: 0 }
              byPanel[panel.name].last = t
              byPanel[panel.name].frames++
            }
        }
      }
      expect(collisions.slice(0, 10), JSON.stringify(byPanel)).toEqual([])
      expect(unreachable.slice(0, 10), '手腕不能靠限制臂展造成与杯子分离').toEqual([])
    },
    60000,
  )
})

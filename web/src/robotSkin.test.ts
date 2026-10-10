import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { SkinnedMesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { applyRobotPose, createRobotRig } from './robotPose'
import { sampleMotion } from './motion'
import { generatePlan, DEFAULT_SCENE } from './domain'

it('抬臂、抓取和放置时表面连续，胸甲和前臂没有被拉成长刺', async () => {
  const bytes = readFileSync(new URL('../public/models/zhixing-robot.glb', import.meta.url))
  const model = (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
  ).scene
  const rig = createRobotRig(model)
  const plan = generatePlan('把两个杯子放进柜子，避开障碍，最后关好柜门').plan!
  const meshes: SkinnedMesh[] = []
  model.traverse((node) => {
    if (node instanceof SkinnedMesh) meshes.push(node)
  })
  expect(meshes).toHaveLength(1)
  const mesh = meshes[0]
  const geometry = mesh.geometry
  const rest = Array.from({ length: geometry.attributes.position.count }, (_, i) =>
    new Vector3().fromBufferAttribute(geometry.attributes.position, i),
  )
  const index = geometry.index!
  const edges: [number, number, number][] = []
  for (let k = 0; k < index.count; k += 3) {
    for (let e = 0; e < 3; e++) {
      const a = index.getX(k + e),
        b = index.getX(k + ((e + 1) % 3))
      edges.push([a, b, rest[a].distanceTo(rest[b])])
    }
  }
  for (const time of [0, 2, 3.5, 7.1, 10, 12.5, 17.5, 27]) {
    applyRobotPose(model, rig, sampleMotion(plan, time, DEFAULT_SCENE))
    mesh.skeleton.update()
    const posed = rest.map((_, i) => mesh.getVertexPosition(i, new Vector3()))
    let worstExtension = 0
    let edge = ''
    for (const [a, b, length] of edges) {
      const extension = posed[a].distanceTo(posed[b]) - length
      if (extension > worstExtension) {
        worstExtension = extension
        edge = `${rest[a].toArray()} -> ${rest[b].toArray()}`
      }
    }
    expect(worstExtension, `${time}s 网格边的异常拉伸 ${edge}`).toBeLessThan(0.04)
  }
})

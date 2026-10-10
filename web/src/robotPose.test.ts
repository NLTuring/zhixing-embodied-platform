import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { Object3D, Quaternion, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { DEFAULT_SCENE, generatePlan, getDuration } from './domain'
import { sampleMotion } from './motion'
import { applyRobotPose, createRobotRig } from './robotPose'

let source: Object3D
beforeAll(async () => {
  const bytes = readFileSync(new URL('../public/models/zhixing-robot.glb', import.meta.url))
  source = (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
  ).scene
})

describe('机器人关节动作的解剖约束', () => {
  const task = '把两个杯子放进柜子，避开障碍，最后关好柜门'

  it('待机姿态保留模型原本的肩肘腕位置', () => {
    const model = clone(source)
    const rig = createRobotRig(model)
    model.updateMatrixWorld(true)
    const bindElbow = rig.lower.getWorldPosition(new Vector3())
    const bindWrist = rig.hand.getWorldPosition(new Vector3())
    applyRobotPose(model, rig, sampleMotion(null, 0, DEFAULT_SCENE))
    model.updateMatrixWorld(true)
    expect(rig.lower.getWorldPosition(new Vector3()).distanceTo(bindElbow)).toBeLessThan(0.003)
    expect(rig.hand.getWorldPosition(new Vector3()).distanceTo(bindWrist)).toBeLessThan(0.003)
  })

  it('完整动作中左肘保持在躯干外侧', () => {
    const model = clone(source)
    const rig = createRobotRig(model)
    const plan = generatePlan(task).plan!
    const crossings: string[] = []
    for (let t = 0; t <= getDuration(plan); t += 1 / 30) {
      applyRobotPose(model, rig, sampleMotion(plan, t, DEFAULT_SCENE))
      model.updateMatrixWorld(true)
      const elbow = rig.lower.getWorldPosition(new Vector3())
      if (elbow.x < 0.17) crossings.push(`${t.toFixed(2)}s: elbow.x=${elbow.x.toFixed(3)}`)
    }
    expect(crossings.slice(0, 12), `${crossings.length} 帧左肘穿向躯干`).toEqual([])
  })

  it('手掌相对前臂的总转角不超过90度', () => {
    const model = clone(source)
    const rig = createRobotRig(model)
    const plan = generatePlan(task).plan!
    const neutral = new Quaternion()
    const violations: string[] = []
    for (let t = 0; t <= getDuration(plan); t += 1 / 30) {
      applyRobotPose(model, rig, sampleMotion(plan, t, DEFAULT_SCENE))
      const angle = (rig.hand.quaternion.angleTo(neutral) * 180) / Math.PI
      if (angle > 90.01) violations.push(`${t.toFixed(2)}s: wrist=${angle.toFixed(1)}°`)
    }
    expect(violations.slice(0, 12), `${violations.length} 帧手腕过度扭转`).toEqual([])
  })

  it('连续播放时关节旋转没有突跳', () => {
    const model = clone(source)
    const rig = createRobotRig(model)
    const plan = generatePlan(task).plan!
    const joints = [rig.upper, rig.lower, rig.hand]
    const previous = joints.map((joint) => joint.quaternion.clone())
    const jumps: string[] = []
    for (let t = 0; t <= getDuration(plan); t += 1 / 60) {
      applyRobotPose(model, rig, sampleMotion(plan, t, DEFAULT_SCENE))
      joints.forEach((joint, i) => {
        const angle = (joint.quaternion.angleTo(previous[i]) * 180) / Math.PI
        if (t > 0 && angle > 12)
          jumps.push(`${t.toFixed(3)}s: ${joint.name} Δ=${angle.toFixed(1)}°`)
        previous[i].copy(joint.quaternion)
      })
    }
    expect(jumps.slice(0, 12), `${jumps.length} 帧关节突跳`).toEqual([])
  })
})

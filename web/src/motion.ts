import type { CupId, Plan, SceneSettings } from './domain'
import { CABINET, doorWrist } from './sceneLayout'
export type Vec3 = [number, number, number]
export const REST_HAND: Vec3 = [0.268, 0.925, -0.025]
// Side grip: fingers extend forward around the cup, with a neutral wrist.
export const GRIP_OFFSET: Vec3 = [-0.03, -0.035, 0.085]
const wristForCup = (p: Vec3): Vec3 => p.map((v, i) => v - GRIP_OFFSET[i]) as Vec3
export const CUP_START: Record<CupId, Vec3> = {
  'cup-blue': [0.1, 1.02, 0.235],
  'cup-white': [0.23, 1.02, 0.235],
}
export const cupGoal = (cup: CupId, offset: number): Vec3 => [
  (cup === 'cup-blue' ? 0.22 : 0.36) +
    Math.max(-CABINET.maxOffset, Math.min(CABINET.maxOffset, offset)),
  CABINET.floor + 0.0535,
  CABINET.targetZ,
]
export const doorHand = doorWrist
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (v: number) => {
  const t = clamp(v)
  return t * t * (3 - 2 * t)
}
export const mix = (a: Vec3, b: Vec3, t: number): Vec3 =>
  t <= 0 ? [...a] : t >= 1 ? [...b] : (a.map((v, i) => v + (b[i] - v) * t) as Vec3)
const above = (p: Vec3, h: number): Vec3 => [p[0], p[1] + h, p[2]]
export interface MotionFrame {
  hand: Vec3
  handPitch: number
  cups: Record<CupId, Vec3>
  door: number
  grip: number
  holding: CupId | null
}

/** Cup-center trajectory for the actual approach and placement actions. */
export function sampleCupPath(plan: Plan, cup: CupId, scene: SceneSettings): Vec3[] {
  const points: Vec3[] = []
  let start = 0
  for (const step of plan.steps) {
    if (step.object === cup && ['approach', 'place'].includes(step.skill)) {
      for (let i = 0; i <= 24; i++) {
        points.push(sampleMotion(plan, start + (step.duration * i) / 24, scene).cups[cup])
      }
    }
    start += step.duration
  }
  return points
}
/** Evaluate from the snapshot, so seeking does not depend on previously visited frames. */
export function sampleMotion(plan: Plan | null, time: number, scene: SceneSettings): MotionFrame {
  const frame: MotionFrame = {
    hand: [...REST_HAND],
    handPitch: 0,
    cups: { 'cup-blue': [...CUP_START['cup-blue']], 'cup-white': [...CUP_START['cup-white']] },
    door: scene.cabinetOpen ? 1 : 0,
    grip: 0,
    holding: null,
  }
  if (!plan) return frame
  let remaining = Math.max(0, time)
  for (const step of plan.steps) {
    if (remaining <= 0) break
    const p = clamp(remaining / step.duration)
    const start = [...frame.hand] as Vec3
    const startPitch = frame.handPitch
    const cup = step.object as CupId
    if (step.skill === 'open' || step.skill === 'close') {
      const from = frame.door,
        to = step.skill === 'open' ? 1 : 0
      const opening = from + (to - from) * smooth((p - 0.28) / 0.5)
      frame.door = opening
      frame.handPitch = startPitch + (-Math.PI / 2 - startPitch) * smooth(p / 0.12)
      const raised: Vec3 = [0.268, 1.22, 0.1]
      if (p < 0.12) frame.hand = mix(start, raised, smooth(p / 0.12))
      else if (p < 0.28) frame.hand = mix(raised, doorHand(from), smooth((p - 0.12) / 0.16))
      else if (p <= 0.78) frame.hand = doorHand(opening)
      else frame.hand = mix(doorHand(to), [0.26, 1.22, 0.1], smooth((p - 0.78) / 0.22))
      frame.grip = 0.6 * smooth((p - 0.23) / 0.05) * (1 - smooth((p - 0.78) / 0.08))
    }
    if (step.skill === 'grasp') {
      const initial = frame.cups[cup]
      const grasp = wristForCup(initial)
      frame.handPitch = startPitch + (-Math.PI / 2 - startPitch) * smooth(p / 0.48)
      if (p < 0.48) frame.hand = mix(start, above(grasp, 0.08), smooth(p / 0.48))
      else if (p < 0.7) frame.hand = mix(above(grasp, 0.08), grasp, smooth((p - 0.48) / 0.22))
      else {
        frame.hand = mix(grasp, above(grasp, 0.1), smooth((p - 0.7) / 0.3))
        frame.holding = cup
      }
      frame.grip = smooth((p - 0.55) / 0.17)
    }
    if (step.skill === 'approach') {
      const goal = wristForCup(cupGoal(cup, scene.targetOffset))
      const edge: Vec3 = [goal[0], goal[1] + step.params.clearance, 0.19]
      const inside: Vec3 = [goal[0], edge[1], goal[2]]
      frame.hand =
        p < 0.65 ? mix(start, edge, smooth(p / 0.65)) : mix(edge, inside, smooth((p - 0.65) / 0.35))
      frame.grip = 1
    }
    if (step.skill === 'place')
      frame.hand = mix(start, wristForCup(cupGoal(cup, scene.targetOffset)), smooth(p))
    if (step.skill === 'release') {
      const goal = cupGoal(cup, scene.targetOffset)
      frame.grip = 1 - smooth(p / 0.45)
      if (p >= 0.45) {
        frame.holding = null
        frame.cups[cup] = goal
      }
      const wrist = wristForCup(goal)
      frame.hand = mix(start, [wrist[0], wrist[1] + 0.015, 0.13], smooth((p - 0.45) / 0.55))
    }
    if (step.skill === 'home') {
      const withdrawn: Vec3 = [REST_HAND[0], 1.1, 0.015]
      frame.hand =
        p < 0.45
          ? mix(start, withdrawn, smooth(p / 0.45))
          : mix(withdrawn, REST_HAND, smooth((p - 0.45) / 0.55))
      frame.handPitch = startPitch * (1 - smooth((p - 0.45) / 0.55))
      frame.grip = 0
    }
    if (frame.holding)
      frame.cups[frame.holding] = frame.hand.map((v, i) => v + GRIP_OFFSET[i]) as Vec3
    remaining -= step.duration
  }
  return frame
}

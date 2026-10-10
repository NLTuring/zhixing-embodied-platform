import { describe, expect, it } from 'vitest'
import { generatePlan, DEFAULT_SCENE, getDuration } from './domain'
import { sampleMotion, CUP_START, cupGoal, REST_HAND } from './motion'
import { CABINET, cabinetPanels } from './sceneLayout'

describe('动作回放的物体与关节状态', () => {
  const plan = generatePlan('把两个杯子放进柜子，避开障碍，最后关好柜门').plan!
  it('初始状态保持杯子在桌面，柜门关闭', () => {
    const frame = sampleMotion(plan, 0, DEFAULT_SCENE)
    expect(frame.cups).toEqual(CUP_START)
    expect(frame.door).toBe(0)
    expect(frame.holding).toBeNull()
  })
  it('抓取边界位置连续，之后物体跟随手部', () => {
    let start = 0
    for (const step of plan.steps) {
      if (step.skill === 'grasp') {
        const before = sampleMotion(plan, start + step.duration * 0.699, DEFAULT_SCENE)
        const after = sampleMotion(plan, start + step.duration * 0.701, DEFAULT_SCENE)
        expect(
          Math.hypot(...before.cups['cup-blue'].map((v, i) => v - after.cups['cup-blue'][i])),
        ).toBeLessThan(0.01)
        const lifted = sampleMotion(plan, start + step.duration, DEFAULT_SCENE)
        expect(lifted.holding).toBe('cup-blue')
        expect(lifted.cups['cup-blue'][1]).toBeGreaterThan(CUP_START['cup-blue'][1])
        break
      }
      start += step.duration
    }
  })
  it('完成后两只杯子保持各自目标位置，松开且关门归位', () => {
    const end = sampleMotion(plan, getDuration(plan), DEFAULT_SCENE)
    expect(end.cups['cup-blue']).toEqual(cupGoal('cup-blue', 0))
    expect(end.cups['cup-white']).toEqual(cupGoal('cup-white', 0))
    expect(end.holding).toBeNull()
    expect(end.door).toBe(0)
    expect(end.hand).toEqual(REST_HAND)
  })
  it('拖回开始会清除已执行物体状态，已开门设置生效', () => {
    sampleMotion(plan, getDuration(plan), DEFAULT_SCENE)
    expect(sampleMotion(plan, 0, { ...DEFAULT_SCENE, cabinetOpen: true }).door).toBe(1)
    expect(sampleMotion(plan, 0, DEFAULT_SCENE).cups).toEqual(CUP_START)
  })
  it('目标拖到两端后，杯身和杯柄仍留在柜内并保留5mm余量', () => {
    const panels = cabinetPanels(1)
    const left = panels.find((panel) => panel.name === '左侧板')!
    const right = panels.find((panel) => panel.name === '右侧板')!
    for (const offset of [-CABINET.maxOffset, CABINET.maxOffset]) {
      for (const cup of ['cup-blue', 'cup-white'] as const) {
        const goal = cupGoal(cup, offset)
        expect(goal[0] - 0.037).toBeGreaterThan(left.position[0] + left.size[0] / 2 + 0.005)
        expect(goal[0] + 0.042 + 0.024 + 0.0055).toBeLessThan(
          right.position[0] - right.size[0] / 2 - 0.005,
        )
      }
    }
  })
})

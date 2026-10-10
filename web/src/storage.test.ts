import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCENE, generatePlan } from './domain'
import { copyExperimentPlan, DEFAULT_CAPABILITY, readExperiments, type Experiment } from './storage'

const record = (): Experiment => ({
  id: 'experiment',
  date: new Date().toISOString(),
  plan: generatePlan('把蓝色杯子放进柜子').plan!,
  scene: { ...DEFAULT_SCENE },
  capability: { ...DEFAULT_CAPABILITY },
  time: 0,
  status: 'draft',
  repairs: 0,
  note: '',
})
let data = ''
beforeEach(() => {
  data = ''
  vi.stubGlobal('localStorage', { getItem: () => data })
})
afterEach(() => vi.unstubAllGlobals())
describe('实验快照', () => {
  it('复制保留手工编辑与修复参数，使用新的标识且独立于原记录', () => {
    const original = record()
    original.plan.version = 4
    original.plan.steps[3].duration = 6
    original.plan.steps[3].params.clearance = 0.1
    const copy = copyExperimentPlan(original)
    expect(copy.id).not.toBe(original.plan.id)
    expect(copy.version).toBe(1)
    expect(copy.steps[3].duration).toBe(6)
    expect(copy.steps[3].params.clearance).toBe(0.1)
    copy.steps[3].params.clearance = 0.2
    expect(original.plan.steps[3].params.clearance).toBe(0.1)
  })
  it('旧版记录补入默认能力，新版保留自身能力快照', () => {
    const old: Partial<Experiment> = record()
    delete old.capability
    const current = record()
    current.capability.payload = 0.5
    data = JSON.stringify([old, current])
    expect(readExperiments().map((r) => r.capability.payload)).toEqual([3, 0.5])
  })
  it('跳过会导致动作采样失败的损坏记录，保留完整记录', () => {
    const badObject = record()
    badObject.plan.steps[2].object = 'cabinet'
    const badRepairs = record()
    badRepairs.repairs = -1
    const badScene = record()
    badScene.scene.targetOffset = 9
    data = JSON.stringify([badObject, badRepairs, badScene, record()])
    expect(readExperiments()).toHaveLength(1)
  })
  it('非法 JSON 或非数组内容安全回退', () => {
    for (const value of ['{', 'null', '{}']) {
      data = value
      expect(readExperiments()).toEqual([])
    }
  })
})

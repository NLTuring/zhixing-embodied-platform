import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCENE,
  generatePlan,
  getDuration,
  getRuntimeIssue,
  getStepAtTime,
  repairPlan,
  revisePlan,
  validatePlan,
  type Plan,
} from './domain'

const build = (task = '把蓝色杯子放进柜子') => generatePlan(task).plan!

describe('场景内自然语言规划', () => {
  it('将蓝杯入柜转换为完整动作序列', () => {
    const plan = build()
    expect(plan.objects).toEqual(['cup-blue'])
    expect(plan.steps.map((s) => s.skill)).toEqual([
      'inspect',
      'open',
      'grasp',
      'approach',
      'place',
      'release',
      'home',
    ])
    expect(validatePlan(plan, DEFAULT_SCENE)).toEqual([])
  })
  it('支持白杯、两个杯子、指定顺序和关门', () => {
    expect(build('把白色杯子收进柜子').objects).toEqual(['cup-white'])
    const plan = build('先把白色杯子放进柜子，再把蓝色杯子放进去，最后关好柜门')
    expect(plan.objects).toEqual(['cup-white', 'cup-blue'])
    expect(plan.steps.filter((s) => s.skill === 'grasp').map((s) => s.object)).toEqual(plan.objects)
    expect(plan.steps.map((s) => s.skill)).toContain('close')
    expect(validatePlan(plan, DEFAULT_SCENE)).toEqual([])
    expect(build('把两个杯子放进柜子').objects).toHaveLength(2)
  })
  it.each([
    '',
    '   ',
    '去厨房做饭',
    '把杯子扔出去',
    '把杯子放到桌子上',
    '把红色杯子放进柜子',
    '把杯子放进柜子然后扫地',
  ])('拒绝未支持的指令 %s', (task) => {
    const result = generatePlan(task)
    expect(result.plan).toBeUndefined()
    expect(result.error).toBeTruthy()
  })
})

describe('依赖检查与计划编辑', () => {
  it('删除接近动作不能绕过柜口检查，修复会补齐路径', () => {
    const plan = build()
    const edited = revisePlan(
      plan,
      plan.steps.filter((s) => s.skill !== 'approach'),
    )
    const issues = validatePlan(edited, DEFAULT_SCENE)
    expect(issues.some((i) => i.title === '尚未经过柜口接近点')).toBe(true)
    const repaired = repairPlan(edited, issues)
    expect(validatePlan(repaired, DEFAULT_SCENE)).toEqual([])
    expect(getRuntimeIssue(repaired, DEFAULT_SCENE, getDuration(repaired))?.kind).toBe('collision')
  })
  it('识别缺少开门步骤，并支持从已开门场景开始', () => {
    const plan = build()
    const edited = revisePlan(
      plan,
      plan.steps.filter((s) => s.skill !== 'open'),
    )
    expect(validatePlan(edited, DEFAULT_SCENE).some((i) => i.kind === 'precondition')).toBe(true)
    expect(validatePlan(edited, { ...DEFAULT_SCENE, cabinetOpen: true })).toEqual([])
  })
  it('将放置移到抓取之前会定位冲突', () => {
    const plan = build()
    const steps = [...plan.steps]
    const place = steps.find((s) => s.skill === 'place')!
    const edited = revisePlan(plan, [place, ...steps.filter((s) => s !== place)])
    expect(validatePlan(edited, DEFAULT_SCENE)[0].stepId).toBe(place.id)
  })
  it('抓取后未放置和松开不能报告完成', () => {
    const plan = build()
    const edited = revisePlan(
      plan,
      plan.steps.filter((s) => !['place', 'release'].includes(s.skill)),
    )
    expect(validatePlan(edited, DEFAULT_SCENE).length).toBeGreaterThan(0)
  })
  it('空计划、越界目标和非法参数有明确错误', () => {
    const plan = build()
    expect(validatePlan(revisePlan(plan, []), DEFAULT_SCENE).length).toBeGreaterThan(0)
    expect(validatePlan(plan, { ...DEFAULT_SCENE, targetOffset: 0.4 })[0].kind).toBe('unreachable')
    expect(
      validatePlan(
        revisePlan(
          plan,
          plan.steps.map((s) => ({ ...s, duration: -1 })),
        ),
        DEFAULT_SCENE,
      ).length,
    ).toBeGreaterThan(0)
  })
  it('修改版本时不改变原始计划及参数', () => {
    const original = build()
    const snapshot = JSON.stringify(original)
    const edited = revisePlan(original, original.steps)
    edited.steps[0].params.clearance = 0.4
    expect(JSON.stringify(original)).toBe(snapshot)
    expect(edited.version).toBe(2)
  })
})

describe('连续时间与碰撞诊断', () => {
  it('处理开始、边界、完成与空计划', () => {
    const plan = build()
    expect(getStepAtTime(plan, -1).index).toBe(0)
    expect(getStepAtTime(plan, plan.steps[0].duration).index).toBe(1)
    expect(getStepAtTime(plan, getDuration(plan)).progress).toBe(1)
    expect(getStepAtTime(revisePlan(plan, []), 0).step).toBeNull()
  })
  it('碰撞随步骤位置和安全间隙变化，不依赖固定时间点', () => {
    const plan = build()
    expect(getRuntimeIssue(plan, DEFAULT_SCENE, 0)).toBeNull()
    const issue = getRuntimeIssue(plan, DEFAULT_SCENE, getDuration(plan))!
    expect(issue.kind).toBe('collision')
    expect(plan.steps.find((s) => s.id === issue.stepId)?.skill).toBe('approach')
    expect(
      getRuntimeIssue(plan, { ...DEFAULT_SCENE, obstacle: false }, getDuration(plan)),
    ).toBeNull()
  })
  it('修复有差异、可通过，原轨迹版本保持不变', () => {
    const original = build()
    const snapshot = JSON.stringify(original)
    const issue = getRuntimeIssue(original, DEFAULT_SCENE, getDuration(original))!
    const repaired = repairPlan(original, [issue])
    expect(repaired.version).toBe(2)
    expect(repaired.repaired).toBe(true)
    expect(
      repaired.steps.find((s) => s.id === issue.stepId)?.params.clearance,
    ).toBeGreaterThanOrEqual(0.08)
    expect(getRuntimeIssue(repaired, DEFAULT_SCENE, getDuration(repaired))).toBeNull()
    expect(JSON.stringify(original)).toBe(snapshot)
  })
  it('补入前置动作后再次校验通过', () => {
    const original = build()
    const edited = revisePlan(
      original,
      original.steps.filter((s) => s.skill !== 'open'),
    )
    const repaired = repairPlan(edited, validatePlan(edited, DEFAULT_SCENE))
    expect(validatePlan(repaired, DEFAULT_SCENE)).toEqual([])
  })
  it('不可达目标不会通过参数修复伪装成成功', () => {
    const plan = build()
    const scene = { ...DEFAULT_SCENE, targetOffset: 0.5 }
    const repaired = repairPlan(plan, validatePlan(plan, scene))
    expect(validatePlan(repaired, scene).some((i) => i.kind === 'unreachable')).toBe(true)
  })
  it('多个杯子每个都验证路径', () => {
    const plan = build('把两个杯子收进柜子')
    const first = getRuntimeIssue(plan, DEFAULT_SCENE, getDuration(plan))!
    const repaired = repairPlan(plan, [first])
    expect(getRuntimeIssue(repaired, DEFAULT_SCENE, getDuration(repaired))).toBeNull()
  })
  it('异常导入的技能不进入执行', () => {
    const plan = build()
    const bad = { ...plan, steps: [{ ...plan.steps[0], skill: 'fly' }] } as unknown as Plan
    expect(validatePlan(bad, DEFAULT_SCENE).length).toBeGreaterThan(0)
  })
})

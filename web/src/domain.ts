export type CupId = 'cup-blue' | 'cup-white'
export type ObjectId = CupId | 'cabinet' | 'target'
export type SkillId =
  'inspect' | 'open' | 'grasp' | 'approach' | 'place' | 'release' | 'close' | 'home'
export interface Step {
  id: string
  skill: SkillId
  object: ObjectId
  label: string
  duration: number
  params: { clearance: number }
}
export interface Plan {
  id: string
  version: number
  task: string
  title: string
  objects: CupId[]
  closeDoor: boolean
  steps: Step[]
  repaired: boolean
  createdAt: string
}
export interface SceneSettings {
  cabinetOpen: boolean
  obstacle: boolean
  targetOffset: number
}
export interface Issue {
  kind: 'precondition' | 'collision' | 'unreachable' | 'unsupported'
  stepId: string
  title: string
  detail: string
  fix: string
}
export interface Skill {
  id: SkillId
  name: string
  category: string
  description: string
  preconditions: string
  effect: string
  defaultDuration: number
}
export const MAX_TARGET_OFFSET = 0.05
export const DEFAULT_SCENE: SceneSettings = { cabinetOpen: false, obstacle: true, targetOffset: 0 }
export const OBJECTS: { id: ObjectId; name: string; color: string }[] = [
  { id: 'cup-blue', name: '蓝色杯子', color: '#3363ed' },
  { id: 'cup-white', name: '白色杯子', color: '#d9dfe7' },
  { id: 'cabinet', name: '右侧柜子', color: '#9aabbb' },
  { id: 'target', name: '放置区域', color: '#2b9072' },
]
export const SKILLS: Skill[] = [
  {
    id: 'inspect',
    name: '识别目标',
    category: '感知',
    description: '定位物体与目标区域，确认当前场景状态。',
    preconditions: '物体在场景中可见',
    effect: '建立对象与位置的对应关系',
    defaultDuration: 1.5,
  },
  {
    id: 'open',
    name: '打开柜门',
    category: '操作',
    description: '接近柜门把手，沿滑轨将柜门侧向打开。',
    preconditions: '手部空闲，柜门可达',
    effect: '柜门开启，放置空间可用',
    defaultDuration: 3.5,
  },
  {
    id: 'grasp',
    name: '抓取杯子',
    category: '操作',
    description: '接近目标杯子并建立稳定夹持关系。',
    preconditions: '手部空闲，目标在桌面',
    effect: '杯子由机器人持握',
    defaultDuration: 3,
  },
  {
    id: 'approach',
    name: '接近柜口',
    category: '运动',
    description: '保持杯子直立，经过接近点移动到柜口。',
    preconditions: '柜门开启，已抓取目标',
    effect: '杯子到达柜口接近位置',
    defaultDuration: 3.5,
  },
  {
    id: 'place',
    name: '放置杯子',
    category: '操作',
    description: '沿受约束的路径将杯子移动到目标区域。',
    preconditions: '已持物到达柜口接近点',
    effect: '杯子到达放置位置',
    defaultDuration: 2.5,
  },
  {
    id: 'release',
    name: '松开杯子',
    category: '操作',
    description: '解除夹持，杯子稳定保留在目标区域。',
    preconditions: '杯子已到达目标位置',
    effect: '手部空闲，杯子完成收纳',
    defaultDuration: 1.5,
  },
  {
    id: 'close',
    name: '关闭柜门',
    category: '操作',
    description: '收回手部后沿滑轨关闭柜门。',
    preconditions: '手部空闲，物体完成收纳',
    effect: '柜门关闭',
    defaultDuration: 3.5,
  },
  {
    id: 'home',
    name: '手臂归位',
    category: '运动',
    description: '从操作空间收回手臂，恢复待机姿态。',
    preconditions: '手部空闲',
    effect: '机器人恢复待机',
    defaultDuration: 2,
  },
]
const uid = () => crypto.randomUUID()
export const objectName = (id: ObjectId) => OBJECTS.find((o) => o.id === id)?.name ?? id
export const skillName = (id: SkillId) => SKILLS.find((s) => s.id === id)?.name ?? id
export function createStep(skill: SkillId, object: ObjectId = 'cup-blue', clearance = 0.02): Step {
  const data = SKILLS.find((s) => s.id === skill)!
  return {
    id: uid(),
    skill,
    object,
    label: data.name,
    duration: data.defaultDuration,
    params: { clearance },
  }
}
export function generatePlan(input: string): { plan?: Plan; error?: string } {
  const task = input.trim()
  if (!task) return { error: '请描述任务，或点击场景中的杯子来指定对象。' }
  if (task.length > 500) return { error: '请将任务控制在 500 字以内，便于明确对象和约束。' }
  if (
    !/杯/.test(task) ||
    !/柜/.test(task) ||
    !/放|收|移动|送/.test(task) ||
    /做饭|扫地|清洁|清洗|扔|丢|飞|跳|舞|厨房|拿出|取出|红色|绿色|盘子|倒水|倒入|打碎|砸|不要放|别放|禁止放/.test(
      task,
    )
  ) {
    return {
      error: '当前场景支持将蓝色或白色杯子收纳到柜内，可组合顺序、避障和关门要求。请调整这条指令。',
    }
  }
  if (/(不要|禁止|不许|别).{0,3}(打开|开门)/.test(task))
    return { error: '入柜需要打开柜门，请移除禁止开门的约束，或先在场景中完成设置。' }
  const both = /两个|两只|全部|所有|都放|都收/.test(task) || (/蓝/.test(task) && /白/.test(task))
  const objects: CupId[] = both
    ? task.indexOf('白') >= 0 && (task.indexOf('蓝') < 0 || task.indexOf('白') < task.indexOf('蓝'))
      ? ['cup-white', 'cup-blue']
      : ['cup-blue', 'cup-white']
    : [/白/.test(task) ? 'cup-white' : 'cup-blue']
  const closeDoor = /关好|关上|关闭|关门/.test(task) && !/(不要|别|不必).{0,3}(关|关闭)/.test(task)
  const clearance = /避开|避障|安全|留出|抬高/.test(task) ? 0.1 : 0.02
  const steps = [createStep('inspect', objects[0]), createStep('open', 'cabinet')]
  for (const object of objects)
    for (const skill of ['grasp', 'approach', 'place', 'release'] as SkillId[])
      steps.push(createStep(skill, object, clearance))
  if (closeDoor) steps.push(createStep('close', 'cabinet'))
  steps.push(createStep('home', 'target'))
  return {
    plan: {
      id: uid(),
      version: 1,
      task,
      title:
        objects.length === 2
          ? '双杯有序收纳'
          : `${objectName(objects[0]).replace('色杯子', '杯')}入柜`,
      objects,
      closeDoor,
      steps,
      repaired: false,
      createdAt: new Date().toISOString(),
    },
  }
}
export function revisePlan(plan: Plan, steps: Step[]): Plan {
  return {
    ...plan,
    objects: [...plan.objects],
    version: plan.version + 1,
    steps: steps.map((s) => ({ ...s, params: { ...s.params } })),
  }
}
export function validatePlan(plan: Plan, scene: SceneSettings): Issue[] {
  const issues: Issue[] = []
  const add = (
    stepId: string,
    title: string,
    detail: string,
    fix: string,
    kind: Issue['kind'] = 'precondition',
  ) => issues.push({ kind, stepId, title, detail, fix })
  if (!Number.isFinite(scene.targetOffset) || Math.abs(scene.targetOffset) > MAX_TARGET_OFFSET)
    add(
      '',
      '目标超出柜内安全区域',
      '放置区域偏移超过 5 cm，请将目标移回柜内，给手部和杯子保留侧向空间。',
      '调整目标位置',
      'unreachable',
    )
  if (!plan.steps.length) {
    add('', '计划还没有动作', '至少需要抓取、移动和放置动作。', '重新生成计划')
    return issues
  }
  let open = scene.cabinetOpen
  let holding: ObjectId | null = null
  let approached: ObjectId | null = null
  const placed = new Set<ObjectId>()
  for (const step of plan.steps) {
    if (!SKILLS.some((s) => s.id === step.skill) || !OBJECTS.some((o) => o.id === step.object)) {
      add(
        step.id,
        '未适配的动作或对象',
        '该技能或对象不在当前场景的能力范围内。',
        '替换技能或对象',
        'unsupported',
      )
      continue
    }
    if (
      !Number.isFinite(step.duration) ||
      step.duration <= 0 ||
      step.duration > 20 ||
      !Number.isFinite(step.params.clearance) ||
      step.params.clearance < 0 ||
      step.params.clearance > 0.3
    ) {
      add(
        step.id,
        '动作参数超出范围',
        '时长应为 0–20 秒，接近高度应为 0–30 cm。',
        '调整参数',
        'unsupported',
      )
      continue
    }
    if (
      ['grasp', 'approach', 'place', 'release'].includes(step.skill) &&
      !plan.objects.includes(step.object as CupId)
    ) {
      add(
        step.id,
        '动作对象与任务不一致',
        '操作动作需要引用本任务中的杯子。',
        '选择任务对象',
        'unsupported',
      )
      continue
    }
    if (step.skill === 'open') {
      if (holding) add(step.id, '开门前需要空闲手部', '先开门，再抓取杯子。', '调整开门顺序')
      open = true
    }
    if (step.skill === 'grasp') {
      if (holding) add(step.id, '手部仍持有物体', '当前物体需要先放置并松开。', '补充放置和松开')
      if (placed.has(step.object))
        add(step.id, '对象已完成收纳', '这只杯子已经在柜内。', '移除重复抓取')
      holding = step.object
      approached = null
    }
    if (step.skill === 'approach' || step.skill === 'place') {
      if (!open) add(step.id, '柜门尚未打开', '入柜路径要求柜门处于开启状态。', '补入打开柜门')
      if (holding !== step.object)
        add(step.id, '尚未抓取目标杯子', '移动或放置前需要建立夹持关系。', '补入抓取动作')
      if (step.skill === 'approach' && holding === step.object) approached = step.object
      if (step.skill === 'place' && approached !== step.object)
        add(
          step.id,
          '尚未经过柜口接近点',
          '放置前需要经过接近动作，以验证杯子穿过柜口的路径。',
          '补入接近柜口动作',
        )
      if (step.skill === 'place' && holding === step.object) placed.add(step.object)
    }
    if (step.skill === 'release') {
      if (holding !== step.object || !placed.has(step.object))
        add(step.id, '杯子尚未到达目标', '松开之前需要将杯子放到目标区域。', '调整放置与松开顺序')
      holding = null
      approached = null
    }
    if (step.skill === 'close') {
      if (holding)
        add(
          step.id,
          '关门前需要完成放置',
          '手部仍持有杯子，关闭柜门会中断收纳。',
          '将关门移到放置之后',
        )
      open = false
    }
    if (step.skill === 'home' && holding)
      add(step.id, '归位前需要松开杯子', '手部持物状态未解除。', '补充放置和松开')
  }
  if (holding || plan.objects.some((o) => !placed.has(o)))
    add(plan.steps.at(-1)!.id, '任务目标尚未完成', '所有指定杯子都需要放置并松开。', '补全收纳动作')
  if (plan.closeDoor && open)
    add(plan.steps.at(-1)!.id, '缺少关门动作', '任务要求完成后关闭柜门。', '补入关闭柜门')
  return issues
}
export function getDuration(plan: Plan): number {
  return plan.steps.reduce((n, s) => n + Math.max(0, s.duration), 0)
}
export function getStepAtTime(
  plan: Plan,
  time: number,
): { index: number; step: Step | null; progress: number } {
  if (!plan.steps.length) return { index: -1, step: null, progress: 0 }
  let remaining = Math.max(0, Number.isFinite(time) ? time : 0)
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]
    if (remaining < step.duration || i === plan.steps.length - 1)
      return { index: i, step, progress: Math.min(1, remaining / Math.max(0.001, step.duration)) }
    remaining -= step.duration
  }
  return { index: -1, step: null, progress: 0 }
}
export function getRuntimeIssue(plan: Plan, scene: SceneSettings, time: number): Issue | null {
  if (!scene.obstacle) return null
  let start = 0
  for (const step of plan.steps) {
    if (
      step.skill === 'approach' &&
      step.params.clearance < 0.08 &&
      time >= start + step.duration * 0.65
    ) {
      return {
        kind: 'collision',
        stepId: step.id,
        title: '杯底与柜口下沿发生接触',
        detail: `${objectName(step.object)}的接近高度仅 ${Math.round(step.params.clearance * 100)} cm，低于当前演示场景的 8 cm 安全条件。`,
        fix: '提高接近点至 10 cm，重新验证受影响路径',
      }
    }
    start += step.duration
  }
  return null
}
export function repairPlan(plan: Plan, issues: Issue[]): Plan {
  let steps = plan.steps
  if (issues.some((i) => i.kind === 'precondition')) {
    const generated = generatePlan(plan.task).plan
    if (generated)
      steps = generated.steps.map(
        (next) =>
          plan.steps.find((s) => s.skill === next.skill && s.object === next.object) ?? next,
      )
  }
  if (issues.some((i) => i.kind === 'collision'))
    steps = steps.map((s) =>
      ['approach', 'place'].includes(s.skill)
        ? { ...s, params: { ...s.params, clearance: 0.1 } }
        : s,
    )
  return {
    ...revisePlan(plan, steps),
    repaired: issues.some((i) => i.kind === 'precondition' || i.kind === 'collision'),
  }
}

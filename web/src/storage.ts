import { getDuration, OBJECTS, type Plan, type SceneSettings, SKILLS } from './domain'
export interface Experiment {
  id: string
  date: string
  plan: Plan
  referencePlan?: Plan | null
  scene: SceneSettings
  capability: Capability
  time: number
  status: 'complete' | 'failed' | 'draft'
  repairs: number
  note: string
}
export interface Capability {
  name: string
  payload: number
  reach: number
  version: number
}
export const DEFAULT_CAPABILITY: Capability = {
  name: '知行 H-01',
  payload: 3,
  reach: 0.65,
  version: 1,
}
const KEY = 'zhixing.experiments.v1'
export function isPlan(value: unknown): value is Plan {
  if (!value || typeof value !== 'object') return false
  const p = value as Plan
  return (
    typeof p.id === 'string' &&
    typeof p.task === 'string' &&
    p.task.length <= 500 &&
    typeof p.title === 'string' &&
    Number.isInteger(p.version) &&
    p.version >= 1 &&
    typeof p.closeDoor === 'boolean' &&
    typeof p.repaired === 'boolean' &&
    typeof p.createdAt === 'string' &&
    Number.isFinite(Date.parse(p.createdAt)) &&
    Array.isArray(p.objects) &&
    p.objects.length > 0 &&
    p.objects.length <= 2 &&
    new Set(p.objects).size === p.objects.length &&
    p.objects.every((o) => o === 'cup-blue' || o === 'cup-white') &&
    Array.isArray(p.steps) &&
    p.steps.length <= 100 &&
    new Set(p.steps.map((s) => s?.id)).size === p.steps.length &&
    p.steps.every(
      (s) =>
        s &&
        typeof s.id === 'string' &&
        SKILLS.some((k) => k.id === s.skill) &&
        OBJECTS.some((o) => o.id === s.object) &&
        (!['grasp', 'approach', 'place', 'release'].includes(s.skill) ||
          s.object === 'cup-blue' ||
          s.object === 'cup-white') &&
        typeof s.label === 'string' &&
        Number.isFinite(s.duration) &&
        s.duration >= 0.5 &&
        s.duration <= 20 &&
        s.params &&
        Number.isFinite(s.params.clearance) &&
        s.params.clearance >= 0 &&
        s.params.clearance <= 0.3,
    )
  )
}
export function readExperiments(): Experiment[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (r: Experiment) =>
          r &&
          typeof r.id === 'string' &&
          typeof r.date === 'string' &&
          Number.isFinite(Date.parse(r.date)) &&
          Number.isFinite(r.time) &&
          r.time >= 0 &&
          isPlan(r.plan) &&
          (r.referencePlan == null || isPlan(r.referencePlan)) &&
          r.time <= getDuration(r.plan) &&
          r.scene &&
          typeof r.scene.cabinetOpen === 'boolean' &&
          typeof r.scene.obstacle === 'boolean' &&
          Number.isFinite(r.scene.targetOffset) &&
          Math.abs(r.scene.targetOffset) <= 0.18 &&
          ['complete', 'failed', 'draft'].includes(r.status) &&
          Number.isInteger(r.repairs) &&
          r.repairs >= 0 &&
          typeof r.note === 'string' &&
          (r.capability === undefined || validCapability(r.capability)),
      )
      .slice(0, 50)
      .map((r) => ({ ...r, capability: r.capability ?? { ...DEFAULT_CAPABILITY } }))
  } catch {
    return []
  }
}
export function copyExperimentPlan(record: Experiment): Plan {
  return {
    ...structuredClone(record.plan),
    id: crypto.randomUUID(),
    version: 1,
    repaired: false,
    createdAt: new Date().toISOString(),
  }
}
export function storeExperiments(records: Experiment[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(records.slice(0, 50)))
    return true
  } catch {
    return false
  }
}
export function readCapability(): Capability {
  try {
    const v = JSON.parse(localStorage.getItem('zhixing.capability.v1') ?? 'null')
    return validCapability(v) ? v : DEFAULT_CAPABILITY
  } catch {
    return DEFAULT_CAPABILITY
  }
}
export function validCapability(value: unknown): value is Capability {
  if (!value || typeof value !== 'object') return false
  const c = value as Capability
  return (
    typeof c.name === 'string' &&
    c.name.length > 0 &&
    c.name.length <= 60 &&
    Number.isFinite(c.payload) &&
    c.payload >= 0.1 &&
    c.payload <= 10 &&
    Number.isFinite(c.reach) &&
    c.reach >= 0.3 &&
    c.reach <= 1 &&
    Number.isInteger(c.version) &&
    c.version >= 1
  )
}

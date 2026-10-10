import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  Boxes,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Expand,
  FlaskConical,
  Focus,
  GitCompareArrows,
  GripVertical,
  Layers3,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react'
import {
  createStep,
  DEFAULT_SCENE,
  generatePlan,
  getDuration,
  getRuntimeIssue,
  getStepAtTime,
  objectName,
  OBJECTS,
  repairPlan,
  revisePlan,
  SKILLS,
  validatePlan,
  type Issue,
  type ObjectId,
  type Plan,
  type SceneSettings,
  type SkillId,
  type Step,
} from './domain'
import { ExperimentsPage, RobotsPage, SkillsPage } from './SidePages'
import {
  copyExperimentPlan,
  readCapability,
  readExperiments,
  storeExperiments,
  type Capability,
  type Experiment,
} from './storage'
import { Dialog, formatTime, IconButton } from './ui'
const Scene = lazy(() => import('./Scene'))
type Page = 'workbench' | 'robots' | 'skills' | 'experiments'
type RunStatus = 'draft' | 'running' | 'paused' | 'failed' | 'complete'
type Modal = 'settings' | 'examples' | 'add' | 'help' | 'changes' | null
const DEFAULT_TASK = '把蓝色杯子放进右侧柜子'
const NAV = [
  { id: 'workbench', name: '工作台', icon: Boxes },
  { id: 'robots', name: '机器人', icon: Bot },
  { id: 'skills', name: '技能库', icon: Layers3 },
  { id: 'experiments', name: '实验记录', icon: FlaskConical },
] as const
const STATUS_LABEL: Record<RunStatus, string> = {
  draft: '待验证',
  running: '验证中',
  paused: '已暂停',
  failed: '待修复',
  complete: '验证通过',
}

class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  render() {
    return this.state.error ? (
      <div className="scene-error">
        <TriangleAlert size={32} />
        <h3>三维场景加载失败</h3>
        <p>请确认浏览器已启用硬件加速，或重新加载页面。</p>
        <button className="button" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    ) : (
      this.props.children
    )
  }
}

function StepEditor({
  step,
  onSave,
  onClose,
}: {
  step: Step
  onSave: (step: Step) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(structuredClone(step))
  const manip = ['grasp', 'approach', 'place', 'release'].includes(draft.skill)
  return (
    <Dialog title="编辑动作" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(draft)
          onClose()
        }}
      >
        <label className="field">
          技能
          <select
            value={draft.skill}
            onChange={(e) => {
              const skill = e.target.value as SkillId
              const base = createStep(
                skill,
                ['open', 'close'].includes(skill)
                  ? 'cabinet'
                  : skill === 'home'
                    ? 'target'
                    : 'cup-blue',
              )
              setDraft({ ...base, id: step.id })
            }}
          >
            {SKILLS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          动作名称
          <input
            value={draft.label}
            required
            maxLength={30}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </label>
        {manip && (
          <label className="field">
            操作对象
            <select
              value={draft.object}
              onChange={(e) => setDraft({ ...draft, object: e.target.value as ObjectId })}
            >
              <option value="cup-blue">蓝色杯子</option>
              <option value="cup-white">白色杯子</option>
            </select>
          </label>
        )}
        <div className="field-grid">
          <label className="field">
            动作时长（秒）
            <input
              type="number"
              min="0.5"
              max="20"
              step="0.5"
              required
              value={draft.duration}
              onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            接近高度（cm）
            <input
              type="number"
              min="0"
              max="30"
              step="1"
              required
              value={Math.round(draft.params.clearance * 100)}
              onChange={(e) =>
                setDraft({ ...draft, params: { clearance: Number(e.target.value) / 100 } })
              }
            />
          </label>
        </div>
        <p className="field-help">保存后创建新的计划版本，并重新检查前置条件。</p>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="button primary">
            保存动作
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('workbench')
  const [task, setTask] = useState(DEFAULT_TASK)
  const [plan, setPlan] = useState<Plan>(() => generatePlan(DEFAULT_TASK).plan!)
  const [originalPlan, setOriginalPlan] = useState<Plan | null>(null)
  const [undo, setUndo] = useState<Plan[]>([])
  const [settings, setSettings] = useState<SceneSettings>({ ...DEFAULT_SCENE })
  const [status, setStatus] = useState<RunStatus>('draft')
  const [time, setTime] = useState(0),
    timeRef = useRef(0)
  const [speed, setSpeed] = useState(1)
  const [mode, setMode] = useState<'auto' | 'review'>('auto')
  const [failure, setFailure] = useState<Issue | null>(null)
  const [repairs, setRepairs] = useState(0),
    [budget, setBudget] = useState(3)
  const [selected, setSelected] = useState<ObjectId | null>('cup-blue')
  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const [comparison, setComparison] = useState(false),
    [reach, setReach] = useState(false),
    [cameraReset, setCameraReset] = useState(0)
  const [modal, setModal] = useState<Modal>(null),
    [editing, setEditing] = useState<Step | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [inputError, setInputError] = useState('')
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null)
  const [records, setRecords] = useState<Experiment[]>(readExperiments)
  const [capability, setCapability] = useState<Capability>(readCapability)
  const [snapshotCapability, setSnapshotCapability] = useState<Capability | null>(null)
  const activeCapability = snapshotCapability ?? capability
  const [overrides, setOverrides] = useState<Partial<Record<SkillId, number>>>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('zhixing.skills.v1') ?? '{}') as Record<
        string,
        unknown
      >
      return Object.fromEntries(
        Object.entries(value).filter(
          ([key, v]) =>
            SKILLS.some((s) => s.id === key) && typeof v === 'number' && v >= 0.5 && v <= 8,
        ),
      )
    } catch {
      return {}
    }
  })
  const [replay, setReplay] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null),
    stepListRef = useRef<HTMLDivElement>(null)
  const dragStep = useRef<string | null>(null),
    savedRun = useRef(false)
  const notify = useCallback((text: string) => setNotice({ text, id: Date.now() }), [])
  const duration = getDuration(plan)
  const cursor = getStepAtTime(plan, time)
  const validation = validatePlan(plan, settings)
  if (activeCapability.payload < 0.25)
    validation.unshift({
      kind: 'unsupported',
      stepId: '',
      title: '本体负载不足',
      detail: '当前示例杯子质量为 0.25 kg，超过所设置的负载能力。',
      fix: '更换本体能力配置',
    })
  if (activeCapability.reach < 0.55 + Math.max(0, settings.targetOffset))
    validation.unshift({
      kind: 'unreachable',
      stepId: '',
      title: '目标超过配置的工作范围',
      detail: '请缩小目标偏移，或选择具备足够工作范围的本体。',
      fix: '调整目标或本体配置',
    })
  const visibleIssue = failure ?? validation[0] ?? null
  const locked = status === 'running'
  const canRepair =
    visibleIssue && ['precondition', 'collision'].includes(visibleIssue.kind) && repairs < budget

  useEffect(() => {
    if (!storeExperiments(records)) notify('浏览器存储空间不足，请导出重要实验记录。')
  }, [records, notify])
  useEffect(() => {
    try {
      localStorage.setItem('zhixing.capability.v1', JSON.stringify(capability))
      localStorage.setItem('zhixing.skills.v1', JSON.stringify(overrides))
    } catch {
      notify('当前配置仅在本次会话有效，浏览器未允许保存。')
    }
  }, [capability, overrides, notify])
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 4600)
    return () => clearTimeout(id)
  }, [notice])

  const seek = useCallback(
    (value: number) => {
      const t = Math.max(0, Math.min(getDuration(plan), value))
      timeRef.current = t
      setTime(t)
      setStatus('paused')
    },
    [plan],
  )
  const resetRun = useCallback(() => {
    timeRef.current = 0
    setTime(0)
    setStatus('draft')
    setFailure(null)
    savedRun.current = false
  }, [])
  const saveRecord = useCallback(
    (result?: Experiment['status']) => {
      const record: Experiment = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        plan: structuredClone(plan),
        referencePlan: originalPlan ? structuredClone(originalPlan) : null,
        scene: { ...settings },
        capability: { ...activeCapability },
        time: result === 'complete' ? getDuration(plan) : timeRef.current,
        status:
          result ?? (status === 'complete' ? 'complete' : status === 'failed' ? 'failed' : 'draft'),
        repairs,
        note: failure?.title ?? '',
      }
      setRecords((previous) => [record, ...previous].slice(0, 50))
      notify(
        result === 'complete'
          ? '验证通过，实验已自动保存。'
          : '实验快照已保存，可在实验记录中回放。',
      )
    },
    [plan, originalPlan, settings, activeCapability, status, repairs, failure, notify],
  )

  useEffect(() => {
    if (status === 'complete' && !savedRun.current && !replay) {
      savedRun.current = true
      saveRecord('complete')
    }
  }, [status, saveRecord, replay])

  useEffect(() => {
    if (status !== 'running') return
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now(),
        dt = Math.max(0, (now - previous) / 1000) * speed
      previous = now
      let next = Math.min(duration, timeRef.current + dt)
      const issue = getRuntimeIssue(plan, settings, next)
      if (issue) {
        let edge = 0
        for (const s of plan.steps) {
          if (s.id === issue.stepId) {
            edge += s.duration * 0.65
            break
          }
          edge += s.duration
        }
        next = edge
        setFailure(issue)
        setStatus('failed')
        setComparison(true)
        setPanelOpen(true)
        setSelectedStep(issue.stepId)
      } else if (next >= duration) setStatus('complete')
      timeRef.current = next
      setTime(next)
    }, 32)
    return () => clearInterval(timer)
  }, [status, plan, settings, speed, duration])

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setStatus((current) => (current === 'running' ? 'paused' : current))
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden)
  }, [])

  const start = () => {
    if (locked) {
      setStatus('paused')
      return
    }
    if (validation.length) {
      setFailure(validation[0])
      setStatus('failed')
      setPanelOpen(true)
      return
    }
    if (timeRef.current >= duration || status === 'complete') {
      timeRef.current = 0
      setTime(0)
    }
    if (!replay) savedRun.current = false
    setSelectedStep(null)
    setFailure(null)
    setStatus('running')
  }

  const applyRepair = useCallback(() => {
    const issues = failure ? [failure] : validatePlan(plan, settings)
    if (
      !issues.length ||
      issues.some((i) => !['collision', 'precondition'].includes(i.kind)) ||
      repairs >= budget
    )
      return
    const next = repairPlan(plan, issues)
    setReplay(false)
    setOriginalPlan(structuredClone(plan))
    setUndo((old) => [...old, plan].slice(-20))
    setPlan(next)
    setRepairs((n) => n + 1)
    setFailure(null)
    timeRef.current = 0
    setTime(0)
    setSelectedStep(null)
    setComparison(true)
    savedRun.current = false
    setStatus(validatePlan(next, settings).length ? 'draft' : 'running')
    notify(`修复已应用：v${plan.version} → v${next.version}，重新验证动作序列。`)
  }, [failure, plan, settings, repairs, budget, notify])

  useEffect(() => {
    if (status !== 'failed' || mode !== 'auto' || !failure || !canRepair) return
    const timer = window.setTimeout(applyRepair, 1400)
    return () => clearTimeout(timer)
  }, [status, mode, failure, canRepair, applyRepair])

  const editSteps = (steps: Step[]) => {
    if (locked) return
    setUndo((old) => [...old, plan].slice(-20))
    setOriginalPlan(plan)
    setPlan({ ...revisePlan(plan, steps), repaired: false })
    resetRun()
    setReplay(false)
  }
  const generate = () => {
    if (locked) return
    const result = generatePlan(task)
    if (!result.plan) {
      setInputError(result.error!)
      return
    }
    result.plan.steps = result.plan.steps.map((s) => ({
      ...s,
      duration: overrides[s.skill] ?? s.duration,
    }))
    setSnapshotCapability(null)
    setPlan(result.plan)
    setOriginalPlan(null)
    setUndo([])
    setRepairs(0)
    setInputError('')
    setSelectedStep(null)
    setComparison(false)
    setReplay(false)
    resetRun()
    notify('动作计划已生成，前置条件检查已更新。')
  }
  const changeSettings = (next: SceneSettings) => {
    if (locked) return
    setSettings(next)
    setReplay(false)
    resetRun()
  }
  const selectObject = (id: ObjectId) => {
    setSelected(id)
    if (locked) return
    if (id === 'cup-blue' || id === 'cup-white') {
      setTask((previous) =>
        /蓝色杯子|白色杯子|两个杯子|杯子/.test(previous)
          ? previous.replace(/蓝色杯子|白色杯子|两个杯子|杯子/g, objectName(id))
          : `把${objectName(id)}放进右侧柜子`,
      )
      setInputError('')
    }
  }
  const moveStep = (id: string, delta: number) => {
    const index = plan.steps.findIndex((s) => s.id === id),
      target = index + delta
    if (target < 0 || target >= plan.steps.length) return
    const steps = [...plan.steps],
      [step] = steps.splice(index, 1)
    steps.splice(target, 0, step)
    editSteps(steps)
  }
  const focusStep = (step: Step) => {
    const index = plan.steps.findIndex((s) => s.id === step.id)
    setSelectedStep(step.id)
    seek(plan.steps.slice(0, index).reduce((n, s) => n + s.duration, 0) + 0.01)
  }
  const insertSkill = (skill: SkillId) => {
    const object: ObjectId = ['open', 'close'].includes(skill)
      ? 'cabinet'
      : skill === 'home'
        ? 'target'
        : plan.objects[0]
    const step = createStep(skill, object)
    step.duration = overrides[skill] ?? step.duration
    const index = Math.max(
      0,
      plan.steps.findIndex((s) => s.skill === 'home'),
    )
    const steps = [...plan.steps]
    steps.splice(index, 0, step)
    editSteps(steps)
    setSelectedStep(step.id)
    setPage('workbench')
    setModal(null)
    setPanelOpen(true)
    setEditing(step)
  }
  const chooseExample = (kind: 'normal' | 'collision' | 'precondition' | 'multi') => {
    setSnapshotCapability(null)
    const text =
      kind === 'multi'
        ? '先把白色杯子放进柜子，再收纳蓝色杯子，避开障碍，最后关好柜门'
        : DEFAULT_TASK
    const next = generatePlan(text).plan!
    if (kind === 'precondition') next.steps = next.steps.filter((s) => s.skill !== 'open')
    setTask(text)
    setPlan(next)
    setSettings({ ...DEFAULT_SCENE, obstacle: kind === 'collision' || kind === 'multi' })
    setRepairs(0)
    setOriginalPlan(null)
    setUndo([])
    setInputError('')
    setModal(null)
    setComparison(false)
    setPage('workbench')
    setSelectedStep(null)
    setReplay(false)
    resetRun()
    notify('演示场景已载入，可以编辑计划或开始验证。')
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (modal || editing || page !== 'workbench') return
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        generate()
      }
      if (
        e.code === 'Space' &&
        !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault()
        start()
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  })
  useEffect(() => {
    if (timeRef.current <= 0 || !cursor.step) return
    const stepId = cursor.step.id
    const frame = requestAnimationFrame(() => {
      stepListRef.current
        ?.querySelector(`[data-step-id="${stepId}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [cursor.step?.id, locked, status, visibleIssue?.kind])

  const heading = NAV.find((n) => n.id === page)!.name
  const loadExperiment = (record: Experiment, copy: boolean) => {
    const next = copy ? copyExperimentPlan(record) : structuredClone(record.plan)
    setPlan(next)
    setTask(next.task)
    setSettings({ ...record.scene })
    setSnapshotCapability({ ...record.capability })
    setRepairs(copy ? 0 : record.repairs)
    setFailure(null)
    setOriginalPlan(copy ? null : structuredClone(record.referencePlan ?? null))
    setUndo([])
    setSelectedStep(null)
    setInputError('')
    setComparison(false)
    timeRef.current = 0
    setTime(0)
    setStatus(copy ? 'draft' : 'paused')
    setReplay(!copy)
    setPage('workbench')
    savedRun.current = !copy
    if (copy) notify('实验已复制为新任务，保留动作和能力配置。')
  }
  const sceneProps = {
    plan,
    referencePlan: originalPlan,
    time,
    settings,
    selected,
    onSelect: selectObject,
    onTargetChange: (offset: number) => changeSettings({ ...settings, targetOffset: offset }),
    comparison,
    reach,
    reset: cameraReset,
    locked,
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            setPage('workbench')
          }}
          aria-label="知行工作台"
        >
          <svg viewBox="0 0 36 32" aria-hidden="true">
            <path d="M5 24 18 8 31 24" />
            <circle cx="5" cy="24" r="3" />
            <circle cx="18" cy="8" r="3" />
            <circle cx="31" cy="24" r="3" />
          </svg>
          <strong>知行</strong>
        </a>
        <span className="top-divider" />
        <span className="top-title">{heading === '工作台' ? '具身任务工作台' : heading}</span>
        <div className="top-actions">
          <span className="local-indicator">
            <span className="status-dot" />
            本地工作区
          </span>
          <span className="prototype-label">原型演示</span>
          <button className="button compact" disabled={locked} onClick={() => setModal('settings')}>
            <Settings2 size={17} />
            <span>环境设置</span>
          </button>
          <button className="button compact" onClick={() => saveRecord()}>
            <Save size={17} />
            <span>保存实验</span>
          </button>
          <IconButton label="使用帮助" onClick={() => setModal('help')}>
            <CircleHelp size={20} />
          </IconButton>
        </div>
      </header>
      <aside className="nav-rail">
        <nav aria-label="主导航">
          {NAV.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => {
                if (locked) setStatus('paused')
                setPage(id)
              }}
            >
              <Icon size={24} strokeWidth={1.65} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <span className="rail-sign">
          ZX<span>01</span>
        </span>
      </aside>
      <main className="main-content">
        {page === 'workbench' && (
          <div className="workspace">
            <div className="workspace-heading">
              <div>
                <div className="breadcrumb">
                  桌面操作<span>/</span>
                  {replay ? '实验回放' : '新建实验'}
                  <span className="experiment-code">EXP · {plan.id.slice(0, 4).toUpperCase()}</span>
                </div>
                <h1>
                  {plan.title}
                  <span className={`run-badge ${status}`}>
                    <span className="status-dot" />
                    {STATUS_LABEL[status]}
                  </span>
                </h1>
              </div>
              <div className="workspace-actions">
                <span className="body-chip">
                  <Bot size={17} />
                  {activeCapability.name}
                </span>
                <button
                  className="button compact"
                  disabled={locked}
                  onClick={() => setModal('examples')}
                >
                  <Sparkles size={17} />
                  示例任务
                </button>
                <button
                  className="button compact panel-toggle"
                  onClick={() => setPanelOpen(!panelOpen)}
                >
                  <Layers3 size={17} />
                  动作计划
                </button>
              </div>
            </div>
            <div className="workbench-grid">
              <section ref={stageRef} className="scene-stage" aria-label="三维任务空间">
                <SceneBoundary>
                  <Suspense
                    fallback={
                      <div className="loading-panel">
                        <LoaderCircle className="spin" size={24} />
                        加载三维任务空间…
                      </div>
                    }
                  >
                    <Scene {...sceneProps} />
                  </Suspense>
                </SceneBoundary>
                <div className="scene-top-left">
                  <span className="scene-title">
                    <span className="live-square" />
                    任务空间
                  </span>
                  <span className="scene-version">DESK / 01</span>
                </div>
                <div className="scene-tools">
                  <IconButton
                    label="显示可达范围"
                    className={reach ? 'active' : ''}
                    onClick={() => setReach(!reach)}
                  >
                    <Crosshair size={19} />
                  </IconButton>
                  <IconButton
                    label="对比修复路径"
                    className={comparison ? 'active' : ''}
                    onClick={() => setComparison(!comparison)}
                  >
                    <GitCompareArrows size={19} />
                  </IconButton>
                  <span className="tool-separator" />
                  <IconButton label="恢复默认视角" onClick={() => setCameraReset((n) => n + 1)}>
                    <Focus size={19} />
                  </IconButton>
                  <IconButton
                    label="全屏场景"
                    onClick={() => {
                      if (document.fullscreenElement) void document.exitFullscreen()
                      else
                        void stageRef.current
                          ?.requestFullscreen()
                          .catch(() => notify('当前浏览器暂不支持全屏。'))
                    }}
                  >
                    <Expand size={18} />
                  </IconButton>
                </div>
                <div className="object-dock">
                  <span>场景对象</span>
                  {OBJECTS.filter((o) => o.id !== 'target').map((o) => (
                    <button
                      key={o.id}
                      onClick={() => selectObject(o.id)}
                      className={selected === o.id ? 'active' : ''}
                    >
                      <i style={{ background: o.color }} />
                      {o.name}
                      {selected === o.id && <Check size={13} />}
                    </button>
                  ))}
                </div>
                {selected === 'target' && (
                  <div className="target-editor">
                    <label>
                      目标偏移 <strong>{Math.round(settings.targetOffset * 100)} cm</strong>
                      <input
                        aria-label="目标位置偏移"
                        type="range"
                        min="-5"
                        max="5"
                        value={Math.round(settings.targetOffset * 100)}
                        disabled={locked}
                        onChange={(e) =>
                          changeSettings({
                            ...settings,
                            targetOffset: Number(e.target.value) / 100,
                          })
                        }
                      />
                    </label>
                    <small>也可直接拖动场景中的蓝色目标区域</small>
                  </div>
                )}
                <div className="scene-bottom">
                  <div className="axis-mark">
                    <span>Y</span>
                    <i />
                    <b>X</b>
                  </div>
                  <span className="scene-instruction">拖动旋转 · 滚轮缩放 · 点击选择对象</span>
                  {comparison && (
                    <div className="path-legend">
                      {originalPlan && (
                        <span>
                          <i />
                          原路径
                        </span>
                      )}
                      <span className="current-path">
                        <i />
                        {originalPlan ? '当前路径' : '计划路径'}
                      </span>
                    </div>
                  )}
                </div>
                {locked && (
                  <span className="scene-running">
                    <span className="pulse-dot" />
                    {cursor.step?.label}
                  </span>
                )}
              </section>

              <section className="timeline" aria-label="动作回放">
                <IconButton
                  label={locked ? '暂停回放' : '播放回放'}
                  className="play-control"
                  onClick={start}
                  disabled={!plan.steps.length}
                >
                  {locked ? (
                    <Pause size={21} fill="currentColor" />
                  ) : (
                    <Play size={21} fill="currentColor" />
                  )}
                </IconButton>
                <IconButton
                  label="上一步"
                  onClick={() => {
                    const i = Math.max(0, cursor.index - 1)
                    focusStep(plan.steps[i])
                  }}
                  disabled={!plan.steps.length}
                >
                  <SkipBack size={17} />
                </IconButton>
                <span className="time-readout">
                  <strong>{formatTime(time)}</strong>
                  <span>/ {formatTime(duration)}</span>
                </span>
                <div className="timeline-track">
                  <div className="timeline-marks">
                    {plan.steps.map((s, i) => (
                      <button
                        key={s.id}
                        onClick={() => focusStep(s)}
                        style={{
                          left: `${(plan.steps.slice(0, i).reduce((n, x) => n + x.duration, 0) / Math.max(1, duration)) * 100}%`,
                        }}
                        title={s.label}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    aria-label="回放时间"
                    min="0"
                    max={duration || 1}
                    step="0.01"
                    value={time}
                    onChange={(e) => seek(Number(e.target.value))}
                    style={
                      {
                        '--progress': `${(time / Math.max(1, duration)) * 100}%`,
                      } as React.CSSProperties
                    }
                  />
                </div>
                <IconButton
                  label="下一步"
                  onClick={() => {
                    const i = Math.min(plan.steps.length - 1, cursor.index + 1)
                    focusStep(plan.steps[i])
                  }}
                  disabled={!plan.steps.length}
                >
                  <SkipForward size={17} />
                </IconButton>
                <select
                  aria-label="回放速度"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  <option value="1">1×</option>
                  <option value="2">2×</option>
                  <option value="4">4×</option>
                </select>
                <IconButton label="重置回放" onClick={resetRun}>
                  <RotateCcw size={17} />
                </IconButton>
              </section>

              <section className={`task-composer ${inputError ? 'has-error' : ''}`}>
                <div className="composer-heading">
                  <span>
                    <Sparkles size={16} />
                    任务指令
                  </span>
                  <div className="object-tags">
                    {plan.objects.map((o) => (
                      <button key={o} onClick={() => setSelected(o)}>
                        {objectName(o)}
                      </button>
                    ))}
                    <span className="composer-target">
                      <ArrowRight size={13} />
                      右侧柜子
                    </span>
                  </div>
                  <span className="keyboard-hint">Ctrl ↵</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    generate()
                  }}
                >
                  <textarea
                    aria-label="任务指令"
                    value={task}
                    maxLength={500}
                    rows={1}
                    disabled={locked}
                    onChange={(e) => {
                      setTask(e.target.value)
                      setInputError('')
                    }}
                    placeholder="描述一个任务，或点击场景添加对象…"
                  />
                  <button
                    className="button primary generate-button"
                    disabled={locked}
                    type="submit"
                  >
                    <Sparkles size={17} />
                    <span>生成计划</span>
                    <ArrowRight size={17} />
                  </button>
                </form>
                {inputError && (
                  <p className="input-error" role="alert">
                    <TriangleAlert size={15} />
                    {inputError}
                  </p>
                )}
              </section>

              {panelOpen && (
                <button
                  className="panel-scrim"
                  aria-label="收起动作计划"
                  onClick={() => setPanelOpen(false)}
                />
              )}
              <aside className={`plan-panel ${panelOpen ? 'open' : ''}`} aria-label="动作计划">
                <div className="plan-header">
                  <div>
                    <h2>
                      动作计划 <span>{plan.steps.length}</span>
                    </h2>
                    <p>
                      {validation.length
                        ? `${validation.length} 项约束需要处理`
                        : status === 'failed'
                          ? '执行中发现约束冲突'
                          : '前置条件就绪，可开始验证'}
                    </p>
                  </div>
                  <div>
                    <span className="version">v{plan.version}</span>
                    <IconButton
                      className="panel-close"
                      label="关闭动作计划面板"
                      onClick={() => setPanelOpen(false)}
                    >
                      <X size={19} />
                    </IconButton>
                  </div>
                </div>
                <div className="plan-subheader">
                  <span>执行顺序</span>
                  <div>
                    <IconButton
                      label="撤销计划编辑"
                      disabled={locked || !undo.length}
                      onClick={() => {
                        const previous = undo.at(-1)!
                        setUndo(undo.slice(0, -1))
                        setPlan(revisePlan(plan, previous.steps))
                        resetRun()
                      }}
                    >
                      <Undo2 size={16} />
                    </IconButton>
                    <IconButton label="添加动作" disabled={locked} onClick={() => setModal('add')}>
                      <Plus size={18} />
                    </IconButton>
                  </div>
                </div>
                <div className="step-list" ref={stepListRef}>
                  {plan.steps.map((step, index) => {
                    const stepEnd = plan.steps
                      .slice(0, index + 1)
                      .reduce((n, s) => n + s.duration, 0)
                    const done = time >= stepEnd,
                      active = cursor.index === index && time > 0,
                      bad = visibleIssue?.stepId === step.id
                    return (
                      <div
                        key={step.id}
                        data-step-id={step.id}
                        className={`step-row ${selectedStep === step.id || active ? 'selected' : ''} ${bad ? 'invalid' : ''} ${done ? 'done' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`步骤 ${index + 1} ${step.label}`}
                        onClick={() => focusStep(step)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.target === e.currentTarget) focusStep(step)
                        }}
                        draggable={!locked}
                        onDragStart={(e) => {
                          dragStep.current = step.id
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          const from = plan.steps.findIndex((s) => s.id === dragStep.current)
                          if (from >= 0) moveStep(plan.steps[from].id, index - from)
                          dragStep.current = null
                        }}
                      >
                        <span className={`step-number ${done ? 'done' : ''}`}>
                          {bad ? (
                            <TriangleAlert size={16} />
                          ) : done ? (
                            <Check size={16} />
                          ) : (
                            String(index + 1).padStart(2, '0')
                          )}
                        </span>
                        <div className="step-copy">
                          <strong>{step.label}</strong>
                          <span>
                            {['open', 'close'].includes(step.skill)
                              ? '柜门 · 滑轨操作'
                              : step.skill === 'home'
                                ? '恢复待机姿态'
                                : `${objectName(step.object)} · ${step.duration}s`}
                            {step.skill === 'approach' &&
                              ` · ${Math.round(step.params.clearance * 100)}cm`}
                          </span>
                        </div>
                        <div className="step-actions" onClick={(e) => e.stopPropagation()}>
                          <IconButton
                            label={`编辑动作 ${index + 1}`}
                            disabled={locked}
                            onClick={() => setEditing(step)}
                          >
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton
                            label={`上移动作 ${index + 1}`}
                            disabled={locked || index === 0}
                            onClick={() => moveStep(step.id, -1)}
                          >
                            <ArrowUp size={14} />
                          </IconButton>
                          <IconButton
                            label={`下移动作 ${index + 1}`}
                            disabled={locked || index === plan.steps.length - 1}
                            onClick={() => moveStep(step.id, 1)}
                          >
                            <ArrowDown size={14} />
                          </IconButton>
                          <IconButton
                            label={`删除动作 ${index + 1}`}
                            disabled={locked}
                            onClick={() => editSteps(plan.steps.filter((s) => s.id !== step.id))}
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </div>
                        <GripVertical size={13} className="drag-grip" />
                      </div>
                    )
                  })}
                  {!plan.steps.length && (
                    <div className="empty-plan">
                      <Layers3 size={28} />
                      <p>添加动作，或重新生成计划。</p>
                    </div>
                  )}
                </div>
                {visibleIssue && (
                  <div
                    className={`diagnosis ${visibleIssue.kind === 'collision' ? 'collision' : ''}`}
                    data-testid="diagnostic"
                  >
                    <div className="diagnosis-title">
                      <TriangleAlert size={18} />
                      <strong>
                        {visibleIssue.kind === 'collision' ? '验证发现碰撞' : '执行前检查'}
                      </strong>
                      <span>
                        {visibleIssue.stepId
                          ? `${plan.steps.findIndex((s) => s.id === visibleIssue.stepId) + 1}`.padStart(
                              2,
                              '0',
                            )
                          : '约束'}
                      </span>
                    </div>
                    <h3>{visibleIssue.title}</h3>
                    <p>{visibleIssue.detail}</p>
                    <div className="repair-suggestion">
                      <Sparkles size={15} />
                      {visibleIssue.fix}
                    </div>
                    {repairs >= budget && (
                      <p className="budget-note">已达到 {budget} 次修复预算，请调整计划或目标。</p>
                    )}
                  </div>
                )}
                {plan.repaired && originalPlan && !visibleIssue && (
                  <button className="repair-summary" onClick={() => setModal('changes')}>
                    <CheckCheck size={17} />
                    <span>修复已应用 · 计划 v{plan.version}</span>
                    <ChevronRight size={15} />
                  </button>
                )}
                <div className="plan-footer">
                  <div className="repair-mode">
                    <span>修复模式</span>
                    <div role="group" aria-label="修复模式">
                      <button
                        className={mode === 'auto' ? 'active' : ''}
                        onClick={() => setMode('auto')}
                      >
                        自动
                      </button>
                      <button
                        className={mode === 'review' ? 'active' : ''}
                        onClick={() => setMode('review')}
                      >
                        审核
                      </button>
                    </div>
                  </div>
                  {status === 'complete' && (
                    <div className="completion-line">
                      <CheckCheck size={17} />
                      {replay ? '历史回放完成' : '目标完成，实验已保存'}
                    </div>
                  )}
                  {canRepair && status === 'failed' ? (
                    <button className="button primary run-button" onClick={applyRepair}>
                      <Sparkles size={18} />
                      {mode === 'auto' ? '立即修复并验证' : '应用修复并验证'}
                    </button>
                  ) : (
                    <button
                      className="button primary run-button"
                      disabled={!plan.steps.length}
                      onClick={start}
                    >
                      {locked ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
                      {locked
                        ? '暂停验证'
                        : replay
                          ? status === 'complete'
                            ? '重新回放'
                            : '继续回放'
                          : status === 'complete'
                            ? '重新验证'
                            : status === 'paused'
                              ? '继续验证'
                              : '开始验证'}
                    </button>
                  )}
                  <div className="plan-footer-meta">
                    <span>
                      修复预算 {repairs} / {budget}
                    </span>
                    <span>
                      {locked
                        ? '运行中'
                        : mode === 'auto' && status === 'failed' && canRepair
                          ? '自动修复即将继续…'
                          : '示例环境 · 可追溯'}
                    </span>
                    {locked && (
                      <IconButton
                        label="停止验证"
                        onClick={() => {
                          setStatus('paused')
                          notify('验证已停止，现场状态已保留。')
                        }}
                      >
                        <Square size={12} />
                      </IconButton>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}
        {page === 'robots' && (
          <SceneBoundary>
            <RobotsPage
              capability={capability}
              onSave={(value) => {
                setCapability(value)
                setSnapshotCapability(null)
                setReplay(false)
                resetRun()
                notify('本体能力已更新。')
              }}
              onUse={() => {
                setSnapshotCapability(null)
                setReplay(false)
                setPage('workbench')
                resetRun()
              }}
              notify={notify}
            />
          </SceneBoundary>
        )}
        {page === 'skills' && (
          <SkillsPage
            overrides={overrides}
            onDuration={(id, value) => setOverrides((old) => ({ ...old, [id]: value }))}
            onInsert={insertSkill}
            onPreview={(id) => {
              setReplay(false)
              setSnapshotCapability(null)
              setUndo([])
              savedRun.current = false
              const next = generatePlan('把蓝色杯子放进柜子，避开障碍，最后关好柜门').plan!
              setPlan(next)
              setTask(next.task)
              setFailure(null)
              setOriginalPlan(null)
              setRepairs(0)
              const index = next.steps.findIndex((s) => s.skill === id)
              const t = next.steps.slice(0, Math.max(0, index)).reduce((n, s) => n + s.duration, 0)
              timeRef.current = t
              setTime(t)
              setSelectedStep(next.steps[index]?.id ?? null)
              setStatus('paused')
              setPage('workbench')
              notify('已定位到该动作，可播放或拖动时间轴预览。')
            }}
          />
        )}
        {page === 'experiments' && (
          <ExperimentsPage
            records={records}
            onReplay={(r) => loadExperiment(r, false)}
            onCopy={(r) => loadExperiment(r, true)}
            onNew={() => chooseExample('normal')}
          />
        )}
      </main>

      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{notice.text}</span>
          <IconButton label="关闭提示" onClick={() => setNotice(null)}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {editing && (
        <StepEditor
          key={editing.id}
          step={editing}
          onClose={() => setEditing(null)}
          onSave={(step) => editSteps(plan.steps.map((s) => (s.id === step.id ? step : s)))}
        />
      )}
      {modal === 'settings' && (
        <Dialog title="场景与验证设置" onClose={() => setModal(null)}>
          <p className="dialog-intro">配置桌面收纳环境，并观察规划与修复的变化。</p>
          <label className="toggle-row">
            <div>
              <strong>柜门初始开启</strong>
              <span>用于验证开门前置条件</span>
            </div>
            <input
              type="checkbox"
              checked={settings.cabinetOpen}
              onChange={(e) => changeSettings({ ...settings, cabinetOpen: e.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <div>
              <strong>启用柜口障碍</strong>
              <span>低于 8 cm 的接近高度会触发示例碰撞</span>
            </div>
            <input
              type="checkbox"
              checked={settings.obstacle}
              onChange={(e) => changeSettings({ ...settings, obstacle: e.target.checked })}
            />
          </label>
          <label className="field">
            目标偏移（cm）
            <input
              type="range"
              min="-5"
              max="5"
              value={Math.round(settings.targetOffset * 100)}
              onChange={(e) =>
                changeSettings({ ...settings, targetOffset: Number(e.target.value) / 100 })
              }
            />
            <span className="range-value">{Math.round(settings.targetOffset * 100)} cm</span>
          </label>
          <label className="field">
            最大自动修复次数
            <input
              type="number"
              min="1"
              max="5"
              value={budget}
              onChange={(e) => setBudget(Math.max(1, Math.min(5, Number(e.target.value))))}
            />
          </label>
          <div className="dialog-actions">
            <button className="button primary" onClick={() => setModal(null)}>
              完成设置
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'examples' && (
        <Dialog title="选择一个起点" onClose={() => setModal(null)} wide>
          <p className="dialog-intro">每个场景都可以继续编辑任务、动作和目标。</p>
          <div className="example-grid">
            {[
              {
                id: 'normal',
                title: '一次顺利的收纳',
                desc: '柜口无障碍，观察完整的开门、抓取和放置。',
                badge: '基础流程',
                icon: CheckCheck,
              },
              {
                id: 'collision',
                title: '发现问题，修复路径',
                desc: '在接近柜口时发现碰撞，比较修复前后路径。',
                badge: '验证与修复',
                icon: GitCompareArrows,
              },
              {
                id: 'precondition',
                title: '计划少了一步',
                desc: '尝试执行未包含开门动作的计划，查看前置检查。',
                badge: '约束检查',
                icon: ShieldIcon,
              },
              {
                id: 'multi',
                title: '有顺序的双杯收纳',
                desc: '先收白杯，再收蓝杯，避开障碍并关好柜门。',
                badge: '多步骤任务',
                icon: Layers3,
              },
            ].map((item) => (
              <button
                className="example-card"
                key={item.id}
                onClick={() =>
                  chooseExample(item.id as 'normal' | 'collision' | 'precondition' | 'multi')
                }
              >
                <item.icon size={25} />
                <span>{item.badge}</span>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {modal === 'add' && (
        <Dialog title="添加一个动作" onClose={() => setModal(null)}>
          <div className="add-skill-list">
            {SKILLS.map((skill) => (
              <button key={skill.id} onClick={() => insertSkill(skill.id)}>
                <span>
                  <strong>{skill.name}</strong>
                  <small>{skill.preconditions}</small>
                </span>
                <Plus size={18} />
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {modal === 'changes' && (
        <Dialog title="查看修复差异" onClose={() => setModal(null)}>
          <p className="dialog-intro">
            计划 v{originalPlan?.version ?? plan.version - 1} → v{plan.version} · 保留原始任务目标
          </p>
          <div className="change-list">
            {plan.steps
              .filter(
                (s) =>
                  !originalPlan?.steps.some(
                    (old) => old.id === s.id && old.params.clearance === s.params.clearance,
                  ),
              )
              .map((s) => (
                <div key={s.id}>
                  <span className="change-marker">+</span>
                  <div>
                    <strong>{s.label}</strong>
                    <p>
                      {originalPlan?.steps.some((old) => old.id === s.id)
                        ? `接近高度调整为 ${Math.round(s.params.clearance * 100)} cm`
                        : '补入动作，满足执行前置条件'}
                    </p>
                  </div>
                </div>
              ))}
          </div>
          <div className="dialog-actions">
            <button
              className="button primary"
              onClick={() => {
                setComparison(true)
                setModal(null)
              }}
            >
              在场景中比较路径
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'help' && (
        <Dialog title="开始使用知行" onClose={() => setModal(null)}>
          <ol className="help-list">
            <li>
              <strong>描述任务</strong>
              <p>输入杯子收纳要求，或点击场景中的物体指定对象。</p>
            </li>
            <li>
              <strong>检查与编辑</strong>
              <p>点击动作定位回放，使用编辑、上下移动或拖动调整计划。</p>
            </li>
            <li>
              <strong>运行与修复</strong>
              <p>开始验证后观察连续动作。失败时，可自动修复或逐步审核。</p>
            </li>
            <li>
              <strong>保存与复现</strong>
              <p>验证通过会自动保存，也可随时保存草稿和导出实验。</p>
            </li>
          </ol>
          <div className="help-note">
            <strong>原型演示环境</strong>
            <p>
              任务在已支持的对象与技能范围内解析，动作与约束由本地规则驱动。几何资产来自当前机器人模型，未连接真实规划模型或物理仿真器。
            </p>
          </div>
          <div className="dialog-actions">
            <button className="button primary" onClick={() => setModal(null)}>
              开始探索
              <ArrowRight size={17} />
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
function ShieldIcon({ size }: { size?: number }) {
  return <CheckCheck size={size} />
}

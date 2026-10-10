import { lazy, Suspense, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FileJson,
  FlaskConical,
  Layers3,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react'
import { DEFAULT_SCENE, SKILLS, type SkillId } from './domain'
import { type Capability, type Experiment, validCapability } from './storage'
import { Dialog, downloadJson, formatTime } from './ui'
const Scene = lazy(() => import('./Scene'))

export function RobotsPage({
  capability,
  onSave,
  onUse,
  notify,
}: {
  capability: Capability
  onSave: (v: Capability) => void
  onUse: () => void
  notify: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(capability)
  const [reach, setReach] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="library-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">EMBODIMENT LIBRARY</div>
          <h1>机器人能力</h1>
          <p>让规划始于本体真正具备的能力。</p>
        </div>
        <button className="button" onClick={() => fileRef.current?.click()}>
          <Upload size={18} />
          导入能力描述
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="导入能力 JSON"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              if (f.size > 100_000) throw new Error()
              const v: unknown = JSON.parse(await f.text())
              if (!validCapability(v)) throw new Error()
              onSave(v)
              notify('能力描述已导入，新验证将使用当前配置。')
            } catch {
              notify('文件格式无效。请使用导出的能力描述模板，大小不超过 100 KB。')
            }
            e.target.value = ''
          }}
        />
      </div>
      <div className="robot-layout">
        <div className="robot-showcase">
          <div className="showcase-top">
            <span className="small-label">当前本体</span>
            <span className="pill subtle">
              <span className="status-dot" />
              几何已接入
            </span>
          </div>
          <Suspense fallback={<div className="loading-panel">加载本体模型…</div>}>
            <Scene
              plan={null}
              time={0}
              settings={DEFAULT_SCENE}
              selected={null}
              onSelect={() => {}}
              onTargetChange={() => {}}
              comparison={false}
              reach={reach}
              reset={0}
              locked
              robotOnly
            />
          </Suspense>
          <div className="showcase-caption">
            <div>
              <h2>{capability.name}</h2>
              <span>人形机器人 · 原始 OBJ 适配</span>
            </div>
            <button className={`button ${reach ? 'active' : ''}`} onClick={() => setReach(!reach)}>
              <Layers3 size={18} />
              可达空间
            </button>
          </div>
        </div>
        <div className="robot-details">
          <div className="section-heading">
            <h2>能力概览</h2>
            <span className="version">v{capability.version}.0</span>
          </div>
          <p className="muted">用于任务预检的示例配置，真实本体接入后可替换为标定数据。</p>
          <div className="capability-grid">
            <div>
              <span>示例负载</span>
              <strong>
                {capability.payload}
                <small>kg</small>
              </strong>
            </div>
            <div>
              <span>手臂工作范围</span>
              <strong>
                {capability.reach.toFixed(2)}
                <small>m</small>
              </strong>
            </div>
            <div>
              <span>可用技能</span>
              <strong>
                8<small>项</small>
              </strong>
            </div>
            <div>
              <span>模型三角面</span>
              <strong>
                80<small>k</small>
              </strong>
            </div>
          </div>
          <div className="capability-note">
            <ShieldCheck size={21} />
            <div>
              <strong>能力状态：待真机标定</strong>
              <p>当前关节由几何部件建立，用于连续动作演示。</p>
            </div>
          </div>
          <h3>已适配的操作</h3>
          <div className="skill-chips">
            {SKILLS.map((s) => (
              <span key={s.id}>
                <Check size={14} />
                {s.name}
              </span>
            ))}
          </div>
          <div className="detail-actions">
            <button
              className="button"
              onClick={() => {
                setDraft(capability)
                setEditing(true)
              }}
            >
              <Settings2 size={18} />
              编辑能力
            </button>
            <button className="button primary" onClick={onUse}>
              用于新任务
              <ArrowRight size={18} />
            </button>
          </div>
          <button
            className="text-button"
            onClick={() => downloadJson('知行-能力描述.json', capability)}
          >
            <FileJson size={17} />
            导出能力描述模板
          </button>
        </div>
      </div>
      {editing && (
        <Dialog title="编辑本体能力" onClose={() => setEditing(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!validCapability(draft)) return
              onSave({ ...draft, version: capability.version + 1 })
              setEditing(false)
            }}
          >
            <label className="field">
              本体名称
              <input
                value={draft.name}
                maxLength={60}
                required
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="field">
              示例负载（kg）
              <input
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                value={draft.payload}
                required
                onChange={(e) => setDraft({ ...draft, payload: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              示例工作范围（m）
              <input
                type="number"
                min="0.3"
                max="1"
                step="0.01"
                value={draft.reach}
                required
                onChange={(e) => setDraft({ ...draft, reach: Number(e.target.value) })}
              />
            </label>
            <p className="field-help">新验证会检查负载和目标范围。历史实验保留原有配置。</p>
            <div className="dialog-actions">
              <button type="button" className="button" onClick={() => setEditing(false)}>
                取消
              </button>
              <button className="button primary" type="submit">
                保存能力配置
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}

export function SkillsPage({
  overrides,
  onDuration,
  onInsert,
  onPreview,
}: {
  overrides: Partial<Record<SkillId, number>>
  onDuration: (id: SkillId, n: number) => void
  onInsert: (id: SkillId) => void
  onPreview: (id: SkillId) => void
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('全部'),
    [selected, setSelected] = useState<SkillId>('grasp')
  const skill = SKILLS.find((s) => s.id === selected)!
  const list = SKILLS.filter(
    (s) =>
      (category === '全部' || s.category === category) &&
      `${s.name}${s.description}`.includes(query),
  )
  return (
    <div className="library-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">REUSABLE SKILLS</div>
          <h1>技能库</h1>
          <p>把每一次动作，变成可以复用的能力。</p>
        </div>
        <span className="pill subtle">
          <span className="status-dot" />8 项桌面操作技能
        </span>
      </div>
      <div className="skills-layout">
        <section className="skill-browser">
          <div className="search-field">
            <Search size={20} />
            <input
              placeholder="搜索技能或能力…"
              aria-label="搜索技能"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="清空搜索" onClick={() => setQuery('')}>
                <X size={17} />
              </button>
            )}
          </div>
          <div className="filter-tabs">
            {['全部', '感知', '操作', '运动'].map((c) => (
              <button
                key={c}
                className={category === c ? 'active' : ''}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="skill-list">
            {list.map((s) => (
              <button
                key={s.id}
                className={`skill-row ${s.id === selected ? 'selected' : ''}`}
                onClick={() => setSelected(s.id)}
              >
                <span className="skill-symbol">
                  {s.category === '感知' ? (
                    <Search size={22} />
                  ) : s.category === '运动' ? (
                    <ArrowRight size={22} />
                  ) : (
                    <Bot size={22} />
                  )}
                </span>
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.category} · H-01 已适配</small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
            {!list.length && (
              <div className="empty-state">
                <Search size={32} />
                <h3>没有匹配的技能</h3>
                <p>试试“抓取”“运动”或清空筛选。</p>
                <button
                  className="button"
                  onClick={() => {
                    setQuery('')
                    setCategory('全部')
                  }}
                >
                  清空筛选
                </button>
              </div>
            )}
          </div>
        </section>
        <section className="skill-detail">
          <div className="detail-kicker">
            <span>{skill.category}技能</span>
            <span className="version">v1.0</span>
          </div>
          <div className="large-skill-icon">
            <Bot size={40} />
          </div>
          <h2>{skill.name}</h2>
          <p className="skill-description">{skill.description}</p>
          <div className="skill-metadata">
            <div>
              <span>前置条件</span>
              <strong>{skill.preconditions}</strong>
            </div>
            <div>
              <span>执行效果</span>
              <strong>{skill.effect}</strong>
            </div>
            <div>
              <span>适配本体</span>
              <strong>知行 H-01 · 几何演示模型</strong>
            </div>
          </div>
          <label className="field inline-field">
            默认动作时长
            <span>
              <input
                type="number"
                aria-label="默认动作时长"
                min="0.5"
                max="8"
                step="0.5"
                value={overrides[skill.id] ?? skill.defaultDuration}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (n >= 0.5 && n <= 8) onDuration(skill.id, n)
                }}
              />
              秒
            </span>
          </label>
          <p className="field-help">用于新生成和新插入的动作，保留既有实验的时间配置。</p>
          <div className="detail-actions">
            <button className="button" onClick={() => onPreview(skill.id)}>
              <Play size={17} />
              预览动作
            </button>
            <button className="button primary" onClick={() => onInsert(skill.id)}>
              <Plus size={18} />
              插入当前计划
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

export function ExperimentsPage({
  records,
  onReplay,
  onCopy,
  onNew,
}: {
  records: Experiment[]
  onReplay: (r: Experiment) => void
  onCopy: (r: Experiment) => void
  onNew: () => void
}) {
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all')
  const list = records.filter(
    (r) => r.plan.task.includes(query) && (filter === 'all' || r.status === filter),
  )
  const labels = { complete: '验证通过', failed: '验证未通过', draft: '实验草稿' }
  return (
    <div className="library-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">EXPERIMENT NOTEBOOK</div>
          <h1>实验记录</h1>
          <p>每一次执行，都有迹可循。</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={19} />
          创建新实验
        </button>
      </div>
      <div className="experiment-summary">
        <div>
          <FlaskConical size={24} />
          <span>
            已保存实验<strong>{records.length}</strong>
          </span>
        </div>
        <div>
          <ShieldCheck size={24} />
          <span>
            验证通过<strong>{records.filter((r) => r.status === 'complete').length}</strong>
          </span>
        </div>
        <div>
          <SlidersHorizontal size={24} />
          <span>
            修复记录<strong>{records.reduce((n, r) => n + r.repairs, 0)}</strong>
          </span>
        </div>
        <p>记录保存在当前浏览器，可导出单次实验快照。</p>
      </div>
      <div className="table-toolbar">
        <div className="search-field">
          <Search size={20} />
          <input
            placeholder="搜索任务内容…"
            aria-label="搜索实验"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="筛选实验状态"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部状态</option>
          <option value="complete">验证通过</option>
          <option value="failed">验证未通过</option>
          <option value="draft">实验草稿</option>
        </select>
      </div>
      {list.length ? (
        <div className="experiment-table">
          <div className="table-header">
            <span>任务 / 版本</span>
            <span>状态</span>
            <span>时长</span>
            <span>保存时间</span>
            <span>操作</span>
          </div>
          {list.map((r) => (
            <div className="experiment-row" key={r.id}>
              <div className="experiment-name">
                <strong>{r.plan.title}</strong>
                <span title={r.plan.task}>{r.plan.task}</span>
                <small>
                  v{r.plan.version} · {r.repairs} 次修复
                </small>
              </div>
              <span className={`result-badge ${r.status}`}>{labels[r.status]}</span>
              <span className="mono">
                <Clock3 size={15} />
                {formatTime(r.time)}
              </span>
              <span className="date-cell">
                {new Date(r.date).toLocaleDateString('zh-CN')}
                <small>
                  {new Date(r.date).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              </span>
              <div className="table-actions">
                <button className="button compact" onClick={() => onReplay(r)}>
                  <Play size={16} />
                  回放
                </button>
                <button
                  className="icon-button"
                  aria-label={`复制实验 ${r.plan.title}`}
                  title="复制为新任务"
                  onClick={() => onCopy(r)}
                >
                  <Copy size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`导出实验 ${r.plan.title}`}
                  title="导出实验快照"
                  onClick={() =>
                    downloadJson(`知行-实验-${r.id.slice(0, 8)}.json`, {
                      schemaVersion: 1,
                      environment: 'prototype',
                      ...r,
                    })
                  }
                >
                  <ArrowDownToLine size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state notebook-empty">
          <FlaskConical size={42} />
          <h2>{records.length ? '没有匹配的实验' : '从第一个实验开始'}</h2>
          <p>
            {records.length
              ? '调整搜索内容或状态筛选。'
              : '完成一次验证，或将工作台中的草稿保存为实验。'}
          </p>
          <button
            className="button"
            onClick={
              records.length
                ? () => {
                    setQuery('')
                    setFilter('all')
                  }
                : onNew
            }
          >
            {records.length ? '清空筛选' : '进入任务工作台'}
            <ArrowRight size={17} />
          </button>
        </div>
      )}
    </div>
  )
}

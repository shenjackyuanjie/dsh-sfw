/**
 * dsh-sfw 配置卡片的表单模型：在 `dsh-sfw` settings namespace 上分阶段编辑，
 * 保存时一次性写入。与 DSH 插件配置页的其他卡片（bash / agent-loop）共享
 * 相同的交互契约：输入只进入草稿，保存才落盘；每个控件渲染「当前草稿」，
 * 保存未接受的字段会保留草稿供用户修正。
 *
 * 字段用「路径」寻址：顶层字段（enabled / productName / wordmark）与嵌套
 * overlays 字段共用同一模型，`settings.mutate` 的多段 path 一次写全。
 * @module @shenjack/dsh-sfw/client/config-form
 */

import type { SettingsScopeSeam, SettingsPathOpSeam } from './seams.ts'

/** 本插件在宿主 settings 服务中注册的 namespace。 */
export const SFW_NAMESPACE = 'dsh-sfw'

/** 一个字段的存储值 ↔ 草稿文本转换。 */
export interface SfwFieldSpec {
  /** 表单内字段名（稳定 id）。 */
  field: string
  /** 写入 settings namespace 的路径。 */
  path: readonly string[]
  /** 把存储值格式化为控件展示文本。 */
  format: (value: unknown) => string
  /**
   * 把草稿文本解析为一次写；空串返回 clear；无法接受时返回 undefined
   * （会使保存被阻止，而不是丢弃该编辑）。
   */
  parse: (text: string) => { kind: 'set'; value: unknown } | { kind: 'clear' } | undefined
}

/** 一个字段作为控件渲染所需的状态。 */
export interface SfwFieldState {
  /** 控件展示的草稿文本。 */
  text: string
  /** 保存后是否会在用户层留下该字段（草稿自己回答，预览保存结果）。 */
  overridden: boolean
  /** 草稿是否不是该字段可接受的值（会阻止保存）。 */
  invalid: boolean
}

/** 卡片整体表单状态。 */
export interface SfwCardSnapshot {
  /** namespace 未对该客户端暴露时卡片整体不渲染。 */
  available: boolean
  /** 宿主文档是否接受写入。 */
  writable: boolean
  /** 是否存在保存会写入的草稿。 */
  dirty: boolean
  /** 是否存在无效草稿（阻止保存）。 */
  invalid: boolean
  /** 是否有保存正在过网。 */
  saving: boolean
  /** 上一次保存是否未落盘（下次编辑或保存时清除）。 */
  failed: boolean
  /** 各字段状态，按字段名寻址。 */
  fields: Record<string, SfwFieldState>
}

/** 卡片 slot 条目注入的动作面。 */
export interface SfwCardActions {
  /** 为某字段暂存草稿文本。 */
  edit: (field: string, text: string) => void
  /** 暂存一次 clear，使保存后该字段回落到组合层。 */
  reset: (field: string) => void
  /** 写入所有暂存草稿，然后按宿主接受的结果重新播种。 */
  save: () => void
  /** 丢弃所有暂存草稿。 */
  discard: () => void
}

/** 布尔字段的草稿文本。 */
export const BOOL_TRUE = 'true'
export const BOOL_FALSE = 'false'

/** 一个布尔字段：值只在 true/false 间切换，草稿非法即阻止保存。 */
export function boolField(field: string, path: readonly string[]): SfwFieldSpec {
  return {
    field,
    path,
    format: value => value === true ? BOOL_TRUE : BOOL_FALSE,
    parse: (text) => {
      if (text === BOOL_TRUE) return { kind: 'set', value: true }
      if (text === BOOL_FALSE) return { kind: 'set', value: false }
      return undefined
    },
  }
}

/** 一个自由文本字段；空草稿表示 clear（清空与重置是同一手势）。 */
export function textField(field: string, path: readonly string[]): SfwFieldSpec {
  return {
    field,
    path,
    format: value => typeof value === 'string' ? value : '',
    parse: (text) => {
      const trimmed = text.trim()
      return trimmed === '' ? { kind: 'clear' } : { kind: 'set', value: trimmed }
    },
  }
}

/** 一个枚举字段；只接受枚举值，其他草稿阻止保存。 */
export function enumField(
  field: string,
  path: readonly string[],
  values: readonly string[],
  fallback: string,
): SfwFieldSpec {
  return {
    field,
    path,
    format: value => (typeof value === 'string' && values.includes(value) ? value : fallback),
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      return values.includes(trimmed) ? { kind: 'set', value: trimmed } : undefined
    },
  }
}

/** 一条字段草稿。 */
interface StagedEdit {
  text: string
  clear: boolean
}

/** 在（可能是嵌套的）对象中读取某路径的值；路径缺失返回 undefined。 */
function pathValue(source: unknown, path: readonly string[]): unknown {
  let current = source
  for (const key of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined
    const record = current as Record<string, unknown>
    if (!Object.hasOwn(record, key)) return undefined
    current = record[key]
  }
  return current
}

/** 某路径是否出现在用户层（出现即视为已覆盖，与值无关）。 */
function pathPresent(source: unknown, path: readonly string[]): boolean {
  return pathValue(source, path) !== undefined
}

/**
 * 一张卡片在一个 settings namespace 上的分阶段表单。
 *
 * 表单发布不可变快照（稳定引用直到下一次变更），组件通过
 * `useSyncExternalStore` 读取；scope 与草稿各自变化时都会重建快照。
 */
export class SfwCardForm {
  private readonly specs = new Map<string, SfwFieldSpec>()
  private readonly staged = new Map<string, StagedEdit>()
  private readonly listeners = new Set<() => void>()
  private saving = false
  private failed = false
  private snapshot: SfwCardSnapshot

  /**
   * @param scope - 绑定到 `dsh-sfw` namespace 的 settings 句柄。
   * @param api - 浏览器 `connection` 句柄的 settings 面（嵌套路径写入用）。
   * @param specs - 卡片编辑的字段；`field` 必须唯一。
   */
  constructor(
    private readonly scope: SettingsScopeSeam<SfwConfigLike>,
    private readonly api: { settings: { mutate(payload: {
      ns: string
      ops: readonly SettingsPathOpSeam[]
      expectedRevision?: number
    }): Promise<{ result: { ok: boolean } }> } },
    specs: readonly SfwFieldSpec[],
  ) {
    for (const spec of specs) {
      if (this.specs.has(spec.field)) throw new Error(`dsh-sfw card declares field "${spec.field}" twice`)
      this.specs.set(spec.field, spec)
    }
    this.snapshot = this.project()
    scope.subscribe(() => { this.publish() })
  }

  /** 订阅快照替换。@returns 移除订阅的释放函数。 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** 当前快照（稳定引用；`useSyncExternalStore` 直接消费）。 */
  getSnapshot(): SfwCardSnapshot {
    return this.snapshot
  }

  /** 构建 slot 条目注入的动作面。 */
  actions(): SfwCardActions {
    return {
      edit: (field, text) => { this.stage(field, { text, clear: false }) },
      reset: (field) => { this.stage(field, { text: this.spec(field).format(this.baseValue(field)), clear: true }) },
      save: () => { void this.save() },
      discard: () => {
        if (this.staged.size === 0 && !this.failed) return
        this.staged.clear()
        this.failed = false
        this.publish()
      },
    }
  }

  /** 读取一个字段的渲染状态。 */
  field(field: string): SfwFieldState {
    const staged = this.staged.get(field)
    const spec = this.spec(field)
    if (staged === undefined) {
      return {
        text: spec.format(this.sectionValue(field)),
        overridden: this.stored(field),
        invalid: false,
      }
    }
    const write = staged.clear ? { kind: 'clear' as const } : spec.parse(staged.text)
    return {
      text: staged.text,
      overridden: write?.kind === 'set',
      invalid: write === undefined,
    }
  }

  /**
   * 写入所有暂存草稿，然后按宿主接受的结果重新播种。
   *
   * 宿主是唯一权威：schema 表达不了的约束由宿主校验器裁决，因此保存结果
   * 从 section 读回而非本地预测。未落盘的保存保留草稿，供用户修正。
   */
  async save(): Promise<void> {
    const plan = this.plan()
    if (plan.ops.length === 0 || this.saving || plan.invalid) return
    this.saving = true
    this.failed = false
    this.publish()
    let landed = false
    const revision = this.scope.getSnapshot().revision
    try {
      const response = await this.api.settings.mutate({
        ns: SFW_NAMESPACE,
        ops: plan.ops,
        ...(revision === undefined ? {} : { expectedRevision: revision }),
      })
      landed = response.result.ok
    } catch {
      landed = false
    }
    if (landed) {
      this.staged.clear()
      // 直接经 RPC 写出的字段不经过 scope 的响应通道；主动读回一次，避免
      // 等待 settings/document-updated 事件。load 是 SettingsScopeController
      // 的公开方法（契约接口未收窄它）。
      const load = (this.scope as unknown as { load?: () => Promise<void> }).load
      await load?.()
    }
    this.saving = false
    this.failed = !landed
    this.publish()
  }

  /** 每个暂存草稿解析为的写操作；无效草稿计入 invalid 并携带无 op 条目。 */
  private plan(): { ops: SettingsPathOpSeam[]; invalid: boolean } {
    const ops: SettingsPathOpSeam[] = []
    let invalid = false
    for (const [field, staged] of this.staged) {
      const spec = this.spec(field)
      if (staged.clear) {
        if (this.stored(field)) ops.push({ op: 'unset', path: spec.path })
        continue
      }
      const write = spec.parse(staged.text)
      if (write === undefined) {
        invalid = true
        continue
      }
      if (write.kind === 'set') {
        ops.push({ op: 'set', path: spec.path, value: write.value })
      } else if (this.stored(field)) {
        ops.push({ op: 'unset', path: spec.path })
      }
    }
    return { ops, invalid }
  }

  private stage(field: string, edit: StagedEdit): void {
    this.staged.set(field, edit)
    this.failed = false
    this.publish()
  }

  private spec(field: string): SfwFieldSpec {
    const spec = this.specs.get(field)
    if (spec === undefined) throw new Error(`dsh-sfw card has no field ${field}`)
    return spec
  }

  private project(): SfwCardSnapshot {
    const view = this.scope.getSnapshot()
    const fields: Record<string, SfwFieldState> = {}
    for (const field of this.specs.keys()) fields[field] = this.field(field)
    const plan = this.plan()
    return {
      available: view.status === 'ready',
      writable: view.writable,
      dirty: plan.ops.length > 0,
      invalid: plan.invalid,
      saving: this.saving,
      failed: this.failed,
      fields,
    }
  }

  private sectionValue(field: string): unknown {
    return pathValue(this.scope.getSnapshot().value, this.spec(field).path)
  }

  private baseValue(field: string): unknown {
    return pathValue(this.scope.getSnapshot().base, this.spec(field).path)
  }

  private stored(field: string): boolean {
    return pathPresent(this.scope.getSnapshot().user, this.spec(field).path)
  }

  private publish(): void {
    this.snapshot = this.project()
    for (const listener of this.listeners) listener()
  }
}

/** controller 构造所需的配置形状（结构缝，避免引入 mask 类型的循环依赖）。 */
export interface SfwConfigLike {
  enabled?: boolean
  productName?: string
  wordmark?: string
  overlays?: {
    wordmark?: { enabled?: boolean; mode?: string }
    title?: { enabled?: boolean }
    hero?: { enabled?: boolean }
  }
}

/** 卡片编辑的全部字段：顶层三个 + overlays 的四个开关/模式。 */
export const SFW_CARD_SPECS: readonly SfwFieldSpec[] = [
  boolField('enabled', ['enabled']),
  textField('productName', ['productName']),
  textField('wordmark', ['wordmark']),
  enumField('wordmarkMode', ['overlays', 'wordmark', 'mode'], ['replace', 'harness-remove'], 'replace'),
  boolField('overlayWordmark', ['overlays', 'wordmark', 'enabled']),
  boolField('overlayTitle', ['overlays', 'title', 'enabled']),
  boolField('overlayHero', ['overlays', 'hero', 'enabled']),
]

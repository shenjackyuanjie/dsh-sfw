/**
 * dsh-sfw 宿主端：通过 cordis 函数插件改写所服务的 index.html，使浏览器在
 * JavaScript 加载前也不会显示原产品名；同时把完整配置写入
 * `window.__DSH_SFW__` 交给浏览器端。该通道与 client-modules 注入启动清单
 * 使用同一个 index 改写接缝，是无需额外 RPC 的宿主端到浏览器端配置通道。
 *
 * 配置来源按优先级叠加：schema 默认值 → cordis entry config → settings 服务
 * 存在时 `$DSH_HOME/settings.yaml` 的 `dsh-sfw` namespace（见 {@link apply}）；
 * settings.yaml 变更会热重挂载 index 变换，下次请求即生效。三个处理面（字标 /
 * 标题 / 欢迎区）由 `overlays` 独立开关；标题关闭时宿主端也不再改写 `<title>`，
 * 但始终注入完整配置载荷。
 *
 * 本插件必须作为宿主加载图中的 loader 条目存在，client-modules 才能发现
 * `dsh.client` 声明并提供 `lib/client.js`。本文件就是该入口，不注册其他能力。
 * @module @shenjack/dsh-sfw
 */

import type { Context } from 'cordis'
import z from 'schemastery'
import {
  defaultConfig, maskProductName, normalizeWireConfig,
  MAX_WORDMARK_LENGTH, type SfwConfig,
} from './mask.ts'

/** 稳定的 cordis 插件名，同时也是 Web 启动图中的条目 ID。 */
export const name = 'dsh-sfw'

/** 注册 index 改写前必须可用的服务。 */
export const inject = ['httpServer']

/** 插件配置：品牌隐藏选项，参见 {@link SfwConfig}。 */
export const Config: z<SfwConfig> = z.object({
  enabled: z.boolean().default(true),
  productName: z.string().default('Harness'),
  wordmark: z.string().max(MAX_WORDMARK_LENGTH).default('opencode'),
  overlays: z.object({
    wordmark: z.object({
      enabled: z.boolean().default(true),
      mode: z.union([z.const('replace'), z.const('harness-remove')]).default('replace'),
    }).default({ enabled: true, mode: 'replace' }),
    title: z.object({
      enabled: z.boolean().default(true),
    }).default({ enabled: true }),
    hero: z.object({
      enabled: z.boolean().default(true),
    }).default({ enabled: true }),
  }).default({
    wordmark: { enabled: true, mode: 'replace' },
    title: { enabled: true },
    hero: { enabled: true },
  }),
})

/** 本插件使用的 httpServer 结构化接缝，无需导入宿主实现包。 */
interface HttpServerSeam {
  /** 注册对每次 index.html 响应生效的变换。 */
  tapIndex(transform: (html: string) => string): () => void
}

/** settings 服务的最小结构化接缝（可选服务；无需导入 @deepseek-ai/dsh-settings）。 */
interface SettingsScopeSeam<T> {
  /** 当前解析值：schema 默认值 → 注册方 base → settings.yaml 用户层。 */
  get(): T
  /** 订阅已提交的配置变更；返回取消订阅函数。 */
  watch(callback: (next: T, prev: T) => void): () => void
}

/** 宿主 `ctx.settings` 服务的结构化接缝，只暴露 dsh-sfw 消费的注册能力。 */
interface SettingsSeam<T> {
  register(ns: string, schema: z<T>, options?: { base?: Partial<T> }): SettingsScopeSeam<T>
}

/** cordis FiberState 的卸载态数值，与宿主 installSettingsSection 的 isUnloading 判断一致。 */
const FIBER_DISPOSED = 4
const FIBER_UNLOADING = 5

/** 配置是否与已生效配置相同（refresh 的幂等守卫，避免重复挂载同一变换）。 */
function sameConfig(a: SfwConfig, b: SfwConfig): boolean {
  return a.enabled === b.enabled
    && a.productName === b.productName
    && a.wordmark === b.wordmark
    && a.overlays.wordmark.enabled === b.overlays.wordmark.enabled
    && a.overlays.wordmark.mode === b.overlays.wordmark.mode
    && a.overlays.title.enabled === b.overlays.title.enabled
    && a.overlays.hero.enabled === b.overlays.hero.enabled
}

/** 安全嵌入 JSON：转义 `<`，避免配置字符串逃逸所注入的 script 元素。 */
function escapeForScript(payload: string): string {
  return payload.replaceAll('<', '\\u003c')
}

/**
 * 变换待返回的 index.html：先改写包含 DeepSeek 的 `<title>`（`overlays.title`
 * 关闭时跳过），再把完整配置紧跟 `<head>` 注入；不存在 head 时则放在文档最前，
 * 与启动清单的兜底行为一致。
 * @param html index.html 原文。
 * @param config 完整解析后的隐藏配置。
 * @returns 变换后的 HTML。
 */
export function transformIndex(html: string, config: SfwConfig): string {
  let out = html
  if (config.overlays.title.enabled) {
    out = out.replace(/<title\b[^>]*>([\s\S]*?)<\/title>/i, (whole, inner: string) => {
      const maskedInner = maskProductName(inner, config.productName)
      return maskedInner === inner ? whole : whole.replace(inner, maskedInner)
    })
  }
  const payload = escapeForScript(JSON.stringify(config))
  const script = `<script>window.__DSH_SFW__ = ${payload}</script>`
  const head = out.indexOf('<head>')
  if (head !== -1) return `${out.slice(0, head + 6)}${script}${out.slice(head + 6)}`
  return `${script}${out}`
}

/**
 * 挂载 index 改写。配置来源按优先级叠加：schema 默认值 → cordis entry config →
 * settings 服务存在时 `$DSH_HOME/settings.yaml` 的 `dsh-sfw` namespace；
 * settings.yaml 变更会热重挂载变换，下次 index.html 请求即生效。loader 会应用
 * Config 模式中的默认值；此处再次显式合并，让没有传入配置的手工测试上下文
 * 也能正常运行。
 * @param ctx 已注入 httpServer 服务的宿主插件上下文。
 * @param config 已应用模式默认值的插件配置。
 */
export function apply(ctx: Context, config?: SfwConfig): void {
  // 手工测试上下文传入的配置可能缺少 overlays 子树；用与浏览器端相同的归一
  // 化补齐全部默认字段，保证后续读取结构完整。
  const entry = normalizeWireConfig({ ...defaultConfig(), ...config })
  // 当前权威配置来源：settings 服务接入后指向其 scope，否则指向 entry。
  let current: () => SfwConfig = () => entry
  // 已注册的 index 变换释放器；每次重挂载前先释放旧变换。
  let disposeIndex: (() => void) | undefined
  // 已生效的配置：与最新解析值一致时 refresh 为空操作。
  let applied: SfwConfig | undefined

  const refresh = (): void => {
    const resolved = current()
    if (applied !== undefined && sameConfig(applied, resolved)) return
    disposeIndex?.()
    disposeIndex = undefined
    applied = resolved
    if (!resolved.enabled) return
    const httpServer = (ctx as unknown as { httpServer?: HttpServerSeam }).httpServer
    if (httpServer === undefined) {
      throw new Error('dsh-sfw：httpServer 服务不可用（插件已声明 inject）')
    }
    disposeIndex = httpServer.tapIndex(html => transformIndex(html, resolved))
  }

  // 插件自身 fiber 是否正在卸载：卸载中的回落/热更新会与最外层清理 effect
  // 竞态（分离回落重新挂载的变换将无人释放），与宿主 installSettingsSection
  // 的 isUnloading 判断保持一致。
  const unloading = (): boolean => {
    const state: number = ctx.fiber.state
    return state === FIBER_DISPOSED || state === FIBER_UNLOADING
  }

  // 可选 settings 服务：注册 `dsh-sfw` namespace（cordis entry config 为 base），
  // 把配置来源切到其 scope；服务缺失或晚到时（纯 cordis 装配/测试）回调不运行，
  // 保持 entry 配置不变。
  ctx.inject(['settings'], (sctx) => {
    const settings = (sctx as unknown as { settings?: SettingsSeam<SfwConfig> }).settings
    if (settings === undefined) return
    const scope = settings.register('dsh-sfw', Config, { base: entry })
    current = () => scope.get()
    // settings 服务分离（provider 重载/卸载）时回落 entry 配置并重挂载；
    // 插件自身卸载时跳过（index 变换由下方清理 effect 释放）。
    sctx.effect(() => () => {
      if (unloading()) return
      current = () => entry
      refresh()
    }, 'dsh-sfw：settings 分离回落')
    // settings.yaml 热变更 → 立即用新配置重挂载 index 变换。
    scope.watch(() => {
      if (unloading()) return
      refresh()
    })
    refresh()
  })

  // 初始挂载（无 settings 服务时也生效）；插件卸载时释放变换。
  refresh()
  ctx.effect(() => () => disposeIndex?.(), 'dsh-sfw：index 改写清理')
}

/**
 * DSH Web 客户端接缝（结构缝）：dsh-sfw 浏览器半部只通过 cordis 服务与 DSH
 * 协作（`ctx.slots` / `ctx.settingsScope` / `ctx.locale`），不导入任何
 * `@deepseek-ai/*` 包——与宿主半部对 `httpServer`/`settings` 的处理方式一致。
 * 这里用最小结构化类型描述用到的服务面，DSH 侧的运行时契约（slot 系统、
 * settings 传输、locale 注册）由各自的宿主实现提供。
 *
 * 浏览器端模块表只冻结平台模块（react、`@deepseek-ai/cordis`、
 * `@deepseek-ai/dsh-client-ui-slots` 等）；本插件 bundle 除 react 外不引用
 * 其他共享模块，因此也不会产生模块表解析不到的 require。
 * @module @shenjack/dsh-sfw/client/seams
 */

import type { Context } from 'cordis'

/** settings namespace 的客户端只读快照，与 `dsh-client-runtime` 的契约一致。 */
export interface SettingsScopeSnapshotSeam<T> {
  /** `loading` 直到首个已接受的 section；`ready` 之后持续成立；`unavailable` 表示未对该客户端暴露。 */
  status: 'loading' | 'ready' | 'unavailable'
  /** 最近一次 schema 解析后的 section；首次接受前为 undefined。 */
  value: T | undefined
  /** 组合层（注册方 base + schema 默认）；字段被 clear 后回落到这里。 */
  base: unknown
  /** 原始用户层；字段在此层的存在与否决定「已覆盖」标记。 */
  user: unknown
  /** 命名空间修订号，用于给下次写入加 fence；首个宿主视图前为 undefined。 */
  revision: number | undefined
  /** 宿主文档是否接受写入；memory 模式恒为 false。 */
  writable: boolean
  /** `host` 与宿主文档同步；`memory` 仅在本浏览器进程内。 */
  mode: 'host' | 'memory'
}

/** 一个 settings namespace 的客户端句柄（`dsh-client-runtime` 契约的镜像）。 */
export interface SettingsScopeSeam<T> {
  getSnapshot(): SettingsScopeSnapshotSeam<T>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

/** `ctx.settingsScope.bind` 的入参。 */
export interface SettingsScopeSpecSeam<T> {
  /** 宿主插件注册的 settings namespace。 */
  namespace: string
  /** 把 wire section 收窄为 T；缺省按 namespace 自己的 wire schema 校验。 */
  decode?: (section: unknown) => T | undefined
}

/** `ctx.settingsScope` 服务的最小面。 */
export interface SettingsScopeServiceSeam {
  bind<T>(spec: SettingsScopeSpecSeam<T>): SettingsScopeSeam<T>
}

/** `settings.mutate` 的一次路径操作（与宿主 RPC 契约一致）。 */
export interface SettingsPathOpSeam {
  op: 'set' | 'unset'
  path: readonly string[]
  value?: unknown
}

/** 浏览器 `connection` 句柄中本卡片使用的最小面。 */
export interface ConnectionHandleSeam {
  api: {
    settings: {
      mutate(payload: {
        ns: string
        ops: readonly SettingsPathOpSeam[]
        expectedRevision?: number
      }): Promise<{ result: { ok: boolean } }>
    }
  }
}

/** slot 注册选项的最小面（list 条目所需字段）。 */
export interface SlotRegisterOptionsSeam {
  name: string
  id: string
  order?: number
  locale?: string
  inject?: () => object
}

/** `ctx.slots` 服务的最小面。 */
export interface SlotsServiceSeam {
  register(options: SlotRegisterOptionsSeam, component: unknown): () => void
  /** 等待某 slot 被声明后再注册；支持 generator 批量注册并原子回滚。 */
  inject(name: string, factory: () => Iterable<() => void> | void): () => void
}

/** `ctx.locale` 服务的最小面。 */
export interface LocaleServiceSeam {
  /** 注册一个命名空间的字典；返回注销函数（可作为 effect 清理器）。 */
  register(ns: string, dictionaries: Record<string, Record<string, string>>): () => void
  bind(ns: string): (key: string) => string
}

declare module 'cordis' {
  interface Context {
    /** DSH Web slot 系统服务（ui-slots 提供）。 */
    slots: SlotsServiceSeam
    /** DSH settings namespace 传输服务（ui-settings 提供）。 */
    settingsScope: SettingsScopeServiceSeam
    /** DSH 前端文案服务（locale 提供）。 */
    locale: LocaleServiceSeam
  }
}

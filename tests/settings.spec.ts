/**
 * settings.yaml 接入测试：用真实 cordis Context 装配可选 settings 服务，断言
 * tapIndex 变换的载荷（覆盖优先级）、live 更新、enabled 切换与卸载清理。
 * webServer 与 settings 均以测试桩提供；变换输出断言沿用 index-tap.spec.ts
 * 的 `window.__DSH_SFW__` 载荷形状。
 */
import { Context } from 'cordis'
import type z from 'schemastery'
import { describe, expect, it } from 'vitest'
import { apply, Config } from '../src/index.ts'
import type { SfwConfig } from '../src/mask.ts'

const SAMPLE_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>DeepSeek Harness</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

/** 记录 tapIndex 变换注册/释放历史的 webServer 测试桩。 */
function recorderWebServer(): {
  state: {
    /** 全部注册历史（含已释放的变换）。 */
    registrations: Array<(html: string) => string>
    /** 当前仍生效的变换（释放时移除）。 */
    live: Array<(html: string) => string>
    disposals: number
  }
  webServer: { tapIndex(transform: (html: string) => string): () => void }
} {
  const state = {
    registrations: [] as Array<(html: string) => string>,
    live: [] as Array<(html: string) => string>,
    disposals: 0,
  }
  return {
    state,
    webServer: {
      tapIndex(transform) {
        state.registrations.push(transform)
        state.live.push(transform)
        return () => {
          state.disposals += 1
          const index = state.live.indexOf(transform)
          if (index !== -1) state.live.splice(index, 1)
        }
      },
    },
  }
}

/** 模拟 settings 服务的 register/get/watch；publish 推送 settings.yaml 文档变更。 */
function fakeSettings(): {
  settings: {
    register<T>(
      ns: string,
      schema: z<T>,
      options?: { base?: Partial<T> },
    ): {
      get(): T
      watch(callback: (next: T, prev: T) => void): () => void
    }
  }
  publish(section: Record<string, unknown>): void
} {
  const user: Record<string, Record<string, unknown>> = {}
  const watchers = new Map<string, Set<(next: unknown, prev: unknown) => void>>()
  return {
    settings: {
      register(ns, schema, options) {
        const base = { ...(options?.base ?? {}) } as Record<string, unknown>
        const set: Set<(next: unknown, prev: unknown) => void> = new Set()
        watchers.set(ns, set)
        return {
          // 与真实 settings 服务相同的解析序：schema 默认值 → base → 用户层。
          get: () => schema({ ...base, ...(user[ns] ?? {}) } as never),
          watch: (callback) => {
            set.add(callback as (next: unknown, prev: unknown) => void)
            return () => set.delete(callback as (next: unknown, prev: unknown) => void)
          },
        }
      },
    },
    /** 模拟 settings provider 发布新文档：更新 `dsh-sfw` 用户层并通知 watcher。 */
    publish(section) {
      const ns = 'dsh-sfw'
      user[ns] = section
      for (const callback of watchers.get(ns) ?? []) callback(section, undefined)
    },
  }
}

const pluginObject = { name: 'dsh-sfw', Config, inject: ['webServer'], apply }

/** 让 cordis 的 fiber 加载微任务（含 apply 内嵌套的 inject fiber）全部落地。 */
const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

/** 当前生效的最后一个变换输出的 `window.__DSH_SFW__` 载荷文本。 */
function latestPayload(state: { live: Array<(html: string) => string> }): string {
  const transform = state.live.at(-1)
  if (transform === undefined) throw new Error('no live tapIndex transform registered')
  const html = transform(SAMPLE_HTML)
  const marker = 'window.__DSH_SFW__ = '
  const start = html.indexOf(marker) + marker.length
  return html.slice(start, html.indexOf('</script>'))
}

/** 装配一个真实 cordis 上下文：提供 webServer 桩，按需提供 settings 桩。 */
async function mount(options: {
  entry?: SfwConfig
  withSettings?: boolean
  seed?: Record<string, unknown>
} = {}): Promise<{
  state: {
    registrations: Array<(html: string) => string>
    live: Array<(html: string) => string>
    disposals: number
  }
  settings: ReturnType<typeof fakeSettings> | undefined
  dispose: () => Promise<void>
}> {
  const ctx = new Context()
  const recorder = recorderWebServer()
  ctx.provide('webServer', recorder.webServer)
  let settings: ReturnType<typeof fakeSettings> | undefined
  if (options.withSettings !== false) {
    settings = fakeSettings()
    if (options.seed !== undefined) settings.publish(options.seed)
    ctx.provide('settings', settings.settings)
  }
  const fiber = ctx.plugin(
    pluginObject,
    options.entry ?? { enabled: true, productName: 'Harness', wordmark: 'opencode' },
  )
  await fiber
  await flush()
  return { state: recorder.state, settings, dispose: () => fiber.dispose() }
}

describe('apply 的 settings.yaml 接入', () => {
  it('settings 用户层覆盖 cordis entry 配置', async () => {
    const { state } = await mount({
      entry: { enabled: true, productName: 'Harness', wordmark: 'foo' },
      seed: { wordmark: 'bar' },
    })
    expect(state.live.length).toBeGreaterThan(0)
    expect(latestPayload(state)).toContain('"wordmark":"bar"')
    // 未在 settings 层写出的字段回落到 entry base。
    expect(latestPayload(state)).toContain('"productName":"Harness"')
  })

  it('entry 未提供 overlays 时按默认值补齐', async () => {
    const { state } = await mount({
      entry: { enabled: true, productName: 'Harness', wordmark: 'foo' },
      withSettings: false,
    })
    expect(latestPayload(state))
      .toContain('"overlays":{"wordmark":{"enabled":true,"mode":"replace"},')
    expect(latestPayload(state)).toContain('"title":{"enabled":true}')
    expect(latestPayload(state)).toContain('"hero":{"enabled":true}')
  })

  it('settings 用户层可独立开关处理面与字标模式', async () => {
    const { state } = await mount({
      entry: { enabled: true, productName: 'Harness', wordmark: 'foo' },
      seed: {
        overlays: {
          wordmark: { enabled: false, mode: 'harness-remove' },
          hero: { enabled: false },
        },
      },
    })
    const payload = latestPayload(state)
    expect(payload).toContain('"wordmark":{"enabled":false,"mode":"harness-remove"}')
    expect(payload).toContain('"hero":{"enabled":false}')
    // 未写出的 title 保持开启。
    expect(payload).toContain('"title":{"enabled":true}')
  })

  it('无 settings 服务时回落 cordis entry 配置', async () => {
    const { state } = await mount({
      entry: { enabled: true, productName: 'InnerAI', wordmark: 'foo' },
      withSettings: false,
    })
    expect(latestPayload(state)).toContain('"productName":"InnerAI"')
    expect(latestPayload(state)).toContain('"wordmark":"foo"')
  })

  it('settings 无 dsh-sfw section 时回落 entry 配置', async () => {
    const { state } = await mount({
      entry: { enabled: true, productName: 'Harness', wordmark: 'foo' },
      seed: {},
    })
    expect(latestPayload(state)).toContain('"wordmark":"foo"')
  })

  it('settings 把 enabled 置 false 时不注册 index 变换', async () => {
    const { state } = await mount({
      entry: { enabled: true, productName: 'Harness', wordmark: 'opencode' },
      seed: { enabled: false },
    })
    expect(state.live).toHaveLength(0)
  })

  it('settings.yaml 热变更后重挂载变换并立即生效', async () => {
    const mounted = await mount({
      entry: { enabled: true, productName: 'Harness', wordmark: 'foo' },
    })
    expect(latestPayload(mounted.state)).toContain('"wordmark":"foo"')
    mounted.settings!.publish({ wordmark: 'baz' })
    expect(latestPayload(mounted.state)).toContain('"wordmark":"baz"')
  })

  it('enabled 经 settings 切换 false/true 时摘除并恢复变换', async () => {
    const mounted = await mount({
      entry: { enabled: true, productName: 'Harness', wordmark: 'foo' },
    })
    expect(mounted.state.live.length).toBeGreaterThan(0)
    mounted.settings!.publish({ enabled: false })
    expect(mounted.state.live).toHaveLength(0)
    expect(mounted.state.disposals).toBeGreaterThan(0)
    mounted.settings!.publish({ enabled: true, wordmark: 'baz' })
    expect(mounted.state.live.length).toBeGreaterThan(0)
    expect(latestPayload(mounted.state)).toContain('"wordmark":"baz"')
  })

  it('插件卸载时释放已注册的 index 变换', async () => {
    const mounted = await mount({
      entry: { enabled: true, productName: 'Harness', wordmark: 'foo' },
    })
    expect(mounted.state.live.length).toBeGreaterThan(0)
    const before = mounted.state.disposals
    await mounted.dispose()
    expect(mounted.state.live).toHaveLength(0)
    expect(mounted.state.disposals).toBeGreaterThan(before)
  })
})

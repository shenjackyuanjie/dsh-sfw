/**
 * 配置卡片表单模型测试：字段转换、草稿暂存、保存 op 生成（顶层与嵌套路径）、
 * 无效草稿阻止保存、保存失败保留草稿与恢复默认。scope 与 api 均以桩提供，
 * 断言聚焦表单自己拥有的行为。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  SFW_CARD_SPECS, SfwCardForm, type SfwConfigLike,
} from '../src/client/config-form.ts'
import type { SettingsScopeSnapshotSeam, SettingsPathOpSeam } from '../src/client/seams.ts'

/** 一个可推送更新的 scope 桩；`publish` 模拟宿主 section 变更。 */
function fakeScope(initial: Partial<SettingsScopeSnapshotSeam<SfwConfigLike>> = {}) {
  let snapshot: SettingsScopeSnapshotSeam<SfwConfigLike> = {
    status: 'ready',
    value: { enabled: true, productName: 'Harness', wordmark: 'opencode' },
    base: { enabled: true, productName: 'Harness', wordmark: 'opencode' },
    user: {},
    revision: 1,
    writable: true,
    mode: 'host',
    ...initial,
  }
  const listeners = new Set<() => void>()
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: async (field: string, value: unknown) => {
      const next = { ...snapshot.value, [field]: value } as SfwConfigLike
      snapshot = { ...snapshot, value: next, user: { ...(snapshot.user as object), [field]: value } }
      for (const listener of listeners) listener()
    },
    unset: async (field: string) => {
      snapshot = { ...snapshot, user: { ...(snapshot.user as object) } }
      delete (snapshot.user as Record<string, unknown>)[field]
      for (const listener of listeners) listener()
    },
  }
  return {
    scope,
    publish(next: Partial<SettingsScopeSnapshotSeam<SfwConfigLike>>) {
      snapshot = { ...snapshot, ...next }
      for (const listener of listeners) listener()
    },
  }
}

/** 记录 mutate 调用、可编程返回的 api 桩。 */
function fakeApi(result: { ok: boolean } = { ok: true }) {
  const calls: Array<{ ns: string; ops: readonly SettingsPathOpSeam[]; expectedRevision?: number }> = []
  const api = {
    settings: {
      mutate: vi.fn(async (payload: {
        ns: string
        ops: readonly SettingsPathOpSeam[]
        expectedRevision?: number
      }) => {
        calls.push(payload)
        return { result }
      }),
    },
  }
  return { api, calls }
}

function makeForm(overrides: {
  scope?: ReturnType<typeof fakeScope>
  api?: ReturnType<typeof fakeApi>['api']
} = {}) {
  const fake = overrides.scope ?? fakeScope()
  const api = overrides.api ?? fakeApi().api
  const form = new SfwCardForm(fake.scope, api, SFW_CARD_SPECS)
  return { form, scope: fake, api }
}

describe('SfwCardForm 字段渲染', () => {
  it('按存储值格式化每个字段，并报告用户层覆盖', () => {
    const { scope, form } = makeForm()
    scope.publish({
      value: { enabled: false, productName: 'Harness', wordmark: 'opencode', overlays: { wordmark: { mode: 'harness-remove' } } },
      user: { enabled: false, overlays: { wordmark: { mode: 'harness-remove' } } },
    })
    expect(form.field('enabled').text).toBe('false')
    expect(form.field('enabled').overridden).toBe(true)
    expect(form.field('productName').text).toBe('Harness')
    expect(form.field('productName').overridden).toBe(false)
    expect(form.field('wordmarkMode').text).toBe('harness-remove')
    expect(form.field('wordmarkMode').overridden).toBe(true)
    expect(form.field('overlayTitle').text).toBe('false')
    expect(form.getSnapshot().available).toBe(true)
  })

  it('namespace 未暴露（非 ready）时整体不可用', () => {
    const { scope, form } = makeForm()
    scope.publish({ status: 'unavailable' })
    expect(form.getSnapshot().available).toBe(false)
  })
})

describe('SfwCardForm 草稿与保存', () => {
  it('编辑只暂存草稿，保存时才写入；顶层字段走单段路径', async () => {
    const { api, form } = makeForm()
    form.actions().edit('productName', 'opencode')
    expect(form.getSnapshot().dirty).toBe(true)
    expect(api.settings.mutate).not.toHaveBeenCalled()

    await form.save()
    await vi.waitFor(() => { expect(api.settings.mutate).toHaveBeenCalledOnce() })
    const call = api.settings.mutate.mock.calls[0]![0]
    expect(call.ns).toBe('dsh-sfw')
    expect(call.expectedRevision).toBe(1)
    expect(call.ops).toEqual([{ op: 'set', path: ['productName'], value: 'opencode' }])
    expect(form.getSnapshot().dirty).toBe(false)
  })

  it('嵌套 overlays 字段走多段路径，一次保存写入全部草稿', async () => {
    const { api, form } = makeForm()
    const actions = form.actions()
    actions.edit('wordmarkMode', 'harness-remove')
    actions.edit('overlayHero', 'false')
    actions.save()
    await vi.waitFor(() => { expect(api.settings.mutate).toHaveBeenCalledOnce() })
    const call = api.settings.mutate.mock.calls[0]![0]
    expect(call.ops).toEqual([
      { op: 'set', path: ['overlays', 'wordmark', 'mode'], value: 'harness-remove' },
      { op: 'set', path: ['overlays', 'hero', 'enabled'], value: false },
    ])
  })

  it('恢复默认暂存一次 clear；用户层有该字段时保存发 unset', async () => {
    const { scope, api, form } = makeForm()
    scope.publish({ user: { wordmark: 'opencode' } })
    form.actions().reset('wordmark')
    expect(form.field('wordmark').text).toBe('opencode')
    expect(form.field('wordmark').overridden).toBe(false)
    await form.save()
    await vi.waitFor(() => { expect(api.settings.mutate).toHaveBeenCalledOnce() })
    expect(api.settings.mutate.mock.calls[0]![0].ops).toEqual([{ op: 'unset', path: ['wordmark'] }])
  })

  it('用户层没有该字段时，clear 草稿不产生任何写', async () => {
    const { api, form } = makeForm()
    form.actions().reset('wordmark')
    await form.save()
    await vi.waitFor(() => { expect(api.settings.mutate).not.toHaveBeenCalled() })
    expect(form.getSnapshot().dirty).toBe(false)
  })

  it('无效草稿（enum 不接受的值）阻止保存', async () => {
    const { api, form } = makeForm()
    form.actions().edit('wordmarkMode', 'bogus')
    const snapshot = form.getSnapshot()
    expect(snapshot.invalid).toBe(true)
    expect(form.field('wordmarkMode').invalid).toBe(true)
    await form.save()
    await vi.waitFor(() => { expect(api.settings.mutate).not.toHaveBeenCalled() })
  })

  it('保存失败保留草稿并标记 failed；宿主接受后清空', async () => {
    const failing = fakeApi({ ok: false })
    const { form } = makeForm({ api: failing.api })
    form.actions().edit('productName', 'X')
    await form.save()
    await vi.waitFor(() => { expect(form.getSnapshot().failed).toBe(true) })
    expect(form.field('productName').text).toBe('X')
    expect(form.getSnapshot().dirty).toBe(true)

    // 下一次保存成功（api 桩切换结果）。
    failing.api.settings.mutate.mockResolvedValue({ result: { ok: true } })
    await form.save()
    await vi.waitFor(() => { expect(form.getSnapshot().failed).toBe(false) })
    expect(form.getSnapshot().dirty).toBe(false)
  })

  it('保存过程带 saving 标记；discard 丢弃全部草稿', async () => {
    const { api, form } = makeForm()
    api.settings.mutate.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      return { result: { ok: true } }
    })
    form.actions().edit('wordmark', 'harmes')
    const saving = form.save()
    expect(form.getSnapshot().saving).toBe(true)
    await saving
    expect(form.getSnapshot().saving).toBe(false)

    form.actions().edit('wordmark', 'x')
    form.actions().discard()
    expect(form.getSnapshot().dirty).toBe(false)
    // 保存成功后按宿主接受的结果重新播种（scope 值未变；真实宿主会经
    // settings/document-updated 事件推送新 section）。
    expect(form.field('wordmark').text).toBe('opencode')
  })

  it('scope 外部分发变更时快照重建', () => {
    const { scope, form } = makeForm()
    scope.publish({ value: { enabled: true, productName: 'N', wordmark: 'opencode' } })
    expect(form.field('productName').text).toBe('N')
  })
})

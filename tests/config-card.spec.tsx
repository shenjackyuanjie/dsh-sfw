// @vitest-environment jsdom
/**
 * 配置卡片组件测试：渲染、展开、控件编辑回调与保存/放弃按钮状态。
 * 快照与动作以桩提供；断言用户可见行为，不检查类名或渲染次数。
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SfwConfigCard, type SfwCardProps } from '../src/client/config-card.tsx'
import type { SfwCardSnapshot } from '../src/client/config-form.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function snapshot(overrides: Partial<SfwCardSnapshot> = {}): SfwCardSnapshot {
  return {
    available: true,
    writable: true,
    dirty: false,
    invalid: false,
    saving: false,
    failed: false,
    fields: {
      enabled: { text: 'true', overridden: false, invalid: false },
      productName: { text: 'Harness', overridden: false, invalid: false },
      wordmark: { text: 'opencode', overridden: false, invalid: false },
      wordmarkMode: { text: 'replace', overridden: false, invalid: false },
      overlayWordmark: { text: 'true', overridden: false, invalid: false },
      overlayTitle: { text: 'true', overridden: false, invalid: false },
      overlayHero: { text: 'true', overridden: false, invalid: false },
    },
    ...overrides,
  }
}

function renderCard(state: SfwCardSnapshot, actions: Partial<SfwCardProps> = {}) {
  const props: SfwCardProps = {
    t: (key) => en[key],
    useSfwCard: (selector) => selector(state),
    edit: vi.fn(),
    reset: vi.fn(),
    save: vi.fn(),
    discard: vi.fn(),
    ...actions,
  }
  render(<SfwConfigCard {...props} />)
  return props
}

describe('SfwConfigCard', () => {
  it('namespace 不可用时渲染为空', () => {
    renderCard(snapshot({ available: false }))
    expect(document.body.textContent).toBe('')
  })

  it('渲染卡片标题与描述', () => {
    renderCard(snapshot())
    expect(screen.getByText(en.title)).toBeTruthy()
    expect(screen.getByText(en.description)).toBeTruthy()
  })

  it('默认收起；点击展开后显示字段与保存按钮', () => {
    renderCard(snapshot())
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.expand) }))
    expect(screen.getByLabelText(en.productName)).toBeTruthy()
    expect(screen.getByLabelText(en.wordmark)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.save })).toBeTruthy()
  })

  it('有草稿时头部显示未保存徽章，保存按钮可点', () => {
    renderCard(snapshot({ dirty: true }))
    expect(screen.getByText(en.unsaved)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.expand) }))
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('无效草稿禁用保存', () => {
    renderCard(snapshot({ dirty: true, invalid: true }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.expand) }))
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('无草稿时保存与放弃都禁用', () => {
    renderCard(snapshot())
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.expand) }))
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: en.discard }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('保存失败提示可见；开关切换触发 edit', () => {
    const edit = vi.fn()
    renderCard(snapshot({ failed: true }), { edit })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.expand) }))
    expect(screen.getByText(en.saveFailed)).toBeTruthy()
    const checkbox = screen.getByLabelText(en.enabled) as HTMLInputElement
    fireEvent.click(checkbox)
    expect(edit).toHaveBeenCalledWith('enabled', 'false')
  })

  it('只读文档禁用全部控件并提示', () => {
    renderCard(snapshot({ writable: false }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.expand) }))
    expect(screen.getByText(en.readOnly)).toBeTruthy()
    expect((screen.getByLabelText(en.productName) as HTMLInputElement).disabled).toBe(true)
  })

  it('覆盖字段显示已覆盖徽章与恢复默认', () => {
    const reset = vi.fn()
    renderCard(snapshot({ fields: {
      ...snapshot().fields,
      wordmark: { text: 'opencode', overridden: true, invalid: false },
    } }), { reset })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.expand) }))
    expect(screen.getByText(en.overridden)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.reset }))
    expect(reset).toHaveBeenCalledWith('wordmark')
  })

  it('mode 下拉选择触发 edit', () => {
    const edit = vi.fn()
    renderCard(snapshot(), { edit })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.expand) }))
    const select = screen.getByLabelText(en.wordmarkMode) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'harness-remove' } })
    expect(edit).toHaveBeenCalledWith('wordmarkMode', 'harness-remove')
  })
})

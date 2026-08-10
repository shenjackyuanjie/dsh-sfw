/** 品牌隐藏核心的纯逻辑测试：配置解析、载荷边界和产品名替换。 */
import { describe, expect, it } from 'vitest'
import {
  defaultConfig, maskProductName, normalizeWireConfig,
} from '../src/mask.ts'

describe('normalizeWireConfig', () => {
  it('载荷缺失或格式错误时回退到默认值', () => {
    expect(normalizeWireConfig(undefined)).toEqual(defaultConfig())
    expect(normalizeWireConfig('garbage')).toEqual(defaultConfig())
    expect(normalizeWireConfig(null)).toEqual(defaultConfig())
    expect(normalizeWireConfig([1, 2])).toEqual(defaultConfig())
  })

  it('接受类型正确的字段并忽略类型错误字段', () => {
    const parsed = normalizeWireConfig({ enabled: false, productName: 42, wordmark: 7 })
    expect(parsed.enabled).toBe(false)
    expect(parsed.productName).toBe('Harness')
    expect(parsed.wordmark).toBe('opencode')
    expect(normalizeWireConfig({ enabled: 'yes' }).enabled).toBe(true)
    expect(normalizeWireConfig({ productName: '' }).productName).toBe('Harness')
    expect(normalizeWireConfig({ wordmark: '  openclaw  ' }).wordmark).toBe('openclaw')
    expect(normalizeWireConfig({ wordmark: '   ' }).wordmark).toBe('opencode')
    expect(normalizeWireConfig({ wordmark: 'x'.repeat(33) }).wordmark).toBe('opencode')
  })

  it('兼容旧版宿主端序列化出的额外字段', () => {
    const oldShape = {
      enabled: true,
      productName: 'Harness',
      providerName: 'DS',
      providerId: 'ds-official',
      models: { 'DeepSeek-V4-Flash': 'V4-Flash' },
      extra: {},
    }
    expect(normalizeWireConfig(oldShape)).toEqual(defaultConfig())
  })
})

describe('normalizeWireConfig 的 overlays', () => {
  it('缺省时全部处理面开启、字标为 replace 模式', () => {
    expect(normalizeWireConfig(undefined).overlays).toEqual(defaultConfig().overlays)
    expect(normalizeWireConfig({}).overlays).toEqual(defaultConfig().overlays)
    expect(normalizeWireConfig({ overlays: null }).overlays).toEqual(defaultConfig().overlays)
  })

  it('接受部分 overlay 配置并补齐其余默认值', () => {
    const parsed = normalizeWireConfig({
      overlays: {
        wordmark: { mode: 'harness-remove' },
        title: { enabled: false },
      },
    })
    expect(parsed.overlays.wordmark).toEqual({ enabled: true, mode: 'harness-remove' })
    expect(parsed.overlays.title).toEqual({ enabled: false })
    expect(parsed.overlays.hero).toEqual({ enabled: true })
  })

  it('忽略类型错误与未知模式字段', () => {
    const parsed = normalizeWireConfig({
      overlays: {
        wordmark: { enabled: 'yes', mode: 'explode' },
        title: { enabled: 0 },
        hero: { enabled: 'no' },
        extra: { enabled: false },
      },
    })
    expect(parsed.overlays.wordmark).toEqual({ enabled: true, mode: 'replace' })
    expect(parsed.overlays.title).toEqual({ enabled: true })
    expect(parsed.overlays.hero).toEqual({ enabled: true })
  })
})

describe('maskProductName', () => {
  it('只替换完整产品名', () => {
    expect(maskProductName('DeepSeek Harness', 'Harness')).toBe('Harness')
    expect(maskProductName('My session — DeepSeek Harness', 'Harness')).toBe('My session — Harness')
    // 提供方名称、模型 ID 和用户内容中单独出现的 DeepSeek 刻意保持不变。
    expect(maskProductName('DeepSeek / DeepSeek-V4-Flash / deepseek-official', 'Harness'))
      .toBe('DeepSeek / DeepSeek-V4-Flash / deepseek-official')
  })

  it('使用配置的替代产品名', () => {
    expect(maskProductName('DeepSeek Harness', 'InnerAI')).toBe('InnerAI')
  })
})

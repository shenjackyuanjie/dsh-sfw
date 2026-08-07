/**
 * Pure masking-core tests: config parsing, the wire boundary, and the
 * product-name masker.
 */
import { describe, expect, it } from 'vitest'
import {
  defaultConfig, maskProductName, normalizeWireConfig,
} from '../src/mask.ts'

describe('normalizeWireConfig', () => {
  it('falls back to defaults for missing or malformed payloads', () => {
    expect(normalizeWireConfig(undefined)).toEqual(defaultConfig())
    expect(normalizeWireConfig('garbage')).toEqual(defaultConfig())
    expect(normalizeWireConfig(null)).toEqual(defaultConfig())
    expect(normalizeWireConfig([1, 2])).toEqual(defaultConfig())
  })

  it('accepts well-typed fields and ignores mistyped ones', () => {
    const parsed = normalizeWireConfig({ enabled: false, productName: 42, wordmark: 7 })
    expect(parsed.enabled).toBe(false)
    expect(parsed.productName).toBe('Harness')
    expect(parsed.wordmark).toBe('opencode')
    expect(normalizeWireConfig({ enabled: 'yes' }).enabled).toBe(true)
    expect(normalizeWireConfig({ productName: '' }).productName).toBe('Harness')
    expect(normalizeWireConfig({ wordmark: '' }).wordmark).toBe('opencode')
  })

  it('tolerates a payload serialized by an older host half (extra fields)', () => {
    const oldShape = {
      enabled: true,
      productName: 'Harness',
      providerName: 'DS',
      providerId: 'ds-official',
      models: { 'DeepSeek-V4-Flash': 'V4-Flash' },
      extra: {},
    }
    expect(normalizeWireConfig(oldShape)).toEqual({ enabled: true, productName: 'Harness', wordmark: 'opencode' })
  })
})

describe('maskProductName', () => {
  it('replaces only the full product spelling', () => {
    expect(maskProductName('DeepSeek Harness', 'Harness')).toBe('Harness')
    expect(maskProductName('My session — DeepSeek Harness', 'Harness')).toBe('My session — Harness')
    // Standalone DeepSeek occurrences (provider names, model ids, user
    // content) are deliberately NOT touched.
    expect(maskProductName('DeepSeek / DeepSeek-V4-Flash / deepseek-official', 'Harness'))
      .toBe('DeepSeek / DeepSeek-V4-Flash / deepseek-official')
  })

  it('uses the configured product name', () => {
    expect(maskProductName('DeepSeek Harness', 'InnerAI')).toBe('InnerAI')
  })
})

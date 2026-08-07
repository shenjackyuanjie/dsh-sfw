/**
 * Pure masking-core tests: rule construction, longest-first ordering, the
 * wire-boundary parser, and idempotence.
 */
import { describe, expect, it } from 'vitest'
import {
  buildRules, defaultConfig, maskString, normalizeWireConfig, serializeConfig,
} from '../src/mask.ts'

describe('buildRules', () => {
  it('orders rules longest-first so compound strings beat their parts', () => {
    const rules = buildRules(defaultConfig())
    const froms = rules.map(([from]) => from)
    const sorted = [...froms].sort((a, b) => b.length - a.length)
    expect(froms).toEqual(sorted)
    // 17-char provider id outranks the 16-char product name; every compound
    // token outranks its own parts ('DeepSeek Harness' before 'DeepSeek').
    expect(froms[0]).toBe('deepseek-official')
    expect(froms.indexOf('DeepSeek Harness')).toBeLessThan(froms.indexOf('DeepSeek'))
    expect(froms).toContain('DeepSeek-V4-Flash')
    expect(froms).toContain('deepseek')
  })

  it('merges the default model pairs and honors overrides and extras', () => {
    const config = { ...defaultConfig(), models: { 'DeepSeek-V4-Flash': 'Flash' }, extra: { 'DeepSeek': 'Private AI' } }
    const lookup = new Map(buildRules(config))
    expect(lookup.get('DeepSeek-V4-Flash')).toBe('Flash')
    expect(lookup.get('DeepSeek-V4-Pro')).toBe('V4-Pro')
    expect(lookup.get('DeepSeek')).toBe('Private AI')
    expect(lookup.get('deepseek-official')).toBe('ds-official')
  })
})

describe('maskString', () => {
  const rules = buildRules(defaultConfig())

  it('masks every known surface with its compound-first replacement', () => {
    expect(maskString('DeepSeek Harness', rules)).toBe('Harness')
    expect(maskString('DeepSeek-V4-Flash', rules)).toBe('V4-Flash')
    expect(maskString('DeepSeek-V4-Pro', rules)).toBe('V4-Pro')
    expect(maskString('deepseek-official', rules)).toBe('ds-official')
    expect(maskString('DeepSeek', rules)).toBe('DS')
    expect(maskString('deepseek-v4-flash', rules)).toBe('v4-flash')
    expect(maskString('deepseek', rules)).toBe('ds')
  })

  it('handles compound text and mixed case without partial-rule collisions', () => {
    expect(maskString('Welcome to DeepSeek Harness — DeepSeek-V4-Flash', rules))
      .toBe('Welcome to Harness — V4-Flash')
    expect(maskString('https://api.deepseek.com/v1', rules)).toBe('https://api.ds.com/v1')
    expect(maskString('DEEPSEEK PLATFORM', rules)).toBe('DS PLATFORM')
  })

  it('is idempotent', () => {
    const once = maskString('DeepSeek Harness / DeepSeek-V4-Flash / deepseek-official', rules)
    expect(maskString(once, rules)).toBe(once)
  })

  it('returns the input unchanged for an empty rule set', () => {
    expect(maskString('DeepSeek Harness', [])).toBe('DeepSeek Harness')
  })
})

describe('normalizeWireConfig', () => {
  it('falls back to defaults for missing or malformed payloads', () => {
    expect(normalizeWireConfig(undefined)).toEqual(defaultConfig())
    expect(normalizeWireConfig('garbage')).toEqual(defaultConfig())
    expect(normalizeWireConfig(null)).toEqual(defaultConfig())
    expect(normalizeWireConfig([1, 2])).toEqual(defaultConfig())
  })

  it('accepts well-typed fields and ignores mistyped ones', () => {
    const wire = {
      enabled: false,
      productName: 42,
      providerName: 'Inhouse',
      providerId: 'inhouse-official',
      models: { 'DeepSeek-V4-Flash': 7, 'DeepSeek-V4-Pro': 'Pro' },
      extra: { 'deepseek': 'inhouse' },
    }
    const parsed = normalizeWireConfig(wire)
    expect(parsed.enabled).toBe(false)
    expect(parsed.productName).toBe('Harness')
    expect(parsed.providerName).toBe('Inhouse')
    expect(parsed.providerId).toBe('inhouse-official')
    expect(parsed.models).toEqual({ 'DeepSeek-V4-Pro': 'Pro' })
    expect(parsed.extra).toEqual({ deepseek: 'inhouse' })
  })
})

describe('serializeConfig', () => {
  it('merges the default model pairs into the payload', () => {
    const merged = serializeConfig(defaultConfig())
    expect(merged.models['DeepSeek-V4-Flash']).toBe('V4-Flash')
    expect(merged.models['deepseek-v4-pro']).toBe('v4-pro')
  })
})

// @vitest-environment jsdom
/**
 * Browser-half DOM engine tests: the brand wordmark replacement (including
 * the descendant-svg scan), the title setter shadow, and the guarantee that
 * ordinary UI copy is left untouched.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { defaultConfig, maskProductName } from '../src/mask.ts'
import { patchTitle, patchWordmark, startWordmarkMasking } from '../src/client/dom.ts'

const PRODUCT_NAME = defaultConfig().productName

function wordmarkSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.innerHTML = `
    <defs>
      <clipPath id="dsh-wordmark-whale-clip"><rect width="23" height="17"/></clipPath>
      <clipPath id="dsh-wordmark-badge-clip"><rect width="46" height="14"/></clipPath>
    </defs>
    <g clip-path="url(#dsh-wordmark-whale-clip)">
      <path id="whale" d="M1 1 L2 2 Z" fill="currentColor"/>
    </g>
    <path id="letter-a" d="M3 3 Z" fill="currentColor"/>
    <path id="letter-b" d="M4 4 Z" fill="currentColor"/>
    <rect id="badge-plate" x="10" y="10" width="52" height="14" fill="currentColor"/>
    <g clip-path="url(#dsh-wordmark-badge-clip)">
      <path id="badge-letter" d="M5 5 Z" fill="var(--dsw-alias-label-primary-inverted)"/>
    </g>
  `
  return svg
}

/** Flush pending MutationObserver microtasks (jsdom delivers them async). */
const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('patchWordmark', () => {
  it('masks the letterforms and badge plate but keeps the whale glyph', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, PRODUCT_NAME)
    expect(svg.querySelector('#whale')?.getAttribute('fill')).toBe('currentColor')
    expect(svg.querySelector('#letter-a')?.getAttribute('fill')).toBe('transparent')
    expect(svg.querySelector('#letter-b')?.getAttribute('fill')).toBe('transparent')
    expect(svg.querySelector('#badge-plate')?.getAttribute('fill')).toBe('transparent')
    expect(svg.querySelector('#badge-letter')?.getAttribute('fill')).toBe('transparent')
  })

  it('appends the neutral product-name text next to the whale', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, 'InnerAI')
    const text = svg.querySelector('text[data-dsh-sfw-text]')
    expect(text?.textContent).toBe('InnerAI')
    expect(text?.getAttribute('x')).toBe('30')
    expect(text?.getAttribute('fill')).toBe('currentColor')
  })

  it('is idempotent (single text, no double patching)', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, PRODUCT_NAME)
    patchWordmark(svg, PRODUCT_NAME)
    expect(svg.querySelectorAll('[data-dsh-sfw-text]')).toHaveLength(1)
    expect(svg.querySelector('#letter-a')?.getAttribute('fill')).toBe('transparent')
  })

  it('skips text injection for an empty product name but still masks the letters', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, '')
    expect(svg.querySelector('[data-dsh-sfw-text]')).toBeNull()
    expect(svg.querySelector('#letter-a')?.getAttribute('fill')).toBe('transparent')
  })

  it('is a no-op on svgs without the whale clip', () => {
    const other = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    other.innerHTML = '<path d="M1 1 Z" fill="currentColor"/>'
    patchWordmark(other, PRODUCT_NAME)
    expect(other.querySelector('path')?.getAttribute('fill')).toBe('currentColor')
  })
})

describe('startWordmarkMasking', () => {
  it('patches wordmarks added as descendants of a large subtree', async () => {
    const stop = startWordmarkMasking(PRODUCT_NAME)
    // React-style mount: the whole UI arrives as ONE added subtree; the svg
    // is a descendant, never the added node itself (regression guard).
    const root = document.createElement('div')
    root.innerHTML = '<section><button><svg></svg></button></section>'
    root.querySelector('svg')?.replaceWith(wordmarkSvg())
    document.body.appendChild(root)
    await flush()
    const svg = root.querySelector('svg') as SVGSVGElement
    expect(svg.querySelector('#letter-a')?.getAttribute('fill')).toBe('transparent')
    expect(svg.querySelector('#whale')?.getAttribute('fill')).toBe('currentColor')
    expect(svg.querySelector('[data-dsh-sfw-text]')?.textContent).toBe(PRODUCT_NAME)
    stop()
  })

  it('re-patches a freshly remounted wordmark', async () => {
    const stop = startWordmarkMasking(PRODUCT_NAME)
    document.body.appendChild(wordmarkSvg())
    await flush()
    document.body.innerHTML = ''
    document.body.appendChild(wordmarkSvg())
    await flush()
    const svg = document.querySelector('svg') as SVGSVGElement
    expect(svg.querySelector('#letter-a')?.getAttribute('fill')).toBe('transparent')
    expect(svg.querySelectorAll('[data-dsh-sfw-text]')).toHaveLength(1)
    stop()
  })

  it('leaves ordinary UI text and attributes untouched', async () => {
    const stop = startWordmarkMasking(PRODUCT_NAME)
    document.body.innerHTML = `
      <button aria-label="选择模型，当前 DeepSeek-V4-Flash，推理等级 High">
        DeepSeek-V4-Flash
      </button>
      <div>Provider: DeepSeek (deepseek-official)</div>
      <input placeholder="deepseek-v4-pro" />
    `
    await flush()
    expect(document.body.textContent).toContain('DeepSeek-V4-Flash')
    expect(document.body.textContent).toContain('DeepSeek (deepseek-official)')
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('选择模型，当前 DeepSeek-V4-Flash，推理等级 High')
    expect(document.querySelector('input')?.getAttribute('placeholder')).toBe('deepseek-v4-pro')
    stop()
  })
})

describe('patchTitle', () => {
  const mask = (text: string): string => maskProductName(text, PRODUCT_NAME)

  it('masks the initial title and every later assignment', () => {
    document.title = 'DeepSeek Harness'
    const stop = patchTitle(mask)
    expect(document.title).toBe('Harness')
    document.title = 'My session — DeepSeek Harness'
    expect(document.title).toBe('My session — Harness')
    stop()
    document.title = 'DeepSeek Harness'
    expect(document.title).toBe('DeepSeek Harness')
  })

  it('restores the original accessor on dispose', () => {
    const stop = patchTitle(mask)
    stop()
    document.title = 'DeepSeek Harness'
    expect(document.title).toBe('DeepSeek Harness')
  })
})

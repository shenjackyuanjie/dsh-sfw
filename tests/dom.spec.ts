// @vitest-environment jsdom
/**
 * Browser-half DOM engine tests: the brand wordmark replacement (including
 * the descendant-svg scan and the button-functionality guarantee), the title
 * setter shadow, and the guarantee that ordinary UI copy is left untouched.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { defaultConfig, maskProductName } from '../src/mask.ts'
import { patchTitle, patchWordmark, startWordmarkMasking } from '../src/client/dom.ts'

const WORDMARK = defaultConfig().wordmark

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
  it('removes the entire original svg content (whale, letterforms, badge)', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, WORDMARK)
    expect(svg.querySelector('#whale')).toBeNull()
    expect(svg.querySelector('#letter-a')).toBeNull()
    expect(svg.querySelector('#badge-plate')).toBeNull()
    expect(svg.querySelectorAll('path')).toHaveLength(0)
    expect(svg.querySelectorAll('rect')).toHaveLength(0)
    expect(svg.querySelectorAll('g')).toHaveLength(0)
  })

  it('injects the centered wordmark lettering', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, 'opencode')
    const text = svg.querySelector('text[data-dsh-sfw-wordmark]')
    expect(text?.textContent).toBe('opencode')
    expect(text?.getAttribute('x')).toBe('91')
    expect(text?.getAttribute('text-anchor')).toBe('middle')
    expect(text?.getAttribute('font-size')).toBe('14')
    expect(text?.getAttribute('fill')).toBe('currentColor')
  })

  it('keeps the svg element itself (button sizing and clicks survive)', () => {
    const svg = wordmarkSvg()
    svg.setAttribute('width', '182')
    svg.setAttribute('height', '24')
    const button = document.createElement('button')
    button.setAttribute('aria-label', '新会话')
    button.appendChild(svg)
    patchWordmark(svg, WORDMARK)
    expect(button.querySelector('svg')).toBe(svg)
    expect(svg.getAttribute('width')).toBe('182')
    expect(svg.getAttribute('height')).toBe('24')
    expect(button.getAttribute('aria-label')).toBe('新会话')
  })

  it('is idempotent (single text, no double patching)', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, WORDMARK)
    patchWordmark(svg, WORDMARK)
    expect(svg.querySelectorAll('[data-dsh-sfw-wordmark]')).toHaveLength(1)
    expect(svg.children).toHaveLength(1)
  })

  it('clears the svg without injecting text for an empty wordmark', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, '')
    expect(svg.children).toHaveLength(0)
    expect(svg.querySelector('[data-dsh-sfw-wordmark]')).toBeNull()
  })

  it('is a no-op on svgs without the whale clip', () => {
    const other = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    other.innerHTML = '<path d="M1 1 Z" fill="currentColor"/>'
    patchWordmark(other, WORDMARK)
    expect(other.querySelector('path')?.getAttribute('fill')).toBe('currentColor')
  })
})

describe('startWordmarkMasking', () => {
  it('patches wordmarks added as descendants of a large subtree', async () => {
    const stop = startWordmarkMasking(WORDMARK)
    // React-style mount: the whole UI arrives as ONE added subtree; the svg
    // is a descendant, never the added node itself (regression guard).
    const root = document.createElement('div')
    root.innerHTML = '<section><button><svg></svg></button></section>'
    root.querySelector('svg')?.replaceWith(wordmarkSvg())
    document.body.appendChild(root)
    await flush()
    const svg = root.querySelector('svg') as SVGSVGElement
    expect(svg.querySelectorAll('path')).toHaveLength(0)
    expect(svg.querySelector('text[data-dsh-sfw-wordmark]')?.textContent).toBe(WORDMARK)
    stop()
  })

  it('re-patches a freshly remounted wordmark', async () => {
    const stop = startWordmarkMasking(WORDMARK)
    document.body.appendChild(wordmarkSvg())
    await flush()
    document.body.innerHTML = ''
    document.body.appendChild(wordmarkSvg())
    await flush()
    const svg = document.querySelector('svg') as SVGSVGElement
    expect(svg.querySelectorAll('path')).toHaveLength(0)
    expect(svg.querySelectorAll('[data-dsh-sfw-wordmark]')).toHaveLength(1)
    stop()
  })

  it('leaves ordinary UI text and attributes untouched', async () => {
    const stop = startWordmarkMasking(WORDMARK)
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
  const mask = (text: string): string => maskProductName(text, 'Harness')

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

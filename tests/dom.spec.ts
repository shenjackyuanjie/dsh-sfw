// @vitest-environment jsdom
/**
 * Browser-half DOM engine tests: the brand wordmark replacement (including
 * the descendant-svg scan and the button-functionality guarantee), the title
 * setter shadow, and the guarantee that ordinary UI copy is left untouched.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { defaultConfig, maskProductName } from '../src/mask.ts'
import {
  patchHeroChrome, patchTitle, patchWordmark, startHeroCleanup,
  startWordmarkMasking,
} from '../src/client/dom.ts'

const WORDMARK = defaultConfig().wordmark
const WORDMARK_SIZE = defaultConfig().wordmarkSize

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

  it('injects the centered wordmark lettering at the configured size', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, 'opencode', WORDMARK_SIZE)
    const text = svg.querySelector('text[data-dsh-sfw-wordmark]')
    expect(text?.textContent).toBe('opencode')
    expect(text?.getAttribute('x')).toBe('91')
    expect(text?.getAttribute('text-anchor')).toBe('middle')
    expect(text?.getAttribute('font-size')).toBe(String(WORDMARK_SIZE))
    expect(text?.getAttribute('fill')).toBe('currentColor')
  })

  it('scales the baseline and letter-spacing with a custom size', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, 'opencode', 22)
    const text = svg.querySelector('text[data-dsh-sfw-wordmark]')
    expect(text?.getAttribute('font-size')).toBe('22')
    expect(text?.getAttribute('y')).toBe('19.6')
    expect(text?.getAttribute('letter-spacing')).toBe('1.6')
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

describe('patchHeroChrome', () => {
  /** A realistic hero headline row: fish svg + headline text + preview badge. */
  function heroRow(): HTMLElement {
    const headline = document.createElement('div')
    headline.innerHTML = `
      <svg width="34" height="25" viewBox="0 0 23.16 17.04" fill="none" aria-hidden="true">
        <path d="M22.9168 1.43018Z" fill="currentColor"/>
      </svg>
      <span>开始构建吧</span>
      <span>预览版</span>
    `
    return headline
  }

  it('hides the fish logo and the preview badge, keeps the headline text', () => {
    const headline = heroRow()
    patchHeroChrome(headline)
    const fish = headline.querySelector('svg') as SVGSVGElement
    const badge = headline.querySelectorAll('span')[1] as HTMLSpanElement
    const text = headline.querySelector('span') as HTMLSpanElement
    expect(fish.style.display).toBe('none')
    expect(badge.style.display).toBe('none')
    expect(fish.getAttribute('data-dsh-sfw-hidden')).toBe('true')
    expect(badge.getAttribute('data-dsh-sfw-hidden')).toBe('true')
    expect(text.textContent).toBe('开始构建吧')
    expect(text.style.display).not.toBe('none')
    // The row is flipped to a centered flex so the remaining text stays centered.
    expect(headline.style.display).toBe('flex')
    expect(headline.style.justifyContent).toBe('center')
  })

  it('is idempotent (single marker, no double hiding)', () => {
    const headline = heroRow()
    patchHeroChrome(headline)
    patchHeroChrome(headline)
    expect(headline.getAttribute('data-dsh-sfw-hidden')).toBe('true')
    // The row marker lives on the row itself; descendants carry fish + badge.
    expect(headline.querySelectorAll('[data-dsh-sfw-hidden]')).toHaveLength(2)
    expect(headline.querySelector('svg')?.style.display).toBe('none')
  })

  it('is a no-op on trees without a hero headline', () => {
    const root = document.createElement('div')
    root.innerHTML = '<span>预览版</span><svg viewBox="0 0 23.16 17.04"><path d="M1 1Z"/></svg>'
    patchHeroChrome(root)
    expect(root.querySelector('span')?.style.display).not.toBe('none')
    expect(root.querySelector('svg')?.style.display).not.toBe('none')
  })

  it('leaves fish logos outside the hero headline untouched', () => {
    const root = document.createElement('div')
    root.innerHTML = '<svg viewBox="0 0 23.16 17.04"><path d="M1 1Z"/></svg>'
    patchHeroChrome(root)
    expect(root.querySelector('svg')?.style.display).not.toBe('none')
  })
})

describe('startHeroCleanup', () => {
  it('cleans a hero mounted after the observer started', async () => {
    const stop = startHeroCleanup()
    const headline = document.createElement('div')
    headline.innerHTML = `
      <svg width="34" height="25" viewBox="0 0 23.16 17.04"><path d="M1 1Z"/></svg>
      <span>开始构建吧</span>
      <span>预览版</span>
    `
    document.body.appendChild(headline)
    await flush()
    expect(headline.querySelector('svg')?.style.display).toBe('none')
    expect(headline.querySelectorAll('span')[1].style.display).toBe('none')
    stop()
  })

  it('cleans a freshly remounted hero again', async () => {
    const stop = startHeroCleanup()
    for (let i = 0; i < 2; i++) {
      document.body.innerHTML = ''
      const headline = document.createElement('div')
      headline.innerHTML = `
        <svg width="34" height="25" viewBox="0 0 23.16 17.04"><path d="M1 1Z"/></svg>
        <span>开始构建吧</span>
        <span>预览版</span>
      `
      document.body.appendChild(headline)
      await flush()
      expect(headline.querySelector('svg')?.style.display).toBe('none')
      expect(headline.querySelectorAll('span')[1].style.display).toBe('none')
    }
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

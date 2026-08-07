// @vitest-environment jsdom
/**
 * Browser-half DOM engine tests: text-node/attribute rewriting, editing
 * protection, the title setter shadow, and the brand wordmark path patch.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { buildRules, defaultConfig, maskString } from '../src/mask.ts'
import { patchTitle, patchWordmark, startDomMasking } from '../src/client/dom.ts'

const rules = buildRules(defaultConfig())
const mask = (text: string): string => maskString(text, rules)

/** Flush pending MutationObserver microtasks (jsdom delivers them async). */
const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

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

afterEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('startDomMasking', () => {
  it('masks existing and later-added text nodes', async () => {
    document.body.innerHTML = '<div id="a">DeepSeek Harness</div>'
    const stop = startDomMasking(mask)
    // The initial sweep is synchronous.
    expect(document.getElementById('a')?.textContent).toBe('Harness')

    const added = document.createElement('div')
    added.textContent = 'model DeepSeek-V4-Flash / deepseek-official'
    document.body.appendChild(added)
    await flush()
    expect(added.textContent).toBe('model V4-Flash / ds-official')
    stop()
  })

  it('masks display attributes on added elements', async () => {
    const stop = startDomMasking(mask)
    const button = document.createElement('button')
    button.setAttribute('aria-label', '选择模型，当前 DeepSeek-V4-Flash')
    button.setAttribute('title', 'DeepSeek Harness')
    button.setAttribute('placeholder', 'deepseek-v4-pro')
    button.setAttribute('href', 'https://www.deepseek.com')
    document.body.appendChild(button)
    await flush()
    expect(button.getAttribute('aria-label')).toBe('选择模型，当前 V4-Flash')
    expect(button.getAttribute('title')).toBe('Harness')
    expect(button.getAttribute('placeholder')).toBe('v4-pro')
    // URL attributes are never rewritten.
    expect(button.getAttribute('href')).toBe('https://www.deepseek.com')
    stop()
  })

  it('never rewrites text inside an element the user is editing', () => {
    const stop = startDomMasking(mask)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.textContent = 'about DeepSeek'
    document.body.appendChild(editable)
    editable.focus()
    expect(editable.textContent).toBe('about DeepSeek')
    stop()
  })

  it('leaves textarea and script content alone', () => {
    const stop = startDomMasking(mask)
    const textarea = document.createElement('textarea')
    textarea.textContent = 'deepseek notes'
    document.body.appendChild(textarea)
    const script = document.createElement('script')
    script.textContent = 'const x = "DeepSeek Harness"'
    document.body.appendChild(script)
    expect(textarea.textContent).toBe('deepseek notes')
    expect(script.textContent).toBe('const x = "DeepSeek Harness"')
    stop()
  })

  it('masks characterData mutations (in-place text rewrites)', async () => {
    const stop = startDomMasking(mask)
    const node = document.createElement('div')
    document.body.appendChild(node)
    const text = document.createTextNode('DeepSeek')
    node.appendChild(text)
    await flush()
    expect(text.nodeValue).toBe('DS')
    // A later in-place rewrite (React-style) gets masked too.
    text.nodeValue = 'DeepSeek-V4-Flash'
    await flush()
    expect(text.nodeValue).toBe('V4-Flash')
    stop()
  })

  it('keeps converging without looping when masked text is written back', async () => {
    const stop = startDomMasking(mask)
    const node = document.createElement('div')
    node.textContent = 'DeepSeek Harness'
    document.body.appendChild(node)
    await flush()
    // The observer's own write lands back in the DOM; a second pass must not change it.
    expect(node.textContent).toBe('Harness')
    stop()
  })
})

describe('patchWordmark', () => {
  it('masks the letterforms and badge plate but keeps the whale glyph', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg)
    expect(svg.querySelector('#whale')?.getAttribute('fill')).toBe('currentColor')
    expect(svg.querySelector('#letter-a')?.getAttribute('fill')).toBe('transparent')
    expect(svg.querySelector('#letter-b')?.getAttribute('fill')).toBe('transparent')
    expect(svg.querySelector('#badge-plate')?.getAttribute('fill')).toBe('transparent')
    expect(svg.querySelector('#badge-letter')?.getAttribute('fill')).toBe('transparent')
  })

  it('is a no-op on svgs without the whale clip', () => {
    const other = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    other.innerHTML = '<path d="M1 1 Z" fill="currentColor"/>'
    patchWordmark(other)
    expect(other.querySelector('path')?.getAttribute('fill')).toBe('currentColor')
  })

  it('patches wordmarks added to the live document', async () => {
    const stop = startDomMasking(mask)
    document.body.appendChild(wordmarkSvg())
    await flush()
    const svg = document.querySelector('svg') as SVGSVGElement
    expect(svg.querySelector('#letter-a')?.getAttribute('fill')).toBe('transparent')
    expect(svg.querySelector('#whale')?.getAttribute('fill')).toBe('currentColor')
    stop()
  })
})

describe('patchTitle', () => {
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

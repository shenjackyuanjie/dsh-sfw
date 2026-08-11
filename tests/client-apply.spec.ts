// @vitest-environment jsdom
/**
 * 浏览器端 apply 装配测试：用真实 cordis 上下文 + 注入的 `window.__DSH_SFW__`
 * 断言各 overlay 独立开关与字标模式在 DOM 上的实际效果，以及卸载后的释放。
 */
import { Context } from 'cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.ts'
import { defaultConfig, type SfwConfig } from '../src/mask.ts'

/** 刷新待处理的 MutationObserver 微任务；jsdom 会异步投递。 */
const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

/** 与真实 BrandWordmark 结构一致的字标 SVG（鲸鱼 + 字母 + HARNESS 铭牌）。 */
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

/** 接近真实结构的欢迎区标题行：鱼形 SVG、标题文本和预览徽章。 */
function heroRow(): HTMLElement {
  const headline = document.createElement('div')
  headline.innerHTML = `
    <svg width="34" height="25" viewBox="0 0 23.16 17.04" fill="none" aria-hidden="true">
      <path d="M22.9168 1.43018Z" fill="currentColor"/>
    </svg>
    <span>探索未知之境</span>
    <span>预览版</span>
  `
  return headline
}

/** 当前已装配的插件释放器，afterEach 统一释放避免观察器跨测试泄漏。 */
let disposers: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  delete (window as unknown as Record<string, unknown>).__DSH_SFW__
})

/** 以给定配置装配浏览器端插件；`window.__DSH_SFW__` 模拟宿主注入。 */
async function mount(config: SfwConfig): Promise<void> {
  window.__DSH_SFW__ = config
  const ctx = new Context()
  const fiber = ctx.plugin({ name: 'dsh-sfw', apply })
  await fiber
  await flush()
  disposers.push(() => fiber.dispose())
}

describe('client apply 的 overlays 独立开关', () => {
  it('默认配置下标题、字标、欢迎区全部生效', async () => {
    await mount(defaultConfig())
    document.title = 'My session — DeepSeek Harness'
    expect(document.title).toBe('My session — Harness')
    document.body.appendChild(wordmarkSvg())
    await flush()
    const svg = document.body.querySelector('svg') as SVGSVGElement
    expect(svg.querySelectorAll('path')).toHaveLength(16)
    expect(svg.querySelector('g[data-dsh-sfw-wordmark="opencode"]')).not.toBeNull()
    document.body.appendChild(heroRow())
    await flush()
    const fish = document.body.querySelectorAll('svg')[1] as SVGSVGElement
    expect(fish.style.display).toBe('none')
    expect(document.body.querySelectorAll('span')[1].style.display).toBe('none')
  })

  it('overlays.title 关闭时不拦截标签页标题', async () => {
    await mount({
      ...defaultConfig(),
      overlays: { ...defaultConfig().overlays, title: { enabled: false } },
    })
    document.title = 'My session — DeepSeek Harness'
    expect(document.title).toBe('My session — DeepSeek Harness')
  })

  it('overlays.wordmark 关闭时保持字标原样', async () => {
    await mount({
      ...defaultConfig(),
      overlays: { ...defaultConfig().overlays, wordmark: { enabled: false, mode: 'replace' } },
    })
    document.body.appendChild(wordmarkSvg())
    await flush()
    const svg = document.body.querySelector('svg') as SVGSVGElement
    expect(svg.querySelector('#whale')).not.toBeNull()
    expect(svg.querySelector('#badge-plate')).not.toBeNull()
    expect(svg.querySelectorAll('[data-dsh-sfw-wordmark]')).toHaveLength(0)
  })

  it('overlays.wordmark.mode 为 harness-remove 时只移除铭牌', async () => {
    await mount({
      ...defaultConfig(),
      overlays: { ...defaultConfig().overlays, wordmark: { enabled: true, mode: 'harness-remove' } },
    })
    document.body.appendChild(wordmarkSvg())
    await flush()
    const svg = document.body.querySelector('svg') as SVGSVGElement
    expect(svg.querySelector('#badge-plate')).toBeNull()
    expect(svg.querySelector('#badge-letter')).toBeNull()
    expect(svg.querySelector('#whale')).not.toBeNull()
    expect(svg.querySelector('#letter-a')).not.toBeNull()
    expect(svg.querySelectorAll('[data-dsh-sfw-wordmark]')).toHaveLength(0)
  })

  it('overlays.hero 关闭时保留欢迎区鱼形图标与徽章', async () => {
    await mount({
      ...defaultConfig(),
      overlays: { ...defaultConfig().overlays, hero: { enabled: false } },
    })
    document.body.appendChild(heroRow())
    await flush()
    const fish = document.body.querySelector('svg') as SVGSVGElement
    expect(fish.style.display).not.toBe('none')
    expect(document.body.querySelectorAll('span')[1].style.display).not.toBe('none')
  })

  it('enabled 为 false 时不启动任何处理', async () => {
    await mount({ ...defaultConfig(), enabled: false })
    document.title = 'My session — DeepSeek Harness'
    expect(document.title).toBe('My session — DeepSeek Harness')
    document.body.appendChild(wordmarkSvg())
    await flush()
    const svg = document.body.querySelector('svg') as SVGSVGElement
    expect(svg.querySelector('#whale')).not.toBeNull()
    expect(svg.querySelectorAll('[data-dsh-sfw-wordmark]')).toHaveLength(0)
  })

  it('卸载后停止字标处理', async () => {
    await mount(defaultConfig())
    document.body.appendChild(wordmarkSvg())
    await flush()
    expect(document.body.querySelectorAll('[data-dsh-sfw-wordmark]')).toHaveLength(1)
    const dispose = disposers.pop()!
    await dispose()
    document.body.innerHTML = ''
    document.body.appendChild(wordmarkSvg())
    await flush()
    const svg = document.body.querySelector('svg') as SVGSVGElement
    expect(svg.querySelector('#whale')).not.toBeNull()
    expect(svg.querySelector('#badge-plate')).not.toBeNull()
    expect(svg.querySelectorAll('[data-dsh-sfw-wordmark]')).toHaveLength(0)
  })
})

// @vitest-environment jsdom
/**
 * 浏览器端 DOM 引擎测试：品牌字标替换（含后代 SVG 扫描与按钮功能保证）、
 * 标题 setter 覆盖，以及普通界面文案保持不变的保证。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { maskProductName } from '../src/mask.ts'
import {
  patchHeroChrome, patchTitle, patchWordmark, startHeroCleanup,
  startWordmarkMasking,
} from '../src/client/dom.ts'

const WORDMARK = 'opencode'

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

/** 刷新待处理的 MutationObserver 微任务；jsdom 会异步投递。 */
const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('patchWordmark', () => {
  it('移除原鲸鱼、字母轮廓和铭牌', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, WORDMARK)
    expect(svg.querySelector('#whale')).toBeNull()
    expect(svg.querySelector('#letter-a')).toBeNull()
    expect(svg.querySelector('#badge-plate')).toBeNull()
    expect(svg.querySelectorAll('rect')).toHaveLength(0)
    expect(svg.querySelectorAll('defs')).toHaveLength(0)
  })

  it('注入 OpenCode 官方 viewBox 和精确矢量路径', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, WORDMARK)
    const group = svg.querySelector('g[data-dsh-sfw-wordmark="opencode"]')
    const paths = group?.querySelectorAll('path') ?? []
    expect(svg.getAttribute('viewBox')).toBe('0 0 234 42')
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    expect(paths).toHaveLength(16)
    expect(paths[0]?.getAttribute('d')).toBe('M18 30H6V18H18V30Z')
    expect(paths[15]?.getAttribute('d'))
      .toBe('M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z')
    expect(svg.querySelector('text')).toBeNull()
  })

  it('把 OpenCode 的三档颜色映射为可随主题变化的 currentColor', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, WORDMARK)
    const paths = svg.querySelectorAll('path')
    expect([...paths].every(path => path.getAttribute('fill') === 'currentColor')).toBe(true)
    expect(paths[0]?.getAttribute('fill-opacity')).toBe('0.3')
    expect(paths[1]?.getAttribute('fill-opacity')).toBe('0.72')
    expect(paths[9]?.hasAttribute('fill-opacity')).toBe(false)
  })

  it('为自定义名称注入像素矢量路径', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, 'openclaw')
    expect(svg.getAttribute('viewBox')).toBe('0 0 47 7')
    expect(svg.querySelector('g[data-dsh-sfw-wordmark="openclaw"]')).not.toBeNull()
    expect(svg.querySelectorAll('path')).toHaveLength(8)
    expect(svg.querySelector('text')).toBeNull()
  })

  it('保留 SVG 元素自身以及按钮尺寸和点击行为', () => {
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

  it('具有幂等性且不会重复注入路径组', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, WORDMARK)
    patchWordmark(svg, WORDMARK)
    expect(svg.querySelectorAll('[data-dsh-sfw-wordmark]')).toHaveLength(1)
    expect(svg.children).toHaveLength(1)
  })

  it('在同一个 SVG 上切换配置字标', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, WORDMARK)
    patchWordmark(svg, 'reasonix')
    expect(svg.getAttribute('viewBox')).toBe('0 0 47 7')
    expect(svg.querySelector('g[data-dsh-sfw-wordmark="reasonix"]')).not.toBeNull()
    expect(svg.querySelectorAll('path')).toHaveLength(8)
  })

  it('不处理缺少鲸鱼 clipPath 的 SVG', () => {
    const other = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    other.innerHTML = '<path d="M1 1 Z" fill="currentColor"/>'
    patchWordmark(other, WORDMARK)
    expect(other.querySelector('path')?.getAttribute('fill')).toBe('currentColor')
  })
})

describe('patchWordmark 的 harness-remove 模式', () => {
  it('只移除 HARNESS 铭牌并保留 DeepSeek 字母与鲸鱼 logo', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, WORDMARK, 'harness-remove')
    // 铭牌：底板 rect、文字组、clipPath def 全部移除。
    expect(svg.querySelector('#badge-plate')).toBeNull()
    expect(svg.querySelector('#badge-letter')).toBeNull()
    expect(svg.querySelector('#dsh-wordmark-badge-clip')).toBeNull()
    // 鲸鱼 clipPath def 内的 rect 与深色底板不同，不属于铭牌，应保留。
    expect([...svg.children].filter(child => child.tagName.toLowerCase() === 'rect'))
      .toHaveLength(0)
    // DeepSeek 部分：鲸鱼 clip 组、字母 path、鲸鱼 clipPath def 保留原位。
    expect(svg.querySelector('#whale')).not.toBeNull()
    expect(svg.querySelector('#letter-a')).not.toBeNull()
    expect(svg.querySelector('#letter-b')).not.toBeNull()
    expect(svg.querySelector('#dsh-wordmark-whale-clip')).not.toBeNull()
    // 不注入任何替代路径。
    expect(svg.querySelectorAll('[data-dsh-sfw-wordmark]')).toHaveLength(0)
  })

  it('具有幂等性且可在重挂载后再次移除', () => {
    const svg = wordmarkSvg()
    patchWordmark(svg, WORDMARK, 'harness-remove')
    patchWordmark(svg, WORDMARK, 'harness-remove')
    expect(svg.querySelector('#badge-plate')).toBeNull()
    expect(svg.querySelector('#whale')).not.toBeNull()
    // React 恢复 children 后再次移除。
    svg.innerHTML = wordmarkSvg().innerHTML
    patchWordmark(svg, WORDMARK, 'harness-remove')
    expect(svg.querySelector('#badge-plate')).toBeNull()
    expect(svg.querySelector('#whale')).not.toBeNull()
  })

  it('不处理缺少品牌 clipPath 的 SVG', () => {
    const other = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    other.innerHTML = '<rect x="0" y="0" width="10" height="10" fill="currentColor"/>'
    patchWordmark(other, WORDMARK, 'harness-remove')
    expect(other.querySelector('rect')).not.toBeNull()
  })
})

describe('startWordmarkMasking', () => {
  it('处理作为大型新增子树后代出现的字标', async () => {
    const stop = startWordmarkMasking(WORDMARK)
    // React 风格挂载会把整个界面作为一棵新增子树加入；SVG 只是后代，
    // 不会成为新增节点本身，这是对应的回归保护。
    const root = document.createElement('div')
    root.innerHTML = '<section><button><svg></svg></button></section>'
    root.querySelector('svg')?.replaceWith(wordmarkSvg())
    document.body.appendChild(root)
    await flush()
    const svg = root.querySelector('svg') as SVGSVGElement
    expect(svg.querySelectorAll('path')).toHaveLength(16)
    expect(svg.querySelector('g[data-dsh-sfw-wordmark="opencode"]')).not.toBeNull()
    stop()
  })

  it('重新处理刚刚重挂载的字标', async () => {
    const stop = startWordmarkMasking(WORDMARK)
    document.body.appendChild(wordmarkSvg())
    await flush()
    document.body.innerHTML = ''
    document.body.appendChild(wordmarkSvg())
    await flush()
    const svg = document.querySelector('svg') as SVGSVGElement
    expect(svg.querySelectorAll('path')).toHaveLength(16)
    expect(svg.querySelectorAll('[data-dsh-sfw-wordmark]')).toHaveLength(1)
    stop()
  })

  it('React 在现有 SVG 内恢复 children 时重新处理', async () => {
    const stop = startWordmarkMasking(WORDMARK)
    const svg = wordmarkSvg()
    document.body.appendChild(svg)
    await flush()
    svg.innerHTML = wordmarkSvg().innerHTML
    await flush()
    expect(svg.querySelector('#whale')).toBeNull()
    expect(svg.querySelectorAll('path')).toHaveLength(16)
    expect(svg.querySelectorAll('[data-dsh-sfw-wordmark]')).toHaveLength(1)
    stop()
  })

  it('保持普通界面文本和属性不变', async () => {
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

  it('harness-remove 模式处理重挂载的字标并保留 DeepSeek 部分', async () => {
    const stop = startWordmarkMasking(WORDMARK, 'harness-remove')
    document.body.appendChild(wordmarkSvg())
    await flush()
    const svg = document.querySelector('svg') as SVGSVGElement
    expect(svg.querySelector('#badge-plate')).toBeNull()
    expect(svg.querySelector('#whale')).not.toBeNull()
    expect(svg.querySelector('#letter-a')).not.toBeNull()
    // 重挂载后铭牌再次出现，观察器应再次移除。
    document.body.innerHTML = ''
    document.body.appendChild(wordmarkSvg())
    await flush()
    const remounted = document.querySelector('svg') as SVGSVGElement
    expect(remounted.querySelector('#badge-plate')).toBeNull()
    expect(remounted.querySelector('#whale')).not.toBeNull()
    stop()
  })
})

describe('patchHeroChrome', () => {
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

  it('隐藏鱼形图标和预览徽章并保留标题文本', () => {
    const headline = heroRow()
    patchHeroChrome(headline)
    const fish = headline.querySelector('svg') as SVGSVGElement
    const badge = headline.querySelectorAll('span')[1] as HTMLSpanElement
    const text = headline.querySelector('span') as HTMLSpanElement
    expect(fish.style.display).toBe('none')
    expect(badge.style.display).toBe('none')
    expect(fish.getAttribute('data-dsh-sfw-hidden')).toBe('true')
    expect(badge.getAttribute('data-dsh-sfw-hidden')).toBe('true')
    expect(text.textContent).toBe('探索未知之境')
    expect(text.style.display).not.toBe('none')
    // 标题行改为居中 flex 后，剩余文本仍位于视觉中心。
    expect(headline.style.display).toBe('flex')
    expect(headline.style.justifyContent).toBe('center')
  })

  it('具有幂等性且不会重复隐藏', () => {
    const headline = heroRow()
    patchHeroChrome(headline)
    patchHeroChrome(headline)
    expect(headline.getAttribute('data-dsh-sfw-hidden')).toBe('true')
    // 行标记位于标题行自身，后代标记分别位于鱼形图标和徽章上。
    expect(headline.querySelectorAll('[data-dsh-sfw-hidden]')).toHaveLength(2)
    expect(headline.querySelector('svg')?.style.display).toBe('none')
  })

  it('不处理缺少欢迎区标题的节点树', () => {
    const root = document.createElement('div')
    root.innerHTML = '<span>预览版</span><svg viewBox="0 0 23.16 17.04"><path d="M1 1Z"/></svg>'
    patchHeroChrome(root)
    expect(root.querySelector('span')?.style.display).not.toBe('none')
    expect(root.querySelector('svg')?.style.display).not.toBe('none')
  })

  it('保持欢迎区标题以外的鱼形图标不变', () => {
    const root = document.createElement('div')
    root.innerHTML = '<svg viewBox="0 0 23.16 17.04"><path d="M1 1Z"/></svg>'
    patchHeroChrome(root)
    expect(root.querySelector('svg')?.style.display).not.toBe('none')
  })
})

describe('startHeroCleanup', () => {
  it('清理观察器启动后才挂载的欢迎区', async () => {
    const stop = startHeroCleanup()
    const headline = document.createElement('div')
    headline.innerHTML = `
      <svg width="34" height="25" viewBox="0 0 23.16 17.04"><path d="M1 1Z"/></svg>
      <span>探索未知之境</span>
      <span>预览版</span>
    `
    document.body.appendChild(headline)
    await flush()
    expect(headline.querySelector('svg')?.style.display).toBe('none')
    expect(headline.querySelectorAll('span')[1].style.display).toBe('none')
    stop()
  })

  it('再次清理刚刚重挂载的欢迎区', async () => {
    const stop = startHeroCleanup()
    for (let i = 0; i < 2; i++) {
      document.body.innerHTML = ''
      const headline = document.createElement('div')
      headline.innerHTML = `
        <svg width="34" height="25" viewBox="0 0 23.16 17.04"><path d="M1 1Z"/></svg>
        <span>探索未知之境</span>
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

  it('处理初始标题和之后的每次赋值', () => {
    document.title = 'DeepSeek Harness'
    const stop = patchTitle(mask)
    expect(document.title).toBe('Harness')
    document.title = 'My session — DeepSeek Harness'
    expect(document.title).toBe('My session — Harness')
    stop()
    document.title = 'DeepSeek Harness'
    expect(document.title).toBe('DeepSeek Harness')
  })

  it('释放时恢复原始访问器', () => {
    const stop = patchTitle(mask)
    stop()
    document.title = 'DeepSeek Harness'
    expect(document.title).toBe('DeepSeek Harness')
  })
})

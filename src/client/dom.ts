/**
 * 浏览器品牌处理引擎：替换 DeepSeek Harness 字标、隐藏标签页产品名，并清理
 * 新对话欢迎区的鱼形图标和“预览版”徽章。模型选择器、提供方名称、设置文案
 * 与消息内容均保持原样。
 *
 * - `patchTitle` 覆盖 `document.title` 的 setter，使每次赋值（包括外壳生成的
 *   `"<会话> — DeepSeek Harness"`）都会先完成替换，并立即处理初始标题。
 * - `startWordmarkMasking` 在整个文档上运行 MutationObserver，把侧栏品牌行、
 *   欢迎提示和引导弹窗中的每个 `BrandWordmark` SVG 替换为配置的矢量字标
 *   （`mode: 'replace'`），或只移除其 HARNESS 铭牌、保留 DeepSeek 字母与
 *   鲸鱼 logo（`mode: 'harness-remove'`）。原字标的鲸鱼、字母和 HARNESS 铭牌
 *   会整体移除，再注入生成后的路径。宿主持有的 SVG 外壳保持不变，因此外层
 *   按钮的尺寸、aria-label 和点击处理均不受影响。按钮整体重挂载时会再次替换。
 * - `startHeroCleanup` 隐藏“探索未知之境”标题行中的鱼形图标和“预览版”徽章，
 *   并把标题行改为居中 flex。这里只写入行内样式，不删除 React 节点；重渲染
 *   或重挂载后仍可再次处理。
 *
 * 字标识别必须扫描新增子树的所有后代：React 会一次挂载整棵界面子树，SVG
 * 通常不是 MutationObserver 记录中的新增节点本身。
 * @module @shenjack/dsh-sfw/client/dom
 */

import type { WordmarkMode } from '../mask.ts'
import { resolveWordmark } from './wordmark.ts'

/** 用于识别 BrandWordmark SVG 的 clipPath ID。 */
const WHALE_CLIP_ID = 'dsh-wordmark-whale-clip'

/** 用于识别 HARNESS 铭牌文字组的 clipPath ID。 */
const BADGE_CLIP_ID = 'dsh-wordmark-badge-clip'

/** 注入替代路径组时使用的幂等标记属性。 */
const WORDMARK_MARKER = 'data-dsh-sfw-wordmark'

/** createElementNS 所需的 SVG 命名空间。 */
const SVG_NS = 'http://www.w3.org/2000/svg'

/** FishLogo SVG 的原始 viewBox，用作欢迎区鱼形图标的稳定标识。 */
const FISH_VIEWBOX = '0 0 23.16 17.04'

/** 隐藏欢迎区元素时使用的幂等标记属性。 */
const HIDDEN_MARKER = 'data-dsh-sfw-hidden'

/** 欢迎区标题文案，对应 locales.ts 中的 `hero.headline`（2026-08-10 起为「探索未知之境」）。 */
const HERO_HEADLINE = '探索未知之境'

/** 欢迎区预览徽章文案，对应 locales.ts 中的 `hero.preview`。 */
const HERO_PREVIEW = '预览版'

/**
 * 处理一个品牌字标 SVG。`replace` 模式清空原 children 并注入配置名称对应的
 * 矢量路径；`harness-remove` 模式只删除 HARNESS 铭牌（底板、文字组与 clipPath
 * def），保留 DeepSeek 字母与鲸鱼 logo。两种模式都保留宿主持有的外层 SVG，
 * 从而保留 React 几何、按钮行为、aria 属性和 CSS 颜色继承。
 * @param svg 通过鲸鱼/铭牌 clipPath ID 识别出的字标 SVG。
 * @param wordmark 要显示的字标名称（replace 模式）。
 * @param mode 处理模式，默认 `replace`。
 */
export function patchWordmark(svg: SVGElement, wordmark: string, mode: WordmarkMode = 'replace'): void {
  const current = svg.querySelector(`[${WORDMARK_MARKER}]`)
  const isBrand = current !== null
    || svg.querySelector(`#${WHALE_CLIP_ID}`) !== null
    || svg.querySelector(`#${BADGE_CLIP_ID}`) !== null
  if (!isBrand) return
  if (mode === 'harness-remove') {
    removeHarnessBadge(svg)
    return
  }
  const vector = resolveWordmark(wordmark)
  if (current?.getAttribute(WORDMARK_MARKER) === vector.key) return
  svg.replaceChildren()
  svg.setAttribute('viewBox', vector.viewBox)
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  const group = document.createElementNS(SVG_NS, 'g')
  group.setAttribute(WORDMARK_MARKER, vector.key)
  for (const { d, opacity } of vector.paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', 'currentColor')
    if (opacity !== 1) path.setAttribute('fill-opacity', String(opacity))
    group.appendChild(path)
  }
  svg.appendChild(group)
}

/**
 * 只移除字标 SVG 的 HARNESS 铭牌：引用铭牌 clipPath 的文字组、作为 svg 直接
 * 子元素的铭牌底板 rect，以及不再被引用的铭牌 clipPath def。鲸鱼 clip 组、
 * DeepSeek 字母 path 与鲸鱼 clipPath def 保持原位；React 重挂载后铭牌再次
 * 出现时，观察器会再次调用本函数。非品牌 SVG 由调用方先行排除。
 * @param svg 品牌字标 SVG。
 */
export function removeHarnessBadge(svg: SVGElement): void {
  for (const el of svg.querySelectorAll(`[clip-path*="${BADGE_CLIP_ID}"]`)) {
    el.remove()
  }
  // 铭牌底板是 svg 的直接子元素 rect（defs 内的 rect 嵌套在 clipPath 中，
  // 不在 svg.children 之列），与真实组件的结构一一对应。
  for (const child of [...svg.children]) {
    if (child.tagName.toLowerCase() === 'rect') child.remove()
  }
  svg.querySelector(`#${BADGE_CLIP_ID}`)?.remove()
}

/** 替换根节点自身及其所有后代中的字标 SVG。 */
function patchWordmarksUnder(root: Node, wordmark: string, mode: WordmarkMode): void {
  if (root instanceof SVGElement) patchWordmark(root, wordmark, mode)
  if (root instanceof Element) {
    for (const svg of root.querySelectorAll('svg')) patchWordmark(svg as SVGElement, wordmark, mode)
  }
}

/**
 * 在整个文档上启动实时字标处理（替换或仅移除 HARNESS 铭牌）。
 * @param wordmark 要显示的字标名称（replace 模式）。
 * @param mode 处理模式，默认 `replace`。
 * @returns 用于断开观察器的释放函数。
 */
export function startWordmarkMasking(wordmark: string, mode: WordmarkMode = 'replace'): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      // React 若在现有 SVG 内恢复 children，变更目标会是外层字标，而不是
      // 一个新加入的 SVG 子树，因此也要检查 record.target。
      if (record.target instanceof SVGElement) patchWordmark(record.target, wordmark, mode)
      for (const added of record.addedNodes) {
        patchWordmarksUnder(added, wordmark, mode)
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  patchWordmarksUnder(document.documentElement, wordmark, mode)
  return () => { observer.disconnect() }
}

/**
 * 清理根节点下的新对话欢迎区：找到包含 {@link HERO_HEADLINE} 的标题行，隐藏
 * 通过 {@link FISH_VIEWBOX} 识别的 FishLogo SVG 和包含 {@link HERO_PREVIEW}
 * 的徽章，并把标题行改为居中 flex，使剩余标题保持视觉居中。被隐藏元素以
 * {@link HIDDEN_MARKER} 标记，只写入行内样式，不破坏 React 节点树。不存在
 * 欢迎区时不执行任何操作。
 * @param root 新增子树或文档根节点。
 */
export function patchHeroChrome(root: Node): void {
  if (!(root instanceof Element)) return
  const roots = [root, ...root.querySelectorAll('span')]
  for (const span of roots) {
    if (span.textContent !== HERO_HEADLINE) continue
    const headline = span.parentElement
    if (headline === null || headline.getAttribute(HIDDEN_MARKER) === 'true') continue
    headline.setAttribute(HIDDEN_MARKER, 'true')
    // 原行是“34px 鱼图标 / 标题 / 徽章”三列网格；隐藏两侧后必须接管居中，
    // 否则标题会偏离视觉中心。
    headline.style.display = 'flex'
    headline.style.alignItems = 'center'
    headline.style.justifyContent = 'center'
    headline.style.columnGap = '10px'
    for (const child of headline.children) {
      const isFish = child instanceof SVGElement && child.getAttribute('viewBox') === FISH_VIEWBOX
      const isBadge = child.textContent === HERO_PREVIEW
      if (!isFish && !isBadge) continue
      child.setAttribute(HIDDEN_MARKER, 'true')
      ;(child as HTMLElement).style.display = 'none'
    }
  }
}

/**
 * 在整个文档上启动实时欢迎区清理。
 * @returns 用于断开观察器的释放函数。
 */
export function startHeroCleanup(): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        patchHeroChrome(added)
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  patchHeroChrome(document.documentElement)
  return () => { observer.disconnect() }
}

/**
 * 覆盖 `document.title` setter，使每次赋值都经过替换，并立即处理当前值。
 * 外壳的 DocumentTitle 组件会在挂载时保存“原始”标题、卸载时恢复它；两个
 * 流程都会经过 setter，因此都会被处理。
 * @param mask 标题字符串变换函数。
 * @returns 恢复原始 title 访问器的释放函数。
 */
export function patchTitle(mask: (text: string) => string): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'title')
    ?? Object.getOwnPropertyDescriptor(Document.prototype, 'title')
  if (descriptor === undefined || descriptor.set === undefined || descriptor.get === undefined) {
    // 无浏览器能力的环境（例如未启用 jsdom 的测试）无需处理。
    return () => {}
  }
  const { get, set } = descriptor
  Object.defineProperty(document, 'title', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get() { return get.call(this) },
    set(value: string) { set.call(this, mask(value)) },
  })
  document.title = mask(get.call(document))
  return () => {
    delete (document as unknown as Record<string, unknown>).title
  }
}

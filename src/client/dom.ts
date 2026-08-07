/**
 * Browser branding engine: replaces the DeepSeek Harness wordmark, masks
 * the tab title, and strips the new-conversation hero chrome (fish logo and
 * preview badge). Nothing else in the document is touched — model selector,
 * provider names, settings copy, and message content stay as-is.
 *
 * - `patchTitle` shadows the `document.title` setter so every assignment
 *   (including the shell's `"<session> — DeepSeek Harness"` projection) lands
 *   masked, then masks the initial value.
 * - `startWordmarkMasking` runs a MutationObserver over the whole document
 *   and swaps every `BrandWordmark` svg (sidebar brand row, welcome notice,
 *   onboarding dialog) for the neutral `wordmark` lettering: the svg's
 *   children are removed wholesale (whale, letterforms, HARNESS badge — the
 *   entire original mark) and a centered `<text>` is injected at the
 *   configured `wordmarkSize`. The svg element itself stays, so its size and
 *   the enclosing button (a New Session shortcut with its own aria-label and
 *   click handler) keep working; React only diffs props it knows, and the
 *   component's props never change, so neither the child removal nor the
 *   injected text is undone by re-renders — a remounted svg is simply patched
 *   again.
 * - `startHeroCleanup` hides the fish logo and the preview badge in the
 *   new-conversation hero headline (the row reading `开始构建吧`), and flips
 *   the headline row to a centered flex so the remaining text stays visually
 *   centered. Both hidden elements keep React's tree intact (inline styles
 *   only), so re-renders and remounts are safe; a remounted hero is simply
 *   cleaned again.
 *
 * Wordmark detection needs the descendant scan: React mounts the whole UI as
 * one subtree addition, so the svg is never the added node itself.
 * @module dsh-sfw/client/dom
 */

import { defaultConfig } from '../mask.ts'

/** The BrandWordmark clipPath id that identifies the wordmark svg. */
const WHALE_CLIP_ID = 'dsh-wordmark-whale-clip'

/** Marker attribute on the injected replacement text (idempotence). */
const TEXT_MARKER = 'data-dsh-sfw-wordmark'

/** The SVG namespace (createElementNS needs it). */
const SVG_NS = 'http://www.w3.org/2000/svg'

/** The wordmark svg viewBox height (the brand button ships 182×24). */
const VIEWBOX_HEIGHT = 24

/**
 * The FishLogo svg viewBox (ui-primitives FishLogo, exact extract) — the
 * stable marker of the hero fish logo.
 */
const FISH_VIEWBOX = '0 0 23.16 17.04'

/** Marker attribute on hidden hero elements (idempotence). */
const HIDDEN_MARKER = 'data-dsh-sfw-hidden'

/** The hero headline text (locales.ts `hero.headline`). */
const HERO_HEADLINE = '开始构建吧'

/** The hero preview badge text (locales.ts `hero.preview`). */
const HERO_PREVIEW = '预览版'

/**
 * Baseline y for a size-`size` wordmark text that keeps the verified optical
 * centering of the original 14px lettering (baseline 16.5 in the 24-tall
 * viewBox, font-metric box centered ~1px above the middle): the metric box
 * grows linearly with the font size, so the baseline moves 5.5/14 px per px
 * of font size.
 * @param size - the wordmark font size in px.
 * @returns the baseline y as an SVG attribute string.
 */
function centeredBaseline(size: number): string {
  return String(Math.round((16.5 + (size - 14) * (5.5 / 14)) * 10) / 10)
}

/**
 * Replace one wordmark svg's content with the neutral lettering: remove the
 * original children (whale + letterforms + badge) and inject a centered
 * `<text>` element. No-op on svgs that are not the wordmark or are already
 * replaced.
 * @param svg - the wordmark svg element (identified by the whale clip id).
 * @param wordmark - the replacement lettering (empty keeps the svg blank).
 * @param size - the lettering font size in px (defaults to the config default).
 */
export function patchWordmark(
  svg: SVGElement, wordmark: string, size = defaultConfig().wordmarkSize,
): void {
  if (svg.querySelector(`[${TEXT_MARKER}]`) !== null) return
  if (svg.querySelector(`#${WHALE_CLIP_ID}`) === null) return
  svg.replaceChildren()
  if (wordmark === '') return
  const text = document.createElementNS(SVG_NS, 'text')
  text.setAttribute(TEXT_MARKER, 'true')
  text.setAttribute('x', String(182 / 2))
  text.setAttribute('y', centeredBaseline(size))
  text.setAttribute('text-anchor', 'middle')
  text.setAttribute('font-size', String(size))
  text.setAttribute('font-weight', '600')
  text.setAttribute('letter-spacing', String(Math.round((size / 14) * 10) / 10))
  text.setAttribute('fill', 'currentColor')
  text.textContent = wordmark
  svg.appendChild(text)
}

/** Patch every wordmark svg under a root (including the root itself). */
function patchWordmarksUnder(root: Node, wordmark: string, size: number): void {
  if (root instanceof SVGElement) patchWordmark(root, wordmark, size)
  if (root instanceof Element) {
    for (const svg of root.querySelectorAll('svg')) patchWordmark(svg as SVGElement, wordmark, size)
  }
}

/**
 * Start the live wordmark replacement loop over the whole document.
 * @param wordmark - the replacement lettering.
 * @param size - the lettering font size in px (defaults to the config default).
 * @returns the disposer (disconnects the observer).
 */
export function startWordmarkMasking(
  wordmark: string, size = defaultConfig().wordmarkSize,
): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        patchWordmarksUnder(added, wordmark, size)
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  patchWordmarksUnder(document.documentElement, wordmark, size)
  return () => { observer.disconnect() }
}

/**
 * Strip the new-conversation hero chrome under a root: find the hero headline
 * row (the span reading {@link HERO_HEADLINE}), hide its fish logo (the
 * FishLogo svg, identified by {@link FISH_VIEWBOX}) and its preview badge
 * (the span reading {@link HERO_PREVIEW}), and flip the row to a centered
 * flex so the remaining headline text stays visually centered. Hidden
 * elements are marked with {@link HIDDEN_MARKER} and keep React's tree
 * intact (inline styles only). No-op on roots without a hero.
 * @param root - the added subtree or the document root.
 */
export function patchHeroChrome(root: Node): void {
  if (!(root instanceof Element)) return
  const roots = [root, ...root.querySelectorAll('span')]
  for (const span of roots) {
    if (span.textContent !== HERO_HEADLINE) continue
    const headline = span.parentElement
    if (headline === null || headline.getAttribute(HIDDEN_MARKER) === 'true') continue
    headline.setAttribute(HIDDEN_MARKER, 'true')
    // The row is a 34px-fish / title / badge grid; dropping the two side
    // items would leave the title off-center, so own the centering.
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
 * Start the live hero-chrome cleanup loop over the whole document.
 * @returns the disposer (disconnects the observer).
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
 * Shadow the `document.title` setter so every assignment lands masked, and
 * mask the current value. The shell's DocumentTitle component stores the
 * "original" title at mount and restores it on unmount — both flows go
 * through the setter and therefore through the mask.
 * @param mask - the masked-string transform.
 * @returns the disposer (restores the original title accessor).
 */
export function patchTitle(mask: (text: string) => string): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'title')
    ?? Object.getOwnPropertyDescriptor(Document.prototype, 'title')
  if (descriptor === undefined || descriptor.set === undefined || descriptor.get === undefined) {
    // Non-browser environment (jsdom-less tests); nothing to patch.
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

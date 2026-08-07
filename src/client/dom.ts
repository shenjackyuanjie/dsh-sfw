/**
 * Browser branding engine: replaces the DeepSeek Harness wordmark and masks
 * the tab title. Nothing else in the document is touched — model selector,
 * provider names, settings copy, and message content stay as-is.
 *
 * - `patchTitle` shadows the `document.title` setter so every assignment
 *   (including the shell's `"<session> — DeepSeek Harness"` projection) lands
 *   masked, then masks the initial value.
 * - `startWordmarkMasking` runs a MutationObserver over the whole document
 *   and patches every `BrandWordmark` svg (sidebar brand row, welcome notice,
 *   onboarding dialog): the letterform paths and the HARNESS badge plate are
 *   set to `fill="transparent"` IN PLACE — React only diffs props it knows,
 *   and the component's props never change, so the writes survive re-renders
 *   — and a neutral product-name `<text>` is appended next to the whale glyph
 *   (appended children React does not manage stay put). The whale keeps
 *   `currentColor`.
 *
 * Wordmark detection needs the descendant scan: React mounts the whole UI as
 * one subtree addition, so the svg is never the added node itself.
 * @module dsh-sfw/client/dom
 */

/** The BrandWordmark clipPath id that identifies the wordmark svg (whale + letterforms + badge). */
const WHALE_CLIP_ID = 'dsh-wordmark-whale-clip'

/** Marker attribute on the injected replacement text (idempotence). */
const TEXT_MARKER = 'data-dsh-sfw-text'

/** The SVG namespace (createElementNS needs it). */
const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Replace one wordmark's branding in place: hide the letterform paths and
 * every rect (the HARNESS badge plate), keep the whale glyph, and append the
 * neutral product-name text.
 * @param svg - the wordmark svg element (identified by the whale clip id).
 * @param productName - the replacement wordmark text.
 */
export function patchWordmark(svg: SVGElement, productName: string): void {
  if (svg.querySelector(`#${WHALE_CLIP_ID}`) === null) return
  if (svg.querySelector(`[${TEXT_MARKER}]`) !== null) return
  const whaleGroup = svg.querySelector(`g[clip-path*="${WHALE_CLIP_ID}"]`)
  for (const path of svg.querySelectorAll('path')) {
    if (whaleGroup !== null && whaleGroup.contains(path)) continue
    path.setAttribute('fill', 'transparent')
  }
  for (const rect of svg.querySelectorAll('rect')) {
    rect.setAttribute('fill', 'transparent')
  }
  if (productName === '') return
  const text = document.createElementNS(SVG_NS, 'text')
  text.setAttribute(TEXT_MARKER, 'true')
  text.setAttribute('x', '30')
  text.setAttribute('y', '16.4')
  text.setAttribute('font-size', '13')
  text.setAttribute('font-weight', '600')
  text.setAttribute('letter-spacing', '0.4')
  text.setAttribute('fill', 'currentColor')
  text.textContent = productName
  svg.appendChild(text)
}

/** Patch every wordmark svg under a root (including the root itself). */
function patchWordmarksUnder(root: Node, productName: string): void {
  if (root instanceof SVGElement) patchWordmark(root, productName)
  if (root instanceof Element) {
    for (const svg of root.querySelectorAll('svg')) patchWordmark(svg as SVGElement, productName)
  }
}

/**
 * Start the live wordmark replacement loop over the whole document.
 * @param productName - the replacement wordmark text.
 * @returns the disposer (disconnects the observer).
 */
export function startWordmarkMasking(productName: string): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        patchWordmarksUnder(added, productName)
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  patchWordmarksUnder(document.documentElement, productName)
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

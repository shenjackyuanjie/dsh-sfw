/**
 * Browser branding engine: replaces the DeepSeek Harness wordmark and masks
 * the tab title. Nothing else in the document is touched — model selector,
 * provider names, settings copy, and message content stay as-is.
 *
 * - `patchTitle` shadows the `document.title` setter so every assignment
 *   (including the shell's `"<session> — DeepSeek Harness"` projection) lands
 *   masked, then masks the initial value.
 * - `startWordmarkMasking` runs a MutationObserver over the whole document
 *   and swaps every `BrandWordmark` svg (sidebar brand row, welcome notice,
 *   onboarding dialog) for the neutral `wordmark` lettering: the svg's
 *   children are removed wholesale (whale, letterforms, HARNESS badge — the
 *   entire original mark) and a centered `<text>` is injected. The svg
 *   element itself stays, so its size and the enclosing button (a New
 *   Session shortcut with its own aria-label and click handler) keep working;
 *   React only diffs props it knows, and the component's props never change,
 *   so neither the child removal nor the injected text is undone by
 *   re-renders — a remounted svg is simply patched again.
 *
 * Wordmark detection needs the descendant scan: React mounts the whole UI as
 * one subtree addition, so the svg is never the added node itself.
 * @module dsh-sfw/client/dom
 */

/** The BrandWordmark clipPath id that identifies the wordmark svg. */
const WHALE_CLIP_ID = 'dsh-wordmark-whale-clip'

/** Marker attribute on the injected replacement text (idempotence). */
const TEXT_MARKER = 'data-dsh-sfw-wordmark'

/** The SVG namespace (createElementNS needs it). */
const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Replace one wordmark svg's content with the neutral lettering: remove the
 * original children (whale + letterforms + badge) and inject a centered
 * `<text>` element. No-op on svgs that are not the wordmark or are already
 * replaced.
 * @param svg - the wordmark svg element (identified by the whale clip id).
 * @param wordmark - the replacement lettering (empty keeps the svg blank).
 */
export function patchWordmark(svg: SVGElement, wordmark: string): void {
  if (svg.querySelector(`[${TEXT_MARKER}]`) !== null) return
  if (svg.querySelector(`#${WHALE_CLIP_ID}`) === null) return
  svg.replaceChildren()
  if (wordmark === '') return
  const text = document.createElementNS(SVG_NS, 'text')
  text.setAttribute(TEXT_MARKER, 'true')
  text.setAttribute('x', '91')
  text.setAttribute('y', '16.5')
  text.setAttribute('text-anchor', 'middle')
  text.setAttribute('font-size', '14')
  text.setAttribute('font-weight', '600')
  text.setAttribute('letter-spacing', '1')
  text.setAttribute('fill', 'currentColor')
  text.textContent = wordmark
  svg.appendChild(text)
}

/** Patch every wordmark svg under a root (including the root itself). */
function patchWordmarksUnder(root: Node, wordmark: string): void {
  if (root instanceof SVGElement) patchWordmark(root, wordmark)
  if (root instanceof Element) {
    for (const svg of root.querySelectorAll('svg')) patchWordmark(svg as SVGElement, wordmark)
  }
}

/**
 * Start the live wordmark replacement loop over the whole document.
 * @param wordmark - the replacement lettering.
 * @returns the disposer (disconnects the observer).
 */
export function startWordmarkMasking(wordmark: string): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        patchWordmarksUnder(added, wordmark)
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  patchWordmarksUnder(document.documentElement, wordmark)
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

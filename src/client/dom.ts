/**
 * Browser DOM masking engine: keeps every user-visible DeepSeek token out of
 * the live document. Three cooperating surfaces:
 *
 * - `patchTitle` shadows the `document.title` setter so every assignment
 *   (including the shell's `"<session> — DeepSeek Harness"` projection) lands
 *   masked, then masks the initial value.
 * - `startDomMasking` runs a MutationObserver over the whole document: text
 *   nodes (React re-creates or re-writes them as content streams in), plus
 *   the display attributes aria-label/title/alt/placeholder on added
 *   elements. User input is never touched: text inside an element the user is
 *   editing (contenteditable or an active input/textarea subtree) is skipped.
 * - The sidebar/settings brand wordmark is an SVG whose letterforms are
 *   vector paths — invisible to text rewrites. `patchWordmark` sets those
 *   paths (and the badge plate) to `fill="transparent"` IN PLACE, which
 *   survives React re-renders because React only diffs props it knows and the
 *   component's props never change; the whale glyph keeps `currentColor`.
 *
 * Every mutation writes only when the masked value differs, so the observer
 * converges instead of looping.
 * @module dsh-sfw/client/dom
 */

/** The BrandWordmark clipPath id that identifies the wordmark svg (whale + letterforms + badge). */
const WHALE_CLIP_ID = 'dsh-wordmark-whale-clip'

/** Display attributes rewritten in place (never href/src/value/id/class/data-*). */
const MASKED_ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder'] as const

/** Elements whose text must never be rewritten. */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA'])

/** Whether a node lives inside a subtree the user is actively editing. */
function insideActiveEdit(node: Node): boolean {
  const active = document.activeElement
  if (active === null || active === document.body || active === document.documentElement) return false
  return active.contains(node)
}

/** Whether an element's text content must stay untouched (script/style/textarea or being edited). */
function skipElement(element: Element): boolean {
  if (SKIP_TAGS.has(element.tagName)) return true
  if ((element as HTMLElement).isContentEditable && document.activeElement?.contains(element)) return true
  return false
}

/**
 * Patch the brand wordmark svg in place: mask every path outside the whale
 * clip group plus every rect (the HARNESS badge plate), leaving the whale
 * glyph visible. Attribute writes survive React reconciliation (see module
 * comment).
 * @param svg - the wordmark svg element (identified by the whale clip id).
 */
export function patchWordmark(svg: SVGElement): void {
  if (svg.querySelector(`#${WHALE_CLIP_ID}`) === null) return
  const whaleGroup = svg.querySelector(`g[clip-path*="${WHALE_CLIP_ID}"]`)
  for (const path of svg.querySelectorAll('path')) {
    if (whaleGroup !== null && whaleGroup.contains(path)) continue
    path.setAttribute('fill', 'transparent')
  }
  for (const rect of svg.querySelectorAll('rect')) {
    rect.setAttribute('fill', 'transparent')
  }
}

/** Mask one element's display attributes in place. */
function maskElement(element: Element, mask: (text: string) => string): void {
  for (const attribute of MASKED_ATTRIBUTES) {
    const current = element.getAttribute(attribute)
    if (current === null) continue
    const masked = mask(current)
    if (masked !== current) element.setAttribute(attribute, masked)
  }
}

/** Mask every text node under a root, honoring skip rules. */
function maskTextNodes(root: Node, mask: (text: string) => string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement
    if (parent === null || skipElement(parent) || insideActiveEdit(node)) continue
    const current = node.nodeValue
    if (current === null) continue
    const masked = mask(current)
    if (masked !== current) node.nodeValue = masked
  }
}

/** Rewrite one added subtree (or the initial whole document). */
function rewriteTree(root: Node, mask: (text: string) => string): void {
  if (root.nodeType === Node.TEXT_NODE) {
    const parent = root.parentElement
    if (parent !== null && !skipElement(parent) && !insideActiveEdit(root)) {
      const masked = mask(root.nodeValue ?? '')
      if (masked !== root.nodeValue) root.nodeValue = masked
    }
    return
  }
  if (!(root instanceof Element)) return
  if (skipElement(root)) return
  maskElement(root, mask)
  if (root.tagName === 'svg') patchWordmark(root as SVGElement)
  maskTextNodes(root, mask)
}

/**
 * Start the live DOM masking loop over the whole document.
 * @param mask - the masked-string transform (from the shared rules).
 * @returns the disposer (disconnects the observer).
 */
export function startDomMasking(mask: (text: string) => string): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData' && record.target.nodeValue !== null) {
        const parent = record.target.parentElement
        if (parent !== null && !skipElement(parent) && !insideActiveEdit(record.target)) {
          const masked = mask(record.target.nodeValue)
          if (masked !== record.target.nodeValue) record.target.nodeValue = masked
        }
        continue
      }
      for (const added of record.addedNodes) {
        if (added.nodeType !== Node.TEXT_NODE && !(added instanceof Element)) continue
        rewriteTree(added, mask)
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  rewriteTree(document.documentElement, mask)
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
  const holder: typeof Document.prototype = HTMLDocument.prototype
  const descriptor = Object.getOwnPropertyDescriptor(holder, 'title')
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

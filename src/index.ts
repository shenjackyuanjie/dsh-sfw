/**
 * dsh-sfw host half: a cordis function plugin that taps the served index.html
 * so the browser never shows the product title unmasked, and delivers the
 * resolved masking config to the browser half as `window.__DSH_SFW__` (the
 * same index-tap seam the client-modules package uses for the boot manifest —
 * the only host→browser config channel that does not require RPC plumbing).
 *
 * The plugin must be a loader entry in the host graph for the client-modules
 * scan to discover its `dshClient` declaration and serve `lib/client.js`;
 * this file is that entry. It registers nothing else.
 * @module dsh-sfw
 */

import type { Context } from 'cordis'
import z from 'schemastery'
import {
  defaultConfig, maskProductName, type SfwConfig,
} from './mask.ts'

/** Stable cordis plugin name (also the web boot graph entry id). */
export const name = 'dsh-sfw'

/** Services required before mounting the index tap. */
export const inject = ['httpServer']

/** Plugin config: the product-name replacement (see {@link SfwConfig}). */
export const Config: z<SfwConfig> = z.object({
  enabled: z.boolean().default(true),
  productName: z.string().default('Harness'),
})

/** The httpServer seam surface this plugin uses (structural — no package import). */
interface HttpServerSeam {
  /** Register an index.html transform (applied to every index response). */
  tapIndex(transform: (html: string) => string): () => void
}

/** JSON-safe embedding: escape `<` so plugin-controlled strings cannot break out of the injected script element. */
function escapeForScript(payload: string): string {
  return payload.replaceAll('<', '\\u003c')
}

/**
 * Transform a served index.html: rewrite a DeepSeek-bearing `<title>`, then
 * inject the resolved config script right after `<head>` (prepended when no
 * head exists, mirroring the boot-manifest injection fallback).
 * @param html - the index.html source.
 * @param config - the fully resolved masking config.
 * @returns the transformed html.
 */
export function transformIndex(html: string, config: SfwConfig): string {
  let out = html
  out = out.replace(/<title\b[^>]*>([\s\S]*?)<\/title>/i, (whole, inner: string) => {
    const maskedInner = maskProductName(inner, config.productName)
    return maskedInner === inner ? whole : whole.replace(inner, maskedInner)
  })
  const payload = escapeForScript(JSON.stringify(config))
  const script = `<script>window.__DSH_SFW__ = ${payload}</script>`
  const head = out.indexOf('<head>')
  if (head !== -1) return `${out.slice(0, head + 6)}${script}${out.slice(head + 6)}`
  return `${script}${out}`
}

/**
 * Mount the index tap. The loader applies the Config schema defaults; the
 * explicit merge keeps hand-built test contexts (no config) working.
 * @param ctx - host plugin context with the httpServer service injected.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx: Context, config?: SfwConfig): void {
  const resolved = { ...defaultConfig(), ...config }
  if (!resolved.enabled) return
  const httpServer = (ctx as unknown as { httpServer?: HttpServerSeam }).httpServer
  if (httpServer === undefined) {
    throw new Error('dsh-sfw: httpServer service unavailable (inject declared it)')
  }
  ctx.effect(() => httpServer.tapIndex(html => transformIndex(html, resolved)), 'dsh-sfw: index tap')
}

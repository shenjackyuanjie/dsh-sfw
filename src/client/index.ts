/**
 * dsh-sfw browser half: the branding plugin entry the web boot graph loads
 * from `/plugins/dsh-sfw/client.js`. Reads the host-injected config
 * (`window.__DSH_SFW__`, with local defaults as fallback) and starts the tab
 * title shadow plus the brand wordmark replacement. No cordis services are
 * needed — the DOM is the whole surface.
 * @module dsh-sfw/client
 */

import type { Context } from 'cordis'
import {
  maskProductName, normalizeWireConfig, type SfwConfig,
} from '../mask.ts'
import { patchTitle, startWordmarkMasking } from './dom.ts'

/** Stable cordis plugin name (the web boot graph entry id). */
export const name = 'dsh-sfw'

/** The config payload the host half injects into index.html. */
declare global {
  interface Window {
    __DSH_SFW__?: unknown
  }
}

/** Read the host-injected config; anything missing falls back to local defaults. */
function readConfig(): SfwConfig {
  const wire = typeof window === 'undefined' ? undefined : window.__DSH_SFW__
  return normalizeWireConfig(wire)
}

/**
 * Client plugin body: start the title shadow and the wordmark replacement,
 * disposed with the plugin fiber.
 * @param ctx - browser cordis context (service-free plugin).
 */
export function apply(ctx: Context): void {
  const config = readConfig()
  if (!config.enabled) return
  const mask = (text: string): string => maskProductName(text, config.productName)
  const stopTitle = patchTitle(mask)
  const stopWordmark = startWordmarkMasking(config.wordmark)
  ctx.effect(() => () => {
    stopTitle()
    stopWordmark()
  }, 'dsh-sfw: branding')
}

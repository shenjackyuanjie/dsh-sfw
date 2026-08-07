/**
 * dsh-sfw browser half: the masking plugin entry the web boot graph loads
 * from `/plugins/dsh-sfw/client.js`. Reads the host-injected config
 * (`window.__DSH_SFW__`, with local defaults as fallback) and starts the
 * title shadow, the DOM mutation loop, and the wordmark patching. No cordis
 * services are needed — the DOM is the whole surface.
 * @module dsh-sfw/client
 */

import type { Context } from 'cordis'
import {
  buildRules, maskString, normalizeWireConfig, type SfwConfig,
} from '../mask.ts'
import { patchTitle, startDomMasking } from './dom.ts'

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
 * Client plugin body: start every masking surface and dispose them with the
 * plugin fiber.
 * @param ctx - browser cordis context (service-free plugin).
 */
export function apply(ctx: Context): void {
  const config = readConfig()
  if (!config.enabled) return
  const rules = buildRules(config)
  const mask = (text: string): string => maskString(text, rules)
  const stopTitle = patchTitle(mask)
  const stopDom = startDomMasking(mask)
  ctx.effect(() => () => {
    stopTitle()
    stopDom()
  }, 'dsh-sfw: masking')
}

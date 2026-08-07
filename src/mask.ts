/**
 * Shared masking core: config shape, defaults, wire-boundary parsing, and the
 * product-name masker. Used by both halves — the host half resolves the
 * validated cordis Config and serializes it into the served index.html; the
 * browser half reads that wire payload (falling back to these same defaults).
 *
 * Scope: the plugin only replaces the product branding — the top-left brand
 * wordmark svg (replaced with the `wordmark` lettering) and the browser tab
 * title. All other UI copy (model selector, provider names, settings,
 * message content) is left untouched.
 * @module dsh-sfw/mask
 */

/** Resolved masking configuration (identical shape on both halves). */
export interface SfwConfig {
  /** Master switch; false disables every masking surface. */
  enabled: boolean
  /** Replacement product name for the browser tab title. */
  productName: string
  /** Replacement wordmark lettering shown in place of the brand svg. */
  wordmark: string
}

/** The defaults both halves fall back to when configuration is absent. */
export function defaultConfig(): SfwConfig {
  return { enabled: true, productName: 'Harness', wordmark: 'opencode' }
}

/**
 * Parse the index-injected wire payload (a host-validated SfwConfig, but
 * treated as an untrusted wire boundary here) into a fully resolved config.
 * Unknown or mistyped fields are ignored in favor of the defaults, so a
 * payload serialized by an older host half (extra fields) still resolves.
 * @param wire - the raw `window.__DSH_SFW__` value, or undefined when the host did not inject it.
 * @returns the resolved config (always well-formed).
 */
export function normalizeWireConfig(wire: unknown): SfwConfig {
  const base = defaultConfig()
  if (typeof wire !== 'object' || wire === null || Array.isArray(wire)) return base
  const record = wire as Record<string, unknown>
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : base.enabled,
    productName: typeof record.productName === 'string' && record.productName !== ''
      ? record.productName
      : base.productName,
    wordmark: typeof record.wordmark === 'string' && record.wordmark !== ''
      ? record.wordmark
      : base.wordmark,
  }
}

/**
 * Mask the product name in a string. Only the full `DeepSeek Harness`
 * spelling is replaced — never standalone `DeepSeek` occurrences in user
 * content or other UI copy.
 * @param input - the text to mask.
 * @param productName - the replacement product name.
 * @returns the masked text.
 */
export function maskProductName(input: string, productName: string): string {
  return input.split('DeepSeek Harness').join(productName)
}

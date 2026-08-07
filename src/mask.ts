/**
 * Shared masking core: config shape, defaults, rule-table construction, and
 * the pure string masker. Used by both halves — the host half resolves the
 * validated cordis Config and serializes it into the served index.html; the
 * browser half reads that wire payload (falling back to these same defaults)
 * and drives the DOM masking engine.
 *
 * Masking is ordered longest-first so compound strings (DeepSeek Harness,
 * DeepSeek-V4-Flash) win over their own parts (DeepSeek). The builtin table
 * is deployment-tunable: `models` overrides the default model-name pairs and
 * `extra` adds or overrides any entry.
 * @module dsh-sfw/mask
 */

/** Resolved masking configuration (identical shape on both halves). */
export interface SfwConfig {
  /** Master switch; false disables every masking surface. */
  enabled: boolean
  /** Replacement for the `DeepSeek Harness` product name. */
  productName: string
  /** Replacement for the standalone `DeepSeek` provider display name. */
  providerName: string
  /** Replacement for the `deepseek-official` provider route id. */
  providerId: string
  /** Model-name pairs (id/display name -> masked name); merged over the defaults. */
  models: Record<string, string>
  /** Additional or overriding rules ({from: to}); longest-first ordering still applies. */
  extra: Record<string, string>
}

/** Default model-name pairs the shipped deepseek adapter advertises. */
export const DEFAULT_MODELS: Record<string, string> = {
  'DeepSeek-V4-Flash': 'V4-Flash',
  'DeepSeek-V4-Pro': 'V4-Pro',
  'deepseek-v4-flash': 'v4-flash',
  'deepseek-v4-pro': 'v4-pro',
}

/** The defaults both halves fall back to when configuration is absent. */
export function defaultConfig(): SfwConfig {
  return {
    enabled: true,
    productName: 'Harness',
    providerName: 'DS',
    providerId: 'ds-official',
    models: {},
    extra: {},
  }
}

/**
 * Parse the index-injected wire payload (a host-validated SfwConfig, but
 * treated as an untrusted wire boundary here) into a fully resolved config.
 * Unknown or mistyped fields are ignored in favor of the defaults; `models`
 * and `extra` accept only string→string records.
 * @param wire - the raw `window.__DSH_SFW__` value, or undefined when the host did not inject it.
 * @returns the resolved config (always well-formed).
 */
export function normalizeWireConfig(wire: unknown): SfwConfig {
  const base = defaultConfig()
  if (typeof wire !== 'object' || wire === null || Array.isArray(wire)) return base
  const record = wire as Record<string, unknown>
  const stringField = (key: string, fallback: string): string =>
    typeof record[key] === 'string' && record[key] !== '' ? record[key] as string : fallback
  const stringMap = (key: string): Record<string, string> => {
    const value = record[key]
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    const out: Record<string, string> = {}
    for (const [from, to] of Object.entries(value)) {
      if (typeof to === 'string') out[from] = to
    }
    return out
  }
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : base.enabled,
    productName: stringField('productName', base.productName),
    providerName: stringField('providerName', base.providerName),
    providerId: stringField('providerId', base.providerId),
    models: stringMap('models'),
    extra: stringMap('extra'),
  }
}

/** Escape a literal string for use inside a RegExp alternation. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build the effective rule list for a config: every rule in the map with
 * replacement values, sorted by source length descending so a compound match
 * always wins over its parts.
 * @param config - the resolved configuration.
 * @returns ordered [from, to] pairs, longest source first.
 */
export function buildRules(config: SfwConfig): readonly (readonly [string, string])[] {
  const table: Record<string, string> = {
    'DeepSeek Harness': config.productName,
    'deepseek-official': config.providerId,
    ...DEFAULT_MODELS,
    ...config.models,
    'DeepSeek': config.providerName,
    'DEEPSEEK': config.providerName,
    'deepseek': 'ds',
    ...config.extra,
  }
  return Object.entries(table)
    .filter(([from]) => from !== '')
    .sort((a, b) => b[0].length - a[0].length)
}

/**
 * Mask every rule occurrence in a string in one pass (single regex over the
 * ordered alternation). Idempotent: masked output contains no remaining
 * source token, so applying the rules again changes nothing.
 * @param input - the text to mask.
 * @param rules - ordered rules from {@link buildRules}.
 * @returns the masked text.
 */
export function maskString(input: string, rules: readonly (readonly [string, string])[]): string {
  if (rules.length === 0) return input
  const lookup = new Map(rules)
  const pattern = new RegExp(rules.map(([from]) => escapeRegExp(from)).join('|'), 'g')
  return input.replace(pattern, (match) => lookup.get(match) ?? match)
}

/** The serialized config payload the host injects (fully resolved, defaults merged). */
export function serializeConfig(config: SfwConfig): SfwConfig {
  return { ...config, models: { ...DEFAULT_MODELS, ...config.models } }
}

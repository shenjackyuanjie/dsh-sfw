/**
 * 共享的品牌隐藏核心：配置结构、默认值、跨边界载荷解析与产品名替换。
 * 宿主端负责解析经过校验的 cordis 配置并写入所服务的 index.html；浏览器端
 * 读取这份载荷，缺失字段则回退到同一组默认值。
 *
 * 插件只处理产品品牌：左上角字标 SVG（替换为配置的矢量字标）、浏览器
 * 标签页标题，以及新对话欢迎区的鱼形图标和“预览版”徽章。模型选择器、
 * 提供方名称、设置文案和消息内容均保持原样。
 * @module @shenjack/dsh-sfw/mask
 */

/** 完整解析后的隐藏配置；宿主端和浏览器端使用相同结构。 */
export interface SfwConfig {
  /** 总开关；设为 false 时停用全部处理。 */
  enabled: boolean
  /** 浏览器标签页标题使用的替代产品名。 */
  productName: string
  /** 左上角显示的矢量字标名称。 */
  wordmark: string
}

/** 防止异常配置生成过大的 SVG 路径。 */
export const MAX_WORDMARK_LENGTH = 32

/** 配置缺失时两端共同使用的默认值。 */
export function defaultConfig(): SfwConfig {
  return { enabled: true, productName: 'Harness', wordmark: 'opencode' }
}

/**
 * 将注入 index.html 的载荷解析为完整配置。虽然载荷在宿主端已经过校验，
 * 浏览器端仍将其视为不可信边界；未知字段和类型错误字段会回退到默认值，
 * 因而也能兼容旧版宿主端序列化出的额外字段。
 * @param wire 原始的 `window.__DSH_SFW__` 值；宿主未注入时为 undefined。
 * @returns 始终结构完整的配置。
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
    wordmark: typeof record.wordmark === 'string'
      && record.wordmark.trim() !== ''
      && [...record.wordmark.trim()].length <= MAX_WORDMARK_LENGTH
      ? record.wordmark.trim()
      : base.wordmark,
  }
}

/**
 * 替换字符串中的产品名。只替换完整的 `DeepSeek Harness`，不会处理用户内容
 * 或其他界面文案中单独出现的 `DeepSeek`。
 * @param input 待处理文本。
 * @param productName 替代产品名。
 * @returns 完成替换的文本。
 */
export function maskProductName(input: string, productName: string): string {
  return input.split('DeepSeek Harness').join(productName)
}

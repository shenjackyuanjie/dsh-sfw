/**
 * dsh-sfw 宿主端：通过 cordis 函数插件改写所服务的 index.html，使浏览器在
 * JavaScript 加载前也不会显示原产品名；同时把完整配置写入
 * `window.__DSH_SFW__` 交给浏览器端。该通道与 client-modules 注入启动清单
 * 使用同一个 index 改写接缝，是无需额外 RPC 的宿主端到浏览器端配置通道。
 *
 * 本插件必须作为宿主加载图中的 loader 条目存在，client-modules 才能发现
 * `dshClient` 声明并提供 `lib/client.js`。本文件就是该入口，不注册其他能力。
 * @module dsh-sfw
 */

import type { Context } from 'cordis'
import z from 'schemastery'
import {
  defaultConfig, maskProductName, MAX_WORDMARK_LENGTH, type SfwConfig,
} from './mask.ts'

/** 稳定的 cordis 插件名，同时也是 Web 启动图中的条目 ID。 */
export const name = 'dsh-sfw'

/** 注册 index 改写前必须可用的服务。 */
export const inject = ['httpServer']

/** 插件配置：品牌隐藏选项，参见 {@link SfwConfig}。 */
export const Config: z<SfwConfig> = z.object({
  enabled: z.boolean().default(true),
  productName: z.string().default('Harness'),
  wordmark: z.string().max(MAX_WORDMARK_LENGTH).default('opencode'),
})

/** 本插件使用的 httpServer 结构化接缝，无需导入宿主实现包。 */
interface HttpServerSeam {
  /** 注册对每次 index.html 响应生效的变换。 */
  tapIndex(transform: (html: string) => string): () => void
}

/** 安全嵌入 JSON：转义 `<`，避免配置字符串逃逸所注入的 script 元素。 */
function escapeForScript(payload: string): string {
  return payload.replaceAll('<', '\\u003c')
}

/**
 * 变换待返回的 index.html：先改写包含 DeepSeek 的 `<title>`，再把完整配置
 * 紧跟 `<head>` 注入；不存在 head 时则放在文档最前，与启动清单的兜底行为一致。
 * @param html index.html 原文。
 * @param config 完整解析后的隐藏配置。
 * @returns 变换后的 HTML。
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
 * 挂载 index 改写。loader 会应用 Config 模式中的默认值；此处再次显式合并，
 * 让没有传入配置的手工测试上下文也能正常运行。
 * @param ctx 已注入 httpServer 服务的宿主插件上下文。
 * @param config 已应用模式默认值的插件配置。
 */
export function apply(ctx: Context, config?: SfwConfig): void {
  const resolved = { ...defaultConfig(), ...config }
  if (!resolved.enabled) return
  const httpServer = (ctx as unknown as { httpServer?: HttpServerSeam }).httpServer
  if (httpServer === undefined) {
    throw new Error('dsh-sfw：httpServer 服务不可用（插件已声明 inject）')
  }
  ctx.effect(() => httpServer.tapIndex(html => transformIndex(html, resolved)), 'dsh-sfw：index 改写')
}

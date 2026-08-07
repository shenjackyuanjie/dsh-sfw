/**
 * dsh-sfw 浏览器端：Web 启动图从 `/plugins/dsh-sfw/client.js` 加载的品牌隐藏
 * 插件入口。它读取宿主注入的 `window.__DSH_SFW__` 配置（缺失时使用本地默认值），
 * 然后启动标签页标题拦截、品牌字标替换和新对话欢迎区清理。这里不依赖 cordis
 * 服务，全部处理面都在 DOM 中。
 * @module dsh-sfw/client
 */

import type { Context } from 'cordis'
import {
  maskProductName, normalizeWireConfig, type SfwConfig,
} from '../mask.ts'
import {
  patchTitle, startHeroCleanup, startWordmarkMasking,
} from './dom.ts'

/** 稳定的 cordis 插件名，即 Web 启动图条目 ID。 */
export const name = 'dsh-sfw'

/** 宿主端注入 index.html 的配置载荷。 */
declare global {
  interface Window {
    __DSH_SFW__?: unknown
  }
}

/** 读取宿主注入的配置；缺失或无效字段回退到本地默认值。 */
function readConfig(): SfwConfig {
  const wire = typeof window === 'undefined' ? undefined : window.__DSH_SFW__
  return normalizeWireConfig(wire)
}

/**
 * 浏览器插件主体：启动标题拦截、字标替换和欢迎区清理，并随插件 fiber 一同释放。
 * @param ctx 浏览器端 cordis 上下文；本插件不要求额外服务。
 */
export function apply(ctx: Context): void {
  const config = readConfig()
  if (!config.enabled) return
  const mask = (text: string): string => maskProductName(text, config.productName)
  const stopTitle = patchTitle(mask)
  const stopWordmark = startWordmarkMasking(config.wordmark)
  const stopHeroCleanup = startHeroCleanup()
  ctx.effect(() => () => {
    stopTitle()
    stopWordmark()
    stopHeroCleanup()
  }, 'dsh-sfw：品牌隐藏')
}

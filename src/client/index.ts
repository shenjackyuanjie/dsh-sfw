/**
 * dsh-sfw 浏览器端：Web 启动图从 `/plugins/@shenjack/dsh-sfw/client.js` 加载的
 * 品牌隐藏插件入口。它读取宿主注入的 `window.__DSH_SFW__` 配置（缺失时使用本地
 * 默认值），然后按 `overlays` 独立开关启动标签页标题拦截、品牌字标处理（替换
 * 或仅移除 HARNESS 铭牌）和新对话欢迎区清理。
 *
 * 除品牌隐藏外，本半部还向 DSH 设置页的「插件配置」section 注册一张卡片
 * （`settings.plugin.item` slot）：把 `dsh-sfw` settings namespace 以表单形式
 * 呈现，保存即写入宿主 settings 文档。卡片通过 cordis 服务（`slots` /
 * `settingsScope` / `locale` / `connection`）与 DSH 协作，不导入任何
 * `@deepseek-ai/*` 包。
 * @module @shenjack/dsh-sfw/client
 */

import type { Context } from 'cordis'
import {
  maskProductName, normalizeWireConfig, type SfwConfig,
} from '../mask.ts'
import { SfwConfigCard } from './config-card.tsx'
import {
  SFW_CARD_SPECS, SfwCardForm, SFW_NAMESPACE, type SfwConfigLike,
} from './config-form.ts'
import { en, zh } from './locales.ts'
import type { ConnectionHandleSeam } from './seams.ts'
import {
  patchTitle, startHeroCleanup, startWordmarkMasking,
} from './dom.ts'

/** 稳定的 cordis 插件名，即 Web 启动图条目 ID。 */
export const name = 'dsh-sfw'

/** 卡片文案字典的 locale namespace。 */
export const CONFIG_LOCALE_NS = 'dsh-sfw.config'

/** 卡片在「插件配置」section 中的条目 id（列表 key）。 */
export const CONFIG_CARD_ID = 'sfw'

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
 * 浏览器插件主体：按 `overlays` 开关启动品牌隐藏，并注册设置页配置卡片。
 * @param ctx 浏览器端 cordis 上下文；依赖 slots / settingsScope / locale /
 * connection 服务（均由 DSH Web 启动图提供）。
 */
export function apply(ctx: Context): void {
  const config = readConfig()
  if (config.enabled) {
    const mask = (text: string): string => maskProductName(text, config.productName)
    const stopTitle = config.overlays.title.enabled ? patchTitle(mask) : undefined
    const stopWordmark = config.overlays.wordmark.enabled
      ? startWordmarkMasking(config.wordmark, config.overlays.wordmark.mode)
      : undefined
    const stopHeroCleanup = config.overlays.hero.enabled ? startHeroCleanup() : undefined
    ctx.effect(() => () => {
      stopTitle?.()
      stopWordmark?.()
      stopHeroCleanup?.()
    }, 'dsh-sfw：品牌隐藏')
  }

  // 设置页配置卡片：独立于品牌隐藏运行——即使 enabled 为 false，用户也应能
  // 在设置页把开关改回来。设置卡片依赖 DSH 的 slots / settingsScope / locale /
  // connection 服务；服务缺失（纯 cordis 装配/测试）时回调不运行，品牌隐藏
  // 逻辑不受影响。
  ctx.inject(['slots', 'settingsScope', 'locale', 'connection'], (sctx) => {
    const connection = sctx.get('connection') as ConnectionHandleSeam
    const scope = sctx.settingsScope.bind<SfwConfigLike>({ namespace: SFW_NAMESPACE })
    const form = new SfwCardForm(scope, connection.api, SFW_CARD_SPECS)
    const actions = form.actions()
    sctx.effect(() => sctx.locale.register(CONFIG_LOCALE_NS, { zh, en }), 'dsh-sfw：卡片文案')
    sctx.effect(
      () => sctx.slots.inject('settings.plugin.item', function* () {
        yield sctx.slots.register({
          name: 'settings.plugin.item',
          id: CONFIG_CARD_ID,
          order: 30,
          locale: CONFIG_LOCALE_NS,
          inject: () => ({
            hooks: { sfwCard: form },
            edit: actions.edit,
            reset: actions.reset,
            save: actions.save,
            discard: actions.discard,
          }),
        }, SfwConfigCard)
      }),
      'dsh-sfw：配置卡片',
    )
  })
}

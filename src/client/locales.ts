/**
 * dsh-sfw 配置卡片的文案字典：注册到 `dsh-sfw.config` locale namespace，
 * 由 `ctx.locale` 按当前界面语言选择。
 * @module @shenjack/dsh-sfw/client/locales
 */

/** 卡片渲染用到的文案 key。 */
export type SfwConfigKey =
  | 'title' | 'description'
  | 'enabled' | 'enabledHint'
  | 'productName' | 'productNameHint'
  | 'wordmark' | 'wordmarkHint'
  | 'wordmarkMode' | 'wordmarkModeHint'
  | 'overlayWordmark' | 'overlayWordmarkHint'
  | 'overlayTitle' | 'overlayTitleHint'
  | 'overlayHero' | 'overlayHeroHint'
  | 'modeReplace' | 'modeHarnessRemove'
  | 'overridden' | 'reset' | 'readOnly'
  | 'expand' | 'collapse' | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed'

/** 简体中文文案（产品文案语言）。 */
export const zh: Record<SfwConfigKey, string> = {
  title: '品牌隐藏',
  description: '把 Web 界面中的 DeepSeek 品牌替换为可配置字标。',
  enabled: '启用品牌隐藏',
  enabledHint: '关闭后所有处理面都停用，界面恢复原样。',
  productName: '标签页产品名',
  productNameHint: '替换“DeepSeek Harness”的完整拼写；留空表示不替换。',
  wordmark: '左上角字标',
  wordmarkHint: '使用内置像素字库生成的矢量字标名称，如 openclaw、harmes、reasonix。',
  wordmarkMode: '字标处理模式',
  wordmarkModeHint: 'replace：整体替换为配置字标；harness-remove：只移除 HARNESS 铭牌，保留 DeepSeek 字母与鲸鱼 logo。',
  overlayWordmark: '处理字标',
  overlayWordmarkHint: '是否处理左上角品牌字标 SVG。',
  overlayTitle: '处理标签页标题',
  overlayTitleHint: '是否把“DeepSeek Harness”标题替换为产品名。',
  overlayHero: '处理欢迎区',
  overlayHeroHint: '是否隐藏新对话欢迎区的鱼形图标与“预览版”徽章。',
  modeReplace: '整体替换',
  modeHarnessRemove: '只移除铭牌',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  expand: '展开设置',
  collapse: '收起设置',
  save: '保存',
  saving: '保存中…',
  discard: '放弃修改',
  unsaved: '未保存',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
}

/** 英文文案。 */
export const en: Record<SfwConfigKey, string> = {
  title: 'Brand masking',
  description: 'Replace DeepSeek branding in the Web UI with a configurable wordmark.',
  enabled: 'Enable brand masking',
  enabledHint: 'When off, every overlay is disabled and the UI stays untouched.',
  productName: 'Tab product name',
  productNameHint: 'Replaces the full “DeepSeek Harness” spelling; leave blank to keep it.',
  wordmark: 'Corner wordmark',
  wordmarkHint: 'A vector wordmark drawn from the built-in pixel font, e.g. openclaw, harmes, reasonix.',
  wordmarkMode: 'Wordmark mode',
  wordmarkModeHint: 'replace swaps the whole mark; harness-remove drops only the HARNESS badge, keeping the DeepSeek letters and the whale.',
  overlayWordmark: 'Mask the wordmark',
  overlayWordmarkHint: 'Whether the corner brand SVG is processed.',
  overlayTitle: 'Mask the tab title',
  overlayTitleHint: 'Whether the “DeepSeek Harness” title becomes the product name.',
  overlayHero: 'Mask the hero',
  overlayHeroHint: 'Whether the new-conversation hero’s fish icon and “Preview” badge are hidden.',
  modeReplace: 'Replace entirely',
  modeHarnessRemove: 'Remove badge only',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  expand: 'Show settings',
  collapse: 'Hide settings',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  unsaved: 'Unsaved',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
}

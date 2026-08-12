/**
 * dsh-sfw 配置卡片：注册进 DSH 设置页「插件配置」section 的
 * `settings.plugin.item` slot。卡片头列出插件名与职责，展开后是绑定到
 * `dsh-sfw` settings namespace 的手写控件；输入只进入草稿，保存才写入。
 *
 * 样式直接使用 DSH 主题的 `--dsw-alias-*` 语义 token（内联 style），与设置页
 * 其他卡片在亮色/暗色主题下保持一致；不引入 CSS Modules 构建链。
 * @module @shenjack/dsh-sfw/client/config-card
 */

import { useState, type CSSProperties } from 'react'
import type { SfwCardActions, SfwCardSnapshot } from './config-form.ts'
import type { SfwConfigKey } from './locales.ts'

/** 一个字段的控件形态与文案。 */
export interface SfwFieldDefinition {
  field: string
  kind: 'switch' | 'text' | 'select'
  labelKey: SfwConfigKey
  hintKey: SfwConfigKey
  /** select 字段的选项（值 → 文案 key）。 */
  options?: ReadonlyArray<{ value: string; key: SfwConfigKey }>
}

/** 卡片渲染的字段集合（顺序即展示顺序）。 */
export const SFW_CARD_FIELDS: readonly SfwFieldDefinition[] = [
  { field: 'enabled', kind: 'switch', labelKey: 'enabled', hintKey: 'enabledHint' },
  { field: 'productName', kind: 'text', labelKey: 'productName', hintKey: 'productNameHint' },
  { field: 'wordmark', kind: 'text', labelKey: 'wordmark', hintKey: 'wordmarkHint' },
  {
    field: 'wordmarkMode', kind: 'select', labelKey: 'wordmarkMode', hintKey: 'wordmarkModeHint',
    options: [
      { value: 'replace', key: 'modeReplace' },
      { value: 'harness-remove', key: 'modeHarnessRemove' },
    ],
  },
  { field: 'overlayWordmark', kind: 'switch', labelKey: 'overlayWordmark', hintKey: 'overlayWordmarkHint' },
  { field: 'overlayTitle', kind: 'switch', labelKey: 'overlayTitle', hintKey: 'overlayTitleHint' },
  { field: 'overlayHero', kind: 'switch', labelKey: 'overlayHero', hintKey: 'overlayHeroHint' },
]

/** 组件 props：locale `t`、快照选择 hook 与表单动作（由 slot 注入面绑定）。 */
export interface SfwCardProps {
  t: (key: SfwConfigKey) => string
  useSfwCard: (selector: (snapshot: SfwCardSnapshot) => SfwCardSnapshot) => SfwCardSnapshot
  edit: SfwCardActions['edit']
  reset: SfwCardActions['reset']
  save: SfwCardActions['save']
  discard: SfwCardActions['discard']
}

const cardStyle: CSSProperties = {
  listStyle: 'none',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-layer-3)',
}

const cardOpenStyle: CSSProperties = {
  ...cardStyle,
  background: 'var(--dsw-alias-bg-layer-2)',
  borderColor: 'var(--dsw-alias-label-dimmed)',
}

const headerStyle: CSSProperties = {
  width: '100%',
  appearance: 'none',
  border: 0,
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 16px',
  borderRadius: 12,
}

const headTextStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const nameStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.4,
  color: 'var(--dsw-alias-label-primary)',
}

const descriptionStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-tertiary)',
}

const chevronStyle: CSSProperties = {
  flex: 'none',
  color: 'var(--dsw-alias-label-tertiary)',
  transition: 'transform .16s',
}

const pendingStyle: CSSProperties = {
  flex: 'none',
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 11,
  lineHeight: '17px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-secondary)',
}

const bodyStyle: CSSProperties = {
  borderTop: '1px solid var(--dsw-alias-border-l2)',
  margin: '0 16px',
  paddingBottom: 8,
}

const readOnlyStyle: CSSProperties = {
  margin: '12px 0 0',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-tertiary)',
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '12px 0',
}

const fieldSeparatorStyle: CSSProperties = {
  ...fieldStyle,
  borderTop: '1px solid var(--dsw-alias-border-l2)',
}

const headStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const labelStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-primary)',
}

const badgesStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

const badgeStyle: CSSProperties = {
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 11,
  lineHeight: '17px',
  whiteSpace: 'nowrap',
  fontWeight: 500,
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-secondary)',
}

const resetStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  font: 'inherit',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-secondary)',
  cursor: 'pointer',
}

const inputStyle: CSSProperties = {
  height: 34,
  padding: '0 12px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-3)',
  font: 'inherit',
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-primary)',
}

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-tertiary)',
}

const switchRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '12px 0 4px',
  borderTop: '1px solid var(--dsw-alias-border-l2)',
}

const failedStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-error)',
}

const buttonBaseStyle: CSSProperties = {
  appearance: 'none',
  border: '1px solid transparent',
  borderRadius: 8,
  padding: '5px 14px',
  font: 'inherit',
  fontSize: 13,
  lineHeight: 1.5,
  cursor: 'pointer',
}

const discardStyle: CSSProperties = {
  ...buttonBaseStyle,
  borderColor: 'var(--dsw-alias-border-l2)',
  background: 'none',
  color: 'var(--dsw-alias-label-secondary)',
}

const saveStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: 'var(--dsw-alias-label-primary)',
  color: 'var(--dsw-alias-bg-layer-3)',
}

const disabledButtonStyle: CSSProperties = {
  opacity: 0.4,
  cursor: 'default',
}

/**
 * 渲染 dsh-sfw 配置卡片。
 * @param props - 文案、快照与表单动作。
 * @returns 卡片，namespace 未暴露时返回 null。
 */
export function SfwConfigCard(props: SfwCardProps) {
  const [open, setOpen] = useState(false)
  const state = props.useSfwCard(snapshot => snapshot)
  if (!state.available) return null
  const blocked = !state.dirty || state.invalid || state.saving
  const { t } = props
  return (
    <li style={open ? cardOpenStyle : cardStyle}>
      <button
        type="button"
        style={headerStyle}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('title')}`}
        onClick={() => { setOpen(!open) }}
      >
        <span style={headTextStyle}>
          <span style={nameStyle}>{t('title')}</span>
          <span style={descriptionStyle}>{t('description')}</span>
        </span>
        {state.dirty ? <span style={pendingStyle}>{t('unsaved')}</span> : null}
        <span style={{ ...chevronStyle, transform: open ? 'rotate(180deg)' : undefined }}>▾</span>
      </button>
      {open
        ? (
          <div style={bodyStyle}>
            {!state.writable ? <p style={readOnlyStyle} role="status">{t('readOnly')}</p> : null}
            {SFW_CARD_FIELDS.map((definition, index) => (
              <Field
                key={definition.field}
                definition={definition}
                fieldState={state.fields[definition.field]!}
                disabled={!state.writable}
                t={t}
                onEdit={props.edit}
                onReset={props.reset}
                separated={index > 0}
              />
            ))}
            <div style={footerStyle}>
              {state.failed ? <p style={failedStyle} role="status">{t('saveFailed')}</p> : null}
              <button
                type="button"
                style={{ ...discardStyle, ...(!state.dirty || state.saving ? disabledButtonStyle : {}) }}
                disabled={!state.dirty || state.saving}
                onClick={props.discard}
              >
                {t('discard')}
              </button>
              <button
                type="button"
                style={{ ...saveStyle, ...(blocked ? disabledButtonStyle : {}) }}
                disabled={blocked}
                onClick={props.save}
              >
                {t(state.saving ? 'saving' : 'save')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}

/** 一个字段的控件：开关 / 文本 / 下拉，附覆盖徽章与恢复默认。 */
function Field(props: {
  definition: SfwFieldDefinition
  fieldState: { text: string; overridden: boolean; invalid: boolean }
  disabled: boolean
  t: (key: SfwConfigKey) => string
  onEdit: (field: string, text: string) => void
  onReset: (field: string) => void
  separated: boolean
}) {
  const { definition, fieldState, disabled, t } = props
  const { field, kind, labelKey, hintKey } = definition
  const style = props.separated ? fieldSeparatorStyle : fieldStyle
  return (
    <div style={style}>
      <div style={headStyle}>
        <label style={labelStyle} htmlFor={`dsh-sfw-config-${field}`}>{t(labelKey)}</label>
        {fieldState.overridden
          ? (
            <span style={badgesStyle}>
              <span style={badgeStyle}>{t('overridden')}</span>
              <button type="button" style={resetStyle} disabled={disabled} onClick={() => { props.onReset(field) }}>
                {t('reset')}
              </button>
            </span>
          )
          : null}
      </div>
      {kind === 'switch'
        ? (
          <div style={switchRowStyle}>
            <input
              id={`dsh-sfw-config-${field}`}
              type="checkbox"
              checked={fieldState.text === 'true'}
              disabled={disabled}
              onChange={(event) => { props.onEdit(field, event.target.checked ? 'true' : 'false') }}
            />
          </div>
        )
        : kind === 'select'
          ? (
            <select
              id={`dsh-sfw-config-${field}`}
              style={inputStyle}
              disabled={disabled}
              value={fieldState.text}
              onChange={(event) => { props.onEdit(field, event.target.value) }}
            >
              {definition.options?.map(option => (
                <option key={option.value} value={option.value}>{t(option.key)}</option>
              ))}
            </select>
          )
          : (
            <input
              id={`dsh-sfw-config-${field}`}
              style={inputStyle}
              type="text"
              value={fieldState.text}
              disabled={disabled}
              onChange={(event) => { props.onEdit(field, event.target.value) }}
            />
          )}
      <p style={hintStyle}>{t(hintKey)}</p>
    </div>
  )
}

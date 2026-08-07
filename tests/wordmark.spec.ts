/** 可配置矢量字标生成器测试。 */
import { describe, expect, it } from 'vitest'
import { resolveWordmark } from '../src/client/wordmark.ts'

describe('resolveWordmark', () => {
  it('保留 OpenCode 官方路径和 viewBox', () => {
    const vector = resolveWordmark('OpenCode')
    expect(vector.key).toBe('opencode')
    expect(vector.viewBox).toBe('0 0 234 42')
    expect(vector.paths).toHaveLength(16)
    expect(vector.paths[0]?.d).toBe('M18 30H6V18H18V30Z')
    expect(vector.paths[15]?.d)
      .toBe('M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z')
  })

  it.each([
    ['openclaw', '0 0 47 7', 8],
    ['harmes', '0 0 35 7', 6],
    ['reasonix', '0 0 47 7', 8],
  ])('把 %s 转换为像素矢量路径', (name, viewBox, pathCount) => {
    const vector = resolveWordmark(name)
    expect(vector.key).toBe(name)
    expect(vector.viewBox).toBe(viewBox)
    expect(vector.paths).toHaveLength(pathCount)
    expect(vector.paths.every(path => path.d.length > 0)).toBe(true)
    expect(vector.paths.some(path => path.opacity === 0.72)).toBe(true)
    expect(vector.paths.some(path => path.opacity === 1)).toBe(true)
  })

  it('支持数字、连接符和未知字符兜底', () => {
    const vector = resolveWordmark('Agent-42!')
    expect(vector.key).toBe('agent-42!')
    expect(vector.viewBox).toBe('0 0 53 7')
    expect(vector.paths).toHaveLength(9)
  })
})

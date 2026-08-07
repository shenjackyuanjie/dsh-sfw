/** 宿主端测试：index.html 标题改写与配置脚本注入。 */
import { describe, expect, it } from 'vitest'
import { transformIndex } from '../src/index.ts'
import { defaultConfig } from '../src/mask.ts'

const SAMPLE_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>DeepSeek Harness</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

describe('transformIndex', () => {
  it('改写包含 DeepSeek 的标题并保留中性标题', () => {
    const masked = transformIndex(SAMPLE_HTML, defaultConfig())
    expect(masked).toContain('<title>Harness</title>')
    expect(masked).not.toContain('DeepSeek Harness')
    const neutral = transformIndex('<html><head><title>My Page</title></head><body></body></html>', defaultConfig())
    expect(neutral).toContain('<title>My Page</title>')
  })

  it('把完整配置脚本紧跟 head 注入', () => {
    const masked = transformIndex(SAMPLE_HTML, defaultConfig())
    const headEnd = masked.indexOf('</head>')
    const injectedAt = masked.indexOf('window.__DSH_SFW__ =')
    expect(injectedAt).toBeGreaterThan(-1)
    expect(injectedAt).toBeLessThan(headEnd)
  })

  it('只序列化插件配置字段', () => {
    const masked = transformIndex(SAMPLE_HTML, defaultConfig())
    expect(masked).toContain('"enabled":true,"productName":"Harness","wordmark":"opencode"')
    expect(masked).not.toContain('wordmarkSize')
    expect(masked).not.toContain('providerName')
    expect(masked).not.toContain('DeepSeek-V4-Flash')
  })

  it('转义载荷中的小于号以防配置字符串逃逸 script 元素', () => {
    const config = { ...defaultConfig(), productName: 'A<B>Company' }
    const masked = transformIndex('<html><head></head><body></body></html>', config)
    // script 元素中只有 '<' 会形成危险的原始 '</script>'；'>' 保持原样，
    // 与启动清单的注入行为一致。
    const payload = masked.slice(masked.indexOf('= ') + 2, masked.indexOf('</script>'))
    expect(payload).toContain('A\\u003cB>Company')
    expect(payload).not.toContain('<')
  })

  it('不存在 head 时把脚本放在文档最前', () => {
    const masked = transformIndex('<html><body></body></html>', defaultConfig())
    expect(masked.startsWith('<script>window.__DSH_SFW__ =')).toBe(true)
  })
})

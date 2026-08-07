/**
 * Host-half tests: the index.html transform (title rewrite + config script
 * injection).
 */
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
  it('rewrites a DeepSeek-bearing title and keeps a neutral title', () => {
    const masked = transformIndex(SAMPLE_HTML, defaultConfig())
    expect(masked).toContain('<title>Harness</title>')
    expect(masked).not.toContain('DeepSeek Harness')
    const neutral = transformIndex('<html><head><title>My Page</title></head><body></body></html>', defaultConfig())
    expect(neutral).toContain('<title>My Page</title>')
  })

  it('injects the resolved config script right after <head>', () => {
    const masked = transformIndex(SAMPLE_HTML, defaultConfig())
    const headEnd = masked.indexOf('</head>')
    const injectedAt = masked.indexOf('window.__DSH_SFW__ =')
    expect(injectedAt).toBeGreaterThan(-1)
    expect(injectedAt).toBeLessThan(headEnd)
  })

  it('serializes only the plugin config fields', () => {
    const masked = transformIndex(SAMPLE_HTML, defaultConfig())
    expect(masked).toContain('"enabled":true,"productName":"Harness","wordmark":"opencode","wordmarkSize":18')
    expect(masked).not.toContain('providerName')
    expect(masked).not.toContain('DeepSeek-V4-Flash')
  })

  it('escapes < in the payload so config strings cannot break out of the script element', () => {
    const config = { ...defaultConfig(), productName: 'A<B>Company' }
    const masked = transformIndex('<html><head></head><body></body></html>', config)
    // Only '<' is dangerous inside a script element (a raw '</script>'); '>'
    // is left as-is, mirroring the boot-manifest injection.
    const payload = masked.slice(masked.indexOf('= ') + 2, masked.indexOf('</script>'))
    expect(payload).toContain('A\\u003cB>Company')
    expect(payload).not.toContain('<')
  })

  it('prepends the script when no <head> exists', () => {
    const masked = transformIndex('<html><body></body></html>', defaultConfig())
    expect(masked.startsWith('<script>window.__DSH_SFW__ =')).toBe(true)
  })
})

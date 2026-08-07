/**
 * dsh-sfw 构建配置：同时产出宿主端 lib 包和浏览器端 client 包。
 *
 * client 包必须是 Web 外壳模块加载器可消费的闭包工厂产物：整个包体位于
 * factory 中，通过 `window.__ModuleLoader__.load({ id, factory })` 注册；
 * loader 条目把 factory 的 `module.exports` 作为 cordis 插件契约
 *（{ name, apply }）导入。banner/footer/intro 结构与已经发布的
 * @deepseek-ai/dsh-client-* 预设（tsdown.client.ts）保持一致。
 */
import type { UserConfig } from 'tsdown'

/** 插件包 ID，同时也是 Web 启动图中的 loader 条目名。 */
const PLUGIN_ID = 'dsh-sfw'

const configs: UserConfig[] = [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    dts: false,
    clean: true,
    // 输出 lib/index.js（本包声明了 "type": "module"）；默认的 .mjs 后缀
    // 无法命中 exports 映射。
    fixedExtension: false,
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2020',
    dts: false,
    sourcemap: true,
    clean: false,
    // 浏览器端没有外部运行时导入（不引入 react；cordis 仅导入类型并会被擦除），
    // 因此不能保留 external，所有运行时依赖都必须内联到包中。
    deps: { alwaysBundle: /./ },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: `return module.exports; } });`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
]

export default configs

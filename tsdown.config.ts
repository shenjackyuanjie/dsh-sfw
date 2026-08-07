/**
 * dsh-sfw build: the host-half lib bundle plus the browser client bundle.
 *
 * The client bundle must be the closure-factory artifact the web shell's
 * module loader consumes: the whole bundle body sits inside a factory that
 * registers itself via `window.__ModuleLoader__.load({ id, factory })`, and
 * the loader entry imports the factory's `module.exports` as the cordis
 * plugin contract ({ name, apply }). The banner/footer/intro shape mirrors
 * the shipped @deepseek-ai/dsh-client-* preset (tsdown.client.ts).
 */
import type { UserConfig } from 'tsdown'

/** The plugin package id (also the loader entry name in the web boot graph). */
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
    // Emit lib/index.js (the package is "type": "module"); the default .mjs
    // would miss the exports map.
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
    // The client half imports nothing external (no react, no cordis value
    // imports — cordis is type-only and erased), so nothing may stay
    // external: every runtime specifier must be inlined into the bundle.
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

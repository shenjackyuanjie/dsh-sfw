# dsh-sfw 交接文档

> 写于 2026-08-08，最近更新于可配置矢量字标改造。

## 1. 这是什么

一个 dsh(DeepSeek Harness)插件,让 WebUI **不被认出是 DeepSeek**:

- 左上角品牌字标(原为 "deepseek-official" 字母 + HARNESS 铭牌 + 鲸鱼图形的 SVG)→ **保留外层 SVG，内容替换为配置名称对应的矢量路径**(按钮功能保留:点击新建会话;不依赖字体渲染)。
- 浏览器标签页标题 `DeepSeek Harness` → `Harness`(含会话标题 `xxx — DeepSeek Harness`)。
- 新对话欢迎页 hero(「开始构建吧」那一行)→ **鱼形 logo 与「预览版」徽章隐藏**,行改为居中 flex,标题保持视觉居中(2026-08-08 用户追加要求)。

**刻意不做的事**(用户明确否决过):不改写任何其他界面文本 —— 模型选择器里的 `DeepSeek`/`DeepSeek-V4-Flash`、设置页、消息正文、用户自己的工作区/会话名,全部保持原样。早期版本做过全局文本替换,被用户否决后已删除,见 git 历史 `fe24c84`。

## 2. 当前状态

| 项 | 状态 |
|---|---|
| 单元测试 | ✅ 42 个全绿(`pnpm test`) |
| 构建 | ✅ `pnpm run build` 通过,产出 `lib/index.js` + `lib/client.js` |
| 真实浏览器验证 | ⚠️ 旧版文字方案曾通过 headless Edge(CDP)验证；新矢量路径方案仍需刷新运行页面做一次视觉确认 |
| 运行部署 | ✅ 已装进 `$DSH_HOME/profiles/web`(link 方式),cordis.patch.yml 已加行,服务端热重载已生效 |
| 未提交改动 | 无(全部已提交) |

## 3. 仓库结构与文件职责

```
dsh-sfw/
├── package.json          # name: @shenjack/dsh-sfw;dshClient 声明(platform: web);exports ./client → lib/client.js
├── tsconfig.json         # strict;allowImportingTsExtensions;emitDeclarationOnly → lib/types
├── tsdown.config.ts      # 双构建:node 半部 lib/index.js(ESM)+ client 半部 lib/client.js(CJS + __ModuleLoader__ 包装)
├── src/
│   ├── mask.ts           # 共享纯逻辑:SfwConfig 类型/默认值/normalizeWireConfig(容错解析注入载荷)/maskProductName
│   ├── index.ts          # node 半部:Config(schemastery)+ apply → httpServer.tapIndex(改写<title>+注入 window.__DSH_SFW__)
│   └── client/
│       ├── index.ts      # 浏览器入口:{ name, apply } → 启动标题掩蔽 + 字标替换 + hero 清理
│       ├── dom.ts        # patchTitle(setter 拦截)/patchWordmark(注入配置路径)/startWordmarkMasking(observer)/hero 清理
│       └── wordmark.ts   # OpenCode 官方路径 + 通用 5×7 像素矢量字库
└── tests/
    ├── mask.spec.ts      # 配置解析与 productName 掩蔽
    ├── index-tap.spec.ts # index.html 标题改写 + 载荷注入/转义
    ├── dom.spec.ts       # jsdom:矢量字标替换、重挂载回归、hero 清理、标题 setter、不碰普通文本
    └── wordmark.spec.ts  # OpenCode 官方路径与通用像素字库
```

## 4. 架构与关键机制(新接手必读)

插件是 **dsh 的双半部插件**,宿主不用改一行代码:

1. **node 半部**(`src/index.ts`):在宿主里以插件行加载(见 §5)。`apply` 里 `ctx.httpServer.tapIndex()` 注册一个 index.html 变换:
   - 把 `<title>DeepSeek Harness</title>` 直接改写为 `productName`(JS 加载前标签页就不露馅);
   - 把完整配置以 `<script>window.__DSH_SFW__ = {...}</script>` 注入 `<head>`(与 `__DSH_BOOT__` 同一条注入通道;`<` 转义为 `\u003c`)。
2. **浏览器半部**(`src/client/`):因为 `package.json` 里声明了 `dshClient`,宿主 `dsh-client-modules` 自动把它编译好的 `lib/client.js` 挂进浏览器加载图(`__DSH_BOOT__` 出现 `@shenjack/dsh-sfw` 行,`/plugins/@shenjack/dsh-sfw/client.js` 提供服务)。浏览器端 cordis 加载该 bundle(要求 CJS + `window.__ModuleLoader__.load({id, factory})` 包装,tsdown 配置已处理),`apply` 启动:
   - `patchTitle`:`document.title` 的 setter 拦截,任何赋值(会话标题投影)都会过 `DeepSeek Harness → productName`;
   - `startWordmarkMasking`:MutationObserver 全文档监听,任何**新增子树内的所有后代 svg** 都会检查是否为字标(`#dsh-wordmark-whale-clip` 特征),是则 `patchWordmark`;
   - `startHeroCleanup`:同一 observer 模式,任何新增子树内找到文本为「开始构建吧」的行(hero 标题行),把行内 `viewBox="0 0 23.16 17.04"` 的鱼 logo 与「预览版」徽章 `display:none`,并把行从三列 grid 改成居中 flex(否则去掉两侧元素后标题会偏位)。锚点是中文文案,宿主改文案会失效(已知限制)。

**字标替换原理**(`patchWordmark`):识别后 `svg.replaceChildren()` 清空全部原始内容(鲸鱼、字母、铭牌、defs 全部移除)，保留宿主持有的外层 SVG(尺寸 182×24 不动)，再注入 `wordmark` 对应的矢量路径。`opencode` 使用固定上游提交中的 16 条官方路径；其他名称由内置 5×7 字库生成 path，按名称长度动态设置 viewBox。颜色使用 `currentColor` 加透明度，兼容 DSH 亮暗主题。外层按钮(新建会话)不受影响；按钮整体重挂载或 React 恢复同一 SVG 的 children 时，observer 会再次处理，`data-dsh-sfw-wordmark` 保证幂等。hero 清理同理，靠 `data-dsh-sfw-hidden` 标记 + 行上标记保证幂等。

**两个历史教训**(对应两次修复,别倒退):

- 不能只在"新增节点本身就是 svg"时处理字标 —— React 整棵 UI 是一次性挂载的大树,svg 是**后代**节点。必须扫 `querySelectorAll('svg')`。
- 不能全局改文本节点 —— 用户否决(模型选择器被改残)。字标是 SVG 矢量字形,文本替换本来就覆盖不了,必须动 SVG。

**自动化验证行为**:`opencode` 使用官方 viewBox 和 16 条路径，宿主 SVG 的 182×24 尺寸、外层按钮和 aria-label 保留；重挂载与原地恢复 children 都会重新处理。

## 5. 安装与运行状态(本机)

- `$DSH_HOME = D:\githubs\deepseek\dsh`(环境变量已设)。
- 安装方式:`dsh plugin --profile web add link:D:\githubs\deepseek\dsh-sfw`(profile/node_modules/@shenjack/dsh-sfw 是指向仓库的符号链接)。依赖(schemastery)从仓库自身 node_modules 解析。
- 加载方式(2026-08-09 改为 **bundle**,不再编辑 profile 的 cordis.patch.yml):把 `@shenjack/dsh-sfw` 加进 `D:\githubs\deepseek\dsh\profiles\web\package.json` 的 `dsh.profile.bundles`(与 `@deepseek-ai/dsh-base` 等并列);插件自带 `cordis.patch.yml`(`dsh.bundle.patch` manifest)插入自身行,与 `session-persistence-rdb` 同款。profile 的 `cordis.patch.yml` 无 dsh-sfw 条目。
- 配置:只写 `$DSH_HOME/settings.yaml` 的 `dsh-sfw` namespace(见 §6),热生效。
- 运行中的 `dsh web` 进程(3080 端口)通过 `source/current → staging-20260807T143306Z` 的 tsx 源码启动;profile 补丁层支持**配置热重载**,插件行变更会实时挂载。
- ⚠️ 注意:运行中的宿主加载的是**旧版 node 半部**(注入旧形状载荷,含 providerName 等多余字段)。新 client 的 `normalizeWireConfig` 容忍多余字段,所以一切正常;等下次重启 `dsh web` 后载荷会变精简。**改 node 半部代码后必须重启才生效;改 client 半部代码后重新 `pnpm run build` + 刷新页面即可**(`/plugins/*/client.js` 每次请求实时读盘,`cache-control: no-cache`)。

## 6. 配置

配置有两个来源，按优先级叠加（后者覆盖前者）：

1. `$DSH_HOME/settings.yaml` 的 `dsh-sfw` namespace（settings 服务存在时；变更**热生效**，下次页面加载即用新配置）：

```yaml
dsh-sfw:
  enabled: true          # 总开关
  productName: 'Harness' # 标签页标题替换名
  wordmark: 'opencode'   # 可改为 openclaw、harmes、reasonix 或其他名称
```

2. `cordis.patch.yml` 的 entry config（作为 base；未在 settings.yaml 写出的字段回落到这里）：

```yaml
- insert:
    - id: dsh-sfw
      name: '@shenjack/dsh-sfw'
      config:
        enabled: true          # 总开关
        productName: 'Harness' # 标签页标题替换名
        wordmark: 'opencode'   # 可改为 openclaw、harmes、reasonix 或其他名称
```

`opencode` 使用官方矢量资产，其他名称使用通用像素矢量字库。已移除旧的 `wordmarkSize`，尺寸由 SVG viewBox 自动适配。配置热重载后刷新页面即可生效。

settings 接入说明（2026-08-09 改造）：`apply` 里用可选注入 `ctx.inject(['settings'], ...)` 挂接 settings 服务（结构接缝 `SettingsSeam`，不 import 私有包 `@deepseek-ai/dsh-settings`），以 cordis entry config 为 base 注册 `dsh-sfw` namespace；settings 服务缺失时回落 entry。settings.yaml 变更通过 `scope.watch` 热重挂载 `tapIndex` 变换（`enabled` 切 false 时摘除）。settings provider 分离（重载/卸载）时回落 entry 并重挂载；插件卸载时释放变换。测试见 `tests/settings.spec.ts`（真实 cordis 装配 + 桩服务）。

## 7. 日常迭代流程

```sh
cd D:\githubs\deepseek\dsh-sfw
pnpm run build    # tsdown 产出 lib/index.js + lib/client.js;tsc 产出 lib/types
pnpm test         # vitest,35 个用例
```

改完 client 代码 → build → 浏览器刷新。改完 node 代码 → build → 重启 `dsh web`。改完配置 → 直接刷新。

## 8. 真实浏览器验证方法(bun + headless Edge)

bun 1.4 已装,Edge 在 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。

```powershell
# 1. 启动 headless Edge(固定 CDP 端口;注意 Windows 上 playwright channel 启动会因调试管道挂起,必须手动起 + connectOverCDP)
Start-Process 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' `
  -ArgumentList '--headless=new','--remote-debugging-port=9223','--user-data-dir=D:\githubs\deepseek\test-shenjackyuanjie\agent-tmp\edge-profile','--no-first-run','--no-default-browser-check','--disable-gpu','about:blank'

# 2. 运行诊断脚本(playwright 从 dsh repo 的 apps/web node_modules 引入)
bun run D:\githubs\deepseek\test-shenjackyuanjie\agent-tmp\sfw-wordmark.mjs
```

诊断脚本在 `D:\githubs\deepseek\test-shenjackyuanjie\agent-tmp\`(sfw-wordmark.mjs 等,工作区 gitignore 内)。断言要点:未替换字标数 = 0;`svg g[data-dsh-sfw-wordmark="<配置值>"]` 存在且包含 path;按钮 aria-label/尺寸不变;无 console/page error。`opencode` 额外断言 16 条 path 和 `0 0 234 42` viewBox。验证完记得杀掉 headless Edge(命令行匹配 `remote-debugging-port=9223`)。

## 9. 已知限制与待办

- 只覆盖浏览器界面;终端 `dsh` 启动横幅、URL 行、ACP/JSON-RPC 等其他表面不在范围(用户只要 webui)。
- 欢迎页(`WelcomeNotice`)与引导弹窗(`DeepSeekOnboardingDialog`)里的同款字标也会被替换(同一 SVG 特征,自动覆盖)—— 这是预期行为。
- favicon 与**侧栏折叠态**鲸鱼(`FishLogo`,不在 hero 行内)未处理(用户未要求;hero 里的鱼已按用户要求隐藏)。
- hero 清理以中文文案「开始构建吧」「预览版」为锚点,宿主若改动文案会失效(需要时把锚点提成配置)。
- 会话消息正文若出现 "DeepSeek Harness" 字样不会被改写(刻意)。
- 若用户后续还想要其他表面被替换,扩展点:mask.ts 加字段 + node Config 加 schema 字段 + client apply 接线,并同步更新 README 与测试。

## 10. 下一步建议

- 用户刷新页面确认所选矢量字标的视觉效果。
- 下次自然重启 `dsh web` 时确认精简后的 `__DSH_SFW__` 载荷无回归。
- 若想连侧栏折叠态鲸鱼/favicon 一起处理,需要扩展 client 半部(它们是独立 SVG,不在 hero 行内)。
- 若宿主界面文案改动导致 hero 清理失效,把「开始构建吧」「预览版」锚点提成配置字段。

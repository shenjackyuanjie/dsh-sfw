# dsh-sfw

让 dsh WebUI「看起来不是 DeepSeek」的插件 —— 掩盖 Web 界面上的各种 DeepSeek 字样,免得内测期间被路过的人认出来。

插件分两半:

- **node 半部**(宿主侧):通过 `httpServer.tapIndex` 改写被服务的 `index.html` —— 把 `<title>DeepSeek Harness</title>` 直接换成掩蔽后的产品名(JS 加载前就不会露馅),并把解析好的掩蔽规则以 `window.__DSH_SFW__` 注入页面(与 `__DSH_BOOT__` 同一条注入通道)。
- **浏览器半部**(客户端):启动后常驻一个 DOM 掩蔽引擎 —— 文本节点(含后续流式渲染进来的内容)、`aria-label`/`title`/`alt`/`placeholder` 属性、`document.title`(拦截 setter,会话标题的 `xxx — DeepSeek Harness` 也会被掩蔽)、以及侧边栏/设置页的品牌字标 SVG(把字母字形和 HARNESS 铭牌路径原地改成透明,保留鲸鱼图形)。

只要插件包声明了 `dshClient`,宿主 `dsh-client-modules` 会自动把它编译好的 `lib/client.js` 挂进浏览器端的加载图,无需改动 dsh 本体。

## 安装

在 dsh 的 web profile 下安装(以默认的 `web` profile 为例):

```sh
dsh plugin --profile web add link:D:\githubs\deepseek\dsh-sfw
```

然后在 `$DSH_HOME/profiles/web/cordis.patch.yml` 追加一行:

```yaml
- id: dsh-sfw
  name: 'dsh-sfw'
  config: {}
```

重启 `dsh web`(插件集变更按配置源规则重启后生效),刷新浏览器即可。改完插件代码后需重新 `pnpm run build`,再重启 `dsh web`。

## 配置

`config` 里可覆盖默认掩蔽词表(其余字段省略即用默认值):

```yaml
- id: dsh-sfw
  name: 'dsh-sfw'
  config:
    enabled: true          # 总开关,false 时全部掩蔽关闭
    productName: 'Harness' # DeepSeek Harness → 此值
    providerName: 'DS'     # 独立的 DeepSeek → 此值
    providerId: 'ds-official' # deepseek-official → 此值
    models:                # 合并覆盖默认模型名映射
      'DeepSeek-V4-Flash': 'Flash'
    extra:                 # 追加/覆盖任意规则(最长优先匹配)
      'deepseek': 'inhouse'
```

默认规则(按长度降序匹配,复合串优先于其组成部分):

| 原文 | 掩蔽为 |
|---|---|
| `DeepSeek Harness` | `productName`(默认 `Harness`) |
| `deepseek-official` | `providerId`(默认 `ds-official`) |
| `DeepSeek-V4-Flash` / `DeepSeek-V4-Pro` | `V4-Flash` / `V4-Pro` |
| `deepseek-v4-flash` / `deepseek-v4-pro` | `v4-flash` / `v4-pro` |
| `DeepSeek` / `DEEPSEEK` | `providerName`(默认 `DS`) |
| `deepseek` | `ds` |

## 工作原理

- 掩蔽引擎只改写**显示面**:文本节点与展示属性;`href`/`src`/`value`/`id`/`class`/`data-*` 等一律不碰,不会破坏任何内部逻辑或数据。
- 用户在输入框/可编辑区里打字时,正在编辑的内容不会被改写。
- 原地属性写入(`fill="transparent"`)能扛住 React 重渲染:组件 props 不变时 React 不会回写这些属性;文本节点即便被 React 重建,观察者会立刻再次掩蔽,收敛而不是循环。
- 会话消息内容里的 `DeepSeek`(比如模型输出、代码块)同样会被掩蔽;这是刻意的(全界面无漏点),若不想动消息正文,可在 `extra` 里把 `'DeepSeek'` 映射为自身(即 `'DeepSeek': 'DeepSeek'`)。

## 已知限制

- 只覆盖浏览器界面;终端里 `dsh` 启动横幅、URL 行等文本不在范围内。
- 品牌字标保留鲸鱼图形(它本身不带字母);如要连鲸鱼一起去掉,可以把 `extra` 配置无法表达的 SVG 部分再自行扩展(目前刻意不做,避免整块品牌区空白)。
- 掩蔽规则是纯字符串匹配,不含语境判断;极端情况下会误伤与 DeepSeek 同名的用户内容(概率极低,可用 `extra` 定向修正)。

## 开发

```sh
pnpm install
pnpm run build   # tsdown 产出 lib/index.js + lib/client.js,tsc 产出 lib/types
pnpm test        # vitest:规则/注入/DOM 掩蔽
```

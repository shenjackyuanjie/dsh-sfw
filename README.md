# dsh-sfw

让 dsh WebUI「看起来不是 DeepSeek」的插件 —— 把左上角的 DeepSeek Harness 品牌 logo 和浏览器标签页标题换成中性名称,免得内测期间被路过的人认出来。

**只换品牌,不碰内容**:模型选择器、设置页、消息正文等界面上的 `DeepSeek` 字样(模型名、provider 名、用户内容)全部保持原样。

插件分两半:

- **node 半部**(宿主侧):通过 `httpServer.tapIndex` 改写被服务的 `index.html` —— 把 `<title>DeepSeek Harness</title>` 直接换成产品名(JS 加载前标签页就不会露馅),并把配置以 `window.__DSH_SFW__` 注入页面(与 `__DSH_BOOT__` 同一条注入通道)。
- **浏览器半部**(客户端):`document.title` 拦截 setter(会话标题的 `xxx — DeepSeek Harness` 也会被掩蔽);并把侧边栏/欢迎页/引导弹窗里的品牌字标 SVG 就地替换 —— 字母字形和 HARNESS 铭牌路径设为透明,鲸鱼保留,旁边注入中性产品名文字(如 `Harness`)。不触碰任何文本节点或属性。

只要插件包声明了 `dshClient`,宿主 `dsh-client-modules` 会自动把它编译好的 `lib/client.js` 挂进浏览器端的加载图,无需改动 dsh 本体。

## 安装

在 dsh 的 web profile 下安装(以默认的 `web` profile 为例):

```sh
dsh plugin --profile web add link:D:\githubs\deepseek\dsh-sfw
```

然后在 `$DSH_HOME/profiles/web/cordis.patch.yml` 追加(新条目必须放在 `insert:` 列表里):

```yaml
- insert:
    - id: dsh-sfw
      name: 'dsh-sfw'
      config: {}
```

改完配置热重载即生效;改完插件代码需重新 `pnpm run build`,然后刷新浏览器页面(客户端 bundle 每次请求都会重新读取;若长时间未生效再重启 `dsh web`)。

## 配置

```yaml
- insert:
    - id: dsh-sfw
      name: 'dsh-sfw'
      config:
        enabled: true          # 总开关,false 时全部关闭
        productName: 'Harness' # 标签页标题与字标文字的替换名
```

## 工作原理

- 字标 SVG 的字母是矢量路径,文本替换无法覆盖,所以采用**原地属性写入**:把字母字形与 HARNESS 铭牌路径的 `fill` 改为 `transparent`,再向 SVG 追加一个 `Harness` 文本节点。组件 props 不变时 React 重渲染不会回写这些属性、也不会移除额外追加的节点;若按钮整体重挂载,观察者会立刻再次处理(带幂等标记,不会重复注入)。
- 观察者扫描**新增子树内的所有后代 svg**(整个 UI 是一次性挂载的一棵大树,字标只是后代节点),并对全文档做一次初始扫描。
- 只改写 `document.title` 与字标 SVG,其它 DOM 一律不碰。

## 已知限制

- 只覆盖浏览器界面;终端里 `dsh` 启动横幅、URL 行等文本不在范围内。
- 字标保留鲸鱼图形(与 favicon、侧栏折叠态鲸鱼一致);想连鲸鱼一起去掉需要自行扩展 SVG 处理。
- 标签页标题只替换完整的 `DeepSeek Harness` 拼写,不会误伤其他含 `DeepSeek` 的文本。

## 开发

```sh
pnpm install
pnpm run build   # tsdown 产出 lib/index.js + lib/client.js,tsc 产出 lib/types
pnpm test        # vitest:配置解析/index 注入/字标替换与标题掩蔽
```

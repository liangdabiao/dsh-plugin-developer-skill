# 浏览器端（Client 半边）：页面、槽位、主题、i18n 与 Toolview

> 依据：guizang 的 `lib/client.js`（侧栏页面 + 开新对话）、dsh-context 的 `src/client/`（标签页/右侧面板/斜杠命令/设置卡片/i18n 全套）、media-desk 的 `client/`（多页面应用 + 移动端）。

## 目录
- [Client 半边的加载与出口](#client-半边的加载与出口)
- [槽位（slots）地图](#槽位slots地图)
- [插件页面：iframe 模式与 Host 通信](#插件页面iframe-模式与-host-通信)
- [开新对话并填草稿（startSession）](#开新对话并填草稿startsession)
- [主题跟随（防闪白）](#主题跟随防闪白)
- [i18n：跟随 dsh 语言](#i18n跟随-dsh-语言)
- [响应式：container queries / ResizeObserver](#响应式container-queries--resizeobserver)
- [Toolview：把工具结果画出来](#toolview把工具结果画出来)
- [可选依赖的正确姿势](#可选依赖的正确姿势)

## Client 半边的加载与出口

宿主 web 前端按 `package.json` 的 `dsh.client` 声明加载 `./client` 导出，产物整体是 **ModuleLoader closure**（构建见 build-test.md）。源码出口三件套：

```js
exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']   // 硬依赖的浏览器服务
exports.apply = apply                        // 组件闭包捕获 ctx（guizang 结构：组件定义在 apply 里）
```

依赖只用 `require('react')`；宿主模块（`@deepseek-ai/dsh-client-*`）只有在用到对应 face 时才 import 并写进 `dsh.client.inject`。

## 槽位（slots）地图

统一模式：**`ctx.slots.inject(槽名, () => ctx.slots.register(声明, 组件))`**（延迟注册，条件挂载/卸载都在回调里判断）。

| 槽名 | 给你什么 | 声明字段 |
| --- | --- | --- |
| `sidebar.panellist` | 侧栏图标入口 | `{ name:'sidebar.panellist', id, order, label:()=>string }` + 图标组件 |
| `main` | 中央主区域（一级页面） | `{ name:'main', key:面板id }` + 页面组件（通常是 iframe） |
| `conversation.view` | 会话内标签页（Context/Fleet 这种） | `{ name:'conversation.view', id, order, locale?, label }` + 视图组件 |
| `sidebar.right.pane.tab` | 右侧 Sidebar 面板 tab | `{ name, key:id }`；配合 `sidebarRightTabs.register({ id, kind, title, guide:[{order,title,description,icon}] })` |
| `tool.call.toolview` | 工具结果卡片 | `{ name:'tool.call.toolview', key:工具名 }` + 视图组件 |
| `plugins.bundle.config` | 插件设置卡片（Plugins 页面） | `{ name, key:命名空间, locale?, inject:卡片面 }`；数据走 `configForms.get(NS)` |
| `conversation.chat.assistant-actions` | 聊天回复行按钮 | `{ name, id, order }` |
| `conversation.input.overlay` | 输入框上方弹层（/命令弹窗） | `{ name, id, order, inject:(sessionId)=>({hooks…}) }` |
| `conversation.composer.dock` | 输入框下方预留空间（官方装饰位） | `{ name, id, order }` + 组件（官方 decoration 模板用这个） |
| `shell.overlay` | 全局浮层 | `{ name, id }` + 组件（仅在确需浮层且位置明确时用） |
| `conversation.chat.node` | 会话消息流的自定义节点渲染 | `{ name, key:<定义的 kind> }`；配合 `ctx.uiConversation.events.register()` 注册事件定义（Chat row 模式） |

**Chat row 模式**：给会话消息流加自定义渲染——Host 注册事件定义，Client 在 `conversation.chat.node` 槽按定义的 `kind` 注册视图；分页、Turn/Step 放置、增量拼装由宿主 Conversation 层负责，插件只出渲染。

## 页面形态：slot 内 React 组件 vs iframe（官方立场与实战取舍）

**官方技能（dsh 内置 cordis-plugin-development）明确建议**：插件页面渲染为 slot 里的 React 组件，**不建议** Host 伺服 HTML 再 iframe 嵌入——"iframe 文档拿不到宿主的 theme tokens、明暗切换和 ctx.locale"。

| | slot 内 React 组件（官方首选） | iframe 页面（guizang/media-desk 实战形态） |
| --- | --- | --- |
| 主题/语言 | 自动跟随宿主 | 要自己做主题桥（scheme.js）+ 自建 i18n |
| 构建 | 需要 React 构建链 | 页面可零构建纯 HTML/JS |
| 独立打开 | 不适用 | 页面可在普通浏览器打开（骨架的剪贴板降级） |
| 复杂应用 | 大型 SPA 塞进 slot 要自律 | 天然隔离，适合独立工作台类应用 |

**取舍建议**：装饰/小组件/会话内嵌 UI → React 组件进 slot；独立的大型工作台页面（要独立打开、复杂状态）→ iframe 形态可行，但必须补齐主题桥与 i18n（骨架已示范）。**不要为了 iframe 放弃官方建议而不写进 README**——主题和语言体验差距用户直接可见。

**防双挂载**（dsh-context 的 `entrySeated`）：client runner 页面重挂时可能给重复注册放行，注册前读 `ctx.slots.entries(name)` 原始账本，已有同 id 就跳过。

**斜杠命令**（不是槽，是服务）：

```js
ctx.inject(['inputTriggers'], (triggers) => {
  triggers.registerSource({
    trigger: '/', name: 'context', order: 1,
    candidates: async (session, { query, position, signal }) =>
      position === 'leading' ? [{ name: 'context', label: '上下文', description: '查看上下文组成' }] : [],
    onPick: (pick) => { /* 消费输入 + 打开弹层 */ return 'handled' },
    matchEnter: async (session, line) => line === '/context' ? 'handled' : undefined,
  })
})
```

## 插件页面：iframe 模式与 Host 通信

主流做法（guizang/media-desk/骨架）：Client 只注册一个薄 iframe 面板，页面本体（纯 HTML/CSS/JS 或自打包 SPA）由 **Host 的 webServer prefix 路由**伺服：

```
client.js: slots.inject('sidebar.panellist') + slots.inject('main', iframe src='/my-plugin/')
host.js:   ctx.webServer.register({ kind:'prefix', path:'/my-plugin', handler })  // 静态页 + /api/*
```

页面里调接口用**相对路径**（`fetch('api/state')`）——同源、免 token，且兼容反向代理路径前缀（dsh-context 教训：host 侧路径带 `/` 前缀，client 侧常量不带）。

页面内链接**不要开新窗口**：桌面版里 iframe 的 `target=_blank` 交给系统浏览器，那边没有 dsh 登录态打不开——做页面内查看器弹层；保留 `target="_blank"` 让中键/Cmd+点击在新标签打开（网页版用户）。

## 开新对话并填草稿（startSession）

「做同款」「使用工作流」类功能的机制（guizang 实战）：

```
页面按钮 → postMessage({type:'<id>:draft', prompt}, location.origin)
  → client.js 监听（三重校验：event.source 是我的 iframe / origin 同源 / type 匹配）
    → ctx.uiWorkspace.startSession(undefined, { prompt, whenDraftExists:'replace' })
      → 失败时 postMessage({type:'<id>:draft-failed', message}) 回页面弹 toast
```

要点：**只填不发**——草稿填进输入框，用户自己点发送；页面单独打开时（`window.parent === window`）降级为复制到剪贴板。

## 主题跟随（防闪白）

- **Client 侧**：`ctx.inject(['theme'], (c) => { push(c.theme.getTheme()); c.on('theme/change', push) })`，把主题 postMessage 给 iframe（骨架的 `MSG_SCHEME` 通路）。
- **页面侧**：`scheme.js` 放 `<head>` **同步执行**（不能 defer/async，否则深色模式首帧闪白）：读父页面 `body.hasAttribute('data-ds-dark-theme')` → 亮/暗兜底 → 单独打开跟系统 `prefers-color-scheme`。
- **组件内样式**：直接引用 dsh 的主题 token（`--dsw-alias-*`，宿主 `Theme` 查询列全量；token 改名只会降级外观不会崩），literal 颜色只给 artwork 用；布局照抄同类宿主页面的间距与行模式。

## i18n：跟随 dsh 语言

两种粒度都有实战：

**服务级**（dsh-context，Client 半边）：

```js
ctx.locale.register('dsh-context', { zh: DICT_ZH, en: DICT_EN })  // key 扁平点分：'tab.context'
const t = ctx.locale.bind('dsh-context')                          // t(key, params?)
// 语言切换通知：useSyncExternalStore(locale.subscribe, () => locale.getLocale().active)
```

组件的 `label` 传**函数**（`() => t('tab.context')`）才能在语言切换后重注册生效。

**页面级**（media-desk，纯前端）：key 就是中文原文，英文查词典表；`readHostLang()` 读 `document.documentElement.lang` + **MutationObserver 监听 `<html lang>` 变化**自动切换。Host 半边要按请求语言返回错误文案时，用 `AsyncLocalStorage` 随请求隔离语言（`withLang(lang, fn)` + `tr(zh, vars)`）。

市场元信息另放 `locale/zh.json` + `en.json`（`{"meta": {"title": "…", "description": "…"}}`），插件市场页面读取（geochat 模式）。

## 响应式：container queries / ResizeObserver

**插件面板是 shell 的中列，不是视口**——media queries 量的是整个窗口，侧栏打开/收起时全错。正确姿势（dsh-context AGENTS.md + media-desk）：

- CSS 优先用 **container queries**（`@container`）；
- JS 用 **ResizeObserver** 测容器宽度切类名（media-desk：`<1020px` 对话栏收起、`<780px` compact），全站仅保留 `prefers-reduced-motion` 一条 media query；
- 宽度受压时**折叠而非截断**；全屏 overlay 需 portal 到 `document.body`（container 的尺寸 containment 会裁掉 fixed 定位）。

## Toolview：把工具结果画出来

给特定工具的结果做专属卡片（keyed 槽，key = 工具名）：

```js
function apply(ctx) {
  function MemoCardView(props) {          // props 含 callId、block（工具调用数据块）
    const { block } = props
    if (!block || !('kind' in block)) return h('div', null, '⏳ 正在记录…')   // 运行中：无 kind → 骨架屏
    if (block.isError) return h('div', null, '记录失败')
    const meta = memoMetaFrom(block.meta) // 双端共享的纯函数解析 presentationMeta（回放一致）
    if (!meta) return h('div', null, block.content?.[0]?.text || '')           // 无 meta → 文本回退，不留白屏
    return h('div', { class: 'memo-card' }, meta.id)
  }
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'my_plugin_memo_add' }, MemoCardView))
}
```

- **流式预览**：`!('kind' in block)` 分支就是加载态（耗时工具先出骨架屏，完成无缝切换，ecom 出图插件实证）。
- **降级**：meta 缺失/字段不全时回退文本（`block.content` 首行），不留白屏；本地校验，畸形输入返回通用行。
- **数据从哪来**：Host 工具的 `output.presentationMeta`（tool-plugin.md）；客户端不重复执行 Node 逻辑。别把 React props 或 UI 状态存进 meta。

## UI 组件的官方纪律

来自官方 skill（practices）的硬规矩：

- **不要 `require('@deepseek-ai/dsh-client-ui-primitives')` 或任何宿主 Client 包当模块用**（`dsh.client.inject` 只是激活排序，仍被允许但它们随时会变）：plain-JS 插件没有类型检查，宿主组件一变你的槽位直接白屏（控制台报 `slot entry crashed in '<slot>'`）。**照抄宿主控件**的 markup/CSS/行为到自己的组件里：类名改成插件前缀、只保留 `--dsw-alias-*` token 引用、保留用户依赖的行为（Modal 的焦点与 Esc、`role="switch"`+`aria-checked`、Tooltip 定位）。（TS 插件有类型检查时可以像 dsh-context 那样 peer 引 primitives——有编译期兜底。）
- 不要替换应用根节点、不要往 `document.body` 追加第二个应用；不要写组件外的 DOM；全屏 overlay 用宿主提供的 overlay 机制。
- 插件的 UI 是宿主 UI 的一部分：用宿主的 theme tokens、locale 与布局模式，用户看到的是一个应用。

## 可选依赖的正确姿势

一切宿主服务都是**可选 seam**：`ctx.inject(['服务名'], (c) => {...})` 延迟解析，face 缺席或类型不对 → **不注册、不抛错**（能力优雅缺失）。theme、inputTriggers、configForms、sidebarRightTabs 都这样处理——同一 bundle 能装到服务面不同的宿主版本上。

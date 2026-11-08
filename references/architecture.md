# dsh 0.2.x 插件架构（双半边模型与 Cordis 基础）

> 依据：官方文档（deepseek-harness.github.io/deepseek-harness）+ 三个已上架开源插件（dsh-context / dsh-guizang-design / dsh-media-desk）+ GeoChat 插件的实战源码。目标版本 **dsh >= 0.2.1-rc.2, < 0.3.0**。

## 目录
- [dsh 是什么（30 秒）](#dsh-是什么30-秒)
- [双半边模型：一个插件 = Host 半边 + Client 半边](#双半边模型一个插件--host-半边--client-半边)
- [package.json：插件声明字段全解](#packagejson插件声明字段全解)
- [cordis.patch.yml：两行挂载](#cordispatchyml两行挂载)
- [profile 与安装：bundle 列表](#profile-与安装bundle-列表)
- [Cordis 生命周期：apply / inject / effect](#cordis-生命周期apply--inject--effect)
- [Config：用户配置（schemastery）](#config用户配置schemastery)
- [版本兼容声明：engines.dsh](#版本兼容声明enginesdsh)
- [数据目录约定：$DSH_HOME](#数据目录约定dsh_home)
- [参考实现对照表](#参考实现对照表)

## dsh 是什么（30 秒）

DeepSeek Harness（dsh）= **无特权内核，万物皆插件**：模型适配器、工具注册表、Agent 循环、网页界面本身都是插件，挂在 **Cordis** 容器框架上。给 dsh 增加新能力 = 写一个插件包挂上去，**不需要 fork 源码**。

## 双半边模型：一个插件 = Host 半边 + Client 半边

```
┌─ Host 半边（Node 主进程，可信环境）────────────────────┐
│ · src/host.js（或 lib/index.js）：Cordis 插件           │
│ · 注册工具/技能/系统提示；执行工具逻辑；调外部 API        │
│ · 挂 HTTP 路由（ctx.webServer）伺服插件页面和数据接口     │
│ · 加载：cordis.patch.yml insert → package.json main     │
└──────────────┬─────────────────────────────────────────┘
               │ HTTP（webServer 路由）/ 工具结果持久化 meta / startSession
┌──────────────▼─────────────────────────────────────────┐
│ Client 半边（浏览器，dsh web 前端内）                    │
│ · src/client.js → dist/client.js（单文件 CJS closure）  │
│ · 注册 UI：侧栏入口、主区域页面、会话标签页、右侧面板、    │
│   斜杠命令、设置卡片、工具结果 Toolview                   │
│ · 加载：package.json dsh.client 声明 →                   │
│   window.__ModuleLoader__.load({id, factory(require)})  │
└─────────────────────────────────────────────────────────┘
```

两半边可以独立存在：纯工具插件只要 Host 半边；纯 UI 插件可以只有 Client 半边。双端共享的数据约定（meta 结构、接口路径）建议放一个纯 JS 模块里两端各自 import（构建时各自内联）。

**Host 最小骨架**（完整可运行版见 `assets/plugin-skeleton/src/host.js`）：

```js
export const name = 'my-plugin'            // = cordis.patch.yml 的 id
export const inject = ['tools']            // 依赖的宿主服务，就绪后才调 apply
export function apply(ctx, config) { /* 注册 */ }
// 也可用对象形式：export default { name, inject, apply }
// 类形式（对外提供服务的插件）：export default class X extends Service { static inject = [...]; constructor(ctx){ super(ctx,'key') } }
```

**Client 最小骨架**（`assets/plugin-skeleton/src/client.js`）：

```js
// 源码是普通模块，构建时由 esbuild 包成 ModuleLoader closure：
// window.__ModuleLoader__.load({ id, factory(require) { ...; return module.exports } })
const h = require('react').createElement
function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: 'my-plugin', order: 20, label: () => '我的插件' }, Icon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: 'my-plugin' }, Panel))
}
exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply
```

## package.json：插件声明字段全解

```jsonc
{
  "name": "dsh-my-plugin",           // 建议带 dsh- 前缀（市场可发现）
  "version": "0.1.0",
  "type": "module",
  "main": "src/host.js",             // Host 半边入口（零构建可直接发布源码）
  "exports": {
    ".": "./src/host.js",
    "./client": "./dist/client.js",  // 浏览器半边入口（固定约定路径）
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json",
    "./locale/*.json": "./locale/*.json"   // 可选：市场元信息（见 publish.md）
  },
  "icon": "./icon.svg",              // 插件市场图标
  "files": ["src", "dist", "gallery", "cordis.patch.yml", "icon.svg"],  // npm 发布白名单
  "keywords": ["dsh-plugin", "deepseek-harness", "dsh"],                // dshfind 市场靠它收录
  "engines": {                        // 版本门槛（安装时校验，不满足直接拒装）
    "node": "^22.19.0 || >=24.0.0",
    "dsh": ">=0.2.1-rc.2 <0.3.0"
  },
  "dsh": {                            // ← dsh 专有声明块（0.2.x 核心）
    "bundle": { "patch": "./cordis.patch.yml" },  // Host 半边挂载
    "client": {                        // 浏览器半边加载声明
      "platform": "web",
      "immediately": true,             // 可选：启动即加载（缺省懒加载，首次用到才加载）
      "inject": [],                    // 需要宿主注入的浏览器模块表（用 @deepseek-ai/* 才填）
      "external": []                   // 可选：声明非基线的运行时导入（编译型插件用，官方模板字段）
    },
    "manifestVersion": 1,              // GeoChat 用；最新清单版本号
    "compatibility": { "dshReleases": { "0.2.1-rc.2+": "compatible" } }  // 可选：按线声明兼容
  },
  "peerDependencies": { "@deepseek-ai/schemastery": "^3.18.0" },  // 只声明真正 import 的 SDK 包
  "devDependencies": { "esbuild": "^0.25.10" }
}
```

要点：
- **`dsh.bundle.patch` + `dsh.client` 两行就是"两个半边怎么加载"的全部声明**。纯工具插件可以没有 `dsh.client`；纯 UI 插件可以没有 bundle.patch。
- **`dsh.client.inject`**：只有当 client 代码 import `@deepseek-ai/dsh-client-*` 宿主模块时才需要填（那些模块保持 external 由宿主 `require` 提供）。只用 `react` + ctx 服务的话留空数组即可（guizang/media-desk 都是空）。
- **依赖分层**：Host 半边尽量**零 `@deepseek-ai/*` import**（ctx 已经把服务都给了你）——guizang 和 media-desk 的 host 代码只依赖 Node 内置模块，这是版本兼容性最好的做法。需要 SDK（类型/校验器）时放进 `peerDependencies` 并写明版本下限，不要 `*`（部分 SDK 的 npm latest 指向旧版本）。

## cordis.patch.yml：两行挂载

```yaml
- insert:
    - id: my-plugin        # 插件实例 id（Config/日志/页面 key 用）
      name: dsh-my-plugin  # npm 包名（解析入口）
      config: {}           # 可选：行级配置（覆盖插件 Config 的默认值）
```

照抄改个名即可。patch 还支持更多玩法（官方文档）：
- 每行可以带 `inject` / `config`，在挂载层覆盖插件配置；
- `dsh.bundle.patch` 的值也可以是有序文件列表：`["./base.patch.yml", "./web.patch.yml"]`；
- 开发期不动 profile 也可以用 `dsh web --patch ./cordis.yml` 直接挂本地插件（官方 "first plugin" 的玩法，路径要绝对路径）。

**加载顺序**（后层按行覆盖，整行替换而非深合并）：profile 的 bundles 按序 → profile 自身 cordis.patch.yml → `$DSH_HOME/cordis.patch.yml` → 各 `--patch` 参数按 argv 顺序。

## profile 与安装：bundle 列表

profile = `$DSH_HOME/profiles/<name>` 目录，其 `package.json` 声明 `dsh.profile.bundles`（哪些包按什么顺序组成这套配置）：

```bash
dsh plugin --profile web add <npm包名 | ./本地目录 | file:$PWD/xxx.tgz | github:you/repo#commit>
dsh plugin --profile web remove <包名>
dsh plugin --profile web update <包名> --latest
dsh --profile web --dump-config     # 验证：恰好一行 bundle 声明即装好
```

- `dsh plugin` 本质是**转发给 pnpm**，所有 pnpm 动词都可用。
- 首次 add 会用 `@deepseek-ai/dsh-base` 初始化 profile 并把包追加进 bundles。
- **`file:`/`link:` 安装是复制**：改代码后要重装（或用 dev-sandbox 脚本自动化，见 build-test.md）。
- **桌面版 profile（desktop）由 App 管理**：多数版本下 CLI 操作 desktop profile 会报错，桌面版优先用插件页面安装；网页版才随意用 CLI。各版本行为有差异，两处都试。

## Cordis 生命周期：apply / inject / effect

```js
export function apply(ctx, config) {
  // ctx 在插件生命周期内有效；注册的资源随插件卸载自动清理
}
```

| API | 作用 | 备注 |
| --- | --- | --- |
| `ctx.effect(fn, key?)` | 副作用，挂到插件生命周期 | fn 可返回 disposer 函数；`webServer.register` 这类注册习惯上包一层 effect（media-desk 做法）；`tools.register`/`skills.registerProvider` 本身就是 effect 语义，可不包 |
| `ctx.on(event, fn)` | 订阅事件 | 插件卸载自动移除；详见 host-integration.md |
| `ctx.inject(['服务'], cb)` | 运行时等某个服务就绪再回调 | **可选依赖的正确姿势**：服务缺席就不装该能力而不是崩（dsh-context 的 theme/connection 都这样） |
| `export const inject = [...]` | 硬依赖声明 | Cordis 等全部就绪才调 apply；缺了直接起不来 |
| `ctx.get('服务名')` | 取服务实例 | 兜底判断是否存在再用（media-desk 的鉴权降级写法） |

**HMR 热替换**：改配置会热替换插件——框架卸载旧实例、加载新实例，注册项（effect）自动清理，不留旧实例的注册。

## Config：用户配置（schemastery）

同时导出 TS 类型（可选）和同名 schema，**默认值写在 schema 字段上**：

```js
import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  baseUrl: Schema.string().default('https://api.example.com').description('服务地址'),
  maxItems: Schema.number().min(1).max(100).default(20),
  mode: Schema.union(['fast', 'accurate']).default('fast'),
})
export function apply(ctx, config) { /* config 已校验并填好默认值 */ }
```

- 用户在 cordis.yml/profile 层用 `config:` 字段覆盖，或通过插件市场页面的 Configuration 卡片（dsh-context 模式）修改；**改配置 = 热替换插件**（旧实例卸载、新实例加载，effect 注册自动清理）。
- 不要把普通对象导出为 `Config`——Cordis 需要它实现 Standard Schema 接口（`~standard`）。
-  声明为 **dependencies（）+ peerDependencies 双写**——link: 模式安装必须靠 dependencies 落盘，只写 peers 会在 cordis 校验 Config 时抛 TypeError（无 ~standard 接口）。
- 设计原则：**凡是两个部署可能想设不同值的都做成配置字段**；自包含约束写进 schema，加载时大声失败。

**插件运行中改自己的配置**（官方 configEditor 服务，别去手改 profile 的 cordis.patch.yml——那是用户的文件）：

```js
const entry = ctx.fiber.entry
const editor = ctx.get('configEditor')
if (entry === undefined || editor === undefined) throw new Error('Configuration cannot be saved in this profile')
await editor.edit(entry, (current) => ({ ...current, myField: newValue }))
```

编辑普通字段会重启插件（apply 重建状态）；声明了 `.volatile()` 的字段原地生效，用 `config.field.get()` 读（dsh-context 的 `volatileField()` 包了一层特性检测，兼容没有该 API 的旧宿主）。

## 市场元信息与图标（官方清单）

插件管理页/设置页**不激活插件**也会读这些，装完要在市场页面核对：

- `locale/en.json` + `locale/zh.json`：`{ "meta": { "title": "…", "description": "…" } }`；英文标题用 sentence case（只首词与专名大写）。
- 图标：顶层 `"icon": "./icon.svg"`（优先）或导出 `"./icon"`；SVG/PNG/JPEG/WebP，**≤256KiB**，必须在包内（绝对路径/URL/出包符号链接会被拒）。
- exports 带上 `"./locale/*.json"`；`files` 收录 patch、locale、icon、全部运行时文件（npm 发布时验证实际打包清单）。
- 缺失字段回落到 package.json 的 name/description，缺图标用通用图；畸形元数据产生诊断并保留合法文本。

## 密钥与凭证：credentials 服务

**官方路径**：应用内登录/绑定流程拿到的 token 等机密，用 `ctx.credentials.modifyRecord()` 存记录（`inject` 声明 `'credentials'` 或 `ctx.get('credentials')`），不要塞进 Config。自管 API Key 文件方案（media-desk 的 0600 settings.json）适用于宿主 credentials 表达不了的第三方密钥——两案对比见 web-and-data.md。

## 版本兼容声明：engines.dsh

```jsonc
"engines": { "dsh": ">=0.2.1-rc.2 <0.3.0" }
```

- 安装和 profile 启动都会拒绝不满足范围的包。
- **不写 engines.dsh 时**，安装器回落检查 `@deepseek-ai/dsh*` 的 peerDependencies 范围。
- 0.2.x 内部也有多产品线（0.2.0 / 0.2.1 / 0.2.2），dsh-context 的并集写法：`">=0.2.0-rc.2 || >=0.2.1-rc.2 || >=0.2.2-rc.1"`，同时保留 peer 声明——因为不同小版本的安装器检查的字段不同（0.2.1-alpha.4+ 只读 engines.dsh，更早的线只读 peers）。**最稳妥：engines.dsh 与 peers 都写。**
- 运行时再探测可选（dsh-context 的做法：探测失败 → FAIL OPEN 用真功能；低于基线 → 注册零值 fallback + 提示升级）。详见 publish.md。

## 数据目录约定：$DSH_HOME

插件自己的持久数据放 **`$DSH_HOME/<插件名>/`**（缺省 `~/.dsh/<插件名>/`）：

```js
const dataDir = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'my-plugin')
```

- 与宿主默认值一致（桌面版 home 就是 `~/.dsh`）；
- 模型的 bash 在沙箱里**写不了**工作区外——数据读写必须走 Host（工具或 HTTP 接口）；
- 原子写、双进程 mtime 重读等完整模式见 web-and-data.md；
- 用户卸载插件不会删这个目录（数据留存，README 要说清楚）。

## 参考实现对照表

| 你要做的事 | 抄谁 | 位置 |
| --- | --- | --- |
| 纯 JS 零构建插件全结构 | dsh-guizang-design | `lib/index.js`（164 行 host 全注册） |
| HTTP 型插件 + 安全加固 | dsh-media-desk | `src/host.js` |
| TS + tsdown 双端构建 | dsh-context / GeoChat 插件 | `tsdown.config.ts` |
| 用户设置卡片 / 斜杠命令 / 会话标签页 | dsh-context | `src/client/index.ts` |
| skill 快照聚合 + rewrite/addendum | dsh-guizang-design | `lib/skills.js` |
| 版本兼容与基线测试 | dsh-context | `docs/compatibility.md`、`tests/compat/` |

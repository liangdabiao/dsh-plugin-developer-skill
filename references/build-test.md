# 构建、开发循环与测试（dsh 0.2.x）

> 0.2.x 的主流做法已经**不是** 0.1.x 的 junction 链接 + 双端 tsdown。三个已上架插件两种形态：**JS 零构建**（guizang：Host 发布即源码，只打包 client）与 **TS 双端构建**（dsh-context/geochat：tsdown，SDK 走 peer）。骨架采用前者，本文同时讲后者。

## 目录
- [前置：Node 与依赖策略](#前置node-与依赖策略)
- [JS 零构建（推荐起步）](#js-零构建推荐起步)
- [TS 双端构建（进阶）](#ts-双端构建进阶)
- [浏览器产物三大自检](#浏览器产物三大自检)
- [开发循环：watch + dev-sandbox + mock-llm](#开发循环watch--dev-sandbox--mock-llm)
- [测试金字塔（免额度优先）](#测试金字塔免额度优先)

## 前置：Node 与依赖策略

- **Node 22.19+ 或 24+**（dsh 0.2.x 与构建工具都依赖 `Promise.withResolvers` 等新 API；geochat 要求 Node 24+）。`node -v` 先验。
- **依赖策略（代替 0.1.x 的 junction 链接）**：
  - Host 半边**不 import 任何 `@deepseek-ai/*`**（服务都从 ctx 拿）→ 零依赖问题（guizang/media-desk 做法，首选）；
  - 需要 SDK（schemastery、dsh-tools、类型）→ 写进 `peerDependencies` 带版本下限，安装时 pnpm 自动装；
  - 本地开发时的宿主依赖：不需要 dsh 源码 checkout，`npm i -g @deepseek-ai/dsh` 安装包自带全部 `@deepseek-ai/*`，typecheck 可指向它，或直接从 npm 安装对应版本。
- npm 报 peer 冲突时 `npm install --legacy-peer-deps`（dsh 内部 peer 相互引用）。

## JS 零构建（推荐起步）

骨架（`assets/plugin-skeleton/`）的做法，guizang/media-desk 同款：

- **Host 半边**：`src/host.js` 纯 ESM 源码，`main` 直接指向它，**不构建**，发布即源码。
- **Client 半边**：`src/client.js` 用 esbuild 打成单文件 `dist/client.js`：

```js
// scripts/build.mjs 要点（完整版见骨架，--watch 支持）
await build({
  entryPoints: ['src/client.js'],
  outfile: 'dist/client.js',
  bundle: true, format: 'cjs', platform: 'browser', target: 'chrome120',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],  // 宿主提供
  banner: { js: `window.__ModuleLoader__.load({ id: "dsh-your-plugin", factory: (require) => {` +
                 ` const module = { exports: {} }; const exports = module.exports;` },
  footer: { js: ' return module.exports; } });' },
  minify: true,
})
```

- CSS：`loader: { '.css': 'text' }` 内联成字符串，组件里 `<style>{css}</style>` 注入（media-desk 做法）；或页面放 gallery/ 由 Host 的 HTTP 路由伺服（骨架做法，连打包都省了）。
- JSX 想用就在 entry 用 `.jsx` + `jsx: 'transform', jsxFactory: 'React.createElement'`。

## TS 双端构建（进阶）

dsh-context / geochat 的做法。tsdown 双配置数组：

```ts
export default [
  { // Host：ESM + d.ts；SDK 包 external（Loader 校验 Config 必须看到自己的 schemastery 实例）
    entry: { index: 'src/host/index.ts' }, outDir: 'lib', format: ['esm'],
    platform: 'node', target: 'es2024', dts: true,
    deps: { neverBundle: isProductionDependency },
  },
  { // Client：CJS 单文件 closure，文件名固定 client.js
    entry: { client: 'src/client/index.ts' }, outDir: 'lib', format: 'cjs',
    platform: 'browser', outputOptions: { entryFileNames: 'client.js', inlineDynamicImports: true },
    banner:  `window.__ModuleLoader__.load({ id: "dsh-your-plugin", factory: (require) => {`,
    intro:   'var module = { exports: {} }; var exports = module.exports;',
    footer:  'return module.exports; } });',
  },
]
```

进阶要点（dsh-context 实战）：
- **构建期纯净门**：client bundle 里除平台模块（react/react-dom/dsh-client-ui-primitives 等）外，任何其他 `@deepseek-ai/*` 值导入直接构建失败（跨插件值导入禁止）——写一个 esbuild/rolldown 插件检查。
- CSS 通道：CSS Modules / `?inline` / 全局（含 Tailwind 4 编译）都编译成运行时注入 `<style data-plugin="dsh-context">` 的 JS 模块。
- d.ts：Host 端生成（`main` + `types` 字段）。
- Windows 下跑 shell 脚本：用 `.mjs` 包装定位 Git Bash（dsh-context 的 `run-bash.mjs`），或干脆全用 Node 脚本/PowerShell。

## 浏览器产物三大自检

构建脚本打包后**自动检查** `dist/client.js`（骨架 `checkBundle()` 已实现，任一不过即失败）：

1. **require 白名单**：只允许宿主平台模块表（react 系；如声明了 `dsh.client.inject` 则加上那些模块），不允许 Node 内置、不允许 Node 端源码、不允许白名单外的 `@deepseek-ai/*`；
2. **无动态 import**：产物里不允许 `import(`；
3. **单文件**：dist/ 里只有 `client.js`，不能拆 chunk。

漏了包装（banner/footer）前端会报 `__ModuleLoader__ is not a function`。

## 开发循环：watch + dev-sandbox + mock-llm

**改 Host 重装、改 Client 可热更**：

```bash
npm run watch                          # 监听 client/ 重新打包（改 src/client.js 即时生效）
scripts/dev-sandbox.sh 4311            # 改 src/host.js 后重跑（Windows: scripts\dev-sandbox.ps1）
```

**dev-sandbox 的机制**（media-desk 模式，骨架已内置）——隔离 `DSH_HOME` 到 `../.dsh-sandbox`，不碰 `~/.dsh`：

```sh
export DSH_HOME="$SANDBOX"                                   # 关键：隔离数据目录
unset DSH_SESSION_ID DSH_SHELL DSH_WEB_URL DSH_PROFILE ...   # 防外层会话变量泄漏
dsh plugin --profile web remove <包名> || true
dsh plugin --profile web add "file:$ROOT"                    # 从源码目录安装（先 npm run build）
exec dsh --profile web --no-open --port 4311
```

**mock-llm：不花额度跑全链路**（media-desk 的 `scripts/mock-llm.mjs` 模式）——本地 HTTP 服务假装成模型：

- `GET /v1/models` 返回假模型列表；
- 按请求特征路由：system 提示含"策划案"→ 返回假 plan JSON；含"只输出一个 JSON"→ 返回 ops（**故意埋一个非法 op** 测部分失败）；其余返回 SSE 流式 Markdown；
- **故意在输出里埋 `<script>window.__xss=1</script>`** 验证前端渲染层安全；
- 把 dsh 的模型配置指向 `http://127.0.0.1:4399/...` 即可整链路联调，stdout 打印每个请求的提示词特征（可断言插件注入的系统提示是否到位）。

**mock 外部 CLI**（media-desk 的 `mock-monid.mjs`）：包成同名可执行文件放到 PATH 最前面，返回**与真实接口字段结构一致**的编造数据（结构错了归一化测试会挂）。

安装验证一步法：`dsh --profile web --dump-config` 输出恰好一行 bundle 声明 = 装好了。

## 测试金字塔（免额度优先）

```
        ▲  web 界面验收（dsh --profile web + 浏览器；有 LLM key 或 mock-llm）
        │  headless / sandbox 冒烟（dev-sandbox + mock-llm 全链路）
        │  Host 集成测试（真 cordis Context + 假宿主服务）
        │  纯函数/契约测试（零依赖，最该多写）
```

1. **纯函数/契约测试**（`node --test`，零依赖，不需要装 dsh）：骨架 `test/host.test.mjs` 的清单——
   - 工具定义合规：name 正则、`additionalProperties:false`、required ⊆ properties、`output.render` 是函数（**递归 walk 整棵 schema**）；
   - execute 校验分支：缺参/未知参/enum/空态文案；
   - 一份数据两个入口：工具写入 = HTTP 接口写入（guizang 专门断言这个）；
   - safeFile 拒穿越/点文件、放行普通文件；
   - 原子写、双进程 mtime 重读（两个 Store 实例同目录互读）；
   - skill：候选齐全、addendum 存在、正文无 git 命令、附注无 `.mjs`；
   - Config schema 校验与默认值；
   - 鉴权降级：拿不到 connection 服务返回 403（fail closed）。
   - **关键技巧**：测试开头 `process.env.DSH_HOME = mkdtempSync(...)`，**必须在 import 模块之前**（ESM 顶层 `await import`）。
2. **依赖注入**：所有 I/O 函数留注入参数（`fetchImpl`、`exec`、时钟）——测试替换，不碰真实网络（media-desk 全套做法）。
3. **Host 集成测试**（geochat/dsh-context 做法）：真 `new Context()` + 真 ToolRuntime/SkillRegistry + 假宿主服务（fake lease/store），验证注册、会话绑定拒绝伪造 sessionId、工具描述规范。
4. **真浏览器 smoke**（geochat 的 `smoke-readback.mjs`）：Playwright 起本地页，拦截一切外部请求断言 `external=[]`（离线），全链路执行工具语义并截图比对。**无 GPU 环境**：Playwright 默认带 `--no-sandbox`；Puppeteer 手动加 `--no-sandbox --disable-gpu --use-angle=swiftshader`。
5. **验收**：命令行跑通不算完，最终在 web 界面确认工具调用 + 页面渲染（`http://127.0.0.1:3080`）。

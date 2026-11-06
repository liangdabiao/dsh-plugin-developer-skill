# 打包、发布、安装与版本兼容（dsh 0.2.x）

> 依据：官方 "Package and install" 文档 + 三个已上架插件的真实发布流程（guizang：npm；media-desk：npm + Release tgz；geochat：GitHub Release + SHA-256）。

## 目录
- [发布前检查清单](#发布前检查清单)
- [打包：npm pack](#打包npm-pack)
- [发布渠道](#发布渠道)
- [安装途径与命令](#安装途径与命令)
- [桌面版 vs 网页版](#桌面版-vs-网页版)
- [版本兼容声明](#版本兼容声明)
- [市场元信息：icon 与 locale](#市场元信息icon-与-locale)
- [升级语义与用户沟通](#升级语义与用户沟通)

## 发布前检查清单

```bash
npm test                    # 单测全绿（不依赖 dsh）
npm run build               # client 打包 + 三大自检通过
dsh --profile web --dump-config   # 验证 profile 里恰好一行 bundle 声明
# web 界面人工验收：工具调用 + 页面渲染 + 深浅色主题 + 窄面板折叠
```

`prepack` 挂上检查（geochat/media-desk 做法）：`"prepack": "npm run build"`（或 `check`），保证 tgz 里的产物永远最新、检查不过打不出包。

## 打包：npm pack

`files` 白名单控制发布内容，一个字段的锦上添花都别多带：

```jsonc
"files": ["src", "dist", "gallery", "cordis.patch.yml", "icon.svg", "README.md", "LICENSE"]
// 打完验证：npm pack --dry-run 看清单；tar -tzf *.tgz 确认 dist/client.js 在里面
```

- **git 仓库直装的坑**：git 安装只拉源码不跑构建——必须提供自包含的 `prepare` 脚本（构建产物在装时生成），且用户侧 pnpm ≥10 需要允许构建脚本（`pnpm-workspace.yaml` 的 `allowBuilds: { "dsh-your-plugin": true }`）。官方原话：这等同于"在你机器上于安装时执行该包代码"，慎用，优先发 tgz/npm。
- **Release tgz 附 SHA-256**（geochat 做法）：`sha256sum dsh-your-plugin-0.1.0.tgz` 写进 Release notes。

## 发布渠道

| 渠道 | 做法 | 适例 |
| --- | --- | --- |
| npm registry | `npm publish --access public`；CI 用 Trusted Publishing/OIDC 自动 provenance | dsh-context / guizang / media-desk |
| GitHub Release | tag 驱动：`git tag vX.Y.Z && gh release create` 上传 tgz + SHA256 | geochat |
| 插件市场收录 | dshfind.com 按 npm 包名 + keywords 收录（`dsh-plugin`/`deepseek-harness`/`dsh`），可挂 badge | dsh-context |

**发版纪律**（dsh-context）：tag 即发布；release notes 用固定模板；发布后 `npm view <包名>` 核验；CI 里跑基线兼容测试（见下文）。

## 安装途径与命令

```bash
# 网页版 CLI（dsh plugin 转发给 pnpm，pnpm 动词都可用）
dsh plugin --profile web add dsh-your-plugin                 # npm 包名
dsh plugin --profile web add github:you/dsh-your-plugin#<sha>  # git + 固定 commit
dsh plugin --profile web add ./dsh-your-plugin-0.1.0.tgz     # 本地 tgz
dsh plugin --profile web add file:$PWD                       # 源码目录（开发）
dsh plugin --profile web add link:$PWD                       # 同上（链接式）
dsh plugin --profile web update dsh-your-plugin --latest
dsh plugin --profile web remove dsh-your-plugin

# 指定版本/升级
dsh plugin --profile web add dsh-your-plugin@0.1.0
```

**插件页面安装**（桌面版和网页版都适用，对普通用户最顺）：插件 → 添加插件 → 搜包名 → Install → **必须点「立即启用」**——直接关掉对话框只是装上没启用，要回插件列表开开关（guizang 踩坑记录）。

## 桌面版 vs 网页版

| | 网页版（`--profile web`） | 桌面版（`--profile desktop`） |
| --- | --- | --- |
| CLI 安装 | 随意用 | **多数版本 CLI 直接报错**（profile 由 App 独占管理）；装前要完全退出 App（⌘Q），装好重开 |
| 插件页面 | 可用 | 可用（推荐） |
| 数据目录 | `$DSH_HOME`（默认 `~/.dsh`） | 同左（home 就是 `~/.dsh`，`DSH_HOME || ~/.dsh` 正好吻合） |
| iframe 弹窗 | 新标签可用 | `target=_blank` 交系统浏览器、无登录态打不开 → 页面内做查看器 |

两个 Host 进程可能**同时运行**（桌面版 + 网页版）——数据目录的原子写 + mtime 重读纪律（web-and-data.md）就是为这个准备的。

## 版本兼容声明

```jsonc
"engines": {
  "node": "^22.19.0 || >=24.0.0",
  "dsh": ">=0.2.1-rc.2 <0.3.0"        // 或多产品线并集：">=0.2.0-rc.2 || >=0.2.1-rc.2 || >=0.2.2-rc.1"
}
```

- 安装与 profile 启动都会**拒绝**不满足范围的包；无 engines.dsh 时回落检查 `@deepseek-ai/dsh*` peers。
- **两条都写最稳**：不同小版本安装器检查的字段不同（0.2.1-alpha.4+ 只读 engines.dsh；更早的线只读 peers）（dsh-context 实证）。
- peer 依赖写**版本下限**不要 `*`——"部分 SDK 的 npm latest 仍指向旧版本，不要省略版本安装"（geochat README 原话）。
- **基线测试**（要支持多条产品线时）：像 dsh-context 一样声明 baseline 列表（如 `0.2.0-rc.2` / `0.2.1-rc.2` / `0.2.2-rc.1`），CI 对每个基线跑真源码兼容测试，并用 `semver.satisfies` 断言 engines 区间能容纳全部基线、拒收已知不兼容版本。
- **运行时再闸**（可选）：探测宿主版本（读模块树里 `@deepseek-ai/dsh-*` 的 package.json，排除插件自带 node_modules），低于基线 → 注册零值 fallback + UI 提示升级；**探测失败 → FAIL OPEN**（按支持处理）。

## 市场元信息：icon 与 locale

插件管理页/设置页**不激活插件**也会读元信息——装完在市场页核对（官方清单）：

```jsonc
"icon": "./icon.svg",                          // 顶层 icon 字段（优先）或导出 "./icon"
"exports": { "./locale/*.json": "./locale/*.json" }
```

```json
// locale/zh.json —— 插件市场页面的名称与描述（双语各一份）
{ "meta": { "title": "我的插件", "description": "一句话说明它给用户什么" } }
```

- 图标：SVG/PNG/JPEG/WebP，**≤256KiB**，必须在包内（绝对路径/URL/出包符号链接会被拒）。
- 英文标题用 sentence case（只首词与专名大写，如 `Git worktrees`）；别把模板文案留在 locale 里。
- 缺失字段回落到 package.json 的 name/description，缺图标用通用图；畸形元数据产生诊断并保留合法文本。
- keywords 决定 dshfind 收录与搜索：`["dsh-plugin", "deepseek-harness", "dsh", …]`。README 放安装命令 + 截图 + 数据隐私说明（security.md）+ 兼容版本声明。

## 激活语义：HMR 与重启

- 新装 bundle 可经 **HMR 直接激活**（`dsh-hmr`）；
- **替换已安装的包需要重启**才能加载新的 JS 模块代——别从"槽位 id 没变"推断浏览器代码已更新；
- `plugin_manager`（dsh 内置 agent 的工具）的 `set_plugin`/`set_bundle` 状态要分开看：`failed` 要诊断、`overridden` 是更高层赢、`restart-required` 表示改动还没生效。

## 升级语义与用户沟通

- **第三方插件的升级 = 卸载重装**（插件页面对第三方插件就是这样做；CLI 有 update 但用户路径以重装为主）。README 要给"升级"一节说清步骤。
- file: 安装是复制——开发期改代码后重装（dev-sandbox 脚本已自动化）。
- 插件内嵌的第三方内容（如 skill 快照）随插件版本更新——这就是把上游"检查更新"步骤 rewrite 掉的理由（skill-plugin.md）。
- 版本号用 semver；`dsh.compatibility.dshReleases`（可选）按产品线记录验证状态，README 同步一张"已实测版本"表（geochat 的 VALIDATION.md 是范本：每版写明"证明什么/不证明什么"）。

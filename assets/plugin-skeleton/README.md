# dsh-your-plugin —— dsh 0.2.x 插件骨架

一个可直接运行的最小完整插件，演示 dsh 0.2.x 全部常用能力的接线方式：

| 能力 | 位置 | 要点 |
| --- | --- | --- |
| Host 半边 | `src/host.js` | 纯 ESM 零构建；`name`/`inject`/`Config`/`apply(ctx, config)` |
| 工具 | `src/host.js` 的 `memoAddTool`/`memoListTool` | 原生注册（自写校验）、output 双通道（render 给模型 / presentationMeta 给浏览器） |
| 技能 | `src/host.js` 的 `memoSkillProvider` | 两级加载（list 候选 / get 正文）、rank 600 让位、addendum 附注 |
| 系统提示 | `apply` 里 `systemPrompt.section` | 教模型何时用工具 |
| 插件页面 | `gallery/` + webServer prefix 路由 | 静态页 + 数据接口；safeFile/readJson/每请求鉴权三件套 |
| 数据持久化 | `$DSH_HOME/<id>/memos.json` | 原子写、双进程 mtime 重读；工具与页面写同一份数据 |
| 浏览器半边 | `src/client.js` | ModuleLoader closure、侧栏 + main 槽、主题跟随、开新对话只填不发 |
| 构建 | `scripts/build.mjs` | 只打包 client 半边；产物三大自检 |
| 测试 | `test/host.test.mjs` | Node 原生 test runner，零依赖，不需要装 dsh |
| 隔离开发 | `scripts/dev-sandbox.sh` / `.ps1` | 隔离 `DSH_HOME`，不碰 `~/.dsh` |

## 上手

```bash
npm install          # 只装 esbuild（devDep）与 schemastery（peer，pnpm/npm 自动装）
npm test             # Host 逻辑单测（不依赖 dsh）
npm run build        # 打包 dist/client.js + 自检
scripts/dev-sandbox.sh 4311        # 或 PowerShell: scripts\dev-sandbox.ps1
# 浏览器打开 http://127.0.0.1:4311 → 侧栏出现「工作台」
```

不用沙盒直接装进你的 profile：

```bash
dsh plugin --profile web add file:<本项目绝对路径>
dsh --profile web
```

## 改名清单（复制本骨架后）

1. `package.json`：`name`（建议 `dsh-<你的名字>`，市场可发现）、`description`
2. `cordis.patch.yml`：`id`（= 插件实例 id）与 `name`（= 包名）
3. `src/host.js`：`export const name`（= id）、工具名的 `your_plugin_` 前缀、`BASE = '/<id>'`
4. `src/client.js`：`PANEL_ID`（= id）、`BASE`、`MSG_*` 常量前缀、侧栏 label
5. `gallery/`：`scheme.js`/`app.js` 里的 `your-plugin:scheme`/`your-plugin:draft` 消息类型
6. `test/host.test.mjs` 顶部与断言里的占位名

> 用脚手架一键改名：`python <skill>/scripts/scaffold_plugin.py <目标目录> --name dsh-my-plugin`

## 演示闭环

- 对话里说「记一下明天开会」→ 模型调 `your_plugin_memo_add` → 备忘落盘
- 侧栏「工作台」页面 → 同一份数据，可增删
- 对话里问「我记了什么」→ `your_plugin_memo_list` → 按 `your-plugin-briefing` 技能规范播报

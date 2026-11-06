---
name: dsh-plugin-developer
description: 指导并帮助开发 DeepSeek Harness（dsh）插件与功能（目标 dsh 0.2.x）。当用户要求开发/编写/创建/搭建 dsh 插件、或为 dsh 增加新能力时使用，包括：工具（Tool，defineTool 与原生注册、presentationMeta、UI 卡片）、技能（SkillProvider、快照聚合、rewrite/addendum）、系统提示注入、调外部 API 的工具（异步作业+轮询、代理出网、附件转图生图）、插件页面（侧栏/会话标签页/右侧面板/斜杠命令/设置卡片）、webServer HTTP 路由与每请求鉴权、$DSH_HOME 数据持久化、宿主模型调用、后台任务、i18n、浏览器端组件（Toolview/沙箱/CSP/主题）、安全加固清单、双端构建（JS 零构建与 TS 双端）、免额度测试（mock-llm/dev-sandbox）、打包发布与版本兼容（engines.dsh/npm/tgz/桌面版差异）、诊断 dsh 插件报错与常见坑；或直接生成 dsh 插件项目脚手架。内置完整可运行的 0.2.x 骨架（assets/plugin-skeleton，工具+技能+系统提示+插件页面+数据持久化闭环，9 个单测）与两个历史实战案例。基于官方文档与 dsh-context、dsh-guizang-design、dsh-media-desk、GeoChat 四个已上架开源插件的实战经验。
---

# dsh 插件开发（0.2.x）

## Overview

在 DeepSeek Harness（dsh）中"增加新能力" = 写一个插件挂载到 Cordis 容器，**不需要 fork 源码**。dsh 没有特权内核：模型适配器、工具注册表、Agent 循环、网页界面都是插件。

一个插件由**两个半边**组成：**Host 半边**（Node 进程，注册工具/技能/系统提示、跑业务与 HTTP）+ **Client 半边**（浏览器，注册页面/标签页/命令/Toolview）。全部工作流、模板与参考资料以 0.2.x 为准（官方文档 + 四个已上架开源插件实战）。

## 工作流

### 第 0 步：诊断需求 + 选型（先判断要什么能力）

对着需求查**能力面地图**（[plugin-types.md](references/plugin-types.md) 有全表）：

| 用户想要 | 用什么 | 半边 |
| --- | --- | --- |
| 模型多一个动作 | `ctx.tools.register` | Host |
| 教模型按规范产出 | `ctx.skills.registerProvider` | Host |
| 教模型何时用工具 | `ctx.systemPrompt.section` | Host |
| 侧栏页面/工作台 | `slots.inject('sidebar.panellist'+'main')` + `ctx.webServer.register` | Client+Host |
| /命令、会话标签、右侧面板、设置卡片 | `inputTriggers` / `conversation.view` / `sidebarRightTabs` / `Config`+configForms | Client |
| 本机持久数据 | `$DSH_HOME/<插件名>/` + Host 读写 | Host |
| 调外部 API / 生图 | 工具 + 异步作业轮询（http-client.md） | Host |

判断口诀：**给模型的注册在 Host，给用户看的注册在 Client slots，跑腿的在 Host**。90% 需求 = Tool + Skill（+系统提示）起步。要替换底层机制（换模型网关/加审批关卡/换循环）看 plugin-types.md 的四种类型。

### 第 1 步：环境准备

1. **Node 22.19+ 或 24+**（`node -v` 验证；20 必崩）。
2. **确认 dsh 可用**：`dsh -v`；目标宿主版本决定骨架里 `engines.dsh` 区间（默认 `>=0.2.1-rc.2 <0.3.0`）。
3. **分清你在哪开发**：
   - **dsh 自己的对话里**（Harness 内置 agent）：官方自带 `cordis-plugin-development` 技能 + `plugin_manager`（install_bundle）/`cordis_inspect_query`（查已装宿主的 Service/Event/Config/Slots/Theme 权威 API）工具——**在宿主内一切以 inspection 结果为准**，装插件用 `install_bundle` 不要手改 profile。
   - **dsh 外部**（终端/编辑器/外部 AI）：用本 Skill 的工作流；以下官方文档可 WebFetch：

| 主题 | URL |
| --- | --- |
| 第一个插件 | https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/ |
| 工具 | https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/tool |
| 配置 | https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config |
| 打包安装 | https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish |
| 生命周期/服务/事件 | https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/ （events、service） |
| 工具撰写参考（cookbook） | https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-tool |

> 另一个权威知识源：本机安装的 dsh 包内自带官方技能与模板——`<dsh 安装目录>/node_modules/@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/`（含 references 与 decoration/mcp 模板），拿不准官方立场时直接读它。

### 第 2 步：搭骨架

```bash
python scripts/scaffold_plugin.py <项目目录> --name dsh-my-plugin
# 或手动复制 assets/plugin-skeleton/
```

骨架是一个**完整可运行**的最小插件闭环：工具（`memo_add`/`memo_list`，原生注册+自写校验+presentationMeta）+ 技能（含 addendum）+ 系统提示 + 插件页面（gallery/ + webServer 前缀路由 + 鉴权三件套 + safeFile）+ `$DSH_HOME` 数据持久化（原子写/双进程 mtime 重读）+ Client 半边（侧栏+main 槽+主题跟随+开新对话只填不发）+ esbuild 打包自检 + `node --test` 单测（不依赖 dsh）+ dev-sandbox 隔离开发脚本。9 个测试全绿、构建自检通过。

改名清单见 `assets/plugin-skeleton/README.md`；各文件的作用与逐行讲解见 [architecture.md](references/architecture.md)。

### 第 3 步：实现能力（按需读对应指南）

- **工具** → [tool-plugin.md](references/tool-plugin.md)：defineTool vs 原生注册、exec 上下文、output 规范值契约、presentationMeta、presentCall/presentResult 卡片、错误处理。
- **技能** → [skill-plugin.md](references/skill-plugin.md)：两级加载、Candidate 字段、目录聚合、快照 vendor、rewrite+addendum、rank 让位。
- **系统提示** → [system-prompt.md](references/system-prompt.md)：锚点 order、interpolate、prefix/suffix。
- **调外部 API** → [http-client.md](references/http-client.md)：异步作业+轮询、可注入 fetch、undici 代理、附件转图生图。
- **插件页面/HTTP/数据** → [web-and-data.md](references/web-and-data.md) + [browser-side.md](references/browser-side.md)：前缀路由、鉴权三件套、safeFile、$DSH_HOME 模式；槽位地图、iframe 通信、startSession、主题、i18n、Toolview。
- **深度集成** → [host-integration.md](references/host-integration.md)：事件四模式、调用宿主模型、后台任务、agent.inject 通知。
- **安全** → [security.md](references/security.md)：发布前逐条过清单。
- **选型/替换机制** → [plugin-types.md](references/plugin-types.md)。

### 第 4 步：构建

```bash
npm install && npm test && npm run build   # 骨架：JS 零构建 Host + esbuild 打包 client
```

0.2.x 主流两种形态：**JS 零构建**（Host 发布即源码，只打包 client——骨架与 guizang/media-desk 做法）与 **TS 双端 tsdown**（dsh-context/geochat 做法）。做法与产物三大自检见 [build-test.md](references/build-test.md)。

### 第 5 步：测试（免额度优先）

```bash
npm test                      # ① 纯函数/契约测试（node --test，不装 dsh）
scripts/dev-sandbox.sh 4311   # ② 隔离 DSH_HOME 跑网页版（Windows: scripts\dev-sandbox.ps1）
node scripts/mock-llm.mjs     # ③ mock 模型：不花额度跑全链路（模式见 build-test.md）
# ④ web 界面人工验收：http://127.0.0.1:3080，确认工具调用 + 页面渲染 + 深浅色
```

测试金字塔与各层写法见 [build-test.md](references/build-test.md)；报错速查见 [troubleshooting.md](references/troubleshooting.md)。

### 第 6 步：发布

发布前过 [security.md](references/security.md) 清单 → `npm pack`（prepack 自动 build）→ npm publish 或 Release tgz+SHA256 → 安装途径与命令、桌面版差异、engines.dsh 兼容声明、市场元信息（icon/locale）见 [publish.md](references/publish.md)。

## 参考资料索引（按需读取，别一次全读）

| 文件 | 内容 | 何时读 |
| --- | --- | --- |
| `references/architecture.md` | 0.2.x 双半边模型、package.json dsh.* 字段、cordis.patch、profile、Config、版本声明 | 搭骨架/理解全局 |
| `references/plugin-types.md` | 能力面地图 + 四种类型（Provider/Interceptor/Tool/AgentLoop） | 第 0 步选型 |
| `references/tool-plugin.md` | 工具完整指南（两条路线/exec/output/presenters） | 写工具 |
| `references/skill-plugin.md` | SkillProvider/快照聚合/rewrite+addendum | 写技能 |
| `references/system-prompt.md` | 系统提示注入与锚点 order | 教模型用工具 |
| `references/http-client.md` | 异步作业+轮询+代理+附件 | 调外部 API |
| `references/browser-side.md` | 槽位地图/页面/主题/i18n/Toolview | 写浏览器端 |
| `references/web-and-data.md` | webServer 路由/鉴权/safeFile/$DSH_HOME | 做页面与数据 |
| `references/host-integration.md` | 事件/宿主模型调用/后台任务/通知 | 深度集成 |
| `references/security.md` | 安全清单（HTTP/路径/SSRF/密钥/XSS） | 发布前 |
| `references/build-test.md` | 构建两形态/三大自检/dev-sandbox/mock-llm/测试金字塔 | 构建/测试 |
| `references/publish.md` | 打包/渠道/安装/桌面差异/版本兼容 | 发布 |
| `references/troubleshooting.md` | 报错速查 + 十三条实录坑 | 排错 |

## 模板与脚手架

- **插件骨架**：`assets/plugin-skeleton/` —— 0.2.x 完整闭环（推荐，直接运行）。
- **脚手架**：`scripts/scaffold_plugin.py <目录> --name dsh-my-plugin`。

## 实战案例

- **`assets/plugin-skeleton/`**：0.2.x 可运行骨架（首选蓝本）。
- **`assets/examples/weather-plugin/`**：查天气 + 动效卡片（**0.1.x 历史案例**，构建链已过时；工具/技能/系统提示/Toolview 的 API 思路仍适用）。
- **`assets/examples/ecom-details-image-plugin/`**：Claude Skill 改造成 dsh 插件 + 代理异步出图 + 画廊卡片（**0.1.x 历史案例**；异步作业/代理/附件方案的思路仍适用）。

> 四个已上架的开源参考实现（模式对照表见 architecture.md 末尾）：[dsh-context](https://github.com/bowenliang123/dsh-context)（仪表板/命令/设置卡片/兼容层）、[dsh-guizang-design](https://github.com/op7418/dsh-guizang-design)（技能包+页面+工具+数据）、[dsh-media-desk](https://github.com/woniuniuniu/dsh-media-desk)（Web 应用+安全+mock 测试）、[GeoChat DSH 插件](https://github.com/tiwe0/GeoChat)（原生工具+技能+画布）。

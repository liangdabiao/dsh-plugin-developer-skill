# 能力面地图：dsh 0.2.x 插件能做的所有事 + 四种插件类型选型

## 目录
- [能力面地图（0.2.x 新增面全表）](#能力面地图02x-新增面全表)
- [组合模式：真实插件怎么搭](#组合模式真实插件怎么搭)
- [四种插件类型（换驱动/加关卡/装软件/换引擎）](#四种插件类型换驱动加关卡装软件换引擎)
- [选型决策表](#选型决策表)

## 能力面地图（0.2.x 新增面全表）

用户说"给 dsh 加个 X"，先在这张表里定位 API，再按需读对应文档：

| 用户想要 | 注册面 | API（半边） | 详见 |
| --- | --- | --- | --- |
| 让模型多一个可执行动作 | 工具 | `ctx.tools.register(tool)`（Host） | tool-plugin.md |
| 教模型按规范产出 | 技能 | `ctx.skills.registerProvider(fn)`（Host） | skill-plugin.md |
| 批量提供技能文档（快照聚合） | 技能 | 同上 + SKILL.md 目录扫描 + rewrite/addendum | skill-plugin.md |
| 教模型何时用工具/约定 | 系统提示 | `ctx.systemPrompt.section({name,order,text})`（Host） | system-prompt.md |
| 侧栏加一个入口页面 | 侧栏面板 + 主区域 | `slots.inject('sidebar.panellist' / 'main')`（Client） | browser-side.md |
| 会话里加标签页（如 Context/Fleet） | 会话视图槽 | `slots.inject('conversation.view')`（Client） | browser-side.md |
| 右侧边栏加面板 | 右侧面板 | `sidebarRightTabs.register` + `slots.inject('sidebar.right.pane.tab')`（Client，需 `dsh.client.inject` 声明宿主模块） | browser-side.md |
| `/命令`（斜杠触发） | 输入触发源 | `ctx.inject(['inputTriggers'], …)`（Client） | browser-side.md |
| 插件自己的设置界面 | 配置 | Host 导出 `Config`（schemastery）+ Client 可选加 `plugins.bundle.config` 槽卡片 | architecture.md |
| HTTP 接口/静态页面/插件网页 | Web 服务 | `ctx.webServer.register({kind:'prefix', path, handler})`（Host） | web-and-data.md |
| 本机持久数据 | 数据目录 | `$DSH_HOME/<插件名>/` + Host 工具读写 | web-and-data.md |
| 调宿主已配好的模型 | LLM 服务 | `ctx.get('llm').prepareCall(...).stream(...)`（Host） | host-integration.md |
| 后台长任务 | 任务服务 | `ctx.jobs.start({kind,label,owner,run})`（Host） | host-integration.md |
| 监听/拦截运行事件 | 事件系统 | `ctx.on(...)`（Host）；`agent.inject` 异步通知 | host-integration.md |
| 工具结果画成卡片/动画 | Toolview | `slots.inject('tool.call.toolview')` keyed 注册（Client） | browser-side.md + tool-plugin.md |
| 中英文界面 | i18n | `ctx.locale.register(NS,{zh,en})`（Client）+ `locale/*.json` 市场元信息 | browser-side.md + publish.md |

**判断口诀**：给模型的（工具/技能/提示）注册在 Host；给用户看的（页面/标签/命令/设置卡片）注册在 Client 的 slots；给两边跑腿的（HTTP/数据/模型/任务）在 Host。

## 组合模式：真实插件怎么搭

| 插件 | 形态 | 能力组合 |
| --- | --- | --- |
| dsh-guizang-design | 技能包 + 页面 | 5 skills（快照聚合）+ 2 工具（写库）+ 侧栏页面（iframe + HTTP 静态服务）+ 数据目录 + 开新对话草稿 |
| dsh-media-desk | Web 应用 | HTTP 前缀路由 + 5 页 React 应用 + 宿主模型调用 + 生图 API + 密钥管理 + 鉴权加固 |
| dsh-context | 数据仪表板 | 会话投影（sessionProjections）+ 9 条 HTTP 路由 + 会话标签页 + 右侧面板 + `/context` 命令 + 设置卡片 + i18n |
| GeoChat 插件 | 原生工具 + 画布 | 20 工具（Host↔Client 远程命令通道）+ 55 技能 + 右侧画布页签 + 离线静态资源 |

> 90% 的需求 = **Tool + Skill（+ 系统提示）** 起步；带界面的再补 webServer + Client 页面。先做最小可用的 Tool，再逐步加。

## 四种插件类型（换驱动/加关卡/装软件/换引擎）

能力面地图解决"加什么"；这四种类型解决"改什么"——当你要**替换或横切** dsh 现有机制时：

### 类型一：Service Provider（换驱动）

dsh 的底层能力（模型适配器、文件系统、沙箱）是服务。想换实现 → 写 Provider 插件覆盖同一服务键：

```ts
// 1. 声明服务契约
declare module '@deepseek-ai/cordis' {
  interface Context { mySearch: Service<MySearchService> }
}
// 2. 接管旧实现并覆盖
export function apply(ctx: Context, config: Config) {
  ctx.super('mySearch', { /* 复用旧服务配置 */ })
  ctx.provide('mySearch', class extends MySearchService { /* 覆盖方法 */ })
}
```

何时用：换模型网关、把本地 fs 换远程沙箱、接自研搜索。官方文档的 "LLM adapter" 与 "Capability layering" 两节是这条路的地道写法。

### 类型二：Event Interceptor（加关卡）

在关键路径插横切逻辑（审批/审计/限流/改写），用 Cordis 四种事件模式（详见 host-integration.md）：

```ts
// waterfall：每个监听器必须调 next()，不调 = 故意短路（拦截/审批的基础）
ctx.on('tools/execute', async (data, next) => {
  if (!allowed(data)) return        // 短路拒绝
  audit(data)
  return next()                     // 委托继续
})
// 策略兜底：ctx.tools.guard() 单向 deny，后续监听器不可撤销
```

内置可拦截面：`tools/pre-execute`（allow/deny/ask 策略）、`tools/execute`（包装分发：deadline/重试/指标）、`tools/post-execute`（替换呈现/阻断结果/附加上下文）、`tools/result`（观察不可变结果）。

### 类型三：Tool Plugin（装软件）——主推路线

给模型加可调用动作。完整指南见 tool-plugin.md。

### 类型四：Agent Loop（换引擎）

替换"思考→调工具→再思考"核心循环：实现 `Agent` 接口 + `AgentFactory`，注册进 `ctx.agent`。干预面大、风险高，只有做自定义编排框架才用。多智能体协作也可以不动循环：用官方任务/子 Agent 面就有了（dsh-context 的 Fleet 标签页就是消费这些数据）。

## 选型决策表

```text
用户想"加新能力" →
├─ 只是想教模型"怎么写/怎么组织"？              → Skill（skill-plugin.md）
├─ 想让模型多一个"能干的动作"？                → Tool（tool-plugin.md，首选）
├─ 想要一个用户能打开的页面/看板/工作台？       → Client 页面 + webServer（browser-side.md + web-and-data.md）
├─ 想加 /命令、会话标签、右侧面板、设置界面？   → 对应 Client 面（browser-side.md 能力面地图）
├─ 想换掉底层驱动（模型/文件/沙箱/搜索）？     → Service Provider（本文件）
├─ 想在关键路径插审批/审计/限流/改写？         → Event Interceptor（本文件 + host-integration.md）
├─ 想重写整个思考-行动循环？                   → Agent Loop（本文件，慎用）
└─ 调外部生成 API（图/视频/长任务）？          → Tool + 异步作业轮询（http-client.md）
```

多数需求用 **Tool + Skill + 系统提示** 组合即可；先最小可用，再逐步加界面与数据面。

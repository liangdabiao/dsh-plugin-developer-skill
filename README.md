# dsh-plugin-developer — DeepSeek Harness 插件开发 Skill

> 指导 AI Agent 从 0 到 1 开发、构建、安装、测试、发布 DeepSeek Harness（dsh）插件。**基于 dsh 0.2.x**（官方文档 + 四个已上架开源插件实战），内置完整可运行的 0.2.x 骨架与两个历史实战案例。

## 这是什么

dsh 采用"无特权内核、万物皆插件"的设计：模型适配器、工具注册表、Agent 循环、网页界面都是插件。**给 dsh 增加新能力 = 写一个插件包挂到 Cordis 容器上，不需要 fork 源码。**

一个插件 = **Host 半边**（Node：工具/技能/系统提示/HTTP/数据）+ **Client 半边**（浏览器：页面/标签页/命令/Toolview）。这个 Skill 把"写一个 dsh 插件"做成可复用工作流：

```
选型(能力面地图) → 环境准备(Node22+/dsh/官方文档) → 脚手架
→ 实现(工具/技能/提示/页面/数据/集成/安全) → 构建(JS零构建 或 TS双端)
→ 测试(单测→mock-llm→dev-sandbox→web验收) → 发布(npm/tgz/版本兼容)
```

## 目录结构

```
dsh-plugin-developer/
├── SKILL.md                        # 主工作流（Agent 先读这个）
├── README.md                       # 本文件：人读的说明
├── scripts/
│   └── scaffold_plugin.py          # 一键生成插件项目骨架
├── assets/
│   ├── plugin-skeleton/            # 0.2.x 完整可运行骨架（首选蓝本）
│   │   ├── src/host.js             #   Host 半边：工具+技能+提示+HTTP+数据（零构建）
│   │   ├── src/client.js           #   Client 半边：侧栏+页面+主题+开新对话
│   │   ├── gallery/                #   插件页面（纯 HTML/CSS/JS）
│   │   ├── scripts/build.mjs       #   esbuild 打包 client + 三大自检
│   │   ├── scripts/dev-sandbox.*   #   隔离 DSH_HOME 开发循环（sh + ps1）
│   │   └── test/host.test.mjs      #   9 个单测（node --test，不依赖 dsh）
│   └── examples/
│       ├── dsh-seedance-studio/    # 案例①：0.2.x 实战（外部 CLI 生成工具+侧栏面板+skill 快照）
│       └── weather-plugin/         # 案例②：历史案例（0.1.x 构建链，查天气+动效卡片，API 思路仍可参考）
└── references/                     # 按需加载的深度文档（14 篇）
    ├── architecture.md             # 0.2.x 双半边模型、dsh.* 字段、Config、版本声明
    ├── plugin-types.md             # 能力面地图 + 四种类型选型
    ├── tool-plugin.md              # 工具两条路线/exec/output/presenters
    ├── skill-plugin.md             # SkillProvider/快照聚合/rewrite+addendum
    ├── system-prompt.md            # 系统提示注入与锚点 order
    ├── http-client.md              # 异步作业+轮询+代理+附件
    ├── browser-side.md             # 槽位地图/页面/主题/i18n/Toolview
    ├── web-and-data.md             # webServer/鉴权/safeFile/$DSH_HOME
    ├── host-integration.md         # 事件/宿主模型调用/后台任务/通知
    ├── security.md                 # 安全清单
    ├── build-test.md               # 构建两形态/dev-sandbox/mock-llm/测试金字塔
    ├── publish.md                  # 打包/渠道/安装/版本兼容
    └── troubleshooting.md          # 报错速查 + 实录坑
```

## 快速上手（给 AI Agent 的调用指引）

1. **先读 `SKILL.md`**：按第 0~6 步执行（选型→环境→骨架→实现→构建→测试→发布）。
2. **按需读 references**（渐进式加载，别一次全读）。
3. **生成骨架**：`python scripts/scaffold_plugin.py <目录> --name dsh-my-plugin`，先跑 `npm test && npm run build` 确认基线，再填充逻辑。
4. **对照蓝本**：能力疑问先看 `assets/plugin-skeleton/` 对应文件；外部生成 API/CLI 集成看 `assets/examples/dsh-seedance-studio/`。

## 给用户的快速说明

- **让模型多一个动作** → Tool：`ctx.tools.register`（defineTool 或原生对象+自写校验），结构化数据经 `presentationMeta` 给浏览器渲染。
- **教模型按规范产出** → Skill：`SkillProvider { list, get }`，候选常驻、正文按需。
- **要用户能打开的页面** → Client 侧栏入口 + Host webServer 前缀路由伺服页面与数据。
- **要 /命令、会话标签页、右侧面板、设置卡片** → 对应 Client 面（browser-side.md 槽位地图）。
- **要本机存数据** → `$DSH_HOME/<插件名>/` + Host 工具读写（沙箱写不了工作区外）。
- **调宿主已配好的模型** → `ctx.get('llm')`（host-integration.md），不要自带密钥。

## 硬约束速记（0.2.x）

| 项 | 要求 |
| --- | --- |
| Node 版本 | **22.19+ 或 24+** |
| 依赖 | Host 半边尽量零 `@deepseek-ai/*` import；要 SDK 就 peerDependencies 带版本下限（不要 `*`） |
| 版本门槛 | `engines.dsh` 区间必写；不同小版本安装器检查的字段不同，engines 与 peers 都写最稳 |
| 浏览器产物 | 单文件 CJS + `__ModuleLoader__` 包装三件套；require 白名单、无动态 import、无多 chunk（构建自检） |
| 安装 | `dsh plugin --profile web add <包名|tgz|file:目录>`；file:/link: 是复制，改码重装；桌面版优先插件页面 |
| 数据 | `$DSH_HOME/<插件名>/`，原子写 + 双进程 mtime 重读 |
| 安全 | 每请求鉴权三件套、safeFile、模型输出归一化、SSRF 防护、密钥 0600（security.md） |
| 验收 | 命令行跑通不算完，最终在 **web 界面**确认工具调用 + 页面渲染 |

## 参考与致谢

本 Skill 的 0.2.x 升级基于以下一手材料，感谢这些开源项目：

- **官方文档**：https://deepseek-harness.github.io/deepseek-harness/ （develop/basic、framework、reference/cookbook）
- [dsh-context](https://github.com/bowenliang123/dsh-context)（bowenliang123）— 仪表板/斜杠命令/设置卡片/兼容层的权威样本
- [dsh-guizang-design](https://github.com/op7418/dsh-guizang-design)（歸藏/op7418）— 附《dsh插件开发教程》，技能包+页面+工具模式的范本
- [dsh-media-desk](https://github.com/woniuniuniu/dsh-media-desk)（蜗牛的科技笔记）— HTTP 型插件、安全加固、mock 测试工作流
- [GeoChat](https://github.com/tiwe0/GeoChat)（tiwe0）— 原生工具+55 技能+离线资源的 DSH 插件
- 历史案例 weather-plugin（以及已被 dsh-seedance-studio 替代的 ecom-details-image-plugin）与 特别致谢社区支持： https://linux.do



## License

MIT

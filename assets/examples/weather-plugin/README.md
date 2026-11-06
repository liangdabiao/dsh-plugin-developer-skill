# weather-plugin — 完整可运行的 dsh 插件实战案例

> ⚠️ **历史案例（dsh 0.1.x 时代）**：本案例按 dsh **0.1.1-rc.2** 开发，其**构建与安装方式已过时**（junction 链接宿主依赖、tsdown 双端、`dshx.contributes` 清单）。0.2.x 的构建、骨架与安装请以 `assets/plugin-skeleton/` 和 `references/build-test.md`、`references/publish.md` 为准。案例中的**核心 API 思路仍然适用**（defineTool + output/presentationMeta 双通道、SkillProvider 两级加载、systemPrompt.section、keyed Toolview 槽）。

> 本目录是 **dsh-plugin-developer** Skill 的实战案例：一个"查天气 + 动效卡片"的 dsh 插件，已按 dsh 0.1.1-rc.2 真实 API 完整开发、构建、安装，并**在 dsh web 界面实测通过**（模型调用 `weather` 工具 → 加载 `weather-briefing` 技能 → 渲染动效天气卡片 ☀️ 北京 29°C · 东风 6km/h · 20~29°C）。

## 它演示了真实 API 的全部要点

| 能力 | 文件 | 说明 |
| --- | --- | --- |
| 工具（defineTool） | `src/tool.ts` | `defineTool` + 手写 JSON Schema 参数 + `output.render/presentationMeta` 分离 |
| 技能（SkillProvider） | `src/skill.ts` | `{ name, list(), get() }` 两级加载，weather-briefing 播报规范 |
| 系统提示 | `src/index.ts` | `ctx.systemPrompt.section({ name, order, text })` 教模型何时调用 |
| 配置（schemastery） | `src/index.ts` | `export const Config: z<Config> = z.object({...})` 带默认值 |
| 共享契约 | `src/fragment.ts` | 双端共用的纯函数（WMO 天气码 → 动效类型/中文描述、meta 解析） |
| 浏览器端 Toolview | `src/client/index.tsx` | `ctx.slots.inject('tool.call.toolview', ...)` + keyed 组件 + 纯 CSS 6 种天气动效 |
| 打包（双端） | `tsdown.config.ts` | Node ESM + 浏览器 CJS 单文件 + `__ModuleLoader__` banner/footer |
| 构建脚本 | `scripts/build.ps1` | npm install → junction 链宿主依赖 → tsdown → 自检 |
| 产物同步 | `scripts/sync_profile.py` | file: 依赖是复制，改代码后需同步到已安装 profile |
| 安装清单 | `cordis.patch.yml` + `package.json` | `dsh.bundle.patch` / `dsh.client.inject` / `dshx.contributes` |
| 动效预览页 | `preview.html` | `?type=sunny|partly|cloudy|fog|rain|snow|storm&city=..` 独立预览 6 种天气动画 |

## 如何跑通（三行命令）

```bash
# 1. 构建（Node 22+；按 scripts/link_deps.py 核对本机 dsh 缓存路径）
powershell -ExecutionPolicy Bypass -File scripts/build.ps1

# 2. 安装进 profile（web / headless 都装）
dsh plugin --profile web add file:<本目录绝对路径>
dsh plugin --profile headless add file:<本目录绝对路径>

# 3. 测试
dsh --profile headless "北京今天天气怎么样"      # headless 冒烟
dsh --profile web                                # 浏览器打开 http://127.0.0.1:3080 输入问题
```

## 改动后重跑

```bash
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
python scripts/sync_profile.py    # 同步产物到已安装的 profile
```

## 已知边界

- 天气数据源：Open-Meteo（geocoding + forecast，**无需 API key**）。
- "纽约"等中文城市名 geocode 查不到（API 语言问题），用英文名或北京/上海/London 可查。
- 生产部署建议把 API 基地址设为可配置（`Config` 已支持 `baseUrl`/`geocodingUrl` 覆盖）。

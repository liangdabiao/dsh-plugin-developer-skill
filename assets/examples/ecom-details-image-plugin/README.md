# ecom-details-image-plugin

> ⚠️ **历史案例（dsh 0.1.x 时代）**：本案例按 dsh **0.1.1-rc.2** 开发，构建与安装方式已过时（junction 链接、旧清单字段）。0.2.x 请以 `assets/plugin-skeleton/` 与 `references/build-test.md`、`references/publish.md` 为准。案例的方法论与外部 API 实战经验**仍然适用**：SKILL.md→技能正文、脚本→工具、输出→Toolview 的改造映射，异步作业+轮询、undici 代理逐请求注入、output schema 校验坑、聊天附件直读方案（见 references/http-client.md）。

把 **Claude Skill「ecom-details-image」（电商图片方法论）改造**成的 DeepSeek Harness（dsh）插件：让模型在 dsh 里就能写出合规的电商图片 Prompt 并**真实出图**（产品主图 / 详情页 / 社媒图 / 直播场景 / 广告等），结果以画廊卡片展示在网页界面。

## 一句话实战

```
用户：「生成一张白色马克杯的电商主图」
  → 模型加载 ecom-details-image 技能（铁律/模板/风格锁）
  → 写出合规 Prompt → 调用 ecom_generate_image 工具
  → 插件经代理提交 apimart.ai 异步任务 → 轮询取图
  → 浏览器画廊卡片「🖼️ 电商图片已生成」渲染
```

## 用法

1. 构建：`powershell -File scripts/build.ps1`
2. 安装：`dsh plugin --profile web add file:<本目录绝对路径>`
3. 改代码后：`python scripts/sync_profile.py`（file: 依赖是复制）→ 重启 dsh
4. 打开 `http://127.0.0.1:3080`，说「生成 xx 的电商主图 / 详情页 / 社媒图」即可

配置（环境变量或插件 Config）：
- `IMG_API_KEY`：图片 API 密钥（apimart.ai / OpenAI 兼容）
- `IMG_PROXY_URL`：可选 HTTP 代理（apimart 在受限网络需经代理，如 `http://127.0.0.1:1080`）

## 项目结构

```
src/
├── index.ts        # apply 入口：注册工具 + 技能 + 系统提示（含环境变量 fallback）
├── fragment.ts     # 共享契约纯函数（尺寸/分辨率归一化 + EcomImageMeta + 校验）
├── client.ts       # apimart 异步客户端：提交 + 轮询 + 可选 undici ProxyAgent + 重试
├── tool.ts         # ecom_generate_image 工具（output/meta 分离，presentationMeta 投影）
├── skill.ts        # ecom-details-image 技能正文（浓缩方法论，按需加载）
└── client/index.tsx# 浏览器端画廊卡片 Toolview（骨架屏 + 画廊）
assets/templates/   # 原项目 25 个场景模板 JSON（保留）
scripts/            # build.ps1 / link_deps.py / sync_profile.py / 验证脚本
```

## 实战要点（改造中踩过的坑）

| 坑 | 解法 |
| --- | --- |
| apimart 直连超时（受限网络） | 插件内用 undici `ProxyAgent`，经本地代理出网 |
| undici v7 `ProxyAgent` 传字符串无效 | 必须传对象 `{ uri: '...' }` |
| 运行时改 `process.env` 对已初始化 fetch 不生效 | 代理/密钥在进程启动时注入（环境变量或 Config） |
| 工具 output schema `additionalProperties:false` 漏字段 → 每次调用被拒 | `execute()` 返回值必须与 schema 声明字段完全一致 |
| `file:` 安装是复制，不感知改码 | 改后 `sync_profile.py` + 重启 dsh 才生效 |
| 代理链路偶发 TLS 重置 | 轮询 `getJson` 加有限重试 |
| 参考图是本地文件、无公网 URL | apimart 支持 base64 data URI；工具参数 `image_url` 走公网 URL 通道 |

## 验证

- 独立链路：`node scripts/verify_apimart.mjs`（文生图 + 图生图，需在无沙箱终端配代理）
- 冒烟：`dsh --profile headless "生成一张白色马克杯电商主图"`
- 界面验收：dsh web 发消息，看画廊卡片（截图可见白色马克杯 / 参考图连体裤白底化）

## 依赖

- `@deepseek-ai/*`（宿主依赖，构建时 junction 链接，不发布）
- `undici`（代理客户端，bundle 进 node 端）

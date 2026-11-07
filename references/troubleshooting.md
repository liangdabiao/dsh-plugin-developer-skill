# 常见坑与排错（0.2.x 实战合集）

> 来源：weather 案例（0.1.x，部分仍有效）+ 旧出图案例（已被 `assets/examples/dsh-seedance-studio/` 替代，其经验沉淀于下文）+ guizang 插件的十条实测坑 + media-desk/geochat/dsh-context 的工程教训。

## 目录
- [环境与安装报错速查](#环境与安装报错速查)
- [构建报错速查](#构建报错速查)
- [运行时报错速查](#运行时报错速查)
- [设计上的常见坑（十条实录）](#设计上的常见坑十条实录)
- [调外部生成 API 的坑](#调外部生成-api-的坑)
- [调试技巧](#调试技巧)

## 环境与安装报错速查

| 报错/现象 | 原因 | 解决 |
| --- | --- | --- |
| dsh 启动即崩：`Promise.withResolvers` 不是函数 / zstd / stripTypeScriptTypes 缺失 | **Node 版本太旧**（0.2.x 需 22.19+ 或 24） | 升级 Node；多版本共存时用新 node.exe 跑 dsh |
| 安装被拒 / 加载报 engines 不满足 | `engines.dsh` 区间没覆盖当前宿主版本 | 放宽区间（或补产品线并集写法，见 publish.md）；两条都写：engines + peers |
| npm 报 peerDependencies 冲突 | dsh 各包 peer 相互引用 | `npm install --legacy-peer-deps` |
| git 安装后构建脚本没跑（产物缺失） | pnpm ≥10 默认不跑构建脚本 | 用户侧 `pnpm-workspace.yaml` 加 `allowBuilds: { "<包名>": true }`；或改发 tgz（优先） |
| `Cannot find module '@deepseek-ai/xxx'` | peer 依赖没写/写成 `*` | peerDependencies 写版本下限；插件尽量不 import SDK（服务从 ctx 拿） |
| `mklink` 需要管理员权限 | 用了符号链接 | 需要目录联接时用 junction（`mklink /J`，免管理员）；0.2.x 一般不再需要 |
| PowerShell 5.1 执行脚本中文乱码 | 默认编码 | 脚本输出用纯英文；`-ExecutionPolicy Bypass` 运行 |

## 构建报错速查

| 报错/现象 | 原因 | 解决 |
| --- | --- | --- |
| 前端报 `__ModuleLoader__ is not a function` | client 产物缺 banner/footer 包装 | 按 build-test.md 配 esbuild/tsdown 包装三件套 |
| 产物里有 `import(` 或多 chunk | 动态 import / 拆包 | 静态 import；tsdown 配 `inlineDynamicImports: true`；构建自检兜底 |
| 前端白名单报错/加载失败 | client require 了平台模块外的包（Node 内置、Node 端源码、别的 @deepseek-ai/*） | client 只用 react 系 + 宿主 face；需要宿主模块就写进 `dsh.client.inject` |
| tsdown 报 `Promise.withResolvers` | tsdown 0.22+ 要 Node 22 | 升级 Node，或 tsdown@^0.19 |
| CSS 丢失 | 打包器把 CSS 拆成独立文件 | loader 内联 text / CSS Modules→运行时注入 `<style>`（build-test.md） |

## 运行时报错速查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 工具没出现 | 未注册 / 插件没启用 | `dsh --profile web --dump-config` 看有没有你；插件页面确认**已启用**（装完不点启用=没开） |
| 改了代码行为没变 | `file:`/`link:` 安装是复制 | 重跑 dev-sandbox（remove→add→重启 dsh）；client 可 `npm run watch` 热更 |
| 模型从不调用工具 | description 没写"何时用" | 按"做什么+何时用+注意"重写；加系统提示引导 |
| 工具**每次**调用都被校验拒绝（`value.xxx 不在声明的属性中`） | output.schema 配了 `additionalProperties:false` 但 execute 返回值带了未声明字段 | 返回值字段与 schema **完全一致**（最典型"工具被拒"原因） |
| 工具返回了但前端没渲染专属卡片 | meta 缺失 / keyed toolview 的 key 不对 | 确认 presentationMeta 有数据；key=工具名；无 meta 时要有文本回退 |
| 页面 403 | 鉴权/同源被拒 | 每请求鉴权三件套（web-and-data.md）；检查 Origin/Host、sec-fetch-site |
| 页面 iframe 空白 | webServer 路由没挂 / safeFile 拦了 / CSP | 确认 prefix 路由与 client iframe 的 BASE 一致；看 DevTools Network |
| 桌面版链接点不开 | `target=_blank` 交系统浏览器、无 dsh 登录态 | 页面内做查看器弹层（browser-side.md） |
| 深色模式闪白 | 主题脚本晚于首帧 | scheme.js 放 `<head>` **同步执行** |
| 双端数据对不上 | 桌面+网页双进程共写 | mtime 重读 + 原子写（web-and-data.md） |

## 设计上的常见坑（十条实录）

guizang 插件从 0.1.1→0.1.3 修出来的经验，全部通用：

1. **skill 的 git 更新步骤必败**（快照无 `.git`）→ rewrite 掉 + 测试守护（断言正文无 git 命令）。
2. **空状态被当故障汇报** → 文案明确写"这不是错误，不用向用户报告"；工具返回结构化空态而不是 throw。
3. **模型写工作区外被沙箱拦（EPERM）** → 一切数据读写走 Host 工具；skill 附注里明确禁止 bash 直改数据目录。
4. **附注不让模型跑 `.mjs`** → 测试断言附注无 `.mjs`（沙箱写不了数据目录，跑了必败）。
5. **桌面版 iframe 的 `target=_blank` 打不开** → 页面内查看器弹层；保留中键/Cmd+点击给网页版。
6. **headless Chrome 无 GPU 崩溃** → Playwright 默认带 `--no-sandbox`；Puppeteer 手动加 `--no-sandbox --disable-gpu --use-angle=swiftshader`。
7. **主题切换闪白** → scheme.js 放 `<head>` 同步执行。
8. **模型工具调用 JSON 写错**（中文引语里未转义英文双引号）→ 不是插件 bug；`check()` 把错误写清楚让模型下一轮自纠。
9. **重复登记** → 同文件/目录判重（root+entry），只更新不新增。
10. **数据目录默认值要和宿主一致** → `DSH_HOME || ~/.dsh`，桌面版 home 就是 `~/.dsh`。

补三条工程级教训（dsh-context/media-desk）：

11. **投影/折叠函数必须 TOTAL**：未知事件原样返回 state、畸形事件整体丢弃、永不物化 `undefined`——一个 undefined 会让整条缓存链写失败。
12. **运行时改 `process.env.HTTPS_PROXY` 不生效**（fetch 启动时已固定 dispatcher）→ 代理做成插件 Config，逐请求注入（http-client.md）。
13. **面板不是视口** → container queries / ResizeObserver，别用 media queries（browser-side.md）。

## 调外部生成 API 的坑

> 出图部分来自旧出图案例（apimart）实测；出片部分来自 `assets/examples/dsh-seedance-studio/`（即梦 dreamina-canvas）实测。凡是"调外部图片/视频/长作业 API 或 CLI"都要注意。

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 直连超时但浏览器能访问 | 受限网络需走代理 | undici `ProxyAgent` 逐请求注入（不依赖进程全局代理） |
| undici v7 `new ProxyAgent('http://...')` 无效 | **v7 必须传对象** | `new ProxyAgent({ uri })`；用"出口 IP 是否变化"验证 |
| 工具每次被校验拒绝 | 返回值与 output.schema 不一致 | 字段完全一致（见上） |
| 轮询偶发 `ECONNRESET` | 代理链路不稳 | 轮询 GET 有限重试（3 次递增间隔）；先查任务状态再下结论 |
| 参考图没有公网 URL | 只有本地路径/聊天附件 | 附件与本地文件方案（http-client.md） |
| 长任务前端白屏 | 无渲染反馈 | 骨架屏加载占位 → 完成后挂卡片（browser-side.md）；面板轮询进度（dsh-seedance-studio 用 2s setInterval） |
| 任务真超时了结果却成功 | 网络误报 | 先查任务状态接口再判定失败；幂等登记防重复 |
| 报价超过预算还继续跑 | 没有费用护栏 | 单次积分/金额上限（如 maxCredits），超限直接拒绝，绝不静默扣费；先 `dryRun` 看命令 |
| 模型名/参数写死后服务端变了 | 平台模型会更新 | 模型与分辨率以 CLI/HTTP 的实时 `model list` 为准，代码不写死 |

> 先独立验证外部 API 本身（脚本直调、确认 key、确认代理），再联调插件——把"API 可用性"和"插件代码正确性"分开排查。

## 调试技巧

- **最小复现**：先跑骨架（或一个只有 apply+console.log 的插件）确认加载，再逐步加功能。
- **dump 检查**：`dsh --profile web --dump-config` 看注册；启动日志看插件加载/报错。
- **免额度联调**：dev-sandbox（隔离 DSH_HOME）+ mock-llm（假模型，还能故意喂 XSS/非法 op 验证健壮性）——build-test.md。
- **独立验证外部 API**：Python/Node 脚本直调，与插件返回比对。
- **看系统提示**：确认你的段落按预期 order 注入（可加临时日志打印组装结果）。
- **浏览器端**：`http://127.0.0.1:3080`，DevTools 看 iframe 报错；确认 client 产物 URL 返回 200。
- **对照真实蓝本**：骨架 `assets/plugin-skeleton/`（0.2.x 可运行）；历史案例 `assets/examples/`（0.1.x 构建链，API 思路仍可参考）。

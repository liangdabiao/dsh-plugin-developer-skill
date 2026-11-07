# 调外部 API 的工具：异步作业 + 轮询（含外部 CLI 与附件）

> 异步作业+轮询、可注入 fetch、undici ProxyAgent 的实战来源是旧出图案例（已由 dsh-seedance-studio 替代，经验沉淀在本篇）。**外部 CLI 集成**的现行案例见 `assets/examples/dsh-seedance-studio/`（即梦官方 CLI dreamina-canvas）。会话绑定、后台任务化见 host-integration.md。

## 目录
- [为什么不能同步请求](#为什么不能同步请求)
- [核心模式：异步作业 + 轮询](#核心模式异步作业--轮询)
- [可注入 fetch：测试与安全](#可注入-fetch测试与安全)
- [Cookie 与鉴权](#cookie-与鉴权)
- [配置与状态机](#配置与状态机)
- [受限网络：走代理](#受限网络走代理)
- [外部 CLI 型工具（dsh-seedance-studio 模式）](#外部-cli-型工具dsh-seedance-studio-模式)
- [附件与本地文件作工具输入](#附件与本地文件作工具输入)

## 为什么不能同步请求

外部服务（如 AI 课堂平台）生成内容往往要 30 秒~几分钟。工具执行若同步阻塞，会拖死整个模型调用。dsh 工具的正确姿势：**异步提交作业 → 轮询查询状态 → 完成后返回**。

## 核心模式：异步作业 + 轮询

```
execute(input)
  ├─ ① POST /jobs          提交作业 → 拿 jobId（作业 ID）
  ├─ ② 循环（间隔 pollIntervalMs，最多 maxWaitMs）：
  │      GET /jobs/{jobId}  查询状态
  │       ├─ running / queued → 继续等
  │       └─ succeeded / failed → 跳出
  └─ ③ 成功 → 组装 output + meta 返回；失败 → 返回结构化失败
```

```ts
async function waitForJob(api, jobId, config): Promise<JobResult> {
  const deadline = Date.now() + config.maxWaitMs;
  while (Date.now() < deadline) {
    const job = await api.getJob(jobId);
    if (job.status === "succeeded") return job;
    if (job.status === "failed") throw new Error(`作业失败：${job.error}`);
    await sleep(config.pollIntervalMs);
  }
  throw new Error(`作业超时（>${config.maxWaitMs}ms），请稍后重试`);
}
```

## 可注入 fetch：测试与安全

**不要把 `fetch` 写死。** 让 API 客户端接收可注入的 fetch 实现：

```ts
export function makeApiClient(config: Config, fetchImpl: typeof fetch = fetch) {
  return {
    async createJob(input) {
      const res = await fetchImpl(`${config.baseUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: config.accessCode },
        body: JSON.stringify(input),
      });
      return res.json();
    },
    // ...
  };
}
```

好处：
- **测试**：客户端测试时注入假的 `fetch`，模拟各种响应，无需真实网络（这是可测试性的关键）。
- **安全**：真实环境可用受限 fetch 注入访问控制；凭据（accessCode）从配置读取，不写死在代码里。

## Cookie 与鉴权

- 与第三方平台交互时，Cookie 会话需要**持久化保存**（存磁盘/配置），避免每次重建会话；同时注意过期与刷新。
- API 密钥/口令放在 `config`（preset/用户配置），**绝不打进代码或输出**；也不要打印/回显到工具 output。
- 处理 CORS：浏览器端不直连第三方 API，统一走 Node 端（后端）转发，避免跨域和凭据泄露。

## 配置与状态机

把"可调项"都做成插件 `Config`（schemastery z.object，带默认值与 description），用户可在 profile/补丁层覆盖：

| 配置项 | 默认值 | 建议 | 说明 |
| --- | --- | --- | --- |
| `baseUrl` | 第三方服务地址 | — | 可换服务/自建 |
| `accessCode` | 空 | — | 鉴权口令，勿硬编码 |
| `pollIntervalMs` | 5000 | **60000** | 轮询间隔：默认 5s 太密，长作业建议 60s |
| `maxWaitMs` | 600000 | — | 最大等待 10 分钟 |

**状态机**：作业状态（queued → running → succeeded / failed → 超时视为 failed）用显式状态机表达，避免散落的 if 判断；失败/超时都返回**结构化错误**（见 tool-plugin.md 错误处理），模型才能读懂并引导用户重试。

## 受限网络：走代理

有些外部 API（如部分图片/视频生成网关）在受限网络里**直连超时、必须走本地代理**。插件不能依赖进程全局代理，因为：
- 运行时改 `process.env.HTTPS_PROXY` 对已初始化的 fetch 无效（dispatcher 在启动时就固定了）；
- 插件要在各种宿主环境都能跑，代理应做成**可配置项**（`Config.proxyUrl`，缺省空 = 直连）。

用 undici `ProxyAgent` 逐请求注入 dispatcher：

```ts
import { fetch as undiciFetch, ProxyAgent } from 'undici'

export function makeFetch(proxyUrl?: string, fetchImpl: typeof fetch = fetch): typeof fetch {
  if (!proxyUrl) return fetchImpl
  // undici v7：必须传对象 { uri }，字符串形式不生效（会仍直连而超时）
  const dispatcher = new ProxyAgent({ uri: proxyUrl })
  return (input, init) => undiciFetch(input as RequestInfo, { ...init, dispatcher })
}
```

注意：**undici 要显式加进插件 `package.json` 依赖**，并在 tsdown 的 node 端 `bundle: ['undici']`（浏览器端不 import 它）。密钥/代理等敏感配置用环境变量注入（进程启动前设好），勿硬编码进代码或产物。验证代理是否真的生效：请求一个回显出口 IP 的服务（如 `api.ipify.org`），IP 变化即走代理成功。

> 完整工具骨架（含 output/meta 分离）见 [tool-plugin.md](tool-plugin.md)。外部生成 API/CLI 的现行案例见 `assets/examples/dsh-seedance-studio/`（官方 CLI + 画布 + 轮询终态 + 积分上限）。

## 外部 CLI 型工具（dsh-seedance-studio 模式）

外部能力自带官方 CLI 时（登录/画布/计费都由 CLI 管），工具在 Host 里用 `execFile` 驱动 CLI，而不是自己裸调 HTTP。`assets/examples/dsh-seedance-studio/`（即梦 dreamina-canvas）是完整范本：

- **多动作合一**：一个工具用 `action` 枚举覆盖一组相关操作（`init/read/update/list/env/login/canvas`），比散成十几个工具省 schema、模型也好选；工具内按 action 分派到 lib 层函数。
- **CLI 探活先行**：`action=env` 一次看清 CLI 版本/登录态/积分/模型列表；模型与分辨率**以 `model list` 实时结果为准**，不要在代码里写死。
- **费用护栏**：`maxCredits` 是单次积分上限（图片 10 / 视频默认 100），报价超过上限直接拒绝——**不会静默扣费**；支持 `dryRun: true` 先看将要执行的命令与参考顺序。
- **慢操作等终态**：生成在画布上建节点，工具轮询到终态再下载产物；排队中返回 pending 是正常态，不是错误（空态/等待态文案要写清楚）。
- **路径纪律**：产物路径断言在项目目录内（`assertInside`），越界直接拒绝。
- **自检不花钱**：`scripts/selftest.mjs` 只验证数据层、CLI 探活与 ffmpeg 拼接，不建节点、不耗积分。

## 附件与本地文件作工具输入

图生图类 API 需要"参考图"，但模型在 tool call 里拿不到 dsh 聊天上传的附件（内部 blob，无公网 URL）。旧出图案例的实测方案（经验仍有效）：

1. **本地文件路径 → data URI**：工具 `image_url` 参数同时支持公网 URL 和本地路径——execute 里检测非 `http(s)`/`data:` 开头就用 `node:fs` 读文件，转 `data:<mime>;base64,...` 传给 API（前提：API 支持 base64 data URI）。
2. **聊天附件 → 附件存储直读**：上传的附件落盘在 `<DSH_HOME>/attachments/v1/objects/<2hex>/<sha256>`（content-addressed、无扩展名）。工具参数支持特殊值 `"attachments"`：扫描该目录、按**文件头魔数**嗅探图片类型（PNG/JPEG/WebP/GIF）、取 mtime 最新的转 base64 data URI。
3. **系统提示配套**：明确告诉模型"用户通过上传按钮上传了参考图 → image_url 填 `attachments`，不要问用户要路径"（实测模型会照做）。
4. **已知坑**：附件去重（同图只存一次）导致 mtime 不随重传更新，多会话混用时"最近附件"可能不是刚传的图——把它写进工具 description 的"注意"里。

安全提醒：读本地文件前过路径校验（扩展名/大小上限），别把任意路径读取暴露给模型；base64 会进 API 请求，注意服务商的 body 大小限制。

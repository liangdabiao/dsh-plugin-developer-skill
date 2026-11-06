# HTTP 服务与本地数据持久化（webServer + $DSH_HOME）

> 依据：guizang 的 `lib/index.js`（safeFile/readJson 样板）、media-desk 的 `src/host.js`/`src/store.js`/`src/settings.js`（鉴权/双进程存储/密钥）、GeoChat 的 `native-assets.ts`（静态资源完整性）。

## 目录
- [ctx.webServer.register：前缀路由](#ctxwebserverregister前缀路由)
- [每请求鉴权三件套](#每请求鉴权三件套)
- [safeFile：静态文件防护](#safefile静态文件防护)
- [readJson：POST 防护](#readjsonpost-防护)
- [静态资源进阶：Range 与完整性](#静态资源进阶range-与完整性)
- [$DSH_HOME 数据目录模式](#dsh_home-数据目录模式)
- [设置与密钥存储](#设置与密钥存储)
- [一份逻辑两个入口](#一份逻辑两个入口)

## ctx.webServer.register：前缀路由

```js
ctx.effect(() =>
  ctx.webServer.register({
    kind: 'prefix',
    path: '/my-plugin',                    // 所有 /my-plugin/* 进这个 handler
    async handler(req, res) { /* 原生 Node req/res */ },
  }),
  'my-plugin: routes')
```

- 原生 Node `req`/`res`——自己分发路由（media-desk：一个 `route()` 函数按 method+path 分派）、自己写头。
- 插件页面（gallery/）与数据接口（`/api/*`）都从这一层出。
- 响应统一 `cache-control: no-store`（数据）或 `no-cache`（静态）；错误统一 `json(res, status, { error: message })` 兜底。

## 每请求鉴权三件套

**web 服务不替插件路由鉴权——每个请求都要自己走一遍**（media-desk 原话）。三件套：

```js
// ① 登录凭证：交给宿主 connection 服务判定；拿不到鉴权服务一律拒绝（fail closed）
export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })   // 返回数字=拒绝状态码，falsy=放行
}

// ② 跨站写保护：所有写请求检查 sec-fetch-site（读请求可放宽）
const site = req.headers['sec-fetch-site']
if (site && site !== 'same-origin' && site !== 'none') return reject403()

// ③ Origin↔Host 同源：带 Origin 头的请求必须同源
const origin = req.headers.origin
if (origin && origin !== `https://${req.headers.host}`) return reject403()
```

（guizang 的页面是同源静态服务 + 相对路径 fetch，安全靠 ②③ 而非 token；dsh-context 的 POST 路由由宿主 connection 层承担鉴权，插件不自管。）

## safeFile：静态文件防护

四步防护（guizang 样板，骨架已实现可直接抄）：

```js
export function safeFile(dir, rel) {
  try {
    if (rel.split(/[\\/]/).some((seg) => seg.startsWith('.'))) return null   // ① 拒点文件段
    const base = realpathSync(dir)                                            // ② realpath 目录
    const target = resolve(base, normalize(rel))
    if (target !== base && !target.startsWith(base + sep)) return null        // ③ 前缀检查
    if (!existsSync(target)) return null
    const real = realpathSync(target)                                          // ④ 文件 realpath 复核
    if (real !== target || !real.startsWith(base + sep) || !statSync(real).isFile()) return null  // 防符号链接逃逸
    return real
  } catch { return null }
}
```

**动态内容只放行登记过的目录**：伺服用户数据（如 guizang 的作品文件）时，先查登记库确认 `<id>` 存在，再 safeFile 对应 root——不是任意路径都能读。

## readJson：POST 防护

```js
function readJson(req, max = 16 * 1024) {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST') return reject(err(405, '只接受 POST'))
    if (!(req.headers['content-type'] || '').includes('application/json')) return reject(err(415, '要 JSON'))
    // …sec-fetch-site / Origin 同源检查（见上）…
    let size = 0; const chunks = []
    req.on('data', (c) => { size += c.length
      if (size > max) { req.destroy(); return reject(err(413, '请求体过大')) } chunks.push(c) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
                         catch { reject(err(400, 'JSON 解析失败')) } })
  })
}
```

上传通道单独放宽并设上限（media-desk：JSON 4MB / 上传 250MB），**必须配 MIME 白名单 + 魔数嗅探 + 文件名正则**（security.md）。

## 静态资源进阶：Range 与完整性

- **HTTP Range**（视频/大文件拖动进度条）：解析 `Range` 头返回 206 + `content-range`（media-desk `src/host.js` 有实现）。
- **完整性清单**（GeoChat 的离线资源做法）：构建时遍历资源文件生成 `manifest.json`（`{ [相对路径]: { size, sha256 } }`）；运行期伺服时：只允许 GET/HEAD（405+`Allow`）、拒绝 `\` `\0` `.` `..` 段、必须命中 manifest、`realpathSync`+前缀检查、**逐文件 sha256 校验**、响应带 `X-Content-Type-Options: nosniff` + ETag=sha256。

## $DSH_HOME 数据目录模式

```js
const dataDir = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'my-plugin')
```

完整纪律（骨架 `src/host.js` 已示范）：

1. **原子写**：写 `${file}.${pid}.tmp` 再 `renameSync`——进程中途崩溃不留半截文件；
2. **双进程 mtime 重读**：桌面版和网页版是两个 Host 进程共写一份。每次读 `statSync(file).mtimeMs`，变了才重新解析（进程内缓存一份）；
3. **进程内串行化**：promise 队列包住读-改-写（media-desk 的 `run(task)`），避免并发交错；
4. **文件损坏当空处理**，不崩插件；
5. 卸载插件不删数据目录——README 写明数据在哪、怎么删。

数据之外还可以写"宿主级"路径（各归其位）：

| 路径 | 用途 | 出处 |
| --- | --- | --- |
| `$DSH_HOME/<插件名>/` | 插件自有数据 | guizang/media-desk |
| `$DSH_HOME/skills/<name>/SKILL.md` | 导出用户级技能 | media-desk 的 exportSkill |
| `$DSH_HOME/attachments/v1/objects/<2hex>/<sha256>` | 聊天附件存储（content-addressed，只读） | 附件作为工具输入时 |

## 设置与密钥存储

**官方路径（凭证类）**：应用内登录/绑定流程的 token 等机密用 `ctx.credentials.modifyRecord()` 存记录（`inject` 声明 `'credentials'`），不进 Config。

**自管文件（第三方 API Key）**：media-desk 的 `Settings` 类是范本（宿主 credentials 表达不了第三方密钥时）：

- 设置文件与内容数据**分开**：`settings.json`（配置+密钥）vs `state.json`（业务数据）；
- **权限 600**：`writeFile(tmp, data, { mode: 0o600 })` + `chmod` + `rename`；
- **密钥不回传浏览器**：`publicSettings()` 只给 `hasKey: true` + `keyHint: 末四位`；
- **密钥不进日志**：错误信息过 `redact()` 把密钥替换成 `***`；
- 空值语义：提交空 apiKey = 不修改，`clearKey: true` 才删除；
- 输入归一化：baseUrl 去尾部 `/`、去 `/images/generations` 后缀、数字字段 clamp。
- 用户偏好类的轻配置（面板入口、时间范围）用宿主的 Config 机制（architecture.md）而非自管文件；自管文件适合密钥这类宿主 schema 表达不了的敏感项。

## 一份逻辑两个入口

模型走工具、用户走页面（或终端走 CLI），**读写同一份数据**：

```
lib/store.js        ← 全部读写逻辑（原子写/判重/列表）
  ├─ 工具 execute      （模型在对话里用）
  ├─ webServer /api    （页面 fetch）
  └─ scripts/xxx.mjs   （人手动跑，只做参数解析后调同一模块）
```

测试专门断言"工具写入 = 接口写入同一份"（骨架 `test/host.test.mjs` 有）。这一条能防住后续最常见的分叉 bug。

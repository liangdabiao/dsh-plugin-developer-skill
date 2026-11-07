// ============================================================================
// dsh 插件 Host 半边（Node 主进程）—— 纯 ESM、零构建，发布即源码。
//
// 加载方式：宿主读 cordis.patch.yml 的 insert 行 → 按 package.json 的 main
// import 本文件 → 调用 apply(ctx, config)。所有注册随插件生命周期自动清理。
//
// 本骨架演示一套完整闭环「备忘」：
//   工具 memo_add（模型在对话里记备忘）──┐
//   插件页面（用户在侧栏页面记备忘）────┤→ 同一份 $DSH_HOME 数据（一份逻辑两个入口）
//   SkillProvider（教模型按规范播报）     │
//   systemPrompt.section（教模型何时用工具）┘
// ============================================================================
import { homedir } from 'node:os'
import { join, dirname, normalize, resolve, sep } from 'node:path'
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync, realpathSync, createReadStream,
} from 'node:fs'
import Schema from '@deepseek-ai/schemastery'

export const name = 'your-plugin' // = cordis.patch.yml 的 id

// 依赖的宿主服务：Cordis 等它们全部就绪后才调用 apply
export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

// ---------------------------------------------------------------------------
// 用户配置（schemastery）。改配置会热替换插件：旧实例卸载、新实例加载。
// 判断标准：凡是两个部署可能想设不同值的，都应该是配置字段，不要硬编码。
// ---------------------------------------------------------------------------
export const Config = Schema.object({
  maxMemos: Schema.number().min(1).max(500).default(50).description('最多保留多少条备忘'),
  greeting: Schema.string().default('收到').description('工具回执的问候语'),
})

// ---------------------------------------------------------------------------
// 数据目录：$DSH_HOME/<插件名>/。DSH_HOME 缺省 ~/.dsh，与桌面版默认值一致。
// 模型的 bash 跑在沙箱里写不了工作区外，所以数据读写必须走 Host（工具/HTTP）。
// ---------------------------------------------------------------------------
const dataDir = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), name)

/** 原子写：先写临时文件再 rename，进程中途崩溃也不会留下半截文件。 */
function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, file)
}

// 双进程安全读：桌面版和网页版是两个 Host 进程，可能同时改这份数据。
// 每次读都比较 mtime，变了就重读；进程内再缓存一份避免重复解析。
let memoCache = { mtimeMs: -1, list: [] }
function readMemos() {
  const file = join(dataDir(), 'memos.json')
  if (!existsSync(file)) return []
  const mtimeMs = statSync(file).mtimeMs
  if (mtimeMs !== memoCache.mtimeMs) {
    try {
      memoCache = { mtimeMs, list: JSON.parse(readFileSync(file, 'utf8')) }
    } catch {
      memoCache = { mtimeMs, list: [] } // 文件损坏当空处理，不让插件崩
    }
  }
  return memoCache.list
}

function addMemo(text, config) {
  const list = readMemos()
  const memo = { id: Date.now().toString(36), text: String(text).slice(0, 2000), createdAt: new Date().toISOString() }
  list.unshift(memo)
  writeJsonAtomic(join(dataDir(), 'memos.json'), list.slice(0, config.maxMemos))
  return memo
}

// ---------------------------------------------------------------------------
// 手写参数校验：原生注册的工具 dsh 不代验参数（用 defineTool 才代验），
// 所以 execute 里必须自己校验——错误消息写清楚，模型下一轮才能自纠。
// ---------------------------------------------------------------------------
function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.type === 'string' && typeof value !== 'string') problems.push(`${key} 要是字符串`)
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`${name}_memo_add 参数有误：${problems.join('；')}。`)
}

// apply 的 config 参数通过模块级 ref 暴露给工具 execute（工具定义在 apply 外）
const configRef = { config: Config }

// ---------------------------------------------------------------------------
// 工具：给模型的「动作」。注册后参数 schema 进系统提示，调用在 Host 进程执行。
// output 双通道：render 出的文本给模型（要短），presentationMeta 给浏览器渲染
// （写进持久化 meta，不占模型上下文，回放一致）。
// ---------------------------------------------------------------------------
export const memoAddTool = {
  name: 'your_plugin_memo_add',
  description:
    '把一条备忘写进用户的工作台备忘录。当用户说「记一下…」「帮我记住…」或要求保存任何待办时使用；' +
    '用户可以在侧栏「工作台」页面看到这些备忘。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: {
      text: { type: 'string', description: '备忘内容，一句话，最长 2000 字' },
    },
  },
  timeoutMs: 10_000,
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'id'],
      properties: {
        text: { type: 'string', description: '给模型看的回执' },
        id: { type: 'string', description: '备忘 id' },
      },
    },
    render: (_args, value) => [{ type: 'text', text: value.text }],
    // 浏览器端据此渲染卡片（见 src/client.js 的 toolview）
    presentationMeta: (_args, value) => ({ kind: 'your-plugin:memo', id: value.id }),
  },
  async execute(args, exec) {
    check(args, this.parameters)
    const text = typeof args.text === 'string' ? args.text.trim() : ''
    if (!text) throw new Error(`${name}_memo_add：text 不能为空。`)
    // exec 里还有 exec.signal（取消信号）、exec.agent.id（运行时分配的会话 id）——
    // 要做会话绑定时用它，绝不要接受模型在参数里自报的会话 id
    const memo = addMemo(text, configRef.config)
    return {
      text: `${configRef.config.greeting}，已记下：${memo.text.slice(0, 50)}。用户可以在侧栏「工作台」看到它。`,
      id: memo.id,
    }
  },
}

// ---------------------------------------------------------------------------
// 技能：给 AI 的「规范手册」。两级加载——list() 常驻候选（轻），get() 按需给正文（重）。
// description 决定模型何时加载这个技能，要写清「做什么 + 什么场景用」。
// ---------------------------------------------------------------------------
const SKILL_BODY = `# 备忘播报规范

当用户询问或整理备忘录内容时，按以下结构播报：

1. 先报条数（「你有 N 条备忘」）。
2. 逐条列出：时间 + 内容，最新的在前。
3. 结尾问一句是否需要新增、或删掉某条。

边界：只依据 \`your_plugin_memo_add\` 写入的真实数据，不要编造用户没记过的备忘。
`

export const memoSkillProvider = {
  name: 'your-plugin',
  list: () => [{
    name: 'your-plugin-briefing',
    description: '整理或播报「工作台备忘」内容时使用：统一播报结构（条数 → 逐条 → 追问）。',
    path: 'your-plugin-briefing',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
    provider: 'your-plugin',
    rank: 600, // 用户提供方排前面：用户自装同名 skill 时插件让位
    locator: 'your-plugin-briefing',
  }],
  async get(candidate) {
    return {
      name: candidate.name,
      description: candidate.description,
      invocation: candidate.invocation,
      source: 'bundled',
      provider: 'your-plugin',
      // addendum：把插件环境特有的事（数据目录、工具用法）追加给模型
      content: SKILL_BODY + `\n\n## 插件环境说明\n\n备忘数据由插件管理：写入用 \`your_plugin_memo_add\` 工具，读取用 \`your_plugin_memo_list\`。\n不要用 bash 或文件工具直接改数据目录（\`~/.dsh/${name}/\`），沙箱里写不进去。\n`,
    }
  },
}

// 备忘列表工具（读），与 memo_add 配对，演示"写/读成对"
export const memoListTool = {
  name: 'your_plugin_memo_list',
  description: '读取工作台备忘录的全部条目。用户问「我记了什么」「列出备忘」时使用。',
  parameters: { type: 'object', additionalProperties: false, properties: {} },
  timeoutMs: 10_000,
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'count'],
      properties: {
        text: { type: 'string' },
        count: { type: 'number' },
      },
    },
    render: (_args, value) => [{ type: 'text', text: value.text }],
  },
  async execute(args) {
    check(args, this.parameters)
    const list = readMemos()
    if (list.length === 0) {
      // 空状态不是错误：返回明确的空态文案，别让模型把空态当故障汇报
      return { text: '备忘录目前是空的。这不是错误，可以如实告诉用户还没有记录过备忘。', count: 0 }
    }
    const lines = list.map((m) => `- ${m.createdAt.slice(0, 16).replace('T', ' ')} ${m.text}`)
    return { text: `共 ${list.length} 条备忘：\n${lines.join('\n')}`, count: list.length }
  },
}

// ---------------------------------------------------------------------------
// HTTP：ctx.webServer.register 在 dsh 内置 web 服务上挂前缀路由，原生 req/res。
// 插件页面（gallery/）由它伺服；数据接口也在这一层。
// ---------------------------------------------------------------------------
const BASE = '/your-plugin' // 与 client.js 的 iframe src 对应

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
}

// 路径防护四步：拒点段 → realpath 目录 → normalize 前缀检查 → 文件 realpath 复核（防符号链接逃逸）
// 导出是为了测试。
export function safeFile(dir, rel) {
  try {
    if (rel.split(/[\\/]/).some((seg) => seg.startsWith('.'))) return null
    const base = realpathSync(dir)
    const target = resolve(base, normalize(rel))
    if (target !== base && !target.startsWith(base + sep)) return null
    if (!existsSync(target)) return null
    const real = realpathSync(target)
    if (real !== target || !real.startsWith(base + sep) || !statSync(real).isFile()) return null
    return real
  } catch {
    return null
  }
}

function serveFile(res, file) {
  const type = MIME[file.slice(file.lastIndexOf('.')).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, { 'content-type': type, 'content-length': statSync(file).size, 'cache-control': 'no-cache' })
  createReadStream(file).pipe(res)
}

// POST 防护：限 POST、限 JSON、校验 Origin↔Host 同源、限 16KB
function readJson(req) {
  return new Promise((resolve_, reject) => {
    if (req.method !== 'POST') return reject(Object.assign(new Error('只接受 POST'), { status: 405 }))
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      return reject(Object.assign(new Error('要 application/json'), { status: 415 }))
    }
    const site = req.headers['sec-fetch-site']
    if (site && site !== 'same-origin' && site !== 'none') {
      return reject(Object.assign(new Error('拒绝跨站请求'), { status: 403 }))
    }
    const origin = req.headers.origin
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
      return reject(Object.assign(new Error('Origin 与 Host 不同源'), { status: 403 }))
    }
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 16 * 1024) { req.destroy(); return reject(Object.assign(new Error('请求体过大'), { status: 413 })) }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve_(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(Object.assign(new Error('JSON 解析失败'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}

// 每请求鉴权：web 服务不替插件路由鉴权，每个请求都要自己走一遍登录凭证检查。
// 导出是为了测试。
export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主 webServer 已用 URL token 鉴权（无 token 401 在插件之前拦截）；服务缺席时放行，fail-closed 反而会把面板永久 403
  return connection.requestRejection({ headers: req.headers })
}

export function apply(ctx, config) {
  configRef.config = config

  // 注册工具（原生对象直接注册；也可用 @deepseek-ai/dsh-tools 的 defineTool，见 references/tool-plugin.md）
  ctx.tools.register(memoAddTool)
  ctx.tools.register(memoListTool)

  ctx.skills.registerProvider(() => memoSkillProvider)

  // 系统提示：教模型何时用工具。约定类段落放较大 order，避免干扰通用指令
  ctx.systemPrompt.section({
    name: `${name}:prompt`,
    order: 117,
    text: `## 备忘（${name}）\n用户要「记一下 / 帮我记住」任何事，调用 \`${name}_memo_add\` 工具；` +
      `用户问记过什么，调用 \`${name}_memo_list\`。播报遵循 ${name}-briefing 技能。`,
  })

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: BASE,
      async handler(req, res) {
        try {
          const rejection = requestRejection(ctx, req)
          if (typeof rejection === 'number') {
            return res.writeHead(rejection, { 'content-type': 'application/json; charset=utf-8' })
              .end(JSON.stringify({ error: '未授权' }))
          }
          const url = new URL(req.url, 'http://x')
          const path = url.pathname.slice(BASE.length) || '/'

          // 数据接口：与工具共用同一份数据（测试会断言这一点）
          if (path === '/api/memos' && req.method === 'GET') {
            return res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
              .end(JSON.stringify({ memos: readMemos(), maxMemos: config.maxMemos }))
          }
          if (path === '/api/memos' && req.method === 'POST') {
            const body = await readJson(req)
            const text = typeof body.text === 'string' ? body.text.trim() : ''
            if (!text) throw Object.assign(new Error('text 不能为空'), { status: 400 })
            const memo = addMemo(text, config)
            return res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
              .end(JSON.stringify({ ok: true, memo }))
          }
          if (path === '/api/memos/remove' && req.method === 'POST') {
            const body = await readJson(req)
            const rest = readMemos().filter((m) => m.id !== body.id)
            writeJsonAtomic(join(dataDir(), 'memos.json'), rest)
            return res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
              .end(JSON.stringify({ ok: true }))
          }

          // 静态文件：插件页面本体（gallery/）
          const rel = path === '/' ? 'index.html' : path.slice(1)
          const file = safeFile(join(import.meta.dirname, '..', 'gallery'), rel)
          if (file) return serveFile(res, file)
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'not found' }))
        } catch (err) {
          const status = typeof err?.status === 'number' ? err.status : 500
          res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
            .end(JSON.stringify({ error: err?.message || '内部错误' }))
        }
      },
    }),
    `${name}: routes`)
}

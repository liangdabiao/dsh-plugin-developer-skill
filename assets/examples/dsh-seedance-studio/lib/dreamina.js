// 即梦官方 CLI（dreamina-canvas）封装。
// 注意：这不是 npm 上的 jimeng-cli —— 官方 CLI 走 OAuth 登录、画布节点、积分审批和 operation 轮询。
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export class DreaminaError extends Error {
  constructor(message, { code = null, data = null } = {}) {
    super(message)
    this.name = 'DreaminaError'
    this.code = code
    this.data = data
  }
}

let cachedCli = null

function locate(exe) {
  return new Promise((resolve) => {
    const where = process.platform === 'win32' ? 'C:\\Windows\\System32\\where.exe' : 'which'
    execFile(where, [exe], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      if (err) return resolve('')
      const line = String(stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
      resolve(line && existsSync(line) ? line : '')
    })
  })
}

export async function resolveCli() {
  if (cachedCli) return cachedCli
  const candidates = [process.env.DREAMINA_CANVAS_CLI]
  if (process.platform === 'win32') {
    candidates.push(join(homedir(), 'bin', 'dreamina-canvas.exe'))
    candidates.push(join(process.env.LOCALAPPDATA || '', 'dreamina-canvas', 'dreamina-canvas.exe'))
  }
  candidates.push(await locate('dreamina-canvas'))
  const bin = candidates.find((p) => p && existsSync(p))
  if (!bin) {
    throw new DreaminaError('找不到即梦官方 CLI（dreamina-canvas）。用官方安装脚本装一次：irm https://jimeng.jianying.com/canvas-cli/install.ps1 | iex，然后填 DREAMINA_CANVAS_CLI。')
  }
  cachedCli = { bin, version: '' }
  try {
    const { data } = await call(['--format', 'json', 'version'])
    cachedCli.version = (data && data.version) || ''
  } catch {}
  return cachedCli
}

function redact(text) {
  return String(text || '').replace(/(access_token|deviceCode)"?\s*[:=]\s*"?[^\s",}]+/gi, '$1: ***')
}

export function runCli(args, { timeoutMs = 120_000 } = {}) {
  return resolveCli().then(({ bin }) => new Promise((resolve, reject) => {
    execFile(bin, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
      // stdin 一定关掉：CLI 在某些情况下会等交互输入，管道开着就会永久挂住
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
    }, (err, stdout, stderr) => {
      if (err && (err.killed || err.signal)) {
        return reject(new DreaminaError(`即梦 CLI 超时（${Math.round(timeoutMs / 1000)}s）`, { code: 'timeout' }))
      }
      resolve({ code: err && typeof err.code === 'number' ? err.code : 0, stdout: redact(stdout), stderr: redact(stderr) })
    })
  }))
}

// 官方 CLI 统一输出 { schemaVersion: "2", ok, data } 或 { ok:false, error:{ code, message, diagnostics } }
export function parseEnvelope(text) {
  const cleaned = String(text || '').trim()
  if (!cleaned) return null
  const start = cleaned.indexOf('{')
  if (start < 0) return null
  try { return JSON.parse(cleaned.slice(start)) } catch {}
  try { return JSON.parse(cleaned) } catch {}
  return null
}

const CODE_HINT = {
  1: '其它失败',
  2: '输入或请求有问题',
  10: '需要积分确认',
  11: '需要登录',
  13: '策略阻断',
  20: '操作未完成（不代表失败，先查同一个 operation）'
}

export function explainError(error, context = '') {
  if (!error) return context || '未知错误'
  const hints = []
  const detail = (error.diagnostics || []).map((d) => d.detail).filter(Boolean).join('；')
  if (error.reason === 'vip_membership_required') hints.push('这个模型需要会员权益')
  if (error.code === 11) hints.push('先 seedance_studio action=login 登录即梦')
  if (error.code === 10) hints.push('报价超过批准的积分上限：提高 maxCredits 或换便宜模型')
  if (error.code === 13) hints.push('服务端策略拒绝：换提示词或模型，重试同样的请求没用')
  const message = [context, error.message, detail, hints.join('；')].filter(Boolean).join('｜')
  return `${message}${error.code !== undefined && CODE_HINT[error.code] ? `（${CODE_HINT[error.code]}）` : ''}`
}

export async function call(args, options = {}) {
  const list = args[0] === '--format' ? [...args] : ['--format', 'json', ...args]
  if (!list.includes('--non-interactive')) list.splice(2, 0, '--non-interactive')
  const { code, stdout, stderr } = await runCli(list, options)
  const envelope = parseEnvelope(stdout)
  if (!envelope) {
    throw new DreaminaError(`${(stderr || stdout || '即梦 CLI 没有返回 JSON').split(/\r?\n/).filter(Boolean).slice(-1)[0]}`, { code })
  }
  if (envelope.ok === false) {
    const hint = envelope.creditConfirmation && envelope.creditConfirmation.minimumCreditCeiling
      ? `这次报价需要把积分上限提到至少 ${envelope.creditConfirmation.minimumCreditCeiling}`
      : ''
    throw new DreaminaError([explainError(envelope.error), hint].filter(Boolean).join('｜'), { code: envelope.error && envelope.error.code, data: envelope })
  }
  return { data: envelope.data || {}, meta: envelope.meta || {}, code }
}

// ---------- 认证 ----------

export async function authStatus() {
  const { data } = await call(['auth', 'status'], { timeoutMs: 20_000 })
  return data
}

export async function authAccount() {
  const { data } = await call(['auth', 'account'], { timeoutMs: 25_000 })
  return data
}

export async function startLogin() {
  const { data } = await call(['--non-interactive', 'auth', 'login'], { timeoutMs: 30_000 })
  if (data.status === 'logged_in') return { already: true, data }
  const challenge = data.challenge || {}
  return { already: false, challenge, raw: data }
}

// 官方要求：拿到 challenge 之后必须 auth wait --device-code，不能用 auth status 轮询。
export async function waitLogin(deviceCode, { timeoutMs = 300_000 } = {}) {
  const { data } = await call(['--non-interactive', 'auth', 'wait', '--device-code', deviceCode], { timeoutMs })
  return data
}

export function readPendingLogin() {
  try {
    return JSON.parse(readFileSync(join(tmpdir(), 'dsh-seedance-login.json'), 'utf8'))
  } catch {
    return null
  }
}

export function savePendingLogin(value) {
  const file = join(tmpdir(), 'dsh-seedance-login.json')
  if (!value) {
    try { rmSync(file, { force: true }) } catch {}
    return
  }
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  try { renameSync(tmp, file) } catch { try { rmSync(tmp, { force: true }) } catch {} }
}

// ---------- 模型 ----------

let modelCache = null
let modelCacheAt = 0

export async function listModels(type) {
  if (!modelCache || Date.now() - modelCacheAt > 10 * 60_000) {
    const { data } = await call(['model', 'list', '--type', 'image'], { timeoutMs: 40_000 })
    const image = data.items || []
    const videoData = await call(['model', 'list', '--type', 'video'], { timeoutMs: 40_000 })
    modelCache = { image, video: videoData.data.items || [] }
    modelCacheAt = Date.now()
  }
  return type ? modelCache[type] || [] : modelCache
}

export async function resolveModel(name, type) {
  const items = await listModels(type)
  if (!name) return items[0]
  const key = String(name).toLowerCase()
  const hit = items.find((m) => String(m.model).toLowerCase() === key || String(m.displayName || '').toLowerCase() === key || (m.aliases || []).some((a) => String(a).toLowerCase() === key))
  if (hit) return hit
  const partial = items.filter((m) => String(m.model).toLowerCase().includes(key) || String(m.displayName || '').toLowerCase().includes(key))
  if (partial.length === 1) return partial[0]
  throw new DreaminaError(`没有这个${type === 'video' ? '视频' : '图片'}模型：${name}。可用：${items.map((m) => m.model).join('、')}`)
}

export function modelMode(model, mode) {
  return (model.modes || []).find((m) => m.name === mode)
}

// ---------- 画布 ----------

export async function createCanvas(name) {
  const { data } = await call(['canvas', 'create', name, '--use'], { timeoutMs: 40_000 })
  const project = data.project || {}
  return { id: project.projectId, url: project.webUrl, name: project.name }
}

export async function ensureCanvas(dir, project, title) {
  if (project.canvas && project.canvas.id) return project.canvas
  const created = await createCanvas(title || project.title || '上美影短剧')
  project.canvas = { id: created.id, url: created.url, createdAt: new Date().toISOString() }
  return project.canvas
}

// ---------- 生成 ----------

function maxCreditsOption(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export async function createImageNode({ projectId, model, prompt, ratio, resolution, title, maxCredits, count = 1, timeoutMs = 540_000, dryRun = false }) {
  const args = ['node', 'create', 'image', '--project-id', projectId, '--model', model, '--mode', 't2i', '--prompt', prompt, '--ratio', ratio, '--resolution', resolution, '--count', String(count), '--title', title]
  if (dryRun) args.push('--dry-run')
  else {
    args.push('--run', '--wait', '--timeout', '8m', '--interval', '5s')
    const ceiling = maxCreditsOption(maxCredits)
    if (ceiling) args.push('--credit-ceiling', String(ceiling))
  }
  return call(args, { timeoutMs })
}

export async function createVideoNode({ projectId, model, prompt, ratio, resolution, duration, refs = [], maxCredits, title, timeoutMs = 1_000_000, dryRun = false }) {
  const mode = refs.length ? 'm2v' : 't2v'
  const args = ['node', 'create', 'video', '--project-id', projectId, '--model', model, '--mode', mode, '--prompt', prompt, '--ratio', ratio, '--resolution', resolution, '--duration', String(duration)]
  if (title) args.push('--title', title)
  for (const ref of refs) args.push('--ref', `node:${ref}`)
  if (dryRun) args.push('--dry-run')
  else {
    args.push('--run', '--wait', '--timeout', '15m', '--interval', '5s')
    const ceiling = maxCreditsOption(maxCredits)
    if (ceiling) args.push('--credit-ceiling', String(ceiling))
  }
  return call(args, { timeoutMs })
}

export function pickResource(data) {
  const submission = data.submission || {}
  const resources = submission.resources || []
  const done = resources.filter((r) => r.state === 'succeeded' || r.state === 'success')
  const pick = (done.length ? done : resources)[0]
  return pick || null
}

export async function downloadResource(projectId, resourceId, outFile) {
  mkdirSync(dirname(outFile), { recursive: true })
  const { data } = await call(['resource', 'download', resourceId, '-o', outFile, '--project-id', projectId], { timeoutMs: 180_000 })
  return data
}

export async function nodeShow(projectId, nodeId) {
  const { data } = await call(['node', 'show', '--project-id', projectId, '--node-id', nodeId], { timeoutMs: 40_000 })
  return data
}

export function creditInfo(account) {
  if (!account) return null
  return { availableCredits: account.availableCredits, vip: account.isVip, vipLevel: account.vipLevel, displayName: account.displayName }
}

// 插件的 HTTP 半边：给侧栏「短剧工坊」页面用。
// GET 只读（项目、媒体、健康状态）；POST /api/generate 会真的调即梦生成，但仍然走工具那条代码路径，
// 所以路径校验、积分上限、错误分类和模型侧完全一致。
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, sep } from 'node:path'
import { authAccount, authStatus, resolveCli } from './dreamina.js'
import { resolveFfmpeg } from './ffmpeg.js'
import { fileSummary, listProjects, readProject, resolveDir } from './project.js'
import { TOOLS } from './tools.js'

const BASE = '/seedance-studio'
const TOOL = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.md': 'text/markdown; charset=utf-8'
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

// 文件只允许从「有 project.json 的目录」里读，且必须在这个目录内。
function projectRootOf(file) {
  let dir = dirname(file)
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, 'project.json'))) return realpathSync(dir)
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

function serve(res, file) {
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, { 'content-type': type, 'content-length': statSync(file).size, 'cache-control': 'no-cache' })
  createReadStream(file).pipe(res)
}

// 只接受同源页面发来的 JSON
function readJson(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const origin = req.headers.origin
    if (req.method !== 'POST') return reject(Object.assign(new Error('method'), { status: 405 }))
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('需要 JSON'), { status: 415 }))
    if (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host) return reject(Object.assign(new Error('origin'), { status: 403 }))
    let size = 0
    const chunks = []
    req.on('data', (c) => { size += c.length; if (size > max) req.destroy(); else chunks.push(c) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(Object.assign(e, { status: 400 })) } })
    req.on('error', reject)
  })
}

// 生成任务放内存：页面轮询 /api/job 拿进度。工具本身是同步等待的，这里只是包一层。
const jobs = new Map()
let seq = 0

function startJob(kind, args) {
  const id = `job-${Date.now().toString(36)}-${++seq}`
  const job = { id, kind, status: 'running', startedAt: new Date().toISOString(), args: { ...args, project: args.project } }
  jobs.set(id, job)
  if (jobs.size > 40) jobs.delete(jobs.keys().next().value)
  const tool = kind === 'asset' ? TOOL.jimeng_asset : kind === 'episode' ? TOOL.jimeng_episode : TOOL.seedance_assemble
  Promise.resolve()
    .then(() => tool.execute(args))
    .then((r) => {
      job.status = r.ok ? 'done' : 'failed'
      job.summary = r.summary
      job.data = r.data || ''
    })
    .catch((err) => {
      job.status = 'failed'
      job.error = String((err && err.message) || err)
    })
    .finally(() => { job.finishedAt = new Date().toISOString() })
  return job
}

export function registerApi(ctx) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    async handler(req, res) {
      try {
        const url = new URL(req.url || '/', 'http://x')
        const rest = decodeURIComponent(url.pathname.slice(BASE.length)) || '/'

        if (rest === '/health') {
          const [cli, auth, ffmpeg] = await Promise.all([
            resolveCli().then((x) => ({ bin: x.bin, version: x.version })).catch((err) => ({ error: err.message })),
            authStatus().then(async (status) => {
              if (!status.loggedIn) return { loggedIn: false }
              const account = await authAccount().catch(() => null)
              return { loggedIn: true, displayName: account && account.displayName, credits: account && account.availableCredits, vip: account && account.isVip }
            }).catch((err) => ({ error: err.message })),
            resolveFfmpeg().then((x) => x).catch((err) => ({ error: err.message }))
          ])
          const version = (() => { try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version } catch { return null } })()
          return json(res, 200, { ok: true, version, cli, auth, ffmpeg })
        }

        if (rest === '/api/generate' && req.method === 'POST') {
          let body
          try { body = await readJson(req) } catch (err) { return json(res, err.status || 400, { ok: false, error: err.message }) }
          const kind = body.kind === 'episode' ? 'episode' : body.kind === 'asset' ? 'asset' : body.kind === 'assemble' ? 'assemble' : null
          if (!kind) return json(res, 400, { ok: false, error: 'kind 只能是 asset、episode 或 assemble' })
          let dir
          try { dir = resolveDir(String(body.project || '')) } catch (err) { return json(res, 400, { ok: false, error: err.message }) }
          if (!existsSync(join(dir, 'project.json'))) return json(res, 400, { ok: false, error: '这个目录没有 project.json' })
          if (kind === 'asset') {
            const ids = Array.isArray(body.ids) ? body.ids.map(String) : undefined
            const job = startJob('asset', { action: 'generate', project: dir, ids, maxCredits: Number(body.maxCredits) || 10 })
            return json(res, 200, { ok: true, job: job.id })
          }
          if (kind === 'assemble') {
            const job = startJob('assemble', { project: dir, out: body.out ? String(body.out) : undefined })
            return json(res, 200, { ok: true, job: job.id })
          }
          const job = startJob('episode', {
            action: 'generate',
            project: dir,
            episode: body.episode ? String(body.episode) : undefined,
            maxCredits: Number(body.maxCredits) || 100
          })
          return json(res, 200, { ok: true, job: job.id })
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false, error: '只读接口' })

        if (rest === '/api/job') {
          const id = url.searchParams.get('id')
          const job = id && jobs.get(id)
          return job ? json(res, 200, { ok: true, job }) : json(res, 404, { ok: false, error: '没有这个任务' })
        }

        if (rest === '/api/projects') {
          const dir = url.searchParams.get('dir')
          if (!dir || !isAbsolute(dir)) return json(res, 400, { ok: false, error: 'dir 必须是绝对路径' })
          if (!existsSync(dir)) return json(res, 400, { ok: false, error: `目录不存在：${dir}` })
          return json(res, 200, { ok: true, projects: listProjects(resolveDir(dir)) })
        }

        if (rest === '/api/project') {
          const path = url.searchParams.get('path')
          if (!path || !isAbsolute(path)) return json(res, 400, { ok: false, error: 'path 必须是绝对路径' })
          const dir = resolveDir(path)
          const project = readProject(dir)
          return json(res, 200, { ok: true, path: dir, project, files: fileSummary(dir, project) })
        }

        if (rest === '/media') {
          const target = url.searchParams.get('path')
          if (!target || !isAbsolute(target) || !existsSync(target)) return json(res, 404, { ok: false, error: 'not found' })
          const file = realpathSync(target)
          const root = projectRootOf(file)
          if (!root || !(file === root || file.startsWith(root + sep))) return json(res, 403, { ok: false, error: 'forbidden' })
          if (!statSync(file).isFile()) return json(res, 404, { ok: false, error: 'not found' })
          return serve(res, file)
        }

        return json(res, 404, { ok: false, error: 'not found' })
      } catch (err) {
        return json(res, 500, { ok: false, error: String((err && err.message) || err) })
      }
    }
  })
}

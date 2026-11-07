// 注册给模型的四个工具。Host 进程执行，调用即梦官方 CLI（dreamina-canvas）。
// 生成走「画布节点」：资产 = 图片节点，每集 = 视频节点（m2v，引用资产节点），产物下载回项目目录。
import { existsSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { concatEpisodes, ffmpegInfo, probeDuration, resolveFfmpeg } from './ffmpeg.js'
import {
  authAccount, authStatus, createImageNode, createVideoNode, downloadResource, ensureCanvas, listModels, pickResource,
  readPendingLogin, resolveCli, resolveModel, savePendingLogin, startLogin, waitLogin, DreaminaError, nodeShow
} from './dreamina.js'
import {
  assertInside, fileSummary, initProject, listProjects, ProjectError, readProject, resolveDir, saveProject, updateProject
} from './project.js'

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const arr = (description) => ({ type: 'array', description, items: { type: 'string' } })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string' },
      data: { type: 'string' }
    }
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary)
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

function failSummary(err) {
  return err instanceof ProjectError || err instanceof DreaminaError ? err.message : String(err && err.message || err)
}

function requireString(args, key) {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少 ${key}`)
  return value.trim()
}

function optionalString(args, key) {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function bounded(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

// 保证项目有画布：直接在同一份 project 对象上挂 canvas 再落盘，避免读两次盘出现两份对象。
async function attachCanvas(dir, project) {
  const canvas = await ensureCanvas(dir, project, project.title)
  project.canvas = canvas
  saveProject(dir, project)
  return canvas
}

// ---------- 工具 1：项目 ----------

const STUDIO_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: str('init 建项目；read 读状态；update 合并 patch；list 列项目；env 查即梦登录/积分/模型；login 取登录链接；login-check 检查登录；canvas 建/绑定画布', { enum: ['init', 'read', 'update', 'list', 'env', 'login', 'login-check', 'canvas'] }),
    path: str('项目目录绝对路径（init 时可尚不存在）'),
    parent: str('list 时扫描的父目录绝对路径'),
    title: str('剧名 / 画布名'),
    aspect: str('画幅', { enum: ['9:16', '16:9', '21:9', '1:1', '3:4', '4:3'] }),
    episodes: num('集数，默认 5'),
    episodeSeconds: num('每集秒数，默认 15'),
    paletteZh: str('剧组色盘中文串'),
    paletteEn: str('剧组色盘英文串'),
    stylePreset: str('上美影子风格：smy-handdrawn / smy-ink / smy-papercut / smy-dunhuang'),
    model: str('视频模型，默认 seedance_2.5'),
    imageModel: str('图片模型，默认 seedream_4.5'),
    patch: str('update 时的 JSON 字符串；assets/episodes 数组整体替换，其余对象浅合并')
  }
}

export const studioTool = {
  name: 'seedance_studio',
  description: '上美影短剧项目入口：建项目、读进度、把资产/分镜登记进 project.json；也负责即梦登录（官方 dreamina-canvas CLI）、查积分、建画布。所有 path 都要绝对路径。',
  parameters: STUDIO_PARAMS,
  timeoutMs: 6 * 60_000,
  output: OUTPUT,
  async execute(args) {
    const action = requireString(args, 'action')

    if (action === 'login') {
      const pending = readPendingLogin()
      if (pending && pending.expiresAt && Date.parse(pending.expiresAt) > Date.now() + 30_000) {
        return result(true, '已有一个待授权的登录链接', [`打开：${pending.verificationUriComplete}`, `授权后调用 seedance_studio action=login-check。`, `链接 ${pending.expiresAt} 过期。`].join('\n'))
      }
      const { already, challenge } = await startLogin()
      if (already) return result(true, '已经登录', '可以直接开始生成。')
      const record = {
        deviceCode: challenge.deviceCode,
        verificationUriComplete: challenge.verificationUriComplete || challenge.verificationUri,
        expiresAt: challenge.expiresAt,
        createdAt: new Date().toISOString()
      }
      // 官方 CLI 还会落一份本地待授权记录；这里只存非敏感字段
      savePendingLogin(record)
      return result(true, '需要你在浏览器里授权', [
        `打开这个链接并扫码/确认：${record.verificationUriComplete}`,
        `授权完成后调用 seedance_studio action=login-check（链接 ${record.expiresAt} 过期）。`,
        '如果已经登录过，action=login-check 会直接读出账号。'
      ].join('\n'))
    }

    if (action === 'login-check') {
      const pending = readPendingLogin()
      if (pending && pending.deviceCode) {
        try {
          const data = await waitLogin(pending.deviceCode, { timeoutMs: 120_000 })
          if (data && data.status === 'logged_in') savePendingLogin(null)
        } catch (err) {
          const status = await authStatus().catch(() => null)
          if (!status || !status.loggedIn) {
            return result(false, '还没授权完成', `${failSummary(err)}\n链接：${pending.verificationUriComplete}`)
          }
        }
      }
      const status = await authStatus()
      if (!status.loggedIn) return result(false, '当前未登录', '先 seedance_studio action=login 拿授权链接。')
      const account = await authAccount().catch(() => null)
      return result(true, '已登录', `账号：${account ? account.displayName : '（未知）'}｜可用积分：${account ? account.availableCredits : '?'}${account && account.isVip ? `｜会员 ${account.vipLevel}` : ''}`)
    }

    if (action === 'env') {
      const lines = []
      let loggedIn = false
      try {
        const cli = await resolveCli()
        const status = await authStatus()
        loggedIn = Boolean(status.loggedIn)
        lines.push(`即梦 CLI：dreamina-canvas v${cli.version || status.version || '?'}（官方版）`)
        lines.push(loggedIn ? '登录：是' : '登录：否 —— 用 action=login 取授权链接')
        if (loggedIn) {
          const account = await authAccount().catch(() => null)
          if (account) lines.push(`账号：${account.displayName}｜积分：${account.availableCredits}${account.isVip ? `｜会员 ${account.vipLevel}` : ''}`)
        }
      } catch (err) {
        lines.push(`即梦 CLI：不可用 — ${failSummary(err)}`)
      }
      try {
        const models = await listModels()
        lines.push(`模型：图片 ${models.image.length} 个（${models.image.slice(0, 4).map((m) => m.model).join('、')}…），视频 ${models.video.length} 个（${models.video.slice(0, 4).map((m) => m.model).join('、')}…）`)
      } catch (err) {
        lines.push(`模型列表：不可用 — ${failSummary(err)}`)
      }
      try {
        await resolveFfmpeg()
        lines.push(`ffmpeg：${ffmpegInfo().ffmpeg}`)
      } catch (err) {
        lines.push(`ffmpeg：不可用 — ${failSummary(err)}`)
      }
      return result(loggedIn, loggedIn ? '环境就绪' : '还没登录', lines.join('\n'))
    }

    if (action === 'init') {
      const dir = resolveDir(requireString(args, 'path'), { mustExist: false })
      const project = initProject({
        path: dir,
        title: optionalString(args, 'title'),
        aspect: optionalString(args, 'aspect'),
        episodes: args.episodes,
        paletteZh: optionalString(args, 'paletteZh'),
        paletteEn: optionalString(args, 'paletteEn'),
        stylePreset: optionalString(args, 'stylePreset'),
        episodeSeconds: args.episodeSeconds,
        model: optionalString(args, 'model'),
        imageModel: optionalString(args, 'imageModel')
      })
      return result(true, `已建项目：${project.title}（${dir}）`, [
        `画幅 ${project.video.aspect}，${project.episodes.length} 集 × ${project.video.episodeSeconds}s`,
        `色盘：${project.style.palette.zh || '（待填）'}`,
        '下一步：写 剧本.md / 素材清单.md / E01_分镜.md，再用 update 登记 assets 和 episodes；生成前会自动建即梦画布。'
      ].join('\n'))
    }

    if (action === 'list') {
      const parent = resolveDir(optionalString(args, 'parent') || requireString(args, 'path'))
      const projects = listProjects(parent)
      const lines = projects.map((p) => `- ${p.title || '(未命名)'} — ${p.doneEpisodes}/${p.episodes} 集，资产 ${p.doneAssets}/${p.assets}｜${p.path}`)
      return result(true, `${parent} 下有 ${projects.length} 个项目`, lines.join('\n') || '（空）')
    }

    const dir = resolveDir(requireString(args, 'path'))

    if (action === 'canvas') {
      const project = readProject(dir)
      const canvas = await attachCanvas(dir, project)
      return result(true, `画布已就绪：${project.title}`, `projectId：${canvas.id}\n画布链接：${canvas.url}\n（所有图片/视频节点都建在这张画布上，方便在即梦里继续改）`)
    }

    if (action === 'read') {
      const project = readProject(dir)
      const files = fileSummary(dir, project)
      const lines = [
        `《${project.title}》${project.video.aspect} · ${project.video.episodeSeconds}s × ${project.episodes.length} 集`,
        `色盘：${project.style.palette.zh || '（未填）'}`,
        `画布：${project.canvas ? project.canvas.url : '（还没建，生成时自动建）'}`,
        `资产 ${files.assets.length}：${files.assets.map((a) => `${a.id}=${a.status}`).join(' ') || '（空）'}`,
        `集数：${files.episodes.map((e) => `${e.id}[${e.video.status}]`).join(' ')}`
      ]
      return result(true, '已读取', lines.join('\n'))
    }

    if (action === 'update') {
      const raw = requireString(args, 'patch')
      let patch
      try { patch = JSON.parse(raw) } catch (err) { throw new Error(`patch 不是合法 JSON：${err.message}`) }
      const project = updateProject(dir, patch)
      const files = fileSummary(dir, project)
      const noPrompt = files.assets.filter((a) => !a.promptChars).map((a) => a.id)
      return result(true, '已更新 project.json', [`资产 ${files.assets.length}｜集 ${files.episodes.length}`, noPrompt.length ? `缺 prompt 的资产：${noPrompt.join('、')}` : ''].filter(Boolean).join('\n'))
    }

    throw new Error(`未知 action：${action}`)
  }
}

// ---------- 工具 2：资产出图 ----------

const ASSET_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'project'],
  properties: {
    action: str('generate 按资产编号出图（会等待出图完成并下载）；retry 重出失败/指定的；status 看状态；collect 从画布补收已生成但没下载的', { enum: ['generate', 'retry', 'status', 'collect'] }),
    project: str('项目目录绝对路径'),
    ids: arr('要处理的资产编号，如 ["C01","S01"]；省略则处理所有待办'),
    ratio: str('覆盖画幅，如 3:4 / 16:9 / 21:9 / 1:1'),
    resolution: str('分辨率，默认 2K（seedream 支持 2K/4K）'),
    model: str('图片模型，默认 seedream_4.5'),
    maxCredits: num('单张图允许消耗的积分上限，默认 10；报价超过会拒绝执行'),
    dryRun: { type: 'boolean', description: '只演练：输出将要执行的命令，不建节点、不扣积分' }
  }
}

export const assetTool = {
  name: 'jimeng_asset',
  description: '用即梦官方 CLI 给项目里的 C/S/P 资产出图：在项目画布上建图片节点、等待生成、把图下载到 assets/。提示词取自 project.json 的 assets[].prompt。',
  parameters: ASSET_PARAMS,
  timeoutMs: 15 * 60_000,
  output: OUTPUT,
  async execute(args) {
    const action = requireString(args, 'action')
    const dir = resolveDir(requireString(args, 'project'))
    const ids = Array.isArray(args.ids) ? args.ids.map(String) : null
    const project = readProject(dir)
    const selected = (predicate) => project.assets.filter((a) => (ids ? ids.includes(a.id) : true)).filter(predicate)

    if (action === 'status') {
      const lines = project.assets.map((a) => `${a.id} ${a.status || 'idle'}${a.nodeId ? ` node=${a.nodeId}` : ''}${a.file ? ` → ${a.file}` : ''}${a.error ? ` ⚠ ${a.error}` : ''}`)
      return result(true, `资产 ${project.assets.length} 个`, lines.join('\n') || '（还没有资产，先 update）')
    }

    if (action === 'collect') {
      const canvas = project.canvas ? project.canvas.id : null
      if (!canvas) return result(false, '还没有画布', '先出图或 seedance_studio action=canvas')
      const pending = selected((a) => a.nodeId && !a.file)
      const lines = []
      for (const asset of pending) {
        try {
          const data = await nodeShow(canvas, asset.nodeId)
          const node = (data.nodes || [data.node] || []).find(Boolean)
          const resources = (node && node.resources) || []
          const done = resources.find((r) => r.state === 'succeeded') || resources[0]
          if (!done) { lines.push(`${asset.id} 还没有产物`); continue }
          const file = join(dir, 'assets', `${asset.id}.png`)
          await downloadResource(canvas, done.resourceId, file)
          Object.assign(asset, { status: 'done', resourceId: done.resourceId, file: relative(dir, file), error: null })
          lines.push(`${asset.id} ✓ ${relative(dir, file)}`)
        } catch (err) {
          lines.push(`${asset.id} ⚠ ${failSummary(err)}`)
        }
        saveProject(dir, project)
      }
      return result(true, '补收完成', lines.join('\n') || '（没有待补收的资产）')
    }

    if (action !== 'generate' && action !== 'retry') throw new Error(`未知 action：${action}`)

    const modelName = optionalString(args, 'model') || project.image.model || 'seedream_4.5'
    const resolution = optionalString(args, 'resolution') || '2K'
    const maxCredits = bounded(args.maxCredits, 10, 1, 500)
    const targets = selected((a) => (action === 'retry' ? a.status !== 'done' || args.ids : a.status !== 'done'))
    const runnable = targets.filter((a) => String(a.prompt || '').trim())
    if (!runnable.length) return result(false, '没有可出图的资产', '（都已完成，或资产里没有 prompt）')

    const model = await resolveModel(modelName, 'image').catch((err) => { throw new Error(failSummary(err)) })

    if (args.dryRun) {
      const lines = runnable.map((a) => `${a.id}：node create image --model ${model.model} --ratio ${optionalString(args, 'ratio') || a.ratio || '3:4'} --resolution ${resolution} --mode t2i --run --wait（prompt ${String(a.prompt).length} 字）`)
      return result(true, `演练：${lines.length} 个图片节点（未创建、未扣积分）`, lines.join('\n'))
    }

    const canvas = await attachCanvas(dir, project)
    const lines = []
    const failures = []
    for (const asset of runnable) {
      const ratio = optionalString(args, 'ratio') || asset.ratio || '3:4'
      try {
        const { data } = await createImageNode({
          projectId: canvas.id,
          model: model.model,
          prompt: String(asset.prompt),
          ratio,
          resolution,
          title: `${asset.id} ${asset.name || ''}`.trim().slice(0, 80),
          maxCredits
        })
        const nodeId = data.node && data.node.nodeId
        const credits = data.quote && data.quote.maxCredits
        const resource = pickResource(data)
        if (!resource) throw new Error('节点跑完但没有拿到资源')
        const file = join(dir, 'assets', `${asset.id}.png`)
        await downloadResource(canvas.id, resource.resourceId, file)
        Object.assign(asset, { status: 'done', nodeId, resourceId: resource.resourceId, file: relative(dir, file), credits, error: null })
        lines.push(`${asset.id} ✓ ${(credits ? `${credits} 积分，` : '')}${relative(dir, file)}`)
      } catch (err) {
        Object.assign(asset, { status: 'failed', error: failSummary(err).slice(0, 300) })
        failures.push(`${asset.id}：${asset.error}`)
      }
      saveProject(dir, project)
    }
    const data = [lines.join('\n'), failures.length ? `失败：\n${failures.join('\n')}` : ''].filter(Boolean).join('\n\n')
    return result(failures.length === 0, failures.length ? '部分资产出图失败' : `已出图 ${lines.length} 张`, data)
  }
}

// ---------- 工具 3：单集出片 ----------

const EPISODE_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'project'],
  properties: {
    action: str('generate 出片并等待下载；status 看状态；collect 从画布补收', { enum: ['generate', 'status', 'collect'] }),
    project: str('项目目录绝对路径'),
    episode: str('集号，如 E01'),
    prompt: str('本集 Seedance 提示词（时间轴格式）；省略则用 project.json 里该集的 prompt'),
    mode: str('auto 有参考图走 m2v、没有走 t2v', { enum: ['auto', 'm2v', 't2v'] }),
    refs: arr('参考资产编号，按顺序；省略用 project.json 该集的 refs'),
    duration: num('秒数，默认取项目设置'),
    resolution: str('分辨率，默认 720p（seedance_2.5 支持 480p/720p/1080p）'),
    model: str('视频模型，默认 seedance_2.5'),
    maxCredits: num('单集允许消耗的积分上限，默认 100'),
    dryRun: { type: 'boolean', description: '只演练：输出将要执行的命令，不建节点、不扣积分' }
  }
}

export const episodeTool = {
  name: 'jimeng_episode',
  description: '用即梦官方 CLI 出某一集视频（Seedance）：资产图按顺序作为参考，出片后把 mp4 下载到 videos/。第 2 集起可以引用上一集视频节点做延续。',
  parameters: EPISODE_PARAMS,
  timeoutMs: 20 * 60_000,
  output: OUTPUT,
  async execute(args) {
    const action = requireString(args, 'action')
    const dir = resolveDir(requireString(args, 'project'))
    const project = readProject(dir)

    if (action === 'status') {
      const lines = project.episodes.map((e) => `${e.id} ${(e.video && e.video.status) || 'idle'}${e.video && e.video.nodeId ? ` node=${e.video.nodeId}` : ''}${e.video && e.video.file ? ` → ${e.video.file}` : ''}`)
      return result(true, `共 ${project.episodes.length} 集`, lines.join('\n'))
    }

    const episodeId = optionalString(args, 'episode') || (project.episodes[0] && project.episodes[0].id)
    if (!episodeId) throw new Error('项目里还没有集，先 update episodes')
    const index = project.episodes.findIndex((e) => e.id === episodeId)
    if (index < 0) throw new Error(`没有这一集：${episodeId}`)
    const episode = project.episodes[index]

    if (action === 'collect') {
      if (!project.canvas || !episode.video || !episode.video.nodeId) return result(false, '没有可补收的节点', '先 generate')
      const data = await nodeShow(project.canvas.id, episode.video.nodeId)
      const node = (data.nodes || [data.node] || []).find(Boolean)
      const resources = (node && node.resources) || []
      const done = resources.find((r) => r.state === 'succeeded') || resources[0]
      if (!done) return result(false, '节点还没有产物', '稍后再试')
      const file = join(dir, 'videos', `${episodeId}.mp4`)
      await downloadResource(project.canvas.id, done.resourceId, file)
      episode.video = { ...episode.video, status: 'done', resourceId: done.resourceId, file: relative(dir, file) }
      saveProject(dir, project)
      return result(true, `${episodeId} 已收片`, relative(dir, file))
    }

    if (action !== 'generate') throw new Error(`未知 action：${action}`)

    const prompt = optionalString(args, 'prompt') || episode.prompt
    if (!prompt) throw new Error('缺少 prompt：把本集分镜里的 Seedance 提示词传进来')
    const modelName = optionalString(args, 'model') || project.video.model || 'seedance_2.5'
    const resolution = optionalString(args, 'resolution') || '720p'
    const duration = bounded(args.duration, project.video.episodeSeconds, 4, 30)
    const maxCredits = bounded(args.maxCredits, 100, 1, 1000)
    const refIds = Array.isArray(args.refs) ? args.refs.map(String) : (episode.refs || [])
    if (refIds.length > 9) throw new Error('参考图最多 9 张（Seedance 2.5 的 m2v 上限更高，但保持和 skill 一致）')

    const model = await resolveModel(modelName, 'video')
    const refNodes = []
    for (const id of refIds) {
      const asset = project.assets.find((a) => a.id === id)
      if (!asset) throw new Error(`项目里没有这个资产：${id}`)
      if (!asset.nodeId) throw new Error(`资产 ${id} 还没有画布节点（先出图）`)
      refNodes.push(asset.nodeId)
    }
    const modeArg = optionalString(args, 'mode') || 'auto'
    const mode = modeArg === 'auto' ? (refNodes.length ? 'm2v' : 't2v') : modeArg
    if (mode === 'm2v' && !refNodes.length) throw new Error('m2v 至少要一张参考图；纯文字请用 mode=t2v')

    if (args.dryRun) {
      return result(true, `演练：${episodeId} 的出片（未建节点、未扣积分）`, [
        `node create video --model ${model.model} --mode ${mode} --ratio ${project.video.aspect} --resolution ${resolution} --duration ${duration} --ref ${refNodes.map((n) => `node:${n}`).join(' ')} --run --wait`,
        `参考：${refIds.join(' → ') || '（无）'}｜prompt ${String(prompt).length} 字`
      ].join('\n'))
    }

    const canvas = await attachCanvas(dir, project)
    try {
      const { data } = await createVideoNode({
        projectId: canvas.id,
        model: model.model,
        prompt: String(prompt),
        ratio: project.video.aspect,
        resolution,
        duration,
        refs: mode === 'm2v' ? refNodes : [],
        maxCredits,
        title: `${episodeId} ${episode.title || ''}`.trim()
      })
      const nodeId = data.node && data.node.nodeId
      const credits = data.quote && data.quote.maxCredits
      const resource = pickResource(data)
      if (!resource) throw new Error('视频节点跑完但没有拿到资源')
      const file = join(dir, 'videos', `${episodeId}.mp4`)
      await downloadResource(canvas.id, resource.resourceId, file)
      episode.video = {
        status: 'done',
        nodeId,
        submitId: data.submission && data.submission.submitId,
        resourceId: resource.resourceId,
        file: relative(dir, file),
        credits,
        mode,
        duration,
        error: null,
        finishedAt: new Date().toISOString()
      }
      if (!episode.prompt) episode.prompt = String(prompt)
      saveProject(dir, project)
      return result(true, `${episodeId} 已出片${credits ? `（${credits} 积分）` : ''}`, `${relative(dir, file)}\n画布：${canvas.url}`)
    } catch (err) {
      episode.video = { ...(episode.video || {}), status: 'failed', error: failSummary(err).slice(0, 300) }
      saveProject(dir, project)
      return result(false, `${episodeId} 出片失败`, failSummary(err))
    }
  }
}

// ---------- 工具 4：拼接 ----------

const ASSEMBLE_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['project'],
  properties: {
    project: str('项目目录绝对路径'),
    episodes: arr('要拼接的集号，按顺序；省略则用所有已出片的集'),
    out: str('输出文件名，默认 out/final.mp4（相对项目目录）'),
    audio: str('可选旁白音轨路径（绝对，或相对项目目录）'),
    timeoutMs: num('ffmpeg 超时，默认 600000')
  }
}

export const assembleTool = {
  name: 'seedance_assemble',
  description: '把已出片的各集用 ffmpeg 拼成一部片，可选贴一条旁白音轨。默认输出 out/final.mp4。',
  parameters: ASSEMBLE_PARAMS,
  timeoutMs: 15 * 60_000,
  output: OUTPUT,
  async execute(args) {
    const dir = resolveDir(requireString(args, 'project'))
    const project = readProject(dir)
    const wanted = Array.isArray(args.episodes) ? args.episodes.map(String) : null
    const episodes = project.episodes.filter((e) => (wanted ? wanted.includes(e.id) : true))
    const files = []
    const missing = []
    for (const e of episodes) {
      const rel = e.video && e.video.file
      const abs = rel ? assertInside(dir, resolve(dir, rel)) : null
      if (abs && existsSync(abs)) files.push(abs)
      else missing.push(e.id)
    }
    if (!files.length) return result(false, '没有可拼接的视频', `这些集还没出片：${missing.join('、')}`)
    const outRel = optionalString(args, 'out') || 'out/final.mp4'
    const outPath = assertInside(dir, resolve(dir, outRel))
    const audio = optionalString(args, 'audio')
    const audioPath = audio ? (isAbsolute(audio) ? audio : resolve(dir, audio)) : undefined
    const { file, bytes } = await concatEpisodes(files, outPath, { audio: audioPath, timeoutMs: bounded(args.timeoutMs, 600_000, 30_000, 1_800_000) })
    const duration = await probeDuration(file).catch(() => null)
    const lines = [`${files.length} 集 → ${file}（${(bytes / 1024 / 1024).toFixed(1)} MB${duration ? `，${duration}s` : ''}）`]
    if (missing.length) lines.push(`跳过的集（未出片）：${missing.join('、')}`)
    return result(true, '拼接完成', lines.join('\n'))
  }
}

export const TOOLS = [studioTool, assetTool, episodeTool, assembleTool]


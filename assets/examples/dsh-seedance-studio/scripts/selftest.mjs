// 本地自检：不建节点、不花积分，只验证数据层、官方 CLI 探活和 ffmpeg 拼接。
// 运行：node scripts/selftest.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { concatEpisodes, probeDuration, resolveFfmpeg } from '../lib/ffmpeg.js'
import { authAccount, authStatus, resolveCli } from '../lib/dreamina.js'
import { fileSummary, initProject, listProjects, readProject, updateProject } from '../lib/project.js'

const ROOT = process.argv[2] || 'D:\\dsh-research\\.selftest'
const dir = join(ROOT, '样片')

function step(name, fn) {
  process.stdout.write(`- ${name} … `)
  try {
    const value = fn()
    console.log('ok')
    return value
  } catch (err) {
    console.log('失败')
    throw err
  }
}

rmSync(ROOT, { recursive: true, force: true })
mkdirSync(ROOT, { recursive: true })

const project = step('建项目', () => initProject({
  path: dir,
  title: '自检样片',
  aspect: '9:16',
  episodes: 2,
  paletteZh: '朱砂红、墨黑、青瓷绿、鎏金'
}))

step('登记资产与分镜', () => updateProject(dir, {
  assets: [
    { id: 'C01', kind: 'character', name: '主角标准像', ratio: '3:4', prompt: '上美影风格，全身正面站立，白背景' },
    { id: 'S01', kind: 'scene', name: '雪原', ratio: '16:9', prompt: '上美影风格，雪原空镜' }
  ],
  episodes: project.episodes.map((e, i) => ({ ...e, refs: ['C01', 'S01'], prompt: `0-3秒：第${i + 1}集开场` }))
}))

const reread = step('读回 project.json', () => readProject(dir))
const summary = fileSummary(dir, reread)
console.log(`  → ${reread.title}，资产 ${summary.assets.length}，集 ${summary.episodes.length}`)
step('列项目', () => {
  const list = listProjects(ROOT)
  if (!list.length) throw new Error('列表为空')
  return list
})

const cli = await (async () => {
  process.stdout.write('- 定位即梦官方 CLI … ')
  try {
    const c = await resolveCli()
    console.log(`ok（${c.bin}，v${c.version || '?'}）`)
    return c
  } catch (err) {
    console.log(`失败：${err.message}`)
    return null
  }
})()

try {
  const status = await authStatus()
  const account = status.loggedIn ? await authAccount().catch(() => null) : null
  console.log(`- 即梦账号：${status.loggedIn ? `已登录 ${account ? account.displayName : ''}，积分 ${account ? account.availableCredits : '?'}` : '未登录（生成前需要 auth login）'}`)
} catch (err) {
  console.log(`- 即梦账号：查询失败 — ${err.message}`)
}

process.stdout.write('- ffmpeg … ')
const ff = await resolveFfmpeg()
console.log(`ok（${ff.ffmpeg}）`)

const clips = ['videos/E01.mp4', 'videos/E02.mp4'].map((rel, i) => {
  const file = join(dir, rel)
  execFileSync(ff.ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=${i === 0 ? '0xc8332a' : '0x2f6f63'}:s=360x640:d=2`,
    '-pix_fmt', 'yuv420p', '-r', '24', file
  ])
  if (!existsSync(file)) throw new Error(`造样片失败：${file}`)
  return file
})
process.stdout.write('- 拼接 … ')
const out = join(dir, 'out', 'final.mp4')
const { bytes } = await concatEpisodes(clips, out)
const duration = await probeDuration(out)
console.log(`ok（${(bytes / 1024).toFixed(0)} KB，${duration}s）`)
if (!duration || duration < 3.5) throw new Error(`拼接结果时长异常：${duration}`)

writeFileSync(join(dir, 'out', 'selftest.json'), JSON.stringify({ ok: true, duration, cli: Boolean(cli) }, null, 2))
console.log(`\n全部通过。产物：${out}`)

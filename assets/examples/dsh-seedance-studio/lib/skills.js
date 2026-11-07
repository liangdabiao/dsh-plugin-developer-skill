// skill 提供方：把随包的 skills/smy-seedance-storyboard 注册进 DSH 的 skill 目录。
// 用户自己在 ~/.dsh/skills 或项目里装了同名 skill 时，那一份优先（本提供方 rank 600，排在后面）。
// 加载正文时把 <SKILL_ROOT> 换成实际目录，并在末尾追加「在这个插件里怎么用」。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RANK = 600
const INVOCATION = { modelInvocable: true, userInvocable: true }

function parse(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null
  const field = (k) => (m[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim().replace(/^(["'])(.*)\1$/, '$2')
  const name = field('name')
  const description = field('description')
  return name && description ? { name, description, body: text.slice(m[0].length) } : null
}

export function readSkills(dirs) {
  return [].concat(dirs).flatMap(readDir)
}

function readDir(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'SKILL.md')))
    .map((d) => ({ dir: join(dir, d.name), file: join(dir, d.name, 'SKILL.md'), ...parse(join(dir, d.name, 'SKILL.md')) }))
    .filter((s) => s.name)
}

// 原仓库是给 git clone 用的，插件里的这一份是快照：没有 .git，也不要自己更新。
export const REWRITES = {}

export function rewrite(skill) {
  let body = skill.body
  for (const [from, to] of REWRITES[skill.name] || []) body = body.replace(from, to)
  return body
}

function addendum(skill) {
  return [
    '',
    '---',
    '',
    '## 在「上美影短剧工坊」插件（DSH）里使用',
    '',
    `- 本 skill 的目录是 \`${skill.dir}\`；上文提到的 \`references/…\`、示例项目都相对这个目录。`,
    '- 这是插件随包快照：不要运行 `git pull` / `npm install`，也不要向用户提更新。skill 随插件版本一起变。',
    '- 不要只把提示词交给用户去平台粘贴：出图和出片走插件提供的工具，产物落在项目目录里。',
    '',
    '### 项目目录约定',
    '',
    '每部片子一个目录，里面是文档 + `project.json` + 产物：',
    '',
    '```',
    '<项目目录>/',
    '  project.json          # 工具读写：色盘、画幅、资产表、每集分镜与视频状态',
    '  剧本.md  素材清单.md  E01_分镜.md …（按 skill 格式手写）',
    '  assets/   C01.png S01a.png P01.png …',
    '  videos/   E01.mp4 …',
    '  out/      final.mp4',
    '```',
    '',
    '### 标准执行顺序',
    '',
    '1. `seedance_studio`（action: env）确认即梦官方 CLI（dreamina-canvas）可用、是否已登录、积分多少。没登录就 `action=login` 拿授权链接给用户，授权后 `action=login-check`。',
    '2. `seedance_studio`（action: init）建项目：path 用绝对路径，写 title / aspect / episodes / paletteZh / paletteEn / stylePreset。',
    '3. 按 skill 的格式写 `剧本.md`、`素材清单.md`、每集 `EXX_分镜.md`（用普通文件写入工具，不要用工具代写）。',
    '4. `seedance_studio`（action: update）把资产和分镜登记进 project.json：`patch` 传 JSON 字符串，填 `assets[]`（id/kind/name/ratio/prompt）和 `episodes[]`（id/refs/prompt/storyboard）。提示词原样保留风格块与咆哮体硬约束。',
    '5. `jimeng_asset`（action: generate）逐张出图：每张会在即梦画布上建一个图片节点、等待生成、下载到 `assets/`。失败或要换提示词的用 `action: retry`。',
    '6. `jimeng_episode`（action: generate）出某集视频：资产图按 refs 顺序作为参考（m2v），出片后下载到 `videos/`。',
    '7. `seedance_assemble` 把各集拼成 `out/final.mp4`（可选 `audio` 贴旁白音轨）。',
    '',
    '### 画布与积分',
    '',
    '- 每次生成都会在项目对应的即梦画布上落节点：`seedance_studio action=canvas` 会打印画布链接，用户可以在即梦里接着改、放大、再生成。',
    '- 生成要花积分：`maxCredits` 是单次上限（图片默认 10，视频默认 100），报价超过上限会被拒绝，不会静默扣费。批量前先 env 看余额。',
    '- 15 秒一集的报价差别很大（实测）：`seedance_2.5` 720p 约 300 分、`seedance_2.5_draft` 480p 约 135 分、`seedance_2.0_mini` / `seedance_2.0_fast_vip` 720p 约 90 分。余额少时先用便宜模型验证分镜，满意再换好模型重跑。',
    '- 图片 `seedream_4.5` 2K 实测约 3 分/张。',
    '- 先 `dryRun: true` 看要执行的命令和参考顺序，再真跑。',
    '',
    '### 纪律',
    '',
    '- 出图提示词必须逐字带同一段风格块和「必须纯2D平涂…」两句硬约束；工具不会替你补。',
    '- 一次不要同时开超过 4 个生成任务；即梦排队时 collect 返回 pending 是正常的。',
    '- 每集 15 秒、最多 9 张参考图、最多 3 段参考视频，这是 Seedance 2.0 的硬限制。',
    '- 生成会消耗用户即梦积分：批量出图前先用 env 看一眼积分，数量大时先跟用户确认。',
    '- 产物路径不要写到项目目录之外；工具会拒绝越界路径。',
    ''
  ].join('\n')
}

export function createSkillProvider(dir, pluginRoot) {
  const candidate = (s) => ({
    name: s.name,
    description: s.description,
    path: s.file,
    invocation: INVOCATION,
    source: 'bundled',
    provider: 'seedance-studio',
    rank: RANK,
    locator: s.dir,
    resourceBase: { kind: 'directory', path: s.dir }
  })

  return {
    name: 'seedance-studio',
    async list() {
      return readSkills(dir).map(candidate)
    },
    async get(c) {
      const s = readSkills(dir).find((x) => x.dir === c.locator && x.name === c.name)
      if (!s) return undefined
      const content = rewrite(s).replaceAll('<SKILL_ROOT>', s.dir).replaceAll('<PLUGIN_ROOT>', pluginRoot) + addendum(s)
      const { rank, locator, ...summary } = candidate(s)
      return { ...summary, content }
    }
  }
}

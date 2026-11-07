// 上美影短剧工坊 · Host 半边
// 1. 把随包的 skill（skills/smy-seedance-storyboard）注册进 ctx.skills，模型和 /skill 都能用
// 2. 注册四个工具（lib/tools.js）：项目管理、批量出图、单集出片、拼接
// 3. 一个只读状态接口（lib/api.js）：/seedance-studio/health
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerApi } from './lib/api.js'
import { createSkillProvider } from './lib/skills.js'
import { TOOLS } from './lib/tools.js'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const SKILL_DIRS = [join(ROOT, 'skills')]

export const name = 'seedance-studio'
export const inject = ['webServer', 'skills', 'tools']

export function apply(ctx) {
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(SKILL_DIRS, ROOT)))
  for (const tool of TOOLS) ctx.effect(() => ctx.tools.register(tool))
  ctx.effect(() => registerApi(ctx))
}

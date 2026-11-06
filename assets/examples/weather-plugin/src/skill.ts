/**
 * Bundled skill provider for weather-plugin: one skill that teaches the model
 * how to brief a weather report. Mirrors the official provider shape:
 * candidates listed by `list()`, full bodies served by `get()`.
 * @module weather-plugin/skill
 */

import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'

const PROVIDER_NAME = 'weather-plugin'
const INVOCATION = { modelInvocable: true, userInvocable: true } as const

const CANDIDATES: SkillCandidate[] = [
  {
    name: 'weather-briefing',
    description:
      '向用户播报天气时使用：固定结构、语气自然、附一条实用建议。' +
      '在调用 weather 工具拿到实时数据后，按此规范组织播报。',
    invocation: INVOCATION,
    provider: PROVIDER_NAME,
    source: 'bundled',
    rank: BUNDLED_SKILL_RANK,
    locator: 'weather-briefing',
  },
]

const BODY = `# 天气播报规范
1. 先报城市与天气类型（如：北京当前晴天）。
2. 再报温度与体感，单位与用户要求一致（摄氏度/华氏度）。
3. 补充风力（风速+风向）。
4. 有高低温时附上今日范围。
5. 结合天气给一句实用建议（雨天带伞、降温加衣、雪天慢行），不超过 10 字。
6. 只依据 weather 工具返回的实时数据，不编造预报。`

/** The bundled provider registered on `ctx.skills`. */
export const weatherSkillProvider: SkillProvider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve(CANDIDATES),
  async get(candidate): Promise<SkillDefinition> {
    return {
      name: candidate.name,
      description: candidate.description,
      invocation: candidate.invocation,
      provider: PROVIDER_NAME,
      source: 'bundled',
      rank: candidate.rank,
      content: BODY,
    }
  },
}

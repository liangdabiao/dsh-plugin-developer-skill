/**
 * weather-plugin: a dsh plugin that queries a city's current weather and
 * renders it as an animated weather card. Registers:
 * - `weather` tool: geocode + forecast via Open-Meteo, returns a one-line summary
 * - `weather-briefing` skill: how the model should brief a weather report
 * - a system-prompt section: teach the model when to call `weather`
 * The browser half (src/client) draws the animated card in the web shell.
 * @module weather-plugin
 */

import type { Context as CordisContext } from '@deepseek-ai/cordis'
import type SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type SkillService from '@deepseek-ai/dsh-skill'
import type ToolRegistry from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { weatherTool } from './tool.js'
import { weatherSkillProvider } from './skill.js'
import type { WeatherClientConfig } from './client.js'

type Context = CordisContext & {
  tools: ToolRegistry
  systemPrompt: SystemPrompt
  skills: SkillService
}

export const name = 'weather-plugin'
export const inject = ['tools', 'systemPrompt', 'skills']

export interface Config extends WeatherClientConfig {}

const DEFAULT_BASE_URL = 'https://api.open-meteo.com/v1/forecast'
const DEFAULT_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'

export const Config: z<Config> = z.object({
  baseUrl: z.string().default(DEFAULT_BASE_URL)
    .description('Open-Meteo 天气 API 基地址；可指向自建镜像做离线开发。'),
  geocodingUrl: z.string().default(DEFAULT_GEOCODING_URL)
    .description('Open-Meteo 地理编码 API 基地址。'),
  timeoutMs: z.number().step(1).min(1_000).default(10_000)
    .description('单次天气请求超时（毫秒）。'),
})

const PROMPT_TEXT = `## Query weather (weather)
Use the \`weather\` tool when the user asks about the weather, temperature, rain/snow, or wind for any city (for example "北京天气怎么样" or "will it rain in London tomorrow morning?"). Pass the city name in \`city\`. The tool returns real-time conditions as an animated weather card; report it following the weather-briefing skill. Only pass \`unit\` when the user asks for Fahrenheit.`

export function apply(ctx: Context, config: Config): void {
  const resolved: WeatherClientConfig = {
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    geocodingUrl: config.geocodingUrl ?? DEFAULT_GEOCODING_URL,
    timeoutMs: config.timeoutMs ?? 10_000,
  }

  ctx.effect(() => ctx.tools.register(weatherTool(resolved)), 'weather-plugin.tool')
  ctx.effect(() => ctx.skills.registerProvider(() => weatherSkillProvider), 'weather-plugin.skill')
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'tool:weather',
    order: 117,
    text: PROMPT_TEXT,
  }), 'weather-plugin.prompt')
}

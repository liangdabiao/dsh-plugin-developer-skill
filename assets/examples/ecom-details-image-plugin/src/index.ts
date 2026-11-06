/**
 * ecom-details-image-plugin: a dsh plugin that generates e-commerce images
 * (hero shots / PDP details / social / livestream / ads) via an OpenAI
 * compatible async image API (apimart.ai GPT-Image-2 by default). Registers:
 * - `ecom_generate_image` tool: submit prompt → poll task → return image URL
 * - `ecom-details-image` skill: how the model should write e-commerce image prompts
 * - a system-prompt section: teach the model when to use the tool + skill
 * The browser half (src/client) draws the image gallery card in the web shell.
 * @module ecom-details-image-plugin
 */

import type { Context as CordisContext } from '@deepseek-ai/cordis'
import type SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type SkillService from '@deepseek-ai/dsh-skill'
import type ToolRegistry from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { ecomImageTool } from './tool.js'
import { ecomImageSkillProvider } from './skill.js'
import type { EcomImageClientConfig } from './client.js'

type Context = CordisContext & {
  tools: ToolRegistry
  systemPrompt: SystemPrompt
  skills: SkillService
}

export const name = 'ecom-details-image-plugin'
export const inject = ['tools', 'systemPrompt', 'skills']

export interface Config extends EcomImageClientConfig {}

const DEFAULT_BASE_URL = 'https://api.apimart.ai/v1'
const DEFAULT_MODEL = 'gpt-image-2'

export const Config: z<Config> = z.object({
  baseUrl: z.string().default(DEFAULT_BASE_URL)
    .description('OpenAI 兼容图片 API 基地址（apimart.ai / OpenAI / 自建网关）。'),
  model: z.string().default(DEFAULT_MODEL)
    .description('图片生成模型名，如 gpt-image-2、gpt-image-1.5、dall-e-3。'),
  apiKey: z.string().default('')
    .description('图片 API 密钥。留空则从环境变量 IMG_API_KEY / OPENAI_API_KEY 读取；请勿硬编码或回显。'),
  proxyUrl: z.string().default('')
    .description('可选 HTTP 代理地址（如 http://127.0.0.1:1080）。apimart.ai 在受限网络里需经代理访问时配置。'),
  pollIntervalMs: z.number().step(1).min(1_000).default(5_000)
    .description('生图任务轮询间隔（毫秒）。'),
  timeoutMs: z.number().step(1).min(10_000).default(240_000)
    .description('生图任务最大等待时间（毫秒），含提交后首轮等待。'),
})

const PROMPT_TEXT = `## Generate e-commerce images (ecom_generate_image)
Use the \`ecom_generate_image\` tool when the user asks to generate product/marketing images: product hero shots, PDP details, social posts, livestream scenes, ads, banners, or any image corresponding to an image prompt.
Before calling it, load the \`ecom-details-image\` skill and follow its rules to write a high-quality image prompt (scenario template matching, Campaign Style Lock for multi-image sets, hex colors, explicit whitespace, negative constraints). Pass the full prompt in \`prompt\`; choose \`size\` by platform (1:1 hero, 2:3 PDP detail, 4:5 social) and keep \`resolution\` 2k by default. If the user provided a publicly reachable product image URL, pass it in \`image_url\` for better product consistency.
The result appears as a gallery card; report it briefly with the size/resolution tags.`

export function apply(ctx: Context, config: Config): void {
  const apiKey = (config.apiKey && config.apiKey.trim() !== '')
    ? config.apiKey
    : process.env.IMG_API_KEY ?? process.env.OPENAI_API_KEY ?? ''
  const proxyUrl = (config.proxyUrl && config.proxyUrl.trim() !== '')
    ? config.proxyUrl
    : process.env.IMG_PROXY_URL ?? ''

  const resolved: EcomImageClientConfig = {
    baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    model: config.model || DEFAULT_MODEL,
    apiKey,
    proxyUrl,
    pollIntervalMs: config.pollIntervalMs ?? 5_000,
    timeoutMs: config.timeoutMs ?? 240_000,
  }

  ctx.effect(() => ctx.tools.register(ecomImageTool(resolved)), 'ecom-details-image-plugin.tool')
  ctx.effect(() => ctx.skills.registerProvider(() => ecomImageSkillProvider), 'ecom-details-image-plugin.skill')
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'tool:ecom_generate_image',
    order: 116,
    text: PROMPT_TEXT,
  }), 'ecom-details-image-plugin.prompt')
}

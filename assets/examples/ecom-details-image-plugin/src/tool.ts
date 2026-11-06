/**
 * ecom_generate_image tool: submit an image-generation prompt to an
 * OpenAI-compatible / apimart.ai async image API, poll the task, and project
 * the resulting image URL into the persisted `tool/result` meta so the browser
 * half can render it as a gallery card and replay reproduces the same card.
 * The model-facing result stays a one-line summary.
 * @module ecom-details-image-plugin/tool
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { EcomImageClientConfig } from './client.js'
import { makeFetch, submitTask, pollTask } from './client.js'
import {
  ecomMetaFrom,
  normalizeResolution,
  normalizeSize,
  summarizeResult,
  type EcomImageMeta,
} from './fragment.js'

const DESCRIPTION =
  '生成电商图片（产品主图/详情页/社媒图/直播场景等）。当用户要求生成商品图片、视觉素材或图片 Prompt 对应的图片时使用。' +
  '模型应先按 ecom-details-image 技能写出高质量的图片 Prompt（含 Style Lock、hex 颜色、留白、负面约束），再调用本工具出图；' +
  '结果会以画廊卡片展示在网页界面。'

/** 定义 ecom_generate_image 工具（由 index.ts 注册到 ctx.tools） */
export function ecomImageTool(config: EcomImageClientConfig, fetchImpl?: typeof fetch): ToolDefinition {
  return defineTool({
    name: 'ecom_generate_image',
    description: DESCRIPTION,
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description:
          '完整图片生成 Prompt。按 ecom-details-image 技能规范编写：' +
          '多图任务必须以同一段 Campaign Style Lock 开头；颜色用 hex 码；产品占比、留白用数字；' +
          '结尾给负面约束清单。',
      },
      size: {
        type: 'string',
        enum: ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '2:1', '1:2', '21:9', '9:21'],
        description: '图片比例。主图默认 1:1，详情页建议 2:3，海报/社媒按平台选 16:9 / 4:5 等。',
      },
      resolution: {
        type: 'string',
        enum: ['1k', '2k', '4k'],
        description: '分辨率档位（1k/2k/4k）。默认 2k；4k 仅 16:9/9:16/2:1/1:2/21:9/9:21 支持。',
      },
      image_url: {
        type: 'string',
        description: '参考产品图片的 URL（图生图，提升产品一致性）。有公网可访问的商品图 URL 时传入。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          imageUrl: { type: 'string', required: true },
          size: { type: 'string', required: true },
          resolution: { type: 'string', required: true },
          taskId: { type: 'string', required: true },
          prompt: { type: 'string', required: true },
          cost: { type: 'number' },
        },
      },
      // 模型看到一句话摘要即可；完整数据走 meta，不重复占用上下文。
      render: (_args, value) => [{
        type: 'text',
        text: value.text,
      }],
      // 把结构化数据投影进持久化 meta，前端据此渲染画廊并支持回放。
      presentationMeta: (_args, value) => ({
        kind: 'ecom-image',
        imageUrl: value.imageUrl,
        size: value.size,
        resolution: value.resolution,
        taskId: value.taskId,
        prompt: value.prompt ?? '',
      }),
    },
    isConcurrencySafe: () => false,
    async execute(args) {
      const input = args as { prompt?: unknown; size?: unknown; resolution?: unknown; image_url?: unknown }
      const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
      if (prompt === '') throw new Error('ecom_generate_image: prompt 是必填参数')
      const size = normalizeSize(input.size)
      const resolution = normalizeResolution(input.resolution)
      const imageUrl = typeof input.image_url === 'string' && input.image_url.trim() !== ''
        ? input.image_url.trim()
        : undefined

      const fetchImpl_ = makeFetch(config.proxyUrl, fetchImpl ?? fetch)
      const taskId = await submitTask(config, { prompt, size, resolution, imageUrl }, fetchImpl_)
      const result = await pollTask(config, taskId, fetchImpl_)

      return {
        text: summarizeResult({ kind: 'ecom-image', ...result, size, resolution, prompt }),
        imageUrl: result.imageUrl,
        size,
        resolution,
        taskId,
        prompt,
        cost: result.cost,
      }
    },
    presentCall: () => ({
      card: 'generic',
      title: '生成电商图片',
      kind: 'other',
    }),
    presentResult(_args, result) {
      if (result.isError) return undefined
      const meta = ecomMetaFrom(result.meta) as EcomImageMeta | undefined
      if (meta === undefined) return undefined
      return { card: 'generic', title: `电商图片 · ${meta.size}` }
    },
  })
}

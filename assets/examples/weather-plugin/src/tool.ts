/**
 * weather tool: query a city's current weather and project a structured
 * WeatherInfo into the persisted `tool/result` meta so the browser half can
 * render it as an animated card and replay reproduces the same card.
 * The model-facing result stays a one-line text summary.
 * @module weather-plugin/tool
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { WeatherClientConfig } from './client.js'
import { geocode, forecast } from './client.js'
import { parseWeather, summarize, weatherMetaFrom, type WeatherInfo } from './fragment.js'

const DESCRIPTION =
  '查询城市实时天气。当用户询问某地天气、气温、是否下雨/下雪、风力或"要不要带伞"时使用。' +
  '结果会以带动效的天气卡片展示（晴天/多云/阴/雾/雨/雪/雷暴动画）。'

/** 定义 weather 工具（由 index.ts 注册到 ctx.tools） */
export function weatherTool(config: WeatherClientConfig, fetchImpl?: typeof fetch): ToolDefinition {
  return defineTool({
    name: 'weather',
    description: DESCRIPTION,
    parameters: {
      city: {
        type: 'string',
        required: true,
        description: '城市名，如：北京、上海、广州、纽约',
      },
      unit: {
        type: 'string',
        enum: ['c', 'f'],
        description: '温度单位：c=摄氏度，f=华氏度',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          unit: { type: 'string', enum: ['c', 'f'], required: true },
          info: { type: 'object', additionalProperties: true, required: true },
        },
      },
      // 模型看到一句话摘要即可；完整 WeatherInfo 走 meta，不重复占用上下文。
      render: (_args, value) => [{
        type: 'text',
        text: value.text,
      }],
      // 把结构化数据投影进持久化 meta，前端据此渲染动效卡片并支持回放。
      presentationMeta: (_args, value) => ({
        kind: 'weather',
        info: value.info,
        unit: value.unit,
      }),
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as { city?: unknown; unit?: unknown }
      const city = typeof input.city === 'string' ? input.city : ''
      if (city === '') throw new Error('weather: city 是必填参数')
      const unit = input.unit === 'f' ? 'f' : 'c'
      const fetchImpl_ = fetchImpl ?? fetch
      const geo = await geocode(config, city, fetchImpl_)
      if (!geo) throw new Error(`未找到城市「${city}」，请检查城市名拼写（可尝试直辖市或省会名）`)
      const fc = await forecast(config, geo.latitude, geo.longitude, fetchImpl_)
      const info = parseWeather(geo.name, fc.current_weather, fc.daily)
      return { text: summarize(info, unit), info, unit }
    },
    presentCall: () => ({
      card: 'generic',
      title: '天气',
      kind: 'other',
    }),
    presentResult(_args, result) {
      if (result.isError) return undefined
      const meta = weatherMetaFrom(result.meta)
      if (meta === undefined) return undefined
      return { card: 'generic', title: `天气 · ${meta.info.city}` }
    },
  })
}

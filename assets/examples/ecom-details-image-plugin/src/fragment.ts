// 共享契约层：Node 端、浏览器端、测试三方共用的纯函数。
// 把 ecom 图片任务的"元数据结构/尺寸规范/结果还原"钉死在这里，
// 保证 Node 端写入 meta、浏览器端渲染卡片完全一致。

/** apimart / OpenAI 兼容图片 API 支持的比例（与 apimart.md 一致） */
export const VALID_SIZES = [
  'auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5',
  '16:9', '9:16', '2:1', '1:2', '21:9', '9:21',
] as const

export type EcomSize = (typeof VALID_SIZES)[number]

export const VALID_RESOLUTIONS = ['1k', '2k', '4k'] as const
export type EcomResolution = (typeof VALID_RESOLUTIONS)[number]

/** 默认尺寸与分辨率 */
export const DEFAULT_SIZE: EcomSize = '1:1'
export const DEFAULT_RESOLUTION: EcomResolution = '2k'

/** 持久化到 tool/result meta 的结构（浏览器端据此渲染画廊） */
export interface EcomImageMeta {
  kind: 'ecom-image'
  imageUrl: string
  size: string
  resolution: string
  taskId: string
  prompt: string
  cost?: number
}

/** 归一化比例：非法值回退到默认 */
export function normalizeSize(size: unknown): EcomSize {
  if (typeof size === 'string') {
    const s = size.trim().toLowerCase()
    if ((VALID_SIZES as readonly string[]).includes(s)) return s as EcomSize
  }
  return DEFAULT_SIZE
}

/** 归一化分辨率：非法值回退到默认 */
export function normalizeResolution(res: unknown): EcomResolution {
  if (typeof res === 'string') {
    const r = res.trim().toLowerCase()
    if ((VALID_RESOLUTIONS as readonly string[]).includes(r)) return r as EcomResolution
  }
  return DEFAULT_RESOLUTION
}

/** 给模型看的一句话摘要（output.description 保持简短） */
export function summarizeResult(meta: EcomImageMeta): string {
  return `已生成图片（${meta.size}，${meta.resolution}）：${meta.imageUrl}`
}

/** 从持久化 tool/result meta 还原结构化信息（Node 端写入、浏览器端读取） */
export function ecomMetaFrom(meta: unknown): EcomImageMeta | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const m = meta as { kind?: unknown; imageUrl?: unknown; size?: unknown; resolution?: unknown; taskId?: unknown; prompt?: unknown; cost?: unknown }
  if (m.kind !== 'ecom-image') return undefined
  if (typeof m.imageUrl !== 'string' || m.imageUrl === '') return undefined
  return {
    kind: 'ecom-image',
    imageUrl: m.imageUrl,
    size: typeof m.size === 'string' ? m.size : DEFAULT_SIZE,
    resolution: typeof m.resolution === 'string' ? m.resolution : DEFAULT_RESOLUTION,
    taskId: typeof m.taskId === 'string' ? m.taskId : '',
    prompt: typeof m.prompt === 'string' ? m.prompt : '',
    cost: typeof m.cost === 'number' ? m.cost : undefined,
  }
}

/** 供模型直接引用的规则说明（系统提示/技能正文里引用） */
export const RULE_TEXT =
  '图片结果会以画廊卡片展示在网页界面，包含生成图预览、尺寸/分辨率标签与重新生成入口。'

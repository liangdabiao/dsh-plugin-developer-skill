/**
 * apimart.ai / OpenAI 兼容图片 API 客户端（异步作业 + 轮询）。
 * - 提交：POST {baseUrl}/images/generations → 返回 task_id
 * - 轮询：GET  {baseUrl}/tasks/{task_id}     → completed 后取 result.images[0].url[0]
 * - 代理：可选 proxyUrl，通过 undici ProxyAgent 走 HTTP CONNECT 隧道
 *   （apimart.ai 在某些受限网络里需经本地代理才能访问）。
 * fetch 可注入，便于测试。
 * @module ecom-details-image-plugin/client
 */

import { fetch as undiciFetch, ProxyAgent } from 'undici'

export interface EcomImageClientConfig {
  baseUrl: string
  model: string
  apiKey: string
  proxyUrl?: string
  pollIntervalMs: number
  timeoutMs: number
}

export interface GenerateImageInput {
  prompt: string
  size?: string
  resolution?: string
  imageUrl?: string
}

export interface ImageTaskResult {
  taskId: string
  imageUrl: string
  cost?: number
  actualTime?: number
}

/** 依据 proxyUrl 构造本客户端专用的 fetch（带 dispatcher），无代理则用全局 fetch。 */
export function makeFetch(proxyUrl: string | undefined, fetchImpl: typeof fetch = fetch): typeof fetch {
  if (!proxyUrl) return fetchImpl
  // undici v7：ProxyAgent 必须以 { uri } 对象构造（字符串形式不会生效）。
  const dispatcher = new ProxyAgent({ uri: proxyUrl })
  const proxyFetch: typeof fetch = (input, init) =>
    undiciFetch(input as RequestInfo, { ...init, dispatcher })
  return proxyFetch
}

async function postJson(
  url: string,
  body: unknown,
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`生图接口返回 HTTP ${res.status}：${detail.slice(0, 300)}`)
    }
    return (await res.json()) as Record<string, unknown>
  } finally {
    clearTimeout(timer)
  }
}

async function getJson(
  url: string,
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  // 代理链路偶发 TLS 重置/断连，做有限重试（网络抖动容错）。
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`查询任务返回 HTTP ${res.status}：${detail.slice(0, 300)}`)
      }
      return (await res.json()) as Record<string, unknown>
    } catch (err) {
      lastErr = err
      if (attempt < 2) await sleep(3_000 + attempt * 2_000)
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** 提交生图任务，返回 task_id */
export async function submitTask(
  config: EcomImageClientConfig,
  input: GenerateImageInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const payload: Record<string, unknown> = {
    model: config.model,
    prompt: input.prompt,
    n: 1,
    size: input.size ?? '1:1',
    resolution: input.resolution ?? '2k',
  }
  if (input.imageUrl) {
    payload.image_urls = [input.imageUrl]
  }
  const result = await postJson(`${config.baseUrl}/images/generations`, payload, config.apiKey, config.timeoutMs, fetchImpl)
  const code = result.code
  if (code !== undefined && code !== 200) {
    throw new Error(`生图提交失败（code=${code}）：${JSON.stringify(result).slice(0, 300)}`)
  }
  const data = result.data
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`生图提交响应缺少 data 数组：${JSON.stringify(result).slice(0, 300)}`)
  }
  const first = data[0] as Record<string, unknown>
  if (typeof first.task_id !== 'string' || first.task_id === '') {
    throw new Error(`生图提交响应缺少 task_id：${JSON.stringify(first).slice(0, 300)}`)
  }
  return first.task_id
}

/** 轮询任务直至完成或超时；completed 时取回图片 URL */
export async function pollTask(
  config: EcomImageClientConfig,
  taskId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImageTaskResult> {
  const url = `${config.baseUrl}/tasks/${taskId}`
  const deadline = Date.now() + config.timeoutMs
  // apimart 建议提交后等待 10~20s 再开始轮询
  await sleep(10_000)
  while (Date.now() < deadline) {
    const result = await getJson(url, config.apiKey, Math.min(config.timeoutMs, 30_000), fetchImpl)
    const data = result.data
    const task = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
    const status = typeof task.status === 'string' ? task.status : ''
    if (status === 'completed') {
      const imgUrl = extractImageUrl(task)
      if (!imgUrl) throw new Error('任务完成但未取到图片 URL')
      return {
        taskId,
        imageUrl: imgUrl,
        cost: typeof task.cost === 'number' ? task.cost : undefined,
        actualTime: typeof task.actual_time === 'number' ? task.actual_time : undefined,
      }
    }
    if (status === 'failed') {
      throw new Error(`生图任务失败：${JSON.stringify(task).slice(0, 300)}`)
    }
    await sleep(config.pollIntervalMs)
  }
  throw new Error(`生图任务超时（>${Math.round(config.timeoutMs / 1000)}s），请稍后重试`)
}

function extractImageUrl(task: Record<string, unknown>): string | undefined {
  const result = task.result
  if (typeof result !== 'object' || result === null) return undefined
  const images = (result as { images?: unknown }).images
  if (!Array.isArray(images) || images.length === 0) return undefined
  const item = images[0] as Record<string, unknown>
  const urls = item.url
  if (!Array.isArray(urls) || urls.length === 0) return undefined
  const first = urls[0]
  return typeof first === 'string' ? first : undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

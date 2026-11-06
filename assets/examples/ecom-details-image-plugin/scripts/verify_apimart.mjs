// 独立验证脚本：undici ProxyAgent + apimart 异步生图全链路。
// 复现插件 src/client.ts 的核心逻辑（submit + poll），验证：
//   1) 通过本地代理 127.0.0.1:1080 访问 api.apimart.ai
//   2) 纯文生图 与 参考图(base64) 图生图
// 运行：node scripts/verify_apimart.mjs
import { fetch as ufetch, ProxyAgent } from 'undici'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BASE = 'https://api.apimart.ai/v1'
const KEY = 'sk-YOUR_APIMART_KEY'
const PROXY = 'http://127.0.0.1:1080'
const dispatcher = new ProxyAgent(PROXY)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function post(url, body) {
  const res = await ufetch(url, {
    method: 'POST',
    dispatcher,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

async function get(url) {
  const res = await ufetch(url, {
    dispatcher,
    headers: { Authorization: `Bearer ${KEY}` },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function submitAndPoll(payload, tag) {
  console.log(`\n[${tag}] submit...`)
  const r = await post(`${BASE}/images/generations`, payload)
  const code = r.code
  if (code !== undefined && code !== 200) throw new Error(`submit code=${code}: ${JSON.stringify(r).slice(0, 300)}`)
  const tid = r.data[0].task_id
  console.log(`[${tag}] task_id=${tid}`)
  await sleep(12000)
  for (let i = 0; i < 20; i++) {
    const rr = await get(`${BASE}/tasks/${tid}`)
    const d = rr.data || {}
    const st = d.status
    if (st === 'completed') {
      const url = d.result.images[0].url[0]
      console.log(`[${tag}] DONE url=${url} cost=${d.cost} time=${d.actual_time}s`)
      return url
    }
    if (st === 'failed') throw new Error(`task failed: ${JSON.stringify(d).slice(0, 300)}`)
    await sleep(5000)
  }
  throw new Error('timeout')
}

// 1) 纯文生图（最小档位 1k）
await submitAndPoll({
  model: 'gpt-image-2',
  prompt: 'e-commerce product hero: a white ceramic mug on pure white background (#FFFFFF), soft studio lighting, product occupies 38%, centered, no props, no text, no shadows',
  n: 1, size: '1:1', resolution: '1k',
}, 'text-to-image')

// 2) 图生图（本地参考图 base64）
const imgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ScreenShot_2026-05-08_153624_561.png')
const b64 = readFileSync(imgPath).toString('base64')
await submitAndPoll({
  model: 'gpt-image-2',
  prompt: '电商服装展示图：把参考图中的女士连体裤改为纯白背景(#FFFFFF)产品主图，产品占 38%，居中，正面 3/4 角度，专业棚拍，不要文字、不要道具、不要水印',
  n: 1, size: '1:1', resolution: '1k',
  image_urls: [`data:image/png;base64,${b64}`],
}, 'image-to-image')

console.log('\nALL OK')

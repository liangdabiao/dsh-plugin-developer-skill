// 查询指定任务结果（含重试）。
import { fetch as ufetch, ProxyAgent } from 'undici'

const BASE = 'https://api.apimart.ai/v1'
const KEY = 'sk-YOUR_APIMART_KEY'
const PROXY = { uri: 'http://127.0.0.1:1080' }
const dispatcher = new ProxyAgent(PROXY)
const tid = process.argv[2]

async function getRetry(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await ufetch(url, { dispatcher, headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (i === tries - 1) throw e
      console.log(`retry ${i + 1} after ${e.cause?.code || e.message}`)
      await new Promise((r) => setTimeout(r, 4000))
    }
  }
}

const rr = await getRetry(`${BASE}/tasks/${tid}`)
const d = rr.data || {}
console.log('status=', d.status, 'progress=', d.progress)
if (d.status === 'completed') {
  console.log('url=', d.result.images[0].url[0])
  console.log('cost=', d.cost, 'time=', d.actual_time)
} else if (d.status === 'failed') {
  console.log('failed:', JSON.stringify(d).slice(0, 400))
} else {
  console.log('not done, data=', JSON.stringify(d).slice(0, 300))
}

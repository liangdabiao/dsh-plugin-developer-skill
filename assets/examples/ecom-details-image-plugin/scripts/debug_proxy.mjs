// 调试 undici ProxyAgent：确认 fetch 走代理（看出口 IP）。
import { fetch as ufetch, ProxyAgent } from 'undici'

const variants = [
  { name: 'uri-string', make: () => new ProxyAgent('http://127.0.0.1:1080') },
  { name: 'uri-option', make: () => new ProxyAgent({ uri: 'http://127.0.0.1:1080' }) },
  { name: 'connect-option', make: () => new ProxyAgent({ uri: 'http://127.0.0.1:1080', connect: { timeout: 20000 } }) },
]

for (const v of variants) {
  try {
    const dispatcher = v.make()
    const res = await ufetch('https://api.ipify.org?format=json', { dispatcher, signal: AbortSignal.timeout(20000) })
    const ip = await res.json()
    console.log(`[${v.name}] OK ip=${ip.ip}`)
  } catch (e) {
    console.log(`[${v.name}] FAIL: ${e.cause?.code || e.message}`)
  }
}

// 对照：全局 fetch 直连（预期超时）
try {
  const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(15000) })
  console.log('[global-fetch-direct] OK', await res.json())
} catch (e) {
  console.log('[global-fetch-direct] FAIL:', e.cause?.code || e.message)
}

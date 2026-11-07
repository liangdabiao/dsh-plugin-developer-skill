// 客户端模块冒烟：不开浏览器，只验证 client.js 能被模块加载器接住、两个 slot 都注册上。
// 运行：node scripts/client-smoke.mjs
import { readFileSync } from 'node:fs'

const code = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const registrations = []
let module = null

const fakeReact = {
  createElement: (...args) => ({ args }),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useRef: (v) => ({ current: v }),
  useCallback: (f) => f,
  useEffect: () => {},
  Fragment: 'Fragment'
}

globalThis.window = {
  __ModuleLoader__: {
    load({ id, factory }) {
      module = factory((name) => (name === 'react' ? fakeReact : null))
      module.id = id
    }
  }
}

// client.js 直接读 window 并注册 factory，用 Function 执行避免污染模块作用域
new Function('window', code)(globalThis.window)

if (!module) throw new Error('client.js 没有调用 window.__ModuleLoader__.load')
if (!Array.isArray(module.inject) || !module.inject.includes('slots')) throw new Error('client 模块没有 inject slots')
if (typeof module.apply !== 'function') throw new Error('client 模块没有 apply')

const ctx = {
  slots: {
    inject: (key, cb) => { registrations.push(key); cb() },
    register: (opts) => { registrations.push(`${opts.name}#${opts.id || opts.key}`); return () => {} }
  }
}
module.apply(ctx)

const expected = ['sidebar.panellist', 'main']
for (const key of expected) {
  if (!registrations.some((r) => r === key || r.startsWith(`${key}#`))) throw new Error(`没有注册 ${key}：${registrations.join(', ')}`)
}
console.log(`client 模块 OK：${module.id}｜注册 ${registrations.join(' ')}`)

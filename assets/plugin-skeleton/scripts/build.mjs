// 浏览器半边打包：src/client.js → dist/client.js（单文件 CJS + ModuleLoader 包装）。
// Host 半边（src/host.js）是纯 ESM 源码，零构建直接发布。
// 用法：node scripts/build.mjs [--watch]
import { build } from 'esbuild'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const PLUGIN_ID = pkg.name // ModuleLoader id 用包名（guizang / media-desk 惯例）

// dsh web 端加载浏览器半边的约定：整个产物是一个 lazy CommonJS 模块工厂。
// banner 开启 load({id, factory}) 并注入 module/exports，footer 收尾返回 exports。
const banner =
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {` +
  ` const module = { exports: {} }; const exports = module.exports;`
const footer = ' return module.exports; } });'

const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'] // 宿主平台模块表

/** 打包后三大自检，任一不过直接失败——这是 web 端能加载的前提。 */
function checkBundle() {
  const file = join(root, 'dist/client.js')
  const code = readFileSync(file, 'utf8')
  // 1) require 白名单：只允许宿主共享的平台模块，不允许 Node 内置或别的 @deepseek-ai 私包
  const requires = [...code.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1])
  const bad = requires.filter((spec) => !CLIENT_EXTERNALS.includes(spec))
  if (bad.length) throw new Error(`client 产物引用了白名单外的模块：${bad.join(', ')}`)
  // 2) 无动态 import（会破坏单文件沙箱约束）
  if (/\bimport\s*\(/.test(code)) throw new Error('client 产物包含动态 import()，禁止')
  // 3) 单文件：dist/ 里只允许 client.js
  const files = readdirSync(join(root, 'dist'))
  if (files.length !== 1 || files[0] !== 'client.js') {
    throw new Error(`dist/ 应只含 client.js，实际：${files.join(', ')}`)
  }
}

rmSync(join(root, 'dist'), { recursive: true, force: true })
await build({
  entryPoints: [join(root, 'src/client.js')],
  outfile: join(root, 'dist/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'chrome120',
  external: CLIENT_EXTERNALS,
  banner: { js: banner },
  footer: { js: footer },
  minify: !process.argv.includes('--watch'),
  sourcemap: process.argv.includes('--watch') ? 'inline' : false,
  logLevel: 'info',
  ...(process.argv.includes('--watch')
    ? { watch: true }
    : {}),
})

if (!process.argv.includes('--watch')) {
  checkBundle()
  const size = (Buffer.byteLength(readFileSync(join(root, 'dist/client.js'))) / 1024).toFixed(1)
  console.log(`[build] dist/client.js ${size} KB  (id=${PLUGIN_ID})`)
} else {
  console.log(`[build] watching src/client.js → dist/client.js (id=${PLUGIN_ID})`)
}

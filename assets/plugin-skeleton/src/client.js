// ============================================================================
// dsh 插件浏览器半边（Client）。
//
// 加载方式：宿主 web 前端按 package.json 的 dsh.client 声明加载 ./client 导出
// （dist/client.js），它整体被 scripts/build.mjs 包成：
//   window.__ModuleLoader__.load({ id, factory(require) { ...; return module.exports } })
// 本文件只写 factory 内部的普通模块：用 React.createElement（无 JSX，免配置）。
// ============================================================================
const h = require('react').createElement
const { useRef, useEffect } = require('react')

const PANEL_ID = 'your-plugin' // = cordis.patch.yml 的 id
const BASE = '/your-plugin' // = host.js 的 webServer prefix（iframe 页面地址）
const MSG_DRAFT = 'your-plugin:draft' // 页面 → client：开新对话并填草稿
const MSG_DRAFT_FAILED = 'your-plugin:draft-failed' // client → 页面：失败回路
const MSG_SCHEME = 'your-plugin:scheme' // client → 页面：主题变化

// 侧栏图标（24×24 线条 SVG）
function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('path', {
      d: 'M5 4h11l3 3v13H5V4zm3 5h8M8 13h8M8 17h5',
      stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }))
}

function apply(ctx) {
  // 主区域面板：一个 iframe 加载 Host 半边伺服的插件页面。
  // 组件定义在 apply 里，闭包捕获 client ctx（slots/uiWorkspace/theme 服务从这来）。
  function DeskPanel() {
    const frameRef = useRef(null)

    // 开新对话：页面 postMessage 过来 → 这里调 startSession（只填草稿，不自动发送）
    useEffect(() => {
      async function onMessage(event) {
        // 来源三重校验：frame 自己 / 同源 / 消息类型，缺一不可
        const frame = frameRef.current
        if (!frame || event.source !== frame.contentWindow) return
        if (event.origin !== location.origin) return
        const data = event.data
        if (!data || data.type !== MSG_DRAFT) return
        try {
          await ctx.uiWorkspace.startSession(undefined, { prompt: data.prompt, whenDraftExists: 'replace' })
        } catch (err) {
          // 失败回路：告诉页面，让用户看到提示而不是默默无效
          frame.contentWindow?.postMessage({ type: MSG_DRAFT_FAILED, message: String(err) }, location.origin)
        }
      }
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    }, [])

    // 主题跟随：dsh 切换深浅色时转发给 iframe（页面自身另有 <head> 同步兜底）
    useEffect(() => {
      const push = (scheme) => frameRef.current?.contentWindow?.postMessage({ type: MSG_SCHEME, scheme }, location.origin)
      if (ctx.inject) {
        ctx.inject(['theme'], (c) => {
          push(c.theme.getTheme())
          c.on('theme/change', () => push(c.theme.getTheme()))
        })
      }
    }, [])

    return h('iframe', {
      ref: frameRef,
      src: BASE + '/',
      style: { width: '100%', height: '100%', border: 'none', background: 'transparent' },
      title: '工作台',
    })
  }

  // 侧栏入口：sidebar.panellist 槽；order 决定在侧栏的位置，label 用函数便于语言切换后重注册
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => '工作台' }, PanelIcon))

  // 主区域：main 槽（keyed 槽，key = 面板 id）
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, DeskPanel))
}

// ModuleLoader factory 的出口（esbuild banner/footer 负责外面的 load 包装）
exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply

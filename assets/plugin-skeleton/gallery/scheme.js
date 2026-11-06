// 主题同步：必须在 <head> 里同步执行（不能 defer/async），否则深色模式下首帧闪白。
// 三种环境各有来源：
//   1) 嵌在 dsh 里：client.js 会在主题变化时 postMessage {type:'<id>:scheme'}
//   2) 首帧兜底：读父页面 <body data-ds-dark-theme>（dsh 的主题标记）
//   3) 单独打开：跟系统 prefers-color-scheme
(function () {
  var apply = function (scheme) {
    var dark = scheme === 'dark'
      || (scheme && scheme.scheme === 'dark')
      || (window.parent !== window
        && window.parent.document.body
        && window.parent.document.body.hasAttribute('data-ds-dark-theme'))
      || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.toggleAttribute('data-dark', !!dark)
  }
  apply()
  window.addEventListener('message', function (event) {
    if (window.parent !== window && event.origin !== window.location.origin) return
    var data = event.data
    if (data && data.type === 'your-plugin:scheme') apply(data.scheme)
  })
  if (window.matchMedia) {
    var media = window.matchMedia('(prefers-color-scheme: dark)')
    var onSystemChange = function () { if (window.parent === window) apply() }
    if (media.addEventListener) media.addEventListener('change', onSystemChange)
    else if (media.addListener) media.addListener(onSystemChange)
  }
})()

// 插件页面逻辑：纯原生 JS，无框架无构建。
// 嵌在 dsh 的 iframe 里时，开新对话走 postMessage 给父页面（client.js 转 startSession）；
// 单独在浏览器打开时降级为复制到剪贴板。
(function () {
  var MSG_DRAFT = 'your-plugin:draft'

  var listEl = document.getElementById('memo-list')
  var toastEl = document.getElementById('toast')
  var toastTimer = null

  function toast(text) {
    toastEl.textContent = text
    toastEl.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { toastEl.hidden = true }, 3000)
  }

  // 统一请求函数：相对路径（同源），带 JSON 头；错误把服务端的 error 字段透出来
  function request(path, body) {
    return fetch(path, body === undefined
      ? {}
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () { return {} }).then(function (data) {
          if (!res.ok) throw new Error(data.error || ('请求失败 ' + res.status))
          return data
        })
      })
  }

  function esc(text) {
    var div = document.createElement('div') // textContent 渲染，天然防 XSS
    div.textContent = text
    return div.innerHTML
  }

  function render(memos) {
    if (!memos.length) {
      // 空状态是正常态：文案说清楚，别让用户（或模型）以为出了故障
      listEl.innerHTML = '<div class="empty">还没有备忘。在上面输入一条，或在对话里说「记一下…」。</div>'
      return
    }
    listEl.innerHTML = memos.map(function (m) {
      return '<div class="memo" data-id="' + esc(m.id) + '">'
        + '<time>' + esc(m.createdAt.slice(0, 16).replace('T', ' ')) + '</time>'
        + '<span class="text">' + esc(m.text) + '</span>'
        + '<button class="del" data-del="' + esc(m.id) + '" title="删除">✕</button>'
        + '</div>'
    }).join('')
  }

  function load() {
    request('api/memos').then(function (data) { render(data.memos) })
      .catch(function (err) { toast(err.message) })
  }

  document.getElementById('add-form').addEventListener('submit', function (event) {
    event.preventDefault()
    var input = document.getElementById('add-text')
    var text = input.value.trim()
    if (!text) return
    request('api/memos', { text: text }).then(function () {
      input.value = ''
      load()
    }).catch(function (err) { toast(err.message) })
  })

  listEl.addEventListener('click', function (event) {
    var id = event.target.getAttribute && event.target.getAttribute('data-del')
    if (!id) return
    request('api/memos/remove', { id: id }).then(load).catch(function (err) { toast(err.message) })
  })

  // 开新对话并填草稿：嵌在 dsh 里 postMessage（只填不发），独立打开降级为复制
  document.getElementById('draft-btn').addEventListener('click', function () {
    var prompt = '帮我记一条备忘：'
    if (window.parent !== window) {
      window.parent.postMessage({ type: MSG_DRAFT, prompt: prompt }, window.location.origin)
      toast('已发给 dsh，请在对话里确认发送')
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(prompt).then(
        function () { toast('草稿已复制，粘贴到对话里就能用') },
        function () { toast('复制失败') })
    }
  })

  // 失败回路：client.js 的 startSession 出错时通知回来
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return
    var data = event.data
    if (data && data.type === 'your-plugin:draft-failed') toast('开新对话失败：' + data.message)
  })

  load()
})()

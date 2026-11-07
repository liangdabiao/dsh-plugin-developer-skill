// 上美影短剧工坊 · 浏览器半边
// 侧栏加一个「短剧工坊」入口，主区是项目面板：项目列表 → 资产墙 → 每集视频，出图/出片按钮直接调 Host 接口。
// 样式不猜主题 token 名：一律用 currentColor + color-mix，跟随宿主明暗。
window.__ModuleLoader__.load({
  id: 'dsh-seedance-studio',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const BASE = '/seedance-studio'
    const PANEL = 'seedance-studio'
    const LABEL = '短剧工坊'
    const DEFAULT_DIR = 'D:\\dsh-research'

    const media = (abs) => `${BASE}/media?path=${encodeURIComponent(abs)}`
    const joinPath = (dir, rel) => `${dir.replace(/[\\/]+$/, '')}\\${String(rel).replace(/^[\\/]+/, '')}`
    const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0)

    function StudioIcon(props) {
      const s = (props && props.size) || 18
      return h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' },
        h('rect', { x: 3, y: 4.5, width: 18, height: 15, rx: 2 }),
        h('path', { d: 'M8 4.5v15M16 4.5v15M3 9.5h5M3 14.5h5M16 9.5h5M16 14.5h5' }))
    }

    async function api(path, options) {
      const res = await fetch(`${BASE}${path}`, options)
      const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
      if (!body.ok) throw new Error(body.error || `HTTP ${res.status}`)
      return body
    }

    function Chip(props) {
      const color = props.tone === 'ok' ? '#2f8f6b' : props.tone === 'bad' ? '#c0504d' : props.tone === 'run' ? '#b98a2f' : 'currentColor'
      return h('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 999,
          fontSize: 11, lineHeight: 1.6, color, border: `1px solid ${color}`, opacity: props.dim ? 0.6 : 1, whiteSpace: 'nowrap'
        }
      }, props.children)
    }

    function StudioPanel() {
      const [dir, setDir] = React.useState(() => localStorage.getItem('seedance.dir') || DEFAULT_DIR)
      const [projects, setProjects] = React.useState(null)
      const [current, setCurrent] = React.useState(null)
      const [health, setHealth] = React.useState(null)
      const [job, setJob] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const timer = React.useRef(null)

      const refreshHealth = React.useCallback(async () => {
        try { setHealth(await api('/health')) } catch (err) { setHealth({ ok: false, error: String(err.message) }) }
      }, [])

      const openProject = React.useCallback(async (path) => {
        setError('')
        try {
          const data = await api(`/api/project?path=${encodeURIComponent(path)}`)
          setCurrent(data)
        } catch (err) { setError(String(err.message)) }
      }, [])

      const scan = React.useCallback(async (target) => {
        setError('')
        setBusy('scan')
        try {
          const data = await api(`/api/projects?dir=${encodeURIComponent(target)}`)
          setProjects(data.projects || [])
          localStorage.setItem('seedance.dir', target)
          if ((data.projects || []).length === 1) await openProject(data.projects[0].path)
        } catch (err) {
          setProjects([])
          setError(String(err.message))
        } finally { setBusy('') }
      }, [openProject])

      React.useEffect(() => {
        refreshHealth()
        scan(dir)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      // 生成任务轮询：跑完刷新项目，失败把原因贴出来
      React.useEffect(() => {
        if (!job || job.status !== 'running') return undefined
        const tick = async () => {
          try {
            const data = await api(`/api/job?id=${encodeURIComponent(job.id)}`)
            setJob(data.job)
            if (data.job.status !== 'running') {
              if (current) await openProject(current.path)
              await refreshHealth()
            }
          } catch (err) { setError(String(err.message)) }
        }
        timer.current = setInterval(tick, 2000)
        return () => clearInterval(timer.current)
      }, [job, current, openProject, refreshHealth])

      const generate = async (kind, extra) => {
        if (!current) return
        setError('')
        setBusy(kind)
        try {
          const body = { kind, project: current.path, ...extra }
          const data = await api('/api/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
          })
          setJob({ id: data.job, status: 'running', kind })
        } catch (err) { setError(String(err.message)) } finally { setBusy('') }
      }

      const assets = (current && current.files && current.files.assets) || []
      const episodes = (current && current.files && current.files.episodes) || []
      const doneAssets = assets.filter((a) => a.status === 'done').length
      const doneEpisodes = episodes.filter((e) => e.video && e.video.status === 'done').length

      const style = {
        display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: 'inherit', fontSize: 13,
        background: 'transparent'
      }

      return h('div', { style },
        h('style', null, `
          .ss-scroll { overflow: auto; }
          .ss-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
          .ss-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, currentColor 18%, transparent); border-radius: 4px; }
          .ss-card { border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: 10px; }
          .ss-btn { border: 1px solid color-mix(in srgb, currentColor 22%, transparent); background: color-mix(in srgb, currentColor 6%, transparent);
                    color: inherit; border-radius: 7px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
          .ss-btn:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
          .ss-btn:disabled { opacity: .45; cursor: default; }
          .ss-btn.primary { border-color: #c8332a; color: #c8332a; background: color-mix(in srgb, #c8332a 8%, transparent); }
          .ss-input { background: transparent; color: inherit; border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
                      border-radius: 7px; padding: 5px 9px; font-size: 12px; min-width: 0; }
          .ss-thumb { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; display: block; border-radius: 7px; background: color-mix(in srgb, currentColor 6%, transparent); }
          .ss-row:hover { background: color-mix(in srgb, currentColor 5%, transparent); }
        `),
        // 顶栏
        h('div', {
          style: {
            display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', flexWrap: 'wrap',
            borderBottom: '1px solid color-mix(in srgb, currentColor 12%, transparent)'
          }
        },
          h('strong', { style: { fontSize: 13, letterSpacing: 0.5 } }, '上美影短剧工坊'),
          h('input', {
            className: 'ss-input', value: dir, spellCheck: false,
            onChange: (e) => setDir(e.target.value), style: { flex: '1 1 260px' }
          }),
          h('button', { className: 'ss-btn', disabled: busy === 'scan', onClick: () => scan(dir) }, busy === 'scan' ? '扫描中…' : '扫描'),
          health && health.auth && health.auth.loggedIn
            ? h(Chip, { tone: 'ok' }, `即梦 ${health.auth.displayName || ''} · ${health.auth.credits ?? '?'} 积分`)
            : h(Chip, { tone: 'bad' }, '即梦未登录'),
          h('span', { style: { opacity: 0.55, fontSize: 11 } }, `v${(health && health.version) || '?'}`)
        ),
        error ? h('div', { style: { padding: '8px 12px', color: '#c0504d', fontSize: 12 } }, error) : null,
        // 主体
        h('div', { style: { display: 'flex', flex: 1, minHeight: 0 } },
          // 项目列表
          h('div', {
            className: 'ss-scroll',
            style: {
              width: 210, flex: '0 0 210px', borderRight: '1px solid color-mix(in srgb, currentColor 12%, transparent)',
              padding: 8, display: 'flex', flexDirection: 'column', gap: 6
            }
          },
            projects === null ? h('div', { style: { opacity: 0.5, padding: 8 } }, '扫描中…')
              : projects.length === 0 ? h('div', { style: { opacity: 0.6, padding: 8, lineHeight: 1.7 } }, '这个目录下没有项目。', h('br'), '先用 seedance_studio action=init 建一个。')
                : projects.map((p) => h('button', {
                  key: p.path,
                  className: 'ss-btn ss-row',
                  onClick: () => openProject(p.path),
                  style: {
                    textAlign: 'left', padding: '8px 9px',
                    borderColor: current && current.path === p.path ? '#c8332a' : undefined,
                    borderWidth: current && current.path === p.path ? 1 : 1
                  }
                },
                  h('div', { style: { fontWeight: 600, marginBottom: 3 } }, p.title || '(未命名)'),
                  h('div', { style: { opacity: 0.6, fontSize: 11 } }, `${p.doneAssets}/${p.assets} 资产 · ${p.doneEpisodes}/${p.episodes} 集`)
                ))
          ),
          // 详情
          h('div', { className: 'ss-scroll', style: { flex: 1, minWidth: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 } },
            !current ? h('div', { style: { opacity: 0.55, margin: 'auto', textAlign: 'center', lineHeight: 1.9 } }, '左边选一个项目，或在上方填项目根目录后扫描。')
              : h(React.Fragment, null,
                // 项目头
                h('div', { className: 'ss-card', style: { padding: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' } },
                  h('div', { style: { flex: '1 1 240px', minWidth: 0 } },
                    h('div', { style: { fontSize: 17, fontWeight: 700, marginBottom: 4 } }, `${current.project.title}（${current.project.video.aspect} · ${current.project.video.episodeSeconds}s）`),
                    h('div', { style: { opacity: 0.65, fontSize: 12 } }, `色盘：${current.project.style.palette.zh || '未填'}｜模型：${current.project.image.model} + ${current.project.video.model}`),
                    current.project.canvas
                      ? h('a', {
                        href: current.project.canvas.url, target: '_blank', rel: 'noreferrer',
                        style: { fontSize: 12, color: '#2f6f9f', display: 'inline-block', marginTop: 4 }
                      }, '打开即梦画布 ↗')
                      : null
                  ),
                  h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                    h('button', {
                      className: 'ss-btn primary', disabled: Boolean(busy),
                      onClick: () => generate('asset', { maxCredits: 10 })
                    }, busy === 'asset' ? '出图中…' : `全部出图（${assets.length - doneAssets}）`),
                    h('button', {
                      className: 'ss-btn', disabled: Boolean(busy) || episodes.length === 0,
                      onClick: () => generate('episode', { episode: (episodes.find((e) => !e.video || e.video.status !== 'done') || episodes[0] || {}).id, maxCredits: 100 })
                    }, busy === 'episode' ? '出片中…' : '出下一集'),
                    h('button', {
                      className: 'ss-btn', disabled: Boolean(busy) || doneEpisodes === 0,
                      onClick: () => generate('assemble', {})
                    }, busy === 'assemble' ? '拼接中…' : '拼接成片')
                  )
                ),
                // 进度条
                job ? h('div', {
                  className: 'ss-card',
                  style: { padding: '8px 12px', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }
                },
                  h(Chip, { tone: job.status === 'running' ? 'run' : job.status === 'done' ? 'ok' : 'bad' },
                    job.status === 'running' ? '生成中' : job.status === 'done' ? '完成' : '失败'),
                  h('span', { style: { flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.85 } },
                    job.summary || job.error || job.data || '提交中…')
                ) : null,
                // 资产墙
                h('div', null,
                  h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 8 } },
                    h('strong', null, '资产'),
                    h('span', { style: { opacity: 0.55, fontSize: 12 } }, `${doneAssets}/${assets.length} 完成`),
                    h('span', { style: { flex: 1 } }),
                    assets.length ? h('span', { style: { opacity: 0.45, fontSize: 11 } }, `${pct(doneAssets, assets.length)}%`) : null
                  ),
                  assets.length === 0
                    ? h('div', { style: { opacity: 0.55, fontSize: 12 } }, '还没有登记资产，让模型用 seedance_studio action=update 写进 project.json。')
                    : h('div', {
                      style: {
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10
                      }
                    }, assets.map((a) => h('div', { key: a.id, className: 'ss-card', style: { padding: 8 } },
                      a.file
                        ? h('img', { className: 'ss-thumb', src: media(joinPath(current.path, a.file)), alt: a.id, loading: 'lazy' })
                        : h('div', {
                          className: 'ss-thumb',
                          style: { display: 'grid', placeItems: 'center', fontSize: 11, opacity: 0.5 }
                        }, a.status === 'failed' ? '失败' : '未出图'),
                      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 4 } },
                        h('span', { style: { fontWeight: 600 } }, a.id),
                        h(Chip, { tone: a.status === 'done' ? 'ok' : a.status === 'failed' ? 'bad' : a.status === 'running' ? 'run' : undefined },
                          a.status === 'done' ? '完成' : a.status === 'failed' ? '失败' : a.status === 'queued' ? '排队' : '待办')
                      ),
                      a.error ? h('div', { style: { fontSize: 10.5, color: '#c0504d', marginTop: 4, lineHeight: 1.5 } }, a.error) : null
                    )))
                ),
                // 每集
                h('div', null,
                  h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 8 } },
                    h('strong', null, '分集'),
                    h('span', { style: { opacity: 0.55, fontSize: 12 } }, `${doneEpisodes}/${episodes.length} 出片`)
                  ),
                  h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
                    episodes.map((e) => h('div', { key: e.id, className: 'ss-card', style: { padding: 10, display: 'flex', gap: 12, alignItems: 'flex-start' } },
                      e.video && e.video.file
                        ? h('video', {
                          src: media(joinPath(current.path, e.video.file)), controls: true, preload: 'metadata',
                          style: { width: 150, borderRadius: 7, background: '#000', flex: '0 0 150px' }
                        })
                        : h('div', { style: { width: 150, flex: '0 0 150px', aspectRatio: '9 / 16', display: 'grid', placeItems: 'center', borderRadius: 7, background: 'color-mix(in srgb, currentColor 7%, transparent)', fontSize: 11, opacity: 0.5 } }, '未出片'),
                      h('div', { style: { flex: 1, minWidth: 0 } },
                        h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 } },
                          h('strong', null, e.id),
                          e.title ? h('span', { style: { opacity: 0.7 } }, e.title) : null,
                          h(Chip, { tone: (e.video || {}).status === 'done' ? 'ok' : (e.video || {}).status === 'failed' ? 'bad' : (e.video || {}).status === 'running' ? 'run' : undefined },
                            (e.video || {}).status === 'done' ? '已出片' : (e.video || {}).status === 'failed' ? '失败' : (e.video || {}).status === 'running' ? '生成中' : '待办')
                        ),
                        h('div', { style: { opacity: 0.6, fontSize: 11.5, lineHeight: 1.6 } },
                          `参考：${(e.refs || []).join(' → ') || '无'}｜提示词 ${e.promptChars || 0} 字${e.storyboard ? `｜${e.storyboard}` : ''}`),
                        h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
                          h('button', {
                            className: 'ss-btn', disabled: Boolean(busy),
                            onClick: () => generate('episode', { episode: e.id, maxCredits: 100 })
                          }, (e.video || {}).status === 'done' ? '重出本集' : '出本集')
                        )
                      )
                    ))
                  )
                )
              )
          )
        )
      )
    }

    function apply(ctx) {
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 7, label: () => LABEL }, StudioIcon))
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, StudioPanel))
    }

    return { inject: ['slots'], apply }
  }
})

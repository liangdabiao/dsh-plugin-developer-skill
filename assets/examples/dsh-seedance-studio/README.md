# 上美影短剧工坊（dsh-seedance-studio）

把 [smy-seedance-storyboard](https://github.com/) 这套「上美影风格短剧」skill 搬进 DeepSeek Harness，并接上**即梦官方 CLI（dreamina-canvas）**：
一句话故事 → 剧本 / 色盘 / 资产图 / 每集 15 秒分镜 → 在即梦画布上出图出片 → 拼成一部片，全程不用离开对话。

## 装了什么

| 能力 | 说明 |
|---|---|
| skill `smy-seedance-storyboard` | 随包快照：SKILL.md + 6 篇 references + 2 个示例项目，`/skill` 和模型都能用 |
| `seedance_studio` | 建项目、读进度、登记资产/分镜；即梦登录、查积分、建画布 |
| `jimeng_asset` | 每个资产在画布上建图片节点 → 等待生成 → 下载到 `assets/` |
| `jimeng_episode` | 每集建视频节点（m2v，资产节点作参考）→ 等待 → 下载到 `videos/` |
| `seedance_assemble` | ffmpeg 把各集拼成 `out/final.mp4`，可选贴旁白音轨 |

## 前置

即梦官方 CLI（带 OAuth 登录、画布、积分审批，和 npm 上的第三方 `jimeng-cli` 不是一回事）：

```powershell
irm https://jimeng.jianying.com/canvas-cli/install.ps1 | iex
dreamina-canvas --format json version
```

装完让模型跑 `seedance_studio action=login` 拿授权链接，扫码后 `action=login-check`。
拼接还需要 `ffmpeg`。

## 项目目录

```
<项目目录>/
  project.json      # 工具读写：色盘、画幅、画布 id、资产表、每集分镜与视频状态
  剧本.md  素材清单.md  E01_分镜.md …
  assets/           # C01.png S01.png …
  videos/           # E01.mp4 …
  out/              # final.mp4
```

生成会复用同一张即梦画布，`project.json` 里记着画布 id 和每个节点的 nodeId，随时能回画布继续改。

## 侧栏面板

装好后侧栏会多一个「短剧工坊」：

- 顶部填**项目根目录**（默认 `D:\dsh-research`）→ 扫描，左边列出所有含 `project.json` 的项目
- 点项目看资产墙和分集：资产图直接预览，完成的集内嵌播放
- 「全部出图」「出下一集」「拼接成片」按钮直接调 Host 的生成接口，进度条每 2 秒轮询，跑完自动刷新
- 每集卡片可以单独「出本集 / 重出本集」，失败的资产会用红字显示原因
- 面板和工具走同一套代码：路径校验、积分上限（图片 10 / 视频 100）、错误文案完全一致

首次装好或更新了 `client.js` 后，需要刷新一次页面（Ctrl+R）才会加载新的浏览器模块。

## 典型流程

1. `seedance_studio action=env`：CLI、登录、积分、模型一次看清
2. `action=init` → 写剧本/素材清单/分镜 → `action=update` 登记 assets 与 episodes
3. `jimeng_asset action=generate`（可先 `dryRun: true`）
4. `jimeng_episode action=generate`
5. `seedance_assemble` → `out/final.mp4`

## 限制与费用

实测报价（2026-11，cn 区）：

| 用途 | 模型 · 参数 | 积分 |
|---|---|---|
| 资产图 | `seedream_4.5` · 2K | 约 3/张 |
| 单集 15s | `seedance_2.0_mini` · 720p | 约 90 |
| 单集 15s | `seedance_2.0_fast_vip` · 720p | 约 90 |
| 单集 15s | `seedance_2.5_draft` · 480p | 约 135 |
| 单集 15s | `seedance_2.5` · 720p | 约 300 |

- 生成消耗即梦积分；`maxCredits` 是单次上限（图片默认 10、视频默认 100），报价超过上限直接拒绝，不会静默扣费。
- 默认模型选的是便宜档（`seedream_4.5` + `seedance_2.0_mini`），验证分镜够用；要质量再换 `seedance_2.5`。
- Seedance 单集 15 秒、参考图最多 9 张；模型与分辨率以 `model list` 实时结果为准。
- 出片是慢操作：一个视频节点通常几分钟，工具会等终态再下载。
- 即梦会在产物左上角打「AI生成」水印，这是平台行为，CLI 侧去不掉。

## 自检

```powershell
node scripts/selftest.mjs
```

不建节点、不花积分，只验证 project.json、CLI 探活、登录状态和 ffmpeg 拼接。

## 许可

插件代码是 MIT（见 `LICENSE`）。`skills/smy-seedance-storyboard` 是第三方内容快照，原仓库未附 LICENSE，
随包携带仅限本地自用；对外分发或商用前请先向原作者确认授权，详见 `skills/NOTICE.md`。

特别致谢社区支持：  https://linux.do
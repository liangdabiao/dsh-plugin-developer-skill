// ffmpeg 封装：把各集 mp4 拼成一部片，可选贴一条旁白音轨。
import { execFile } from 'node:child_process'
import { existsSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export class FfmpegError extends Error {}

let cached = null

function locate(cmd) {
  return new Promise((resolvePath) => {
    const exe = process.platform === 'win32' ? 'C:\\Windows\\System32\\where.exe' : 'which'
    execFile(exe, [cmd], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      if (err) return resolvePath('')
      const line = String(stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
      resolvePath(line && existsSync(line) ? line : '')
    })
  })
}

export async function resolveFfmpeg() {
  if (cached) return cached
  const candidates = [process.env.SEEDANCE_FFMPEG, await locate('ffmpeg')].filter(Boolean)
  if (process.env.LOCALAPPDATA) candidates.push(join(process.env.USERPROFILE || '', '.local', 'bin', 'ffmpeg.exe'))
  const bin = candidates.find((p) => p && existsSync(p))
  if (!bin) throw new FfmpegError('找不到 ffmpeg，拼接需要它。安装后重试，或把路径填到环境变量 SEEDANCE_FFMPEG。')
  const ffprobe = bin.replace(/ffmpeg(\.exe)?$/i, (m) => (m.toLowerCase().endsWith('.exe') ? 'ffprobe.exe' : 'ffprobe'))
  cached = { ffmpeg: bin, ffprobe: existsSync(ffprobe) ? ffprobe : null }
  return cached
}

function run(bin, args, timeoutMs) {
  return new Promise((resolveRun, reject) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolveRun({ code: err && typeof err.code === 'number' ? err.code : 0, stdout, stderr: String(stderr || '') })
    })
  })
}

function concatLine(file) {
  return `file '${resolve(file).replace(/'/g, "'\\''")}'`
}

export async function concatEpisodes(files, outPath, { audio, timeoutMs = 600_000 } = {}) {
  if (!files.length) throw new FfmpegError('没有可拼接的视频')
  for (const f of files) {
    if (!existsSync(f)) throw new FfmpegError(`视频不存在：${f}`)
    if (statSync(f).size < 1024) throw new FfmpegError(`视频文件太小，可能是坏文件：${f}`)
  }
  const { ffmpeg } = await resolveFfmpeg()
  const listFile = `${outPath}.concat.txt`
  writeFileSync(listFile, `${files.map(concatLine).join('\n')}\n`, 'utf8')
  const base = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile]

  try {
    // 同参数同编码的集，copy 拼接最快也无损
    let res = await run(ffmpeg, [...base, '-c', 'copy', outPath], timeoutMs)
    if (res.code !== 0 || !existsSync(outPath) || statSync(outPath).size < 1024) {
      // 参数不一致时退回重编码
      res = await run(ffmpeg, [...base, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', outPath], timeoutMs)
      if (res.code !== 0) throw new FfmpegError(`ffmpeg 拼接失败：${res.stderr.split(/\r?\n/).filter(Boolean).slice(-2).join(' ')}`)
    }
    if (audio) {
      if (!existsSync(audio)) throw new FfmpegError(`音轨不存在：${audio}`)
      const withAudio = `${outPath}.audio.mp4`
      const res2 = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', outPath, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', withAudio], timeoutMs)
      if (res2.code !== 0) throw new FfmpegError(`贴音轨失败：${res2.stderr.split(/\r?\n/).filter(Boolean).slice(-2).join(' ')}`)
      return { file: withAudio, bytes: statSync(withAudio).size }
    }
    return { file: outPath, bytes: statSync(outPath).size }
  } finally {
    try { unlinkSync(listFile) } catch {}
  }
}

export async function probeDuration(file) {
  const { ffprobe } = await resolveFfmpeg()
  if (!ffprobe) return null
  const res = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], 30_000)
  const value = Number(String(res.stdout).trim())
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null
}

export function ffmpegInfo() {
  return cached ? { ffmpeg: cached.ffmpeg, ffprobe: cached.ffprobe } : null
}

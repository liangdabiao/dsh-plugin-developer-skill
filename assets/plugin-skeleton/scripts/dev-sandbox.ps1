# 在隔离的 DSH_HOME 里重新安装本插件并启动网页版，不碰 ~/.dsh（Windows 版）。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\dev-sandbox.ps1 [-Port 4311]
# 开发循环：改 src/host.js 后重跑本脚本；改 src/client.js 后可配合 `npm run watch` 热更新。
param(
  [int]$Port = 4311,
  [string]$Sandbox = ""
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Sandbox) { $Sandbox = Join-Path (Split-Path -Parent $Root) '.dsh-sandbox' }
New-Item -ItemType Directory -Force -Path $Sandbox | Out-Null
$Sandbox = (Resolve-Path $Sandbox).Path

Set-Location $Root
npm run --silent build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 防外层会话的环境变量泄漏进沙盒
Remove-Item Env:DSH_SESSION_ID -ErrorAction SilentlyContinue
Remove-Item Env:DSH_SHELL -ErrorAction SilentlyContinue
Remove-Item Env:DSH_WEB_URL -ErrorAction SilentlyContinue
Remove-Item Env:DSH_PROFILE -ErrorAction SilentlyContinue
Remove-Item Env:DSH_PROFILE_DIR -ErrorAction SilentlyContinue
$env:DSH_HOME = $Sandbox

$name = (Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json).name
dsh plugin --profile web remove $name 2>$null
if ($LASTEXITCODE -ne 0) { $global:LASTEXITCODE = 0 }  # 首次运行 remove 失败是正常的
dsh plugin --profile web add "file:$Root"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
dsh --profile web --no-open --port $Port
exit $LASTEXITCODE

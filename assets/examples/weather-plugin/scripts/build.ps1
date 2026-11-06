# One-shot rebuild of weather-plugin (node half + browser half).
# Prereqs: Node 22+ and npm installed; dsh published package cached via npx
#         (cache path is hardcoded in scripts/link_deps.py).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> [1/4] Install build tools (tsdown/typescript, first run) ..." -ForegroundColor Cyan
npm install --legacy-peer-deps 2>&1 | Select-Object -Last 3

Write-Host "==> [2/4] Link host deps (junction, must run after npm install) ..." -ForegroundColor Cyan
python scripts/link_deps.py
if ($LASTEXITCODE -ne 0) { throw "link_deps failed" }

Write-Host "==> [3/4] Build both halves (lib/index.js + lib/client.js) ..." -ForegroundColor Cyan
npx tsdown
if ($LASTEXITCODE -ne 0) { throw "tsdown build failed" }

Write-Host "==> [4/4] Sanity check ..." -ForegroundColor Cyan
if (-not (Test-Path "lib/index.js") -or -not (Test-Path "lib/client.js")) { throw "build artifacts missing" }
Write-Host "OK: lib/index.js + lib/client.js generated"

Write-Host ""
Write-Host "Build done. Install into a profile:" -ForegroundColor Green
Write-Host "  dsh plugin --profile web add file:D:/dsh-openmaic-main/weather-plugin"
Write-Host "  dsh plugin --profile headless add file:D:/dsh-openmaic-main/weather-plugin"
Write-Host "(If the profile already installed the same version, refresh manually:"
Write-Host " run scripts/sync_profile.py, or remove and re-add the plugin.)"

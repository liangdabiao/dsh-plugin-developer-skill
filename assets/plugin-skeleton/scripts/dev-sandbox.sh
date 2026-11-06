#!/bin/sh
# 在隔离的 DSH_HOME 里重新安装本插件并启动网页版，不碰 ~/.dsh。
# 用法：scripts/dev-sandbox.sh [端口]   （默认 4311）
# 开发循环：改 src/host.js 后重跑本脚本；改 src/client.js 后可配合 `npm run watch` 热更新。
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX="${DSH_SANDBOX:-$ROOT/../.dsh-sandbox}"
PORT="${1:-4311}"
mkdir -p "$SANDBOX"; SANDBOX="$(cd "$SANDBOX" && pwd)"
cd "$ROOT"
npm run --silent build
# 防外层会话的环境变量泄漏进沙盒
unset DSH_SESSION_ID DSH_SHELL DSH_WEB_URL DSH_PROFILE DSH_PROFILE_DIR
export DSH_HOME="$SANDBOX"
dsh plugin --profile web remove "$(node -p "require('$ROOT/package.json').name")" >/dev/null 2>&1 || true
dsh plugin --profile web add "file:$ROOT" >/dev/null
exec dsh --profile web --no-open --port "$PORT"

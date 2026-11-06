#!/usr/bin/env bash
# dsh 插件测试脚本：先软链宿主依赖，再跑 vitest（保证 import 到宿主版本 dsh）
set -euo pipefail

if [[ -n "${DSH_CHECKOUT:-}" ]]; then
  HARNESS="$DSH_CHECKOUT"
else
  DSH_BIN="$(command -v dsh || true)"
  if [[ -z "$DSH_BIN" ]]; then
    echo "[test] ERROR: 找不到 dsh 命令。请设 DSH_CHECKOUT。" >&2
    exit 1
  fi
  HARNESS="$(dirname "$(dirname "$DSH_BIN")")"
fi

mkdir -p node_modules
ln -sfn "$HARNESS/packages/dsh" node_modules/dsh
ln -sfn "$HARNESS/node_modules/cordis" node_modules/cordis 2>/dev/null || true

npx vitest run

#!/usr/bin/env bash
# dsh 插件构建脚本：定位 harness checkout → 软链宿主依赖 → 双端打包 → 产物自检
set -euo pipefail

# 1. 定位 dsh（harness）checkout
if [[ -n "${DSH_CHECKOUT:-}" ]]; then
  HARNESS="$DSH_CHECKOUT"
else
  # 从 PATH 上的 dsh 命令反推源码目录（真实环境按实际布局调整）
  DSH_BIN="$(command -v dsh || true)"
  if [[ -z "$DSH_BIN" ]]; then
    echo "[build] ERROR: 找不到 dsh 命令。请设 DSH_CHECKOUT 指向 dsh 源码目录。" >&2
    exit 1
  fi
  HARNESS="$(dirname "$(dirname "$DSH_BIN")")"
fi
echo "[build] harness checkout: $HARNESS"

# 2. 软链宿主依赖（dsh / cordis 等指向 checkout，避免发布版本冲突）
mkdir -p node_modules
ln -sfn "$HARNESS/packages/dsh" node_modules/dsh
ln -sfn "$HARNESS/node_modules/cordis" node_modules/cordis 2>/dev/null || true

# 3. 双端打包
npx tsdown

# 4. 产物自检：浏览器端三大硬约束
CLIENT="lib/client.js"
if [[ -f "$CLIENT" ]]; then
  # 4.1 不允许 import Node 内置模块
  if grep -nE "from ['\"](fs|path|os|child_process|node:)" "$CLIENT"; then
    echo "[build] ERROR: 浏览器产物 import 了 Node 内置模块！" >&2
    exit 1
  fi
  # 4.2 不允许动态 import
  if grep -nE "import\(" "$CLIENT"; then
    echo "[build] ERROR: 浏览器产物含动态 import！" >&2
    exit 1
  fi
  # 4.3 必须单文件（无拆包 chunk）
  if ls lib/client-*.js >/dev/null 2>&1; then
    echo "[build] ERROR: 浏览器产物被拆成多 chunk！" >&2
    exit 1
  fi
fi

echo "[build] OK: lib/index.js + lib/client.js"

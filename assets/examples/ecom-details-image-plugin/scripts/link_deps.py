# -*- coding: utf-8 -*-
"""把 npx 缓存的 dsh 宿主依赖以 Windows 目录联接(junction)接到本插件 node_modules。

为什么需要：
- 本插件是 dsh 生态外部插件，构建/类型检查需要 @deepseek-ai/* 宿主包；
- dsh 发布包（npx 缓存）内已含这些包，无需重复安装；
- 用 junction 而非 npm install，可保证与运行中的 dsh 0.1.1-rc.2 版本完全一致。

用法：python scripts/link_deps.py
"""
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "..", "node_modules")

# 用户机器上 dsh 发布包缓存位置（npx 安装 @deepseek-ai/dsh 时生成）
CACHE_AI = r"C:\Users\49707\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai"
CACHE_TOP = r"C:\Users\49707\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules"

# Node 端宿主依赖（构建/类型用；运行时由 dsh Loader 提供）
NODE_DEPS = [
    "cordis", "cosmokit", "schemastery",
    "dsh-tools", "dsh-skill", "dsh-system-prompt",
    "dsh-llm", "dsh-session", "dsh-scope", "dsh-brand", "dsh-goal",
]
# 浏览器端宿主依赖（仅类型；运行时由 web shell 模块表提供）
CLIENT_DEPS = [
    "dsh-client-runtime", "dsh-client-ui-tool", "dsh-client-ui-slots",
    "dsh-client-web-react", "dsh-client-ui-primitives",
]


def junction(dst, src):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.isdir(dst) and not os.path.islink(dst):
        return "exists"
    if os.path.islink(dst) or os.path.exists(dst):
        os.remove(dst)
    subprocess.run(["cmd", "/c", "mklink", "/J", dst, src], check=True, capture_output=True)
    return "linked"


def main():
    linked, missing = [], []
    for name in NODE_DEPS + CLIENT_DEPS:
        src = os.path.join(CACHE_AI, name)
        dst = os.path.join(TARGET, "@deepseek-ai", name)
        # 目标已存在（可能是 npm install 装的 registry 包）→ 直接满足，跳过
        if os.path.isdir(dst) and not os.path.islink(dst):
            continue
        if os.path.isdir(src):
            try:
                junction(dst, src)
                linked.append(name)
            except Exception as e:  # noqa: BLE001
                missing.append(f"{name}({e})")
        else:
            missing.append(name)

    # react：浏览器端 JSX 运行时依赖
    src = os.path.join(CACHE_TOP, "react")
    dst = os.path.join(TARGET, "react")
    if os.path.isdir(dst) and not os.path.islink(dst):
        pass
    elif os.path.isdir(src):
        try:
            junction(dst, src)
            linked.append("react")
        except Exception as e:  # noqa: BLE001
            missing.append(f"react({e})")
    else:
        missing.append("react")

    print("linked:", linked)
    print("missing:", missing if missing else "none")
    if missing:
        raise SystemExit("有缺失的宿主依赖，请检查 dsh 缓存路径。")


if __name__ == "__main__":
    main()

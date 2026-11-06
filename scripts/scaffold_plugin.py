#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""dsh 插件项目脚手架：把 assets/plugin-skeleton（0.2.x）复制到目标目录并替换占位符。

用法:
    python scripts/scaffold_plugin.py <目标目录> [--name dsh-my-plugin] [--desc "一句话说明"]

--name 支持 npm 包名形式：dsh-my-plugin / @scope/my-plugin（id 取最后一段并去掉 dsh- 前缀）。
"""
import argparse
import os
import re
import shutil
import sys

SKELETON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "plugin-skeleton")

# 出现在 package.json / cordis.patch.yml / src/* / gallery/* / test/* 里的占位符
PACKAGE_PLACEHOLDER = "dsh-your-plugin"     # npm 包名（含 dsh- 前缀的完整形式）
ID_PLACEHOLDER = "your-plugin"              # 插件实例 id（cordis id / BASE / 消息前缀 / 技能名）
SNAKE_PLACEHOLDER = "your_plugin"           # 工具名前缀（snake_case）
DESC_EN = "一个演示 dsh 0.2.x 完整结构的插件：工具 + 技能 + 系统提示 + 插件页面 + 数据持久化。"
DESC_CN = "我的第一个 dsh 插件：备忘闭环演示（工具 + 插件页面写同一份数据）。"


def derive_names(name: str):
    """从 npm 包名推导 (包名, 插件id, snake前缀)。"""
    short = name.split("/")[-1]
    if short.startswith("dsh-"):
        short = short[len("dsh-"):]
    if not re.match(r"^[a-z][a-z0-9-]*$", short):
        raise SystemExit(f"[scaffold] 插件 id 非法：{short}（要小写字母开头，仅小写字母/数字/连字符）")
    return name, short, short.replace("-", "_")


def replace_in_file(path, package, plugin_id, snake, desc):
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()

    # 顺序重要：先 snake 前缀（工具名），再完整包名，再剩余的 id（BASE/消息/技能名）
    text = text.replace(SNAKE_PLACEHOLDER, snake)
    text = text.replace(PACKAGE_PLACEHOLDER, package)
    text = text.replace(ID_PLACEHOLDER, plugin_id)
    if desc:
        text = text.replace(DESC_EN, desc)
        text = text.replace(DESC_CN, desc)

    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def main():
    ap = argparse.ArgumentParser(description="生成 dsh 0.2.x 插件项目骨架")
    ap.add_argument("target", help="目标项目目录（会被创建，必须为空）")
    ap.add_argument("--name", default="dsh-my-plugin",
                    help="npm 包名，如 dsh-my-plugin 或 @me/my-plugin")
    ap.add_argument("--desc", default="", help="一句话描述")
    args = ap.parse_args()

    package, plugin_id, snake = derive_names(args.name)
    target = os.path.abspath(args.target)
    if os.path.exists(target) and os.listdir(target):
        print(f"[scaffold] 错误：目标目录非空：{target}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(target, exist_ok=True)
    SKIP_DIRS = {"node_modules", "dist", ".dsh-sandbox", ".tmp"}  # 依赖与构建产物不进骨架
    for root, dirs, files in os.walk(SKELETON):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        rel = os.path.relpath(root, SKELETON)
        dst_dir = target if rel == "." else os.path.join(target, rel)
        os.makedirs(dst_dir, exist_ok=True)
        for fn in files:
            src = os.path.join(root, fn)
            dst = os.path.join(dst_dir, fn)
            shutil.copy2(src, dst)
            if fn.endswith((".json", ".yml", ".yaml", ".js", ".mjs", ".cjs", ".sh", ".ps1",
                            ".py", ".md", ".html", ".ts", ".tsx")):
                replace_in_file(dst, package, plugin_id, snake, args.desc)

    # node_modules / 产物不入骨架；dev-sandbox.sh 需要 可执行位（Windows 无所谓）
    try:
        os.chmod(os.path.join(target, "scripts", "dev-sandbox.sh"), 0o755)
    except OSError:
        pass

    print(f"[scaffold] 已生成插件骨架：{target}")
    print(f"[scaffold] 包名：{package}   插件 id：{plugin_id}   工具前缀：{snake}_")
    print("下一步：")
    print("  1) cd <目标目录> && npm install && npm test && npm run build   # 基线全绿")
    print("  2) 按 assets/plugin-skeleton/README.md 的「改名清单」核对占位符都换干净")
    print("  3) 开发调试：scripts/dev-sandbox.sh 4311（Windows: scripts\\dev-sandbox.ps1）")
    print("     或直接安装：dsh plugin --profile web add file:<项目绝对路径> && dsh --profile web")
    print("  4) 按 SKILL.md 第 3 步实现你的能力（按需读 references/）")


if __name__ == "__main__":
    main()

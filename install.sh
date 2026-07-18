#!/bin/zsh
# Codex Doll Skin 一键安装器
# 用法： curl -fsSL https://raw.githubusercontent.com/d100000/CodeX-Skin/main/install.sh | bash
# 无需系统 Node / npm / git —— 直接使用 Codex 自带的 Node 运行时。
set -euo pipefail

REPO="d100000/CodeX-Skin"
BRANCH="main"
CODEX_APP="${CODEX_APP_PATH:-/Applications/ChatGPT.app}"
NODE="$CODEX_APP/Contents/Resources/cua_node/bin/node"

printf '\n\033[1m▶ Codex Doll Skin 安装程序\033[0m\n\n'

if [ ! -d "$CODEX_APP" ]; then
  echo "✗ 未找到 Codex 桌面版（$CODEX_APP）。"
  echo "  请先安装 Codex，再重新运行本脚本。"
  exit 1
fi
if [ ! -x "$NODE" ]; then
  echo "✗ 未找到 Codex 内置 Node（$NODE）。"
  echo "  可能是 Codex 版本较旧，请更新 Codex 后重试。"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "▶ 正在从 GitHub 下载皮肤运行时…"
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar -xz -C "$WORK"
SRC="$WORK/$(ls "$WORK")"

echo "▶ 正在安装启动器与运行时…"
cd "$SRC"
"$NODE" installer/cli.mjs install-launcher >/dev/null

# 版本兼容提示（不阻断安装）
INSTALLED_VER="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$CODEX_APP/Contents/Info.plist" 2>/dev/null || echo '?')"
TESTED_VER="$("$NODE" -e 'console.log(JSON.parse(require("fs").readFileSync("theme/manifest.json")).minimumCodexVersion)' 2>/dev/null || echo '?')"

printf '\n\033[1;32m✓ 安装完成！\033[0m\n\n'
echo "启动方式："
echo "  1. 退出当前 Codex（⌘Q）"
echo "  2. 打开 访达 → 应用程序（或个人 ~/Applications），双击 “Codex Doll Skin”"
echo "     或运行： open ~/Applications/\"Codex Doll Skin.app\""
echo "  3. 窗口顶部中间的 “D” 按钮即皮肤管理器"
echo ""
if [ "$INSTALLED_VER" != "$TESTED_VER" ]; then
  echo "ℹ 你的 Codex 版本 $INSTALLED_VER 与验证版本 $TESTED_VER 不同，"
  echo "  皮肤仍可注入，个别样式可能有偏差；如遇异常可反馈。"
fi
echo "卸载： curl -fsSL https://raw.githubusercontent.com/$REPO/$BRANCH/uninstall.sh | bash"

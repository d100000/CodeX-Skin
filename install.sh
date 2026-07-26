#!/bin/bash
# aha-codex 一键安装脚本
#
#   curl -fsSL https://raw.githubusercontent.com/d100000/CodeX-Skin/main/install.sh | bash
#
# 做的事：从 GitHub Release 取 latest.json → 下载对应的 aha-codex.app.tar.gz →
# 解压到 /Applications → 去掉 quarantine（应用未经 Apple 公证，不去掉的话首次要右键打开）→ 启动。
# 之后升级不再需要本脚本：应用内置签名自动更新器，启动时会自己检查 GitHub Release。
#
# （旧版"注入式启动器"的安装脚本已由本文件取代；开发者仍可在仓库里用 npm run install-launcher。）
set -euo pipefail

MANIFEST_URL="https://github.com/d100000/CodeX-Skin/releases/latest/download/latest.json"
APP_NAME="aha-codex"
DEST="/Applications"

say() { printf '\033[1;35m[aha-codex]\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m[aha-codex]\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "只支持 macOS。"
[ "$(uname -m)" = "arm64" ] || die "当前版本只提供 Apple Silicon (arm64) 构建，你的机器是 $(uname -m)。"

say "获取最新版本信息……"
manifest="$(curl -fsSL "$MANIFEST_URL")" || die "无法访问 GitHub Release，请检查网络。"
version="$(printf '%s' "$manifest" | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')"
url="$(printf '%s' "$manifest" | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["platforms"]["darwin-aarch64"]["url"])')"

workdir="$(mktemp -d /tmp/aha-codex-install.XXXXXX)"
trap 'rm -rf "$workdir"' EXIT

say "下载 aha-codex v${version}……"
curl -fL --progress-bar "$url" -o "$workdir/app.tar.gz"

say "安装到 ${DEST}……"
tar -xzf "$workdir/app.tar.gz" -C "$workdir"
[ -d "$workdir/${APP_NAME}.app" ] || die "更新包结构异常，未找到 ${APP_NAME}.app。"

# 正在运行的话先退出，避免替换正在使用的二进制
if pgrep -xq "$APP_NAME"; then
  say "退出正在运行的 aha-codex……"
  osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 || pkill -x "$APP_NAME" || true
  sleep 1
fi

rm -rf "${DEST:?}/${APP_NAME}.app"
mv "$workdir/${APP_NAME}.app" "$DEST/"

# 未经 Apple 公证；去掉 quarantine 后无需右键打开
xattr -dr com.apple.quarantine "${DEST}/${APP_NAME}.app" 2>/dev/null || true

say "安装完成，正在启动 aha-codex v${version} 🎀"
open "${DEST}/${APP_NAME}.app"

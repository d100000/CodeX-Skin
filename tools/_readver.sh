#!/bin/zsh
# 从 theme/manifest.json 读出 version（供构建脚本使用，无需依赖 jq）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
/usr/bin/grep -o '"version"[^,]*' "$ROOT/theme/manifest.json" | head -1 | /usr/bin/sed 's/.*"\([0-9][0-9.]*\)".*/\1/'

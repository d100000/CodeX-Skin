#!/bin/zsh
# Codex Doll Skin 卸载器
# 用法： curl -fsSL https://raw.githubusercontent.com/d100000/CodeX-Skin/main/uninstall.sh | bash
set -euo pipefail

printf '\n\033[1m▶ Codex Doll Skin 卸载程序\033[0m\n\n'

rm -rf "$HOME/Applications/Codex Doll Skin.app"
rm -rf "$HOME/.codex/codex-doll-skin"
rm -rf "$HOME/.codex/codex-doll-skin.old"

printf '\033[1;32m✓ 已卸载启动器与运行时。\033[0m\n\n'
echo "· 之后请从原始 Codex 图标启动，即为未换肤的原版。"
echo "· 你在皮肤管理器里保存的自定义主题存放在 Codex 用户数据中，"
echo "  卸载不会删除它们（重新安装即可恢复）。如需彻底清除，"
echo "  可在换肤状态下用管理器逐个删除后再卸载。"

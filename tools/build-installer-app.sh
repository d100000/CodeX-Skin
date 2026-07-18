#!/bin/zsh
# 构建 macOS 双击安装包（.app + .dmg）。产物在 dist/。
# 无需 Apple 开发者证书即可构建；仅签名/公证需要（未签名首启需右键→打开）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/dist/pkg"
APP="$BUILD/Codex Doll Skin Installer.app"
DMG="$ROOT/dist/Codex-Doll-Skin-Installer.dmg"
VERSION="$("$ROOT"/tools/_readver.sh 2>/dev/null || echo 0.0.0)"

echo "▶ 清理构建目录…"
rm -rf "$BUILD" "$DMG"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app"

echo "▶ 拷贝运行时源码到 App 内…"
# 只带 install-launcher 需要的文件（与 installer/cli.mjs 的清单一致）
FILES=(
  installer/cdp.mjs installer/runtime.mjs installer/cli.mjs
  installer/theme-manager.mjs installer/updater.mjs
  installer/manager/00-core.js installer/manager/01-store.js
  installer/manager/02-preview.js installer/manager/03-editor.js
  installer/manager/04-panel.js installer/manager/manager.css
  installer/manager/presets.json
  theme/skin.css theme/manifest.json theme/theme.schema.json
  public/assets/doll-sakura-hero.webp public/assets/doll-room-light.webp
  public/assets/doll-character-side.jpg public/assets/qq-mascot.jpg
  public/assets/qq-friend.jpg public/assets/AppIcon.icns
)
for f in "${FILES[@]}"; do
  mkdir -p "$APP/Contents/Resources/app/$(dirname "$f")"
  cp "$ROOT/$f" "$APP/Contents/Resources/app/$f"
done

echo "▶ 写入应用图标…"
if [ -f "$ROOT/public/assets/AppIcon.icns" ]; then
  cp "$ROOT/public/assets/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
fi

echo "▶ 写入安装脚本与 Info.plist…"
cat > "$APP/Contents/MacOS/installer" <<'SCRIPT'
#!/bin/zsh
set -euo pipefail
HERE="$(cd "$(dirname "$0")/../Resources/app" && pwd)"
CODEX_APP="/Applications/ChatGPT.app"
NODE="$CODEX_APP/Contents/Resources/cua_node/bin/node"
LOG="/tmp/codex-doll-install.log"

if [ ! -x "$NODE" ]; then
  osascript -e 'display alert "未找到 Codex" message "请先安装 Codex 桌面版（ChatGPT.app），然后再运行本安装器。" as critical'
  exit 1
fi

cd "$HERE"
if "$NODE" installer/cli.mjs install-launcher >"$LOG" 2>&1; then
  osascript <<'OSA'
set act to button returned of (display alert "安装完成 ✓" message "已创建 “Codex Doll Skin”。请先退出当前 Codex（⌘Q），再从启动台或 ~/Applications 打开 “Codex Doll Skin”。窗口顶部中间的 D 按钮即皮肤管理器。" buttons {"稍后", "立即打开"} default button "立即打开")
if act is "立即打开" then
  try
    do shell script "open " & quoted form of (POSIX path of (path to home folder)) & "Applications/Codex Doll Skin.app"
  end try
end if
OSA
else
  osascript -e 'display alert "安装失败" message "请把 /tmp/codex-doll-install.log 反馈给开发者。" as critical'
  exit 1
fi
SCRIPT
chmod +x "$APP/Contents/MacOS/installer"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>Codex 皮肤安装器</string>
<key>CFBundleName</key><string>Codex Doll Skin Installer</string>
<key>CFBundleExecutable</key><string>installer</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundleIdentifier</key><string>com.dollskin.codex.installer</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${VERSION}</string>
<key>LSMinimumSystemVersion</key><string>12.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST

echo "▶ 清理扩展属性并 Ad-hoc 签名（不消除 Gatekeeper 提示，但避免“已损坏”报错）…"
xattr -cr "$APP" 2>/dev/null || true
codesign --force --deep --sign - "$APP" 2>&1 | sed 's/^/  /' || echo "  （codesign 跳过）"

echo "▶ 打包 .dmg…"
STAGE="$BUILD/dmgroot"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/拖到这里也可（可选）" 2>/dev/null || true
hdiutil create -volname "Codex Doll Skin" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null

echo ""
echo "✓ 完成： $DMG"
echo "  分发说明：对方双击 .dmg → 右键“Codex 皮肤安装器”→ 打开（首次绕过未签名提示）→ 按提示完成。"

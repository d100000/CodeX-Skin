#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, evaluateSkinState, isMainCodexPage, listPages, setSkinPaused } from "./cdp.mjs";

const DEFAULT_APP = "/Applications/ChatGPT.app";
const DEFAULT_PORT = 9227;
const INSTALL_ROOT = join(homedir(), ".codex", "codex-doll-skin");
const manifest = JSON.parse(readFileSync(new URL("../theme/manifest.json", import.meta.url), "utf8"));

function readVersion(appPath) {
  const plist = join(appPath, "Contents", "Info.plist");
  if (!existsSync(plist)) return null;
  return execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", plist], { encoding: "utf8" }).trim();
}

function doctor() {
  const appPath = process.env.CODEX_APP_PATH || DEFAULT_APP;
  const version = readVersion(appPath);
  const running = (() => {
    try {
      execFileSync("pgrep", ["-f", `${appPath}/Contents/MacOS/ChatGPT`], { stdio: "ignore" });
      return true;
    } catch { return false; }
  })();
  const result = {
    ok: Boolean(version),
    appPath,
    installedVersion: version,
    testedVersion: manifest.minimumCodexVersion,
    exactVersionMatch: version === manifest.minimumCodexVersion,
    running,
    userDataPath: join(homedir(), "Library", "Application Support", "Codex"),
    installEnabled: version === manifest.minimumCodexVersion,
    reason: running
      ? "Quit Codex before launching the skinned runtime."
      : version === manifest.minimumCodexVersion
        ? "Runtime injection is verified for this build."
        : "This Codex version has not been verified."
  };
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

function installRuntime() {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const files = [
    "installer/cdp.mjs",
    "installer/runtime.mjs",
    "installer/cli.mjs",
    "installer/theme-manager.mjs",
    "installer/updater.mjs",
    "installer/manager/00-core.js",
    "installer/manager/01-store.js",
    "installer/manager/02-preview.js",
    "installer/manager/03-editor.js",
    "installer/manager/04-panel.js",
    "installer/manager/manager.css",
    "installer/manager/presets.json",
    "theme/skin.css",
    "theme/manifest.json",
    "theme/theme.schema.json",
    "public/assets/doll-sakura-hero.webp",
    "public/assets/doll-room-light.webp",
    "public/assets/doll-character-side.jpg",
    "public/assets/qq-mascot.jpg",
    "public/assets/qq-friend.jpg",
  ];
  const temporary = `${INSTALL_ROOT}.tmp-${process.pid}`;
  rmSync(temporary, { recursive: true, force: true });
  for (const relative of files) {
    const destination = join(temporary, relative);
    mkdirSync(join(destination, ".."), { recursive: true });
    copyFileSync(join(projectRoot, relative), destination);
  }
  rmSync(INSTALL_ROOT, { recursive: true, force: true });
  mkdirSync(join(INSTALL_ROOT, ".."), { recursive: true });
  execFileSync("/bin/mv", [temporary, INSTALL_ROOT]);
  return INSTALL_ROOT;
}

function installLauncher() {
  const destination = join(homedir(), "Applications", "Codex Doll Skin.app");
  const contents = join(destination, "Contents");
  const macos = join(contents, "MacOS");
  const resources = join(contents, "Resources");
  mkdirSync(macos, { recursive: true });
  mkdirSync(resources, { recursive: true });
  const installRoot = installRuntime();
  const bundledNode = join(DEFAULT_APP, "Contents", "Resources", "cua_node", "bin", "node");
  const executable = `#!/bin/zsh
set -euo pipefail
APP_PATH="${DEFAULT_APP}"
PORT=9227
if pgrep -f "$APP_PATH/Contents/MacOS/ChatGPT" >/dev/null; then
  osascript -e 'display alert "Codex 正在运行" message "请先退出 Codex，再从 Codex Doll Skin 启动。" as warning'
  exit 1
fi
"$APP_PATH/Contents/MacOS/ChatGPT" --remote-debugging-address=127.0.0.1 --remote-debugging-port="$PORT" &
CODEX_PID=$!
CODEX_SKIN_PORT="$PORT" ${JSON.stringify(bundledNode)} ${JSON.stringify(join(installRoot, "installer", "runtime.mjs"))}
wait "$CODEX_PID"
`;
  writeFileSync(join(macos, "Codex Doll Skin"), executable);
  chmodSync(join(macos, "Codex Doll Skin"), 0o755);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>Codex Doll Skin</string>
<key>CFBundleExecutable</key><string>Codex Doll Skin</string>
<key>CFBundleIdentifier</key><string>com.dollskin.codex.launcher</string>
<key>CFBundleName</key><string>Codex Doll Skin</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${manifest.version}</string>
<key>LSUIElement</key><false/>
</dict></plist>`;
  writeFileSync(join(contents, "Info.plist"), plist);
  console.log(JSON.stringify({ ok: true, destination, installRoot, node: bundledNode, mode: "runtime-injection", modifiesCodex: false }, null, 2));
}

async function forMainPages(action) {
  const pages = (await listPages(DEFAULT_PORT)).filter(isMainCodexPage);
  if (!pages.length) throw new Error("No Codex main window found. Launch Codex Doll Skin first.");
  const values = [];
  for (const page of pages) {
    const client = connect(page.webSocketDebuggerUrl);
    try { values.push(await action(client)); }
    finally { client.close(); }
  }
  return values;
}

async function runtimeCommand(command) {
  if (command === "status") return forMainPages(evaluateSkinState);
  if (command === "pause") return forMainPages((client) => setSkinPaused(client, true));
  if (command === "apply") return forMainPages((client) => setSkinPaused(client, false));
  throw new Error(`Unknown runtime command: ${command}`);
}

const command = process.argv[2] || "doctor";
if (command === "doctor") process.exitCode = doctor();
else if (command === "install-launcher") installLauncher();
else if (["status", "pause", "apply"].includes(command)) {
  runtimeCommand(command)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
else if (["check-update", "update", "sync-themes"].includes(command)) {
  import("./updater.mjs")
    .then(({ checkUpdate, selfUpdate, syncThemes }) => {
      if (command === "check-update") return checkUpdate();
      if (command === "update") return selfUpdate();
      return syncThemes(DEFAULT_PORT);
    })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
else {
  console.error(`Unknown command: ${command}. Available: doctor, install-launcher, status, pause, apply, check-update, update, sync-themes`);
  process.exitCode = 2;
}

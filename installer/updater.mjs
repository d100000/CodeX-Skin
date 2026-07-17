// 版本与更新体系：全部联网动作都在 Node 侧执行，注入页面保持零外联。
// - checkUpdate / selfUpdate：对比远端 manifest 版本，下载运行时文件到安装根目录（下次启动生效）
// - syncThemes：拉取远端 themes/index.json，比对本地库（内置预设跳过），导入新增/变更的云端主题
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { connect, listPages, isMainCodexPage } from "./cdp.mjs";

const INSTALL_ROOT = join(homedir(), ".codex", "codex-doll-skin");

// 与 cli.mjs 的安装清单保持一致（自更新按此列表拉取文件）
export const RUNTIME_FILES = [
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

export function compareVersions(a, b) {
  const parse = (value) => String(value || "0").split(".").map((part) => parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function localManifest() {
  return JSON.parse(await readFile(new URL("../theme/manifest.json", import.meta.url), "utf8"));
}

async function fetchRemote(rawBase, path, asJson = true) {
  const response = await fetch(`${rawBase}/${path}`, { headers: { "cache-control": "no-cache" } });
  if (!response.ok) throw new Error(`拉取 ${path} 失败：HTTP ${response.status}`);
  return asJson ? response.json() : Buffer.from(await response.arrayBuffer());
}

export async function checkUpdate() {
  const manifest = await localManifest();
  const rawBase = manifest.updates && manifest.updates.rawBase;
  if (!rawBase) return { ok: false, reason: "manifest.updates.rawBase 未配置" };
  const remote = await fetchRemote(rawBase, "theme/manifest.json");
  return {
    ok: true,
    localVersion: manifest.version,
    remoteVersion: remote.version,
    hasUpdate: compareVersions(remote.version, manifest.version) > 0,
  };
}

// 自更新：把远端运行时文件原子替换进安装根目录；正在运行的 Codex 不受影响，下次启动生效。
export async function selfUpdate() {
  const status = await checkUpdate();
  if (!status.ok) return status;
  if (!status.hasUpdate) return { ...status, updated: false };
  const manifest = await localManifest();
  const rawBase = manifest.updates.rawBase;
  const staging = `${INSTALL_ROOT}.update-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  for (const file of RUNTIME_FILES) {
    const bytes = await fetchRemote(rawBase, file, false);
    const destination = join(staging, file);
    await mkdir(join(destination, ".."), { recursive: true });
    await writeFile(destination, bytes);
  }
  if (existsSync(INSTALL_ROOT)) await rm(`${INSTALL_ROOT}.old`, { recursive: true, force: true }).then(() => rename(INSTALL_ROOT, `${INSTALL_ROOT}.old`));
  await rename(staging, INSTALL_ROOT);
  await rm(`${INSTALL_ROOT}.old`, { recursive: true, force: true });
  return { ...status, updated: true, note: "运行时已更新，重启 Codex Doll Skin 生效" };
}

// 主题云同步：内置预设 id 跳过；远端新增或哈希变化的主题写入运行中 Codex 的主题库。
export async function syncThemes(port = 9227, { notifyAlways = false } = {}) {
  const manifest = await localManifest();
  const rawBase = manifest.updates && manifest.updates.rawBase;
  if (!rawBase) return { ok: false, reason: "manifest.updates.rawBase 未配置" };
  const presets = JSON.parse(await readFile(new URL("./manager/presets.json", import.meta.url), "utf8"));
  const builtinIds = new Set(presets.map((preset) => preset.id));
  const index = await fetchRemote(rawBase, "themes/index.json");
  const pages = (await listPages(port)).filter(isMainCodexPage);
  if (!pages.length) return { ok: false, reason: "Codex 未运行（需要通过 Codex Doll Skin 启动）" };
  const client = connect(pages[0].webSocketDebuggerUrl);
  try {
    const stateResponse = await client.send("Runtime.evaluate", {
      expression: `(async () => {
        const db = await new Promise((res, rej) => { const q = indexedDB.open("codex-doll-skin-library", 1); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        const all = await new Promise((res) => { const t = db.transaction("themes", "readonly").objectStore("themes").getAll(); t.onsuccess = () => res(t.result); });
        db.close();
        return JSON.stringify(Object.fromEntries(all.map((t) => [t.id, t.remoteHash || null])));
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    const local = JSON.parse(stateResponse.result.value || "{}");
    const pulled = [];
    for (const entry of index.themes || []) {
      if (builtinIds.has(entry.id)) continue;
      if (local[entry.id] === entry.sha256) continue;
      if (entry.id in local && local[entry.id] === null) continue; // 用户自建同名主题，不覆盖
      const bytes = await fetchRemote(rawBase, `themes/${entry.file}`, false);
      if (sha256(bytes) !== entry.sha256) throw new Error(`${entry.file} 哈希校验失败`);
      const theme = JSON.parse(bytes.toString("utf8"));
      theme.remoteHash = entry.sha256;
      theme.remoteManaged = true;
      const putResponse = await client.send("Runtime.evaluate", {
        expression: `(async () => {
          const theme = ${JSON.stringify(JSON.stringify(theme))};
          const record = JSON.parse(theme);
          const db = await new Promise((res, rej) => { const q = indexedDB.open("codex-doll-skin-library", 1); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
          await new Promise((res, rej) => { const t = db.transaction("themes", "readwrite").objectStore("themes").put(record); t.onsuccess = res; t.onerror = () => rej(t.error); });
          db.close();
          return true;
        })()`,
        returnByValue: true,
        awaitPromise: true,
      });
      if (putResponse.exceptionDetails) throw new Error(`写入主题 ${entry.id} 失败`);
      pulled.push(entry.id);
    }
    if (pulled.length || notifyAlways) {
      const message = pulled.length ? `已从云端同步 ${pulled.length} 个主题` : "云端主题已是最新";
      await client.send("Runtime.evaluate", {
        expression: `(async () => {
          if (window.__CODEX_DOLL_SKIN_MANAGER__) {
            ${pulled.length ? "await window.__CODEX_DOLL_SKIN_MANAGER__.refresh();" : ""}
            if (window.__CODEX_DOLL_SKIN_MANAGER__.notify) window.__CODEX_DOLL_SKIN_MANAGER__.notify(${JSON.stringify(message)});
          }
          return true;
        })()`,
        returnByValue: true,
        awaitPromise: true,
      });
    }
    return { ok: true, remoteCount: (index.themes || []).length, pulled };
  } finally {
    client.close();
  }
}

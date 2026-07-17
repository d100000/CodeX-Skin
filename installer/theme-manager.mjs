import { readFile } from "node:fs/promises";

const FRAGMENTS = ["00-core.js", "01-store.js", "02-preview.js", "03-editor.js", "04-panel.js"];
const managerDir = new URL("./manager/", import.meta.url);
const defaultAssetDir = new URL("../public/assets/", import.meta.url);

const MIME_TYPES = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

// 将文本中的 asset://<file> 占位符替换为内嵌 data URL，注入页面无需任何文件权限。
export async function embedAssets(text, assetDir = defaultAssetDir) {
  const references = [...new Set(text.match(/asset:\/\/[a-zA-Z0-9._-]+/g) || [])];
  for (const reference of references) {
    const name = reference.slice("asset://".length);
    const extension = name.slice(name.lastIndexOf("."));
    const mime = MIME_TYPES[extension] || "application/octet-stream";
    const bytes = await readFile(new URL(name, assetDir));
    text = text.replaceAll(reference, `data:${mime};base64,${bytes.toString("base64")}`);
  }
  return text;
}

// 装配注入脚本：核心/存储/预览/编辑器/面板五个片段拼进同一个 IIFE 作用域。
export async function buildThemeManagerSource(baseCss) {
  const [managerCss, presetsJson, manifestJson, ...fragments] = await Promise.all([
    readFile(new URL("manager.css", managerDir), "utf8"),
    readFile(new URL("presets.json", managerDir), "utf8").then((text) => embedAssets(text)),
    readFile(new URL("../theme/manifest.json", import.meta.url), "utf8"),
    ...FRAGMENTS.map((name) => readFile(new URL(name, managerDir), "utf8"))
  ]);
  const manifest = JSON.parse(manifestJson);
  return `(() => {
  if (window.__CODEX_DOLL_SKIN_MANAGER__) {
    window.__CODEX_DOLL_SKIN_MANAGER__.refresh();
    return window.__CODEX_DOLL_SKIN_MANAGER__.state();
  }
  const BASE_CSS = ${JSON.stringify(baseCss)};
  const MANAGER_CSS = ${JSON.stringify(managerCss)};
  const VERSION = ${JSON.stringify(manifest.version || "0.0.0")};
  const PRESETS = ${presetsJson};
${fragments.join("\n")}
  return boot();
})()`;
}

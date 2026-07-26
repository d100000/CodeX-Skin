import { mkdir, writeFile } from "node:fs/promises";
import { buildThemeManagerSource } from "../installer/theme-manager.mjs";
import { loadSkinCss, workspaceRootUrl } from "../installer/cdp.mjs";

const output = new URL("../src-tauri/resources/skin-agent.js", import.meta.url);
const css = await loadSkinCss(workspaceRootUrl());
const manager = await buildThemeManagerSource(css);
const source = `window.__DOLL_SKIN_EXTERNAL__ = true;\n${manager}`;

await mkdir(new URL("../src-tauri/resources/", import.meta.url), { recursive: true });
await writeFile(output, source);
console.log(`Built standalone skin agent (${Math.round(source.length / 1024)} KB)`);

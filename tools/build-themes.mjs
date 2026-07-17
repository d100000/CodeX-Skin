#!/usr/bin/env node
// 构建 themes/ 发布目录：内置预设导出为可移植 .codexskin.json（资产内嵌为 data URL），
// 连同手工放入 themes/ 的云端主题一起生成 index.json（含 sha256，供客户端校验同步）。
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { embedAssets } from "../installer/theme-manager.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const themesDir = join(root, "themes");
await mkdir(themesDir, { recursive: true });

// 1. 内置预设 → 可移植主题文件
const presetsRaw = await embedAssets(await readFile(join(root, "installer/manager/presets.json"), "utf8"));
for (const preset of JSON.parse(presetsRaw)) {
  const { preview, ...portable } = preset;
  await writeFile(join(themesDir, `${preset.id}.codexskin.json`), JSON.stringify(portable, null, 2));
}

// 2. 汇总 themes/ 下全部主题生成索引
const entries = [];
for (const file of (await readdir(themesDir)).filter((name) => name.endsWith(".codexskin.json")).sort()) {
  const bytes = await readFile(join(themesDir, file));
  const theme = JSON.parse(bytes.toString("utf8"));
  entries.push({
    id: theme.id,
    name: theme.name,
    file,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(join(themesDir, "index.json"), JSON.stringify({ themes: entries }, null, 2));
console.log(JSON.stringify({ ok: true, themes: entries.map((entry) => `${entry.id} (${Math.round(entry.bytes / 1024)}KB)`) }, null, 2));

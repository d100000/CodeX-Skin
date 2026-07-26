import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const sourceNames = (await readdir(new URL("../Image/", import.meta.url))).filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
const themes = JSON.parse(await readFile(new URL("../src/generated-image-themes.json", import.meta.url), "utf8"));

test("every Image PNG becomes one classified predicted theme", () => {
  assert.equal(themes.length, sourceNames.length);
  assert.equal(new Set(themes.map((theme) => theme.id)).size, themes.length);
  for (const theme of themes) {
    assert.equal(theme.predicted, true);
    assert.ok(theme.category);
    assert.ok(theme.paletteLabel);
    assert.match(theme.colors.accent, /^#[0-9a-f]{6}$/);
    assert.match(theme.background, /^asset:\/\/predicted-[0-9a-f]{12}\.webp$/);
  }
});

test("predicted theme assets exist and stay compact", async () => {
  let total = 0;
  for (const theme of themes) {
    const name = theme.background.slice("asset://".length);
    total += (await stat(new URL(`../preset-assets/${name}`, import.meta.url))).size;
  }
  assert.ok(total > 1024 * 1024);
  assert.ok(total < 20 * 1024 * 1024, `predicted assets are ${(total / 1024 / 1024).toFixed(1)} MB`);
});

test("classification covers a useful range of styles and palettes", () => {
  assert.ok(new Set(themes.map((theme) => theme.category)).size >= 8);
  assert.ok(new Set(themes.map((theme) => theme.paletteLabel)).size >= 8);
});

test("predicted assets stay out of the app bundle and resolve from GitHub", async () => {
  // 安装包瘦身：预测背景不进 public/（即不进 dist），由 GitHub 托管按需下载
  const bundled = await readdir(new URL("../public/assets/", import.meta.url));
  assert.deepEqual(bundled.filter((name) => name.startsWith("predicted-")), [], "public/assets 不允许再出现 predicted-* 资产");
  const presets = await readFile(new URL("../src/presets.js", import.meta.url), "utf8");
  assert.match(presets, /raw\.githubusercontent\.com\/d100000\/CodeX-Skin\/main\/preset-assets\//, "远程基址必须固定指向本仓库");
  assert.match(presets, /cache_preset_asset/, "桌面端必须走 Rust 缓存命令");
  const rust = await readFile(new URL("../src-tauri/src/model_config.rs", import.meta.url), "utf8");
  assert.match(rust, /strip_prefix\("predicted-"\)/, "Rust 侧必须做资产名白名单校验");
  assert.match(rust, /raw\.githubusercontent\.com\/d100000\/CodeX-Skin\/main\/preset-assets\//, "下载域名必须固定");
});

test("first launch asks the user whether to sync preset themes", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /presetSync: null/, "presetSync 默认必须是 null（未选择）");
  assert.match(app, /settings\.presetSync === null/, "首次启动必须弹窗询问");
  assert.match(app, /同步 GitHub 预设主题/, "设置里必须有事后开关");
  assert.match(app, /builtins\.filter\(\(theme\) => !theme\.predicted\)/, "未同步时必须过滤预测主题");
});

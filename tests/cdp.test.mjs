import test from "node:test";
import assert from "node:assert/strict";
import { isMainCodexPage, loadSkinCss, workspaceRootUrl } from "../installer/cdp.mjs";
import { buildThemeManagerSource } from "../installer/theme-manager.mjs";

test("runtime embeds skin assets without external file permissions", async () => {
  const css = await loadSkinCss(workspaceRootUrl());
  assert.doesNotMatch(css, /asset:\/\//);
  assert.match(css, /data:image\/webp;base64,/);
});

test("pet and avatar overlay windows are excluded from skin injection", () => {
  assert.equal(isMainCodexPage({ type: "page", url: "app://-/index.html" }), true);
  assert.equal(isMainCodexPage({ type: "page", url: "app://-/index.html?initialRoute=%2Favatar-overlay" }), false);
  assert.equal(isMainCodexPage({ type: "page", url: "app://-/index.html?initialRoute=%2Favatar-overlay-native" }), false);
});

test("assembled manager keeps the runtime injection contract", async () => {
  const source = await buildThemeManagerSource("/* base */");
  assert.match(source, /codex-doll-skin-runtime/);
  assert.match(source, /codex-doll-theme-override/);
  assert.match(source, /codex-doll-skin-menu/);
  assert.match(source, /codex-doll-skin-manager/);
  assert.match(source, /codex-doll-skin-library/);
  assert.match(source, /codexDollSkinPaused/);
  assert.match(source, /codexDollCurrentTheme/);
  assert.match(source, /image\/png,image\/jpeg,image\/webp/);
  assert.match(source, /1920 \/ image\.width/);
});

test("assembled manager embeds preset assets without external references", async () => {
  const source = await buildThemeManagerSource("");
  assert.doesNotMatch(source, /asset:\/\//);
  assert.match(source, /data:image\/webp;base64,/);
  const presetCount = (source.match(/"schemaVersion": 3/g) || []).length;
  assert.ok(presetCount >= 3, "expected at least 3 built-in presets");
});

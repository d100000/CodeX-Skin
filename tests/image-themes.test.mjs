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
    total += (await stat(new URL(`../public/assets/${name}`, import.meta.url))).size;
  }
  assert.ok(total > 1024 * 1024);
  assert.ok(total < 20 * 1024 * 1024, `predicted assets are ${(total / 1024 / 1024).toFixed(1)} MB`);
});

test("classification covers a useful range of styles and palettes", () => {
  assert.ok(new Set(themes.map((theme) => theme.category)).size >= 8);
  assert.ok(new Set(themes.map((theme) => theme.paletteLabel)).size >= 8);
});

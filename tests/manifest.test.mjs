import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("theme manifest exposes required runtime files", async () => {
  const manifest = JSON.parse(await readFile(new URL("../theme/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.id, "codex-doll-skin");
  assert.match(manifest.minimumCodexVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.runtime.enhancerEnabledByDefault, false);
});

test("runtime skin uses asset placeholders and Codex color tokens", async () => {
  const css = await readFile(new URL("../theme/skin.css", import.meta.url), "utf8");
  assert.match(css, /asset:\/\/doll-sakura-hero\.webp/);
  assert.match(css, /--color-background-surface/);
  assert.match(css, /prefers-reduced-motion/);
});

test("runtime skin targets stable Codex product surfaces", async () => {
  const css = await readFile(new URL("../theme/skin.css", import.meta.url), "utf8");
  assert.match(css, /\.app-shell-left-panel/);
  assert.match(css, /\.main-surface/);
  assert.match(css, /\.composer-surface-chrome/);
  assert.match(css, /data-app-action-sidebar-thread-active/);
});

test("portable theme schema requires version, id, and name", async () => {
  const schema = JSON.parse(await readFile(new URL("../theme/theme.schema.json", import.meta.url), "utf8"));
  assert.deepEqual(schema.required, ["schemaVersion", "id", "name"]);
  assert.deepEqual(schema.properties.schemaVersion.enum, [1, 2, 3]);
  assert.equal(schema.properties.layout.properties.x.maximum, 100);
  assert.equal(schema.properties.filters.properties.blur.maximum, 20);
  assert.ok(schema.properties.background.anyOf.some((option) => option.const === "none"));
  assert.equal(schema.properties.shape.properties.radiusScale.maximum, 2.5);
  assert.deepEqual(schema.properties.shape.properties.shadow.enum, ["default", "none", "bold"]);
});

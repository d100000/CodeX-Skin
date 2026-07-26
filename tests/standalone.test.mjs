import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const tauriConfig = JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const rustSource = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const bridgeSource = await readFile(new URL("../src/bridge.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const managerSource = await readFile(new URL("../installer/theme-manager.mjs", import.meta.url), "utf8");
const generatedAgent = await readFile(new URL("../src-tauri/resources/skin-agent.js", import.meta.url), "utf8");

test("standalone package exposes Tauri development and bundle commands", () => {
  assert.equal(packageJson.name, "aha-codex");
  assert.equal(packageJson.version, "0.4.0");
  assert.equal(packageJson.scripts.dev, "tauri dev");
  assert.equal(packageJson.scripts["app:build"], "tauri build");
  assert.equal(tauriConfig.productName, "aha-codex");
  assert.equal(tauriConfig.identifier, "com.dollskin.studio");
  assert.deepEqual(tauriConfig.bundle.targets, ["app", "dmg"]);
});

test("desktop app exposes signed GitHub updater commands and artifacts", () => {
  assert.equal(tauriConfig.bundle.createUpdaterArtifacts, true);
  assert.match(tauriConfig.plugins.updater.endpoints[0], /github\.com\/d100000\/CodeX-Skin\/releases\/latest\/download\/latest\.json/);
  assert.ok(tauriConfig.plugins.updater.pubkey.length > 80);
  assert.match(rustSource, /tauri_plugin_updater::UpdaterExt/);
  assert.match(rustSource, /check_app_update/);
  assert.match(rustSource, /install_app_update/);
  assert.match(appSource, /app-version/);
  assert.match(appSource, /displayedVersion/);
});

test("native runtime owns Codex process control and CDP without bundled Node", () => {
  assert.match(rustSource, /remote-debugging-address=127\.0\.0\.1/);
  assert.match(rustSource, /\[::1\]/);
  assert.match(rustSource, /tokio_tungstenite/);
  assert.match(rustSource, /app_data_dir/);
  assert.doesNotMatch(rustSource, /cua_node|Contents\/Resources\/.*node/);
});

test("Studio bridge persists themes outside the Codex page origin", () => {
  assert.match(bridgeSource, /load_library/);
  assert.match(bridgeSource, /save_library/);
  assert.match(bridgeSource, /migrate_legacy_themes/);
});

test("generated agent hides the legacy in-Codex manager and exposes pause control", () => {
  assert.match(generatedAgent, /__DOLL_SKIN_EXTERNAL__/);
  assert.match(generatedAgent, /trigger\.hidden = Boolean\(window\.__DOLL_SKIN_EXTERNAL__\)/);
  assert.match(generatedAgent, /pause: setPaused/);
});

test("external injection has a statement boundary and reports JavaScript exceptions", () => {
  assert.match(rustSource, /\{AGENT_SOURCE\};\\n\(async/);
  assert.match(rustSource, /exceptionDetails/);
  assert.match(rustSource, /checked_runtime_result/);
});

test("external agent re-entry does not reload the Codex-local theme", () => {
  assert.match(managerSource, /if \(!window\.__DOLL_SKIN_EXTERNAL__\) \{\s*window\.__CODEX_DOLL_SKIN_MANAGER__\.refresh\(\)/);
});

test("disconnect clears target tracking so reconnect reapplies the current draft", () => {
  assert.match(appSource, /if \(!status\.connected\) \{\s*lastTargetKey\.current = "";\s*return;/);
  assert.match(appSource, /status\.managedTargetIds/);
  assert.match(rustSource, /target_has_skin_runtime/);
});

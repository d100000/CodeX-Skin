import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compareVersions, sha256, RUNTIME_FILES } from "../installer/updater.mjs";

test("compareVersions orders semver-ish strings", () => {
  assert.equal(compareVersions("0.2.0", "0.1.0"), 1);
  assert.equal(compareVersions("0.1.0", "0.2.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.10", "1.0.9"), 1);
  assert.equal(compareVersions("2.0", "1.9.9"), 1);
});

test("manifest declares version and update source", async () => {
  const manifest = JSON.parse(await readFile(new URL("../theme/manifest.json", import.meta.url), "utf8"));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.updates.rawBase, /^https:\/\/raw\.githubusercontent\.com\//);
  assert.equal(typeof manifest.updates.auto, "boolean");
});

test("self-update file list covers the installer file set from cli.mjs", async () => {
  const cli = await readFile(new URL("../installer/cli.mjs", import.meta.url), "utf8");
  for (const file of RUNTIME_FILES) {
    assert.ok(cli.includes(`"${file}"`), `cli.mjs 安装清单缺少 ${file}（两处清单必须一致）`);
  }
});

test("published themes index matches files and hashes", async () => {
  const index = JSON.parse(await readFile(new URL("../themes/index.json", import.meta.url), "utf8"));
  assert.ok(index.themes.length >= 5, "至少包含 4 套内置导出 + 1 套云端示例");
  for (const entry of index.themes) {
    const bytes = await readFile(new URL(`../themes/${entry.file}`, import.meta.url));
    assert.equal(sha256(bytes), entry.sha256, `${entry.file} 哈希与索引不一致（改动主题后需重跑 themes:build）`);
    const theme = JSON.parse(bytes.toString("utf8"));
    assert.equal(theme.id, entry.id);
    assert.doesNotMatch(bytes.toString("utf8"), /asset:\/\//, "发布主题必须内嵌资产");
  }
});

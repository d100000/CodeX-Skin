import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const presetsSource = await readFile(new URL("../src/model-presets.js", import.meta.url), "utf8");
const rustSource = await readFile(new URL("../src-tauri/src/model_config.rs", import.meta.url), "utf8");
const bridgeSource = await readFile(new URL("../src/bridge.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

// 用 import() 加载 ESM 预设表做结构校验
const { MODEL_PRESETS, PRESET_GROUPS } = await import("../src/model-presets.js");

test("model presets are well-formed and never ship real keys", () => {
  assert.ok(MODEL_PRESETS.length >= 10, "预设应覆盖主流供应商");
  const ids = new Set();
  for (const preset of MODEL_PRESETS) {
    assert.ok(preset.id && preset.name, "预设必须有 id 和名称");
    assert.ok(!ids.has(preset.id), `预设 id 重复：${preset.id}`);
    ids.add(preset.id);
    assert.ok(PRESET_GROUPS.includes(preset.group), `未知分组：${preset.group}`);
    assert.ok(["responses", "chat"].includes(preset.wireApi), `非法 wire_api：${preset.wireApi}`);
    if (preset.baseUrl) assert.match(preset.baseUrl, /^https:\/\//, `Base URL 必须是 https：${preset.baseUrl}`);
    assert.ok(!("apiKey" in preset), "预设绝不允许内置 API Key 字段");
  }
  assert.match(presetsSource, /绝不内置任何真实 Key/);
  assert.ok(!/sk-[A-Za-z0-9]{20}/.test(presetsSource), "预设源码不允许出现疑似真实 Key");
});

test("official preset exists and needs no key", () => {
  const official = MODEL_PRESETS.find((preset) => preset.official);
  assert.ok(official, "必须有官方登录预设");
  assert.equal(official.baseUrl, "");
});

test("rust writer follows atomic-write + sentinel ownership rules", () => {
  // 原子写：临时文件 + rename
  assert.match(rustSource, /fs::rename\(&temporary, path\)/, "必须临时文件 + rename 原子写");
  // 哨兵 id：只动我们自己的 provider 表
  assert.match(rustSource, /SENTINEL_PROVIDER_ID/, "必须使用所有权哨兵 id");
  assert.match(rustSource, /"aha-codex"/, "哨兵 id 应为 aha-codex");
  // 写前校验 + 备份 + 回滚
  assert.match(rustSource, /toml::from_str::<toml::Table>/, "写前必须做 TOML 校验");
  assert.match(rustSource, /snapshot_live_files/, "写前必须快照备份");
  assert.match(rustSource, /config\.toml 已回滚/, "auth 写失败必须回滚 config");
  // 官方登录保护
  assert.match(rustSource, /OFFICIAL_AUTH_BACKUP/, "覆盖官方登录前必须备份");
  // 绝不写入 mcp_servers（cc-switch 的教训：孤儿配置复活）。
  // 只检查生产代码——#[cfg(test)] 里的夹具恰恰要用这个表名来验证"原样保留"。
  const productionSource = rustSource.split("#[cfg(test)]")[0];
  assert.ok(!/mcp_servers/.test(productionSource), "模型切换器生产代码不允许触碰 MCP 服务器表");
  assert.match(rustSource, /#\[cfg\(test\)\]/, "写入逻辑必须带 Rust 单元测试");
  // Key 文件权限收紧
  assert.match(rustSource, /0o600/, "落盘文件必须 0600");
});

test("rust commands are registered and mocked in browser bridge", async () => {
  const libSource = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  for (const command of ["load_model_providers", "save_model_providers", "read_live_model_config", "apply_model_provider"]) {
    assert.match(libSource, new RegExp(`model_config::${command}`), `${command} 未注册`);
    assert.match(bridgeSource, new RegExp(command), `${command} 缺浏览器 fallback`);
  }
});

test("studio topbar exposes the model view switch next to the brand", async () => {
  assert.match(appSource, /view-switch/, "顶栏必须有视图切换器");
  assert.match(appSource, /ModelPanel/, "必须挂载 ModelPanel");
  // 皮肤区在模型页下只隐藏不卸载，保住草稿与视频预览状态
  assert.match(appSource, /hidden=\{view !== "skin"\}/, "皮肤工作区应隐藏而非卸载");
  // hidden 属性的 UA 样式 display:none 会被 .studio-layout 的 display:grid 压过，
  // 必须有显式的 [hidden] 规则，否则点"模型"页面不会切换（真实踩过的坑）
  const css = await readFile(new URL("../src/studio.css", import.meta.url), "utf8");
  assert.match(css, /\.studio-layout\[hidden\]\s*\{\s*display:\s*none/, "缺少 .studio-layout[hidden] 显式隐藏规则");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// 00-core.js 是纯函数片段，直接实例化后测试。
const coreSource = await readFile(new URL("../installer/manager/00-core.js", import.meta.url), "utf8");
const core = new Function(`${coreSource}; return { THEME_DEFAULTS, SAFE_ZONES, ANSI_KEYS, TERMINAL_PRESETS, SHADOW_PRESETS, safeColor, cleanFontStack, normalizeTheme, themeCss, backgroundLayerValue, filterValue, themeEquals, dataUrlKilobytes, hslToHex, paletteFromPixels, paletteCandidatesFromPixels, isVideoBackground, contrastRatio, normalizeTokens, sanitizeCustomCss, hexLuminance, isDarkTheme };`)();

const SAMPLE_IMAGE = "data:image/webp;base64,AAAA";

test("normalizeTheme upgrades v1 themes to v3 with all new dimensions defaulted", () => {
  const theme = core.normalizeTheme({
    schemaVersion: 1,
    id: "My Theme!!",
    name: "旧版主题",
    background: SAMPLE_IMAGE,
    colors: { accent: "#123abc", surface: "not-a-color" },
    layout: { x: 130, y: -5 }
  });
  assert.equal(theme.schemaVersion, 3);
  assert.equal(theme.id, "my-theme");
  assert.equal(theme.background, SAMPLE_IMAGE);
  assert.equal(theme.colors.accent, "#123abc");
  assert.equal(theme.colors.surface, core.THEME_DEFAULTS.surface);
  assert.equal(theme.layout.x, 100);
  assert.equal(theme.layout.y, 0);
  assert.deepEqual(theme.filters, { brightness: 100, saturate: 100, blur: 0 });
  // v3 新维度全部落在"跟随 Codex 默认"档
  assert.equal(theme.colorsDark, null);
  assert.equal(theme.terminal, null);
  assert.deepEqual(theme.typography, { sans: "", mono: "", chatFontSize: 0, editorFontSize: 0, fontFaces: [] });
  assert.deepEqual(theme.shape, { radiusScale: null, shadow: "default" });
  assert.equal(theme.layout.sidebarWidth, 0);
  assert.deepEqual(theme.brand, { startupTint: false, logo: null, titlePrefix: "" });
});

test("v3 dimensions normalize and clamp correctly", () => {
  const theme = core.normalizeTheme({
    id: "a",
    typography: { sans: 'LXGW WenKai, "PingFang SC"; } body { display:none', chatFontSize: 99, editorFontSize: 5 },
    shape: { radiusScale: 9, shadow: "weird" },
    layout: { sidebarWidth: 9999 },
    colorsDark: { accent: "#abcdef" },
    terminal: { red: "#ff0000" },
    brand: { startupTint: 1 }
  });
  assert.ok(!theme.typography.sans.includes(";") && !theme.typography.sans.includes("{"), "字体栈必须清洗掉 CSS 语法字符");
  assert.equal(theme.typography.chatFontSize, 22);
  assert.equal(theme.typography.editorFontSize, 10);
  assert.equal(theme.shape.radiusScale, 2.5);
  assert.equal(theme.shape.shadow, "default");
  assert.equal(theme.layout.sidebarWidth, 420);
  assert.equal(theme.colorsDark.accent, "#abcdef");
  assert.equal(theme.terminal.red, "#ff0000");
  assert.equal(theme.terminal.blue, core.TERMINAL_PRESETS.sakura.blue, "缺失的终端色用樱花预设补齐");
  assert.equal(core.ANSI_KEYS.length, 16);
  assert.equal(theme.brand.startupTint, true);
});

test("themeCss emits v3 variable overrides only when set", () => {
  const plain = core.normalizeTheme({ id: "a" });
  const plainCss = core.themeCss(plain);
  assert.doesNotMatch(plainCss, /--corner-radius-scale|--font-sans|--spacing-token-sidebar|electron-dark|ansiRed|--startup/);

  const rich = core.normalizeTheme({
    id: "b",
    typography: { sans: "Inter, sans-serif", mono: "JetBrains Mono, monospace", chatFontSize: 15, editorFontSize: 13 },
    shape: { radiusScale: 0.75, shadow: "none" },
    layout: { sidebarWidth: 320 },
    colorsDark: { accent: "#c9a2c4", surface: "#2a2129", text: "#f3e8ef" },
    terminal: core.TERMINAL_PRESETS.nord,
    brand: { startupTint: true }
  });
  const css = core.themeCss(rich);
  assert.match(css, /--corner-radius-scale:0\.75!important/);
  assert.match(css, /--shadow-sm:none!important/);
  assert.match(css, /--font-sans:Inter, sans-serif!important/);
  assert.match(css, /--codex-chat-font-size:15px!important/);
  assert.match(css, /--vscode-editor-font-size:13px!important/);
  assert.match(css, /--spacing-token-sidebar:320px!important/);
  assert.match(css, /:root\.electron-dark\{[^}]*#2a2129/);
  assert.match(css, /--vscode-terminal-ansiBrightMagenta:#b48ead!important/);
  assert.match(css, /--startup-background:/);
});

test("normalizeTheme rejects non data-URL backgrounds but keeps the none sentinel", () => {
  assert.equal(core.normalizeTheme({ id: "a", background: "https://evil.example/x.png" }).background, null);
  assert.equal(core.normalizeTheme({ id: "a", background: "asset://x.webp" }).background, null);
  assert.equal(core.normalizeTheme({ id: "a", background: "none" }).background, "none");
});

test("themeCss renders image, plain, and inherit variants consistently", () => {
  const image = core.normalizeTheme({ id: "a", background: SAMPLE_IMAGE, layout: { x: 30, y: 70, veil: 50 } });
  const imageCss = core.themeCss(image);
  assert.match(imageCss, /#root::before\{background:linear-gradient/);
  assert.match(imageCss, /30% 70%\/cover/);
  assert.ok(imageCss.includes(core.backgroundLayerValue(image)), "预览与窗口必须共用同一背景公式");

  const plain = core.normalizeTheme({ id: "b", background: "none", colors: { surface: "#f7f8fb" } });
  assert.match(core.themeCss(plain), /#root::before\{background:linear-gradient\(135deg,#f7f8fb,#f7f8fb\)/);

  const inherit = core.normalizeTheme({ id: "c", background: null });
  assert.doesNotMatch(core.themeCss(inherit), /#root::before/);
});

test("filter css emits only non-default filters", () => {
  assert.equal(core.filterValue({ brightness: 100, saturate: 100, blur: 0 }), "");
  assert.equal(core.filterValue({ brightness: 80, saturate: 100, blur: 4 }), "brightness(0.8) blur(4px)");
  const theme = core.normalizeTheme({ id: "a", background: SAMPLE_IMAGE, filters: { blur: 6 } });
  assert.match(core.themeCss(theme), /filter:blur\(6px\)/);
});

test("safe zones stay inside the canvas and cover the spec regions", () => {
  assert.equal(core.SAFE_ZONES.length, 3);
  for (const zone of core.SAFE_ZONES) {
    assert.ok(zone.x >= 0 && zone.y >= 0);
    assert.ok(zone.x + zone.w <= 100, `${zone.key} exceeds width`);
    assert.ok(zone.y + zone.h <= 100, `${zone.key} exceeds height`);
  }
  const character = core.SAFE_ZONES.find((zone) => zone.key === "character");
  assert.equal(character.x, 73);
});

test("themeEquals ignores createdAt so drafts only dirty on real edits", () => {
  const a = core.normalizeTheme({ id: "a", name: "x", createdAt: "2026-01-01T00:00:00.000Z" });
  const b = { ...structuredClone(a), createdAt: "2026-02-02T00:00:00.000Z" };
  assert.ok(core.themeEquals(a, b));
  b.colors = { ...b.colors, accent: "#000000" };
  assert.ok(!core.themeEquals(a, b));
});

test("dataUrlKilobytes estimates payload size", () => {
  assert.equal(core.dataUrlKilobytes(null), 0);
  const kb = core.dataUrlKilobytes("data:image/webp;base64," + "A".repeat(4096));
  assert.ok(kb >= 2 && kb <= 4);
});

const SAMPLE_VIDEO = "data:video/mp4;base64,AAAA";
const SAMPLE_FONT = "data:font/woff2;base64,AAAA";

test("regional veils normalize, clamp, and emit as stacked gradients", () => {
  const plain = core.normalizeTheme({ id: "a" });
  assert.deepEqual(plain.layout.veils, { top: 0, bottom: 0, left: 0, content: 0 });

  const theme = core.normalizeTheme({
    id: "b",
    background: SAMPLE_IMAGE,
    layout: { veils: { top: 40, bottom: 999, left: -5, content: 60 } }
  });
  assert.deepEqual(theme.layout.veils, { top: 40, bottom: 100, left: 0, content: 60 });
  const layer = core.backgroundLayerValue(theme);
  assert.match(layer, /linear-gradient\(180deg,rgba\(255,249,250,0\.4\)/, "顶部蒙层");
  assert.match(layer, /linear-gradient\(0deg,rgba\(255,249,250,1\)/, "底部蒙层夹取到 100");
  assert.doesNotMatch(layer, /linear-gradient\(90deg,rgba\(255,249,250,0\) 0%/, "左侧蒙层为 0 不发射");
  assert.match(layer, /transparent 15%,rgba\(255,249,250,0\.6\) 23%/, "内容区蒙层");
  // 视频路径共用蒙层栈
  const video = core.normalizeTheme({ id: "v", background: "data:video/mp4;base64,AAAA", layout: { veils: { content: 30 } } });
  assert.match(core.themeCss(video), /#root::after\{[^}]*transparent 15%,rgba\(255,249,250,0\.3\)/);
});

test("phase B/C dimensions normalize with follow-default values", () => {
  const theme = core.normalizeTheme({ id: "a" });
  assert.deepEqual(theme.backgrounds, []);
  assert.equal(theme.backgroundDark, null);
  assert.deepEqual(theme.effects, { scrollbar: "default", particles: "none", motion: "default", slideshowMinutes: 0 });
  assert.deepEqual(theme.trigger, { position: "top-center", icon: "D", autoHide: false });
  assert.deepEqual(theme.brand, { startupTint: false, logo: null, titlePrefix: "" });
  assert.deepEqual(theme.typography.fontFaces, []);
});

test("phase B/C dimensions validate and clamp", () => {
  const theme = core.normalizeTheme({
    id: "a",
    background: SAMPLE_VIDEO,
    backgrounds: [SAMPLE_IMAGE, "https://evil/x.png", SAMPLE_IMAGE, SAMPLE_IMAGE, SAMPLE_IMAGE, SAMPLE_IMAGE],
    backgroundDark: SAMPLE_VIDEO,
    effects: { scrollbar: "slim", particles: "sakura", motion: "off", slideshowMinutes: 999 },
    trigger: { position: "bottom-right", icon: "🌸🌸🌸", autoHide: 1 },
    brand: { logo: "hide", titlePrefix: "🌸 <script>" },
    typography: { fontFaces: [{ family: "My Font", src: SAMPLE_FONT }, { family: "bad", src: "https://x" }, { family: "third", src: SAMPLE_FONT }] }
  });
  assert.equal(theme.background, SAMPLE_VIDEO, "视频背景应被接受");
  assert.ok(core.isVideoBackground(theme.background));
  assert.equal(theme.backgrounds.length, 4, "轮播图上限 4 张且剔除非法项");
  assert.equal(theme.backgroundDark, null, "暗色背景不接受视频");
  assert.equal(theme.effects.slideshowMinutes, 240);
  assert.equal(theme.trigger.icon, "🌸🌸", "图标最多 2 个字符（按码点截断）");
  assert.equal(theme.trigger.autoHide, true);
  assert.equal(theme.brand.logo, "hide");
  assert.ok(!theme.brand.titlePrefix.includes("<"));
  assert.equal(theme.typography.fontFaces.length, 1, "仅保留合法字体，上限 2");
  assert.equal(theme.typography.fontFaces[0].family, "My Font");
});

test("themeCss emits phase B/C rules", () => {
  const video = core.normalizeTheme({ id: "v", background: SAMPLE_VIDEO, layout: { veil: 60 } });
  const videoCss = core.themeCss(video);
  assert.match(videoCss, /#root::before\{background:none!important\}/, "视频模式关闭默认英雄图");
  assert.match(videoCss, /#root::after\{content:""!important[^}]*linear-gradient/, "遮罩走 ::after 盖在视频上");
  assert.doesNotMatch(videoCss, /url\("data:video/, "视频不能进 CSS url()");

  const rich = core.themeCss(core.normalizeTheme({
    id: "r",
    background: SAMPLE_IMAGE,
    backgroundDark: "none",
    colorsDark: { accent: "#c9a2c4", surface: "#2a2129", text: "#f3e8ef" },
    effects: { scrollbar: "slim", motion: "off" },
    typography: { fontFaces: [{ family: "My Font", src: SAMPLE_FONT }] }
  }));
  assert.match(rich, /::-webkit-scrollbar\{width:6px!important/);
  assert.match(rich, /transition-duration:0s!important/);
  assert.match(rich, /@font-face\{font-family:"My Font";src:url\("data:font/);
  assert.match(rich, /:root\.electron-dark #root::before\{background:linear-gradient\(135deg,#2a2129/, "暗色纯色背景使用暗色表面色");
  assert.match(rich, /::selection\{background:color-mix/);
  assert.match(rich, /caret-color:/);

  const hidden = core.themeCss(core.normalizeTheme({ id: "h", effects: { scrollbar: "hidden" } }));
  assert.match(hidden, /::-webkit-scrollbar\{width:0!important/);
});

test("palette extraction goes dark for dark images", () => {
  const pixels = [];
  for (let i = 0; i < 64; i += 1) pixels.push(20, 60, 35, 255); // 深绿夜景
  const palette = core.paletteFromPixels(new Uint8ClampedArray(pixels));
  assert.ok(palette, "深色但有色相的图必须产出配色");
  assert.ok(core.hexLuminance(palette.surface) < .35, "深色图的 surface 必须是深色");
  assert.ok(core.hexLuminance(palette.text) > .6, "深色图的 text 必须是亮色");
  assert.ok(core.contrastRatio(palette.text, palette.surface) >= 4.5, "自动配色必须满足 WCAG 对比度");
});

test("dark themes emit a full dark ruleset with dark veils", () => {
  const dark = core.normalizeTheme({ id: "d", background: SAMPLE_IMAGE, colors: { accent: "#58c47a", surface: "#101418", text: "#eef2ec" } });
  assert.ok(core.isDarkTheme(dark));
  const css = core.themeCss(dark);
  assert.match(css, /html,body\{background:#101418!important\}/);
  assert.match(css, /--color-background-elevated-primary:color-mix\(in srgb,#fff 7%,#101418\)/);
  assert.match(css, /\.composer-surface-chrome\{background:color-mix\(in srgb,#101418 93%/);
  assert.match(css, /rgba\(10,13,20/, "深色主题的遮罩必须用暗色 tint");
  const light = core.normalizeTheme({ id: "l" });
  assert.ok(!core.isDarkTheme(light));
  assert.doesNotMatch(core.themeCss(light), /html,body/);
});

test("contrastRatio follows WCAG expectations", () => {
  assert.ok(Math.abs(core.contrastRatio("#000000", "#ffffff") - 21) < .1);
  assert.ok(core.contrastRatio("#3c2938", "#fff9fb") >= 4.5, "默认配色必须可读");
  assert.ok(core.contrastRatio("#cccccc", "#ffffff") < 4.5);
});

test("tokens and customCss are sanitized against injection and external URLs", () => {
  const tokens = core.normalizeTokens({
    "--good-token": "#ff0000",
    "bad-name": "#000",
    "--evil": "url(https://evil.example/x.png)",
    "--strip": "red;}body{display:none"
  });
  assert.deepEqual(Object.keys(tokens), ["--good-token", "--strip"]);
  assert.ok(!tokens["--strip"].includes(";") && !tokens["--strip"].includes("}"));
  const theme = core.normalizeTheme({ id: "a", tokens: { "--good-token": "#ff0000" }, customCss: '@import "x.css"; .a{background:url(https://evil/x.png) url("data:image/png;base64,AA")}' });
  const css = core.themeCss(theme);
  assert.match(css, /--good-token:#ff0000!important/);
  assert.doesNotMatch(css, /@import/);
  assert.doesNotMatch(css, /evil/);
  assert.match(css, /url\("data:image\/png;base64,AA"\)/, "data: url 必须保留");
});

test("sidePanel normalizes with clamped width and stripped markup", () => {
  const off = core.normalizeTheme({ id: "a" }).sidePanel;
  assert.deepEqual(off, { enabled: false, width: 240, title: "", subtitle: "", image: null, card: "", icons: "", heading: "", image2: null, footer: "" });
  const on = core.normalizeTheme({ id: "b", sidePanel: { enabled: 1, width: 900, title: "<b>好友</b>", subtitle: "小蓝|LV 07", image: SAMPLE_IMAGE, card: "hi<script>", icons: "🖥⭐", heading: "我的好友", footer: "查找好友…" } }).sidePanel;
  assert.equal(on.enabled, true);
  assert.equal(on.width, 320);
  assert.ok(!on.title.includes("<"));
  assert.equal(on.subtitle, "小蓝|LV 07");
  assert.equal(on.image, SAMPLE_IMAGE);
  assert.ok(!on.card.includes("<"));
  assert.equal(on.icons, "🖥⭐");
});

test("chrome normalizes with capped toolbar and stripped markup", () => {
  const off = core.normalizeTheme({ id: "a" }).chrome;
  assert.deepEqual(off, { enabled: false, title: "", toolbar: [], statusBar: false });
  const on = core.normalizeTheme({
    id: "b",
    chrome: { enabled: true, title: "Codex 2007<x>", toolbar: ["📝 新建任务", "<bad>", "", 1, 2, 3, 4, 5, 6, 7], statusBar: 1 }
  }).chrome;
  assert.equal(on.enabled, true);
  assert.ok(!on.title.includes("<"));
  assert.ok(on.toolbar.length <= 8);
  assert.ok(on.toolbar.every((item) => !item.includes("<")));
  assert.equal(on.statusBar, true);
});

test("paletteCandidatesFromPixels returns distinct hue candidates", () => {
  const pixels = [];
  for (let i = 0; i < 40; i += 1) pixels.push(230, 150, 180, 255); // 粉
  for (let i = 0; i < 30; i += 1) pixels.push(120, 170, 235, 255); // 蓝
  const candidates = core.paletteCandidatesFromPixels(new Uint8ClampedArray(pixels), 4);
  assert.ok(candidates.length >= 2, "两种主色都应成为候选");
  for (const palette of candidates) assert.match(palette.accent, /^#[0-9a-f]{6}$/);
  assert.notEqual(candidates[0].accent, candidates[1].accent);
  assert.equal(core.paletteCandidatesFromPixels(new Uint8ClampedArray([128, 128, 128, 255]), 4).length, 1, "灰度图返回一套中性候选");
});

test("paletteFromPixels derives a readable palette from the dominant hue", () => {
  const pixels = [];
  for (let i = 0; i < 64; i += 1) pixels.push(230, 150, 180, 255); // 粉色（约 337°）
  const palette = core.paletteFromPixels(new Uint8ClampedArray(pixels));
  assert.ok(palette, "彩色图必须产出配色");
  for (const key of ["accent", "surface", "text"]) assert.match(palette[key], /^#[0-9a-f]{6}$/);
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  assert.ok(Math.min(...channels(palette.surface)) > 230, "surface 必须足够浅保证可读性");
  assert.ok(Math.max(...channels(palette.text)) < 90, "text 必须足够深保证可读性");
  const [r, , b] = channels(palette.accent);
  assert.ok(r > b, "粉色图片的强调色应偏暖");
});

test("paletteFromPixels falls back to luminance-based neutral palettes for grayscale", () => {
  const gray = [];
  for (let i = 0; i < 64; i += 1) gray.push(128, 128, 128, 255);
  const light = core.paletteFromPixels(new Uint8ClampedArray(gray));
  assert.ok(light && core.hexLuminance(light.surface) > .8, "中灰图给浅色中性方案");
  const darkPixels = [];
  for (let i = 0; i < 64; i += 1) darkPixels.push(24, 26, 30, 255);
  const dark = core.paletteFromPixels(new Uint8ClampedArray(darkPixels));
  assert.ok(dark && core.hexLuminance(dark.surface) < .35, "深灰图给深色中性方案");
  assert.ok(core.contrastRatio(dark.text, dark.surface) >= 4.5);
});

test("hslToHex produces valid hex colors", () => {
  assert.equal(core.hslToHex(0, 0, 1), "#ffffff");
  assert.equal(core.hslToHex(0, 0, 0), "#000000");
  assert.match(core.hslToHex(345, .34, .42), /^#[0-9a-f]{6}$/);
});

test("sidebarOpacity emits themed sidebar wash only when set", () => {
  const off = core.normalizeTheme({ id: "a" });
  assert.equal(off.layout.sidebarOpacity, 0);
  assert.doesNotMatch(core.themeCss(off), /app-shell-left-panel/);

  const on = core.normalizeTheme({ id: "b", colors: { surface: "#eef4fd" }, layout: { sidebarOpacity: 40 } });
  const css = core.themeCss(on);
  assert.match(css, /\.app-shell-left-panel\{background:color-mix\(in srgb,#eef4fd 40%,transparent\)!important;backdrop-filter:blur\(5px\)/);
  assert.match(css, /--color-token-side-bar-background:color-mix\(in srgb,#eef4fd 40%/);
  assert.match(css, /\[class\*="sidebar" i\],\[data-slot="sidebar"\]\{background:transparent!important\}/);

  const clamped = core.normalizeTheme({ id: "c", layout: { sidebarOpacity: 999 } });
  assert.equal(clamped.layout.sidebarOpacity, 95);
});

test("base skin keeps the sidebar wash translucent so backgrounds show through", async () => {
  const css = await readFile(new URL("../theme/skin.css", import.meta.url), "utf8");
  const match = css.match(/\.app-shell-left-panel\s*\{[^}]*rgba\(255, 248, 250, (\.\d+)\)/);
  assert.ok(match, "侧栏底色规则必须存在");
  assert.ok(Number(match[1]) <= 0.7, "侧栏底色不透明度不得超过 0.7，保证背景图能透进左侧列表");
});

test("presets never customize the global trigger button", async () => {
  const presets = JSON.parse(await readFile(new URL("../installer/manager/presets.json", import.meta.url), "utf8"));
  for (const preset of presets) {
    assert.equal(preset.trigger, undefined, `${preset.id} 不得携带 trigger 字段：按钮样式是全局用户设置`);
  }
});

test("fragments stay framework-free and use no ES module syntax", async () => {
  for (const name of ["00-core.js", "01-store.js", "02-preview.js", "03-editor.js", "04-panel.js"]) {
    const source = await readFile(new URL(`../installer/manager/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /^\s*(import|export)\s/m, `${name} must not use module syntax`);
    assert.doesNotMatch(source, /require\(/, `${name} must not use require`);
  }
});

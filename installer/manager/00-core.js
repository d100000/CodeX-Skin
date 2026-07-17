// 纯函数与常量。无 DOM / 存储依赖，可在 node:test 中直接实例化验证。
const THEME_DEFAULTS = {
  accent: "#76506f",
  surface: "#fff9fb",
  text: "#3c2938",
  x: 50,
  y: 50,
  veil: 50,
  brightness: 100,
  saturate: 100,
  blur: 0
};

// BACKGROUND_SPEC.md 构图安全区（百分比几何）。
const SAFE_ZONES = [
  { key: "nav", label: "导航区 · 保持低细节", x: 0, y: 0, w: 20, h: 100 },
  { key: "character", label: "角色区 · 人物放这里", x: 73, y: 10, w: 27, h: 78 },
  { key: "composer", label: "输入框区 · 保持素净", x: 24, y: 82, w: 52, h: 18 }
];

const BACKGROUND_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,/i;
const VIDEO_DATA_URL = /^data:video\/(?:mp4|webm);base64,/i;
const FONT_DATA_URL = /^data:(?:font|application)\/[\w+.-]+;base64,/i;

const SCROLLBAR_STYLES = ["default", "slim", "hidden"];
const PARTICLE_KINDS = ["none", "sakura", "snow"];
const MOTION_MODES = ["default", "off"];
const TYPING_FX_KINDS = ["none", "sparkle", "petal"];
const LIST_FX_KINDS = ["none", "slide"];
const TRIGGER_POSITIONS = ["top-center", "top-right", "bottom-right"];

function isVideoBackground(background) {
  return typeof background === "string" && VIDEO_DATA_URL.test(background);
}

// 终端 ANSI 16 色键名，对应 --vscode-terminal-ansi<Key> 变量。
const ANSI_KEYS = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"
];

const TERMINAL_PRESETS = {
  sakura: {
    black: "#5c4a55", red: "#c95c78", green: "#7d9a6e", yellow: "#c98f4e", blue: "#6f82bd", magenta: "#a86bad", cyan: "#5f9a94", white: "#f5eef1",
    brightBlack: "#8a7482", brightRed: "#e08ba2", brightGreen: "#9cba8c", brightYellow: "#e0b070", brightBlue: "#93a5d6", brightMagenta: "#c290c6", brightCyan: "#82b7b1", brightWhite: "#fffafc"
  },
  nord: {
    black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b", blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
    brightBlack: "#4c566a", brightRed: "#bf616a", brightGreen: "#a3be8c", brightYellow: "#ebcb8b", brightBlue: "#81a1c1", brightMagenta: "#b48ead", brightCyan: "#8fbcbb", brightWhite: "#eceff4"
  }
};

const SHADOW_LEVELS = ["default", "none", "bold"];
const SHADOW_PRESETS = {
  none: {
    "--shadow-sm": "none", "--shadow-md": "none", "--shadow-lg": "none",
    "--shadow-xl": "none", "--shadow-2xl": "none", "--shadow-hairline": "none"
  },
  bold: {
    "--shadow-sm": "0px 2px 6px -1px #00000024", "--shadow-md": "0px 4px 12px -2px #00000028",
    "--shadow-lg": "0px 8px 22px -4px #00000030", "--shadow-xl": "0px 14px 34px -6px #00000038",
    "--shadow-2xl": "0px 26px 60px -12px #00000048", "--shadow-hairline": "0px 0px 0px .5px #00000026"
  }
};

function safeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value.toLowerCase() : fallback;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

// 字体栈白名单清洗：留下字体名会用到的字符，杜绝把 CSS 语句注进变量。
function cleanFontStack(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[^\w\s.,"'一-鿿-]/g, "").trim().slice(0, 200);
}

// 0 = 跟随 Codex 默认；正数 = 夹取到范围内的整数像素。
function sizeOrZero(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(Math.max(min, Math.min(max, number)));
}

// null = 跟随默认；数字 = 夹取后保留两位小数（圆角倍率这类比例值）。
function nullableScale(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.max(min, Math.min(max, number)) * 100) / 100;
}

function normalizeTerminal(source) {
  if (!source || typeof source !== "object") return null;
  const palette = {};
  for (const key of ANSI_KEYS) palette[key] = safeColor(source[key], TERMINAL_PRESETS.sakura[key]);
  return palette;
}

function normalizeBackground(value, allowVideo) {
  if (value === "none") return "none";
  if (typeof value === "string" && BACKGROUND_DATA_URL.test(value)) return value;
  if (allowVideo && isVideoBackground(value)) return value;
  return null;
}

function pickEnum(value, allowed) {
  return allowed.includes(value) ? value : allowed[0];
}

function normalizeFontFaces(source) {
  if (!Array.isArray(source)) return [];
  return source.slice(0, 2).map((face) => ({
    family: cleanFontStack(face && face.family).slice(0, 60),
    src: face && typeof face.src === "string" && FONT_DATA_URL.test(face.src) ? face.src : ""
  })).filter((face) => face.family && face.src);
}

// v1/v2/v3 主题都归一化为 v3 结构；未知字段丢弃。新增维度都有"跟随 Codex 默认"取值。
function normalizeTheme(theme) {
  const source = theme || {};
  const typography = source.typography || {};
  const shape = source.shape || {};
  const effects = source.effects || {};
  const trigger = source.trigger || {};
  return {
    schemaVersion: 3,
    id: String(source.id || "").toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 64),
    name: String(source.name || "未命名皮肤").slice(0, 80),
    background: normalizeBackground(source.background, true),
    backgrounds: Array.isArray(source.backgrounds)
      ? source.backgrounds.filter((item) => typeof item === "string" && BACKGROUND_DATA_URL.test(item)).slice(0, 4)
      : [],
    backgroundDark: normalizeBackground(source.backgroundDark, false),
    colors: {
      accent: safeColor(source.colors && source.colors.accent, THEME_DEFAULTS.accent),
      surface: safeColor(source.colors && source.colors.surface, THEME_DEFAULTS.surface),
      text: safeColor(source.colors && source.colors.text, THEME_DEFAULTS.text)
    },
    colorsDark: source.colorsDark && typeof source.colorsDark === "object" ? {
      accent: safeColor(source.colorsDark.accent, "#c9a2c4"),
      surface: safeColor(source.colorsDark.surface, "#2a2129"),
      text: safeColor(source.colorsDark.text, "#f3e8ef")
    } : null,
    terminal: normalizeTerminal(source.terminal),
    typography: {
      sans: cleanFontStack(typography.sans),
      mono: cleanFontStack(typography.mono),
      chatFontSize: sizeOrZero(typography.chatFontSize, 11, 22),
      editorFontSize: sizeOrZero(typography.editorFontSize, 10, 18),
      fontFaces: normalizeFontFaces(typography.fontFaces)
    },
    shape: {
      radiusScale: nullableScale(shape.radiusScale, 0, 2.5),
      shadow: SHADOW_LEVELS.includes(shape.shadow) ? shape.shadow : "default"
    },
    layout: {
      x: clampNumber(source.layout && source.layout.x, THEME_DEFAULTS.x, 0, 100),
      y: clampNumber(source.layout && source.layout.y, THEME_DEFAULTS.y, 0, 100),
      veil: clampNumber(source.layout && source.layout.veil, THEME_DEFAULTS.veil, 0, 100),
      veils: {
        top: clampNumber(source.layout && source.layout.veils && source.layout.veils.top, 0, 0, 100),
        bottom: clampNumber(source.layout && source.layout.veils && source.layout.veils.bottom, 0, 0, 100),
        left: clampNumber(source.layout && source.layout.veils && source.layout.veils.left, 0, 0, 100),
        content: clampNumber(source.layout && source.layout.veils && source.layout.veils.content, 0, 0, 100)
      },
      sidebarWidth: sizeOrZero(source.layout && source.layout.sidebarWidth, 220, 420),
      sidebarOpacity: sizeOrZero(source.layout && source.layout.sidebarOpacity, 15, 95)
    },
    filters: {
      brightness: clampNumber(source.filters && source.filters.brightness, THEME_DEFAULTS.brightness, 20, 200),
      saturate: clampNumber(source.filters && source.filters.saturate, THEME_DEFAULTS.saturate, 0, 200),
      blur: clampNumber(source.filters && source.filters.blur, THEME_DEFAULTS.blur, 0, 20)
    },
    effects: {
      scrollbar: pickEnum(effects.scrollbar, SCROLLBAR_STYLES),
      particles: pickEnum(effects.particles, PARTICLE_KINDS),
      motion: pickEnum(effects.motion, MOTION_MODES),
      typingFx: pickEnum(effects.typingFx, TYPING_FX_KINDS),
      listFx: pickEnum(effects.listFx, LIST_FX_KINDS),
      slideshowMinutes: sizeOrZero(effects.slideshowMinutes, 1, 240)
    },
    trigger: {
      position: pickEnum(trigger.position, TRIGGER_POSITIONS),
      icon: (typeof trigger.icon === "string" && trigger.icon.trim() ? [...trigger.icon.trim()].slice(0, 2).join("") : "D"),
      autoHide: Boolean(trigger.autoHide)
    },
    sidePanel: normalizeSidePanel(source.sidePanel),
    chrome: normalizeChrome(source.chrome),
    tokens: normalizeTokens(source.tokens),
    customCss: sanitizeCustomCss(source.customCss),
    brand: {
      startupTint: Boolean(source.brand && source.brand.startupTint),
      logo: source.brand && source.brand.logo === "hide"
        ? "hide"
        : (source.brand && typeof source.brand.logo === "string" && BACKGROUND_DATA_URL.test(source.brand.logo) ? source.brand.logo : null),
      titlePrefix: typeof (source.brand && source.brand.titlePrefix) === "string"
        ? source.brand.titlePrefix.replace(/[\n\r<>]/g, "").slice(0, 12)
        : ""
    },
    createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString()
  };
}

function filterValue(filters) {
  if (!filters) return "";
  const parts = [];
  if (filters.brightness !== THEME_DEFAULTS.brightness) parts.push("brightness(" + filters.brightness / 100 + ")");
  if (filters.saturate !== THEME_DEFAULTS.saturate) parts.push("saturate(" + filters.saturate / 100 + ")");
  if (filters.blur > 0) parts.push("blur(" + filters.blur + "px)");
  return parts.join(" ");
}

// 遮罩底色：浅色主题用暖白提亮，深色主题用近黑压暗——目的都是提高正文可读性。
function veilTint(theme) {
  return isDarkTheme(theme) ? "10,13,20" : "255,249,250";
}

function veilGradientValue(theme) {
  const tint = veilTint(theme);
  const veil = theme.layout.veil / 100;
  const tail = Math.max(0, veil - .38);
  // 启用侧栏透出时，整体遮罩从侧栏右缘才开始变浓：侧栏区域只保留 35% 强度，
  // 否则"左浓右淡"的默认渐变会和侧栏底色叠成一堵白墙，背景永远透不进左侧列表。
  if (theme.layout && theme.layout.sidebarOpacity) {
    const width = theme.layout.sidebarWidth || 275;
    return "linear-gradient(90deg,rgba(" + tint + "," + (veil * .35).toFixed(3) + ") 0 " + width + "px,rgba(" + tint + "," + veil + ") " + (width + 80) + "px,rgba(" + tint + "," + tail + ") 100%)";
  }
  return "linear-gradient(90deg,rgba(" + tint + "," + veil + "),rgba(" + tint + "," + tail + "))";
}

// 分区蒙层：顶部 / 底部 / 左侧 / 内容区（回答区）各自独立的可读性提亮层。
// 区域几何对齐 BACKGROUND_SPEC 的构图分区；0 = 不发射该层。
function regionalVeilLayers(theme) {
  const veils = (theme.layout && theme.layout.veils) || {};
  const tint = veilTint(theme);
  const layers = [];
  const alpha = (value) => Math.min(1, value / 100);
  if (veils.top) layers.push("linear-gradient(180deg,rgba(" + tint + "," + alpha(veils.top) + ") 0%,rgba(" + tint + "," + alpha(veils.top) * .55 + ") 9%,transparent 20%)");
  if (veils.bottom) layers.push("linear-gradient(0deg,rgba(" + tint + "," + alpha(veils.bottom) + ") 0%,rgba(" + tint + "," + alpha(veils.bottom) * .55 + ") 12%,transparent 26%)");
  if (veils.left) layers.push("linear-gradient(90deg,rgba(" + tint + "," + alpha(veils.left) + ") 0%,rgba(" + tint + "," + alpha(veils.left) * .7 + ") 18%,transparent 32%)");
  if (veils.content) layers.push("linear-gradient(90deg,transparent 15%,rgba(" + tint + "," + alpha(veils.content) + ") 23%,rgba(" + tint + "," + alpha(veils.content) + ") 68%,transparent 77%)");
  return layers;
}

// 蒙层栈 = 分区蒙层（上层）+ 整体渐变遮罩（下层）。图片背景与视频 ::after 共用。
function veilStackValue(theme) {
  return [...regionalVeilLayers(theme), veilGradientValue(theme)].join(",");
}

// 背景层的 CSS background 值。迷你预览与真实窗口共用，保证所见即所得。
// 视频背景返回 ""（由 <video> 元素承载，遮罩走 #root::after）。
function backgroundLayerValue(theme) {
  if (theme.background === "none") {
    return "linear-gradient(135deg," + theme.colors.surface + "," + theme.colors.surface + ")";
  }
  if (!theme.background || isVideoBackground(theme.background)) return "";
  return veilStackValue(theme) + ",url(" + JSON.stringify(theme.background) + ") " + theme.layout.x + "% " + theme.layout.y + "%/cover no-repeat";
}

function colorVarBlock(colors, dark) {
  // 深色主题的表面透明度更低：深色背景杂色多，气泡太透会看不清
  const surfaceMix = dark ? 94 : 88;
  return "--color-background-accent:" + colors.accent + "!important;--color-background-accent-hover:" + colors.accent + "!important;--color-text-accent:" + colors.accent + "!important;--color-icon-accent:" + colors.accent + "!important;--color-border-focus:" + colors.accent + "!important;--color-text-foreground:" + colors.text + "!important;--color-background-surface:color-mix(in srgb," + colors.surface + " " + surfaceMix + "%,transparent)!important";
}

// v3 新维度的 :root 变量发射。全部搭 Codex 官方 token 的车，未设置的维度不发射。
function rootExtraVars(theme) {
  const parts = [];
  const typography = theme.typography || {};
  if (typography.sans) parts.push("--font-sans:" + typography.sans + "!important");
  if (typography.mono) parts.push("--font-mono:" + typography.mono + "!important");
  if (typography.chatFontSize) parts.push("--codex-chat-font-size:" + typography.chatFontSize + "px!important");
  if (typography.editorFontSize) parts.push("--vscode-editor-font-size:" + typography.editorFontSize + "px!important");
  const shape = theme.shape || {};
  if (shape.radiusScale !== null && shape.radiusScale !== undefined) parts.push("--corner-radius-scale:" + shape.radiusScale + "!important");
  if (shape.shadow && shape.shadow !== "default") {
    for (const name in SHADOW_PRESETS[shape.shadow]) parts.push(name + ":" + SHADOW_PRESETS[shape.shadow][name] + "!important");
  }
  if (theme.layout && theme.layout.sidebarWidth) parts.push("--spacing-token-sidebar:" + theme.layout.sidebarWidth + "px!important");
  if (theme.terminal) {
    for (const key of ANSI_KEYS) parts.push("--vscode-terminal-ansi" + key[0].toUpperCase() + key.slice(1) + ":" + theme.terminal[key] + "!important");
  }
  if (theme.brand && theme.brand.startupTint) {
    parts.push("--startup-background:" + theme.colors.surface + "!important");
    parts.push("--startup-logo-shimmer-base:color-mix(in srgb," + theme.colors.accent + " 32%,transparent)!important");
    parts.push("--startup-logo-shimmer-peak:color-mix(in srgb," + theme.colors.accent + " 68%,white)!important");
  }
  // 发射点再清洗一次：草稿实时编辑不经过 normalizeTheme，防止绕过
  const tokens = normalizeTokens(theme.tokens);
  for (const token in tokens) parts.push(token + ":" + tokens[token] + "!important");
  return parts.join(";");
}

// 生成注入到 codex-doll-theme-override 的覆盖样式。
function themeCss(theme) {
  const rules = [];
  for (const face of (theme.typography && theme.typography.fontFaces) || []) {
    rules.push('@font-face{font-family:"' + face.family + '";src:url("' + face.src + '")}');
  }
  const dark = isDarkTheme(theme);
  const extra = rootExtraVars(theme);
  rules.push(":root{" + colorVarBlock(theme.colors, dark) + (extra ? ";" + extra : "") + "}");
  if (theme.colorsDark) rules.push(":root.electron-dark{" + colorVarBlock(theme.colorsDark, true) + "}");
  if (isVideoBackground(theme.background)) {
    // 视频由 <video> 元素承载：关掉默认英雄图，遮罩用 ::after 盖在视频上、正文之下。
    rules.push("#root::before{background:none!important}");
    rules.push('#root::after{content:""!important;position:absolute;inset:0;z-index:0;pointer-events:none;background:' + veilStackValue(theme) + "!important}");
  } else {
    const layer = backgroundLayerValue(theme);
    if (layer) {
      const filter = filterValue(theme.filters);
      rules.push("#root::before{background:" + layer + "!important" + (filter ? ";filter:" + filter : "") + "}");
    }
  }
  if (theme.backgroundDark) {
    const darkLayer = backgroundLayerValue({ ...theme, background: theme.backgroundDark, colors: theme.colorsDark || theme.colors });
    if (darkLayer) rules.push(":root.electron-dark #root::before{background:" + darkLayer + "!important}");
  }
  // 深色主题：基础皮肤是为浅色设计的（白底/白顶栏/深色图标），表面色为深色时
  // 整套换成深色系发射，否则会出现白圈、白侧栏、图标对比度不足
  if (isDarkTheme(theme)) {
    const surface = theme.colors.surface;
    const text = theme.colors.text;
    rules.push("html,body{background:" + surface + "!important}");
    rules.push(":root{"
      + "--color-background-surface-under:color-mix(in srgb,#000 25%," + surface + ")!important;"
      + "--color-background-elevated-primary:color-mix(in srgb,#fff 7%," + surface + ")!important;"
      + "--color-background-elevated-secondary:color-mix(in srgb,#fff 4%," + surface + ")!important;"
      + "--color-background-control:color-mix(in srgb,#fff 6%," + surface + ")!important;"
      + "--color-text-foreground-secondary:color-mix(in srgb," + text + " 72%,transparent)!important;"
      + "--color-text-foreground-tertiary:color-mix(in srgb," + text + " 52%,transparent)!important;"
      + "--color-border:color-mix(in srgb," + text + " 20%,transparent)!important;"
      + "--color-border-light:color-mix(in srgb," + text + " 11%,transparent)!important;"
      + "--color-token-side-bar-background:color-mix(in srgb," + surface + " 55%,transparent)!important;"
      + "--color-token-main-surface-primary:color-mix(in srgb," + surface + " 82%,transparent)!important;"
      + "--color-token-editor-background:color-mix(in srgb," + surface + " 92%,transparent)!important;"
      + "--color-background-elevated-primary-opaque:color-mix(in srgb,#fff 8%," + surface + ")!important;"
      + "--color-background-elevated-secondary-opaque:color-mix(in srgb,#fff 5%," + surface + ")!important;"
      + "--color-background-editor-opaque:" + surface + "!important;"
      + "--color-token-dropdown-background:color-mix(in srgb,#fff 8%," + surface + ")!important;"
      + "--color-token-dropdown-foreground:" + text + "!important"
      + "}");
    rules.push(".app-shell-left-panel{background:color-mix(in srgb," + surface + " 55%,transparent)!important;border-right:1px solid color-mix(in srgb," + text + " 14%,transparent)!important;backdrop-filter:blur(6px) saturate(1.05)!important}");
    rules.push(".main-surface,.browser-main-surface{background:linear-gradient(180deg,color-mix(in srgb," + surface + " 45%,transparent) 0 35%,color-mix(in srgb," + surface + " 88%,transparent) 100%)!important}");
    rules.push(".composer-surface-chrome{background:color-mix(in srgb," + surface + " 93%,transparent)!important;border:1px solid color-mix(in srgb," + text + " 18%,transparent)!important}");
    rules.push(".app-shell-main-content-top-fade{background:transparent!important}");
  }
  // 侧栏不透明度：0 = 跟随基础皮肤默认；设置后底色改用主题表面色按比例混合，
  // 同时把重模糊降为轻模糊——blur(20px) 会把透进来的背景糊成均匀色块
  if (theme.layout && theme.layout.sidebarOpacity) {
    const opacity = theme.layout.sidebarOpacity;
    rules.push(".app-shell-left-panel{background:color-mix(in srgb," + theme.colors.surface + " " + opacity + "%,transparent)!important;backdrop-filter:blur(5px) saturate(1.05)!important}");
    rules.push('[class*="sidebar" i],[data-slot="sidebar"]{background:transparent!important}');
    rules.push(":root{--color-token-side-bar-background:color-mix(in srgb," + theme.colors.surface + " " + opacity + "%,transparent)!important}");
    if (theme.colorsDark) {
      rules.push(":root.electron-dark .app-shell-left-panel{background:color-mix(in srgb," + theme.colorsDark.surface + " " + opacity + "%,transparent)!important}");
    }
  }
  // 选中态与输入光标恒随强调色
  rules.push("::selection{background:color-mix(in srgb," + theme.colors.accent + " 28%,transparent)!important}");
  rules.push("input,textarea,[contenteditable]{caret-color:" + theme.colors.accent + "!important}");
  const effects = theme.effects || {};
  if (effects.scrollbar === "slim") {
    rules.push("::-webkit-scrollbar{width:6px!important;height:6px!important}::-webkit-scrollbar-thumb{background:color-mix(in srgb," + theme.colors.accent + " 35%,transparent)!important;border-radius:99px!important}::-webkit-scrollbar-track{background:transparent!important}");
  } else if (effects.scrollbar === "hidden") {
    rules.push("::-webkit-scrollbar{width:0!important;height:0!important}");
  }
  if (effects.motion === "off") {
    rules.push("*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important;animation-delay:0s!important}");
  }
  const customCss = sanitizeCustomCss(theme.customCss);
  if (customCss) rules.push(customCss);
  return rules.join("");
}

function hexLuminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
  };
  return .2126 * channel(1) + .7152 * channel(3) + .0722 * channel(5);
}

// 表面色为深色的主题：整套发射切换为深色系（底色/顶栏/输入框/次级文字全部跟随）。
function isDarkTheme(theme) {
  return hexLuminance(theme.colors.surface) < .35;
}

// WCAG 相对亮度对比度（1-21）。文字对表面 ≥4.5 视为可读。
function contrastRatio(hexA, hexB) {
  const a = hexLuminance(hexA);
  const b = hexLuminance(hexB);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

// 高级 token 表：仅接受合法自定义属性名，值剔除 CSS 语句字符与外链 url。
function normalizeTokens(source) {
  if (!source || typeof source !== "object") return {};
  const out = {};
  let count = 0;
  for (const key in source) {
    if (count >= 100) break;
    if (!/^--[\w-]{1,60}$/.test(key)) continue;
    const value = String(source[key]).replace(/[;{}]/g, "").trim().slice(0, 300);
    if (!value || /url\(\s*['"]?(?!data:)/i.test(value)) continue;
    out[key] = value;
    count += 1;
  }
  return out;
}

// 自定义 CSS：去掉 @import 与非 data: 的 url()，注入包保持零外联。
function sanitizeCustomCss(value) {
  if (typeof value !== "string") return "";
  return value
    .slice(0, 200000)
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(?!['"]?data:)[^)]*\)/gi, "url()");
}

function cleanLine(value, max) {
  return typeof value === "string" ? value.replace(/[<>]/g, "").slice(0, max) : "";
}

function normalizeSidePanel(source) {
  const panel = source || {};
  return {
    enabled: Boolean(panel.enabled),
    width: clampNumber(panel.width, 240, 200, 320),
    title: cleanLine(panel.title, 20),
    subtitle: cleanLine(panel.subtitle, 30),
    image: typeof panel.image === "string" && BACKGROUND_DATA_URL.test(panel.image) ? panel.image : null,
    card: cleanLine(panel.card, 300),
    icons: cleanLine(panel.icons, 24),
    heading: cleanLine(panel.heading, 20),
    image2: typeof panel.image2 === "string" && BACKGROUND_DATA_URL.test(panel.image2) ? panel.image2 : null,
    footer: cleanLine(panel.footer, 20)
  };
}

// 装饰 Chrome：假标题栏 / 图标工具栏 / 底部状态栏（纯装饰 DOM，失败自动降级）。
function normalizeChrome(source) {
  const chrome = source || {};
  return {
    enabled: Boolean(chrome.enabled),
    title: cleanLine(chrome.title, 30),
    toolbar: Array.isArray(chrome.toolbar)
      ? chrome.toolbar.slice(0, 8).map((item) => cleanLine(item, 14)).filter(Boolean)
      : [],
    statusBar: Boolean(chrome.statusBar)
  };
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return "#" + f(0) + f(8) + f(4);
}

function hueBucketsFromPixels(data) {
  const buckets = new Array(36).fill(0);
  let totalWeight = 0;
  let luminanceSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    luminanceSum += .2126 * r + .7152 * g + .0722 * b;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (delta < 0.04 || max < 0.15) continue;
    let hue;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    const weight = delta * max;
    buckets[Math.floor(hue / 10) % 36] += weight;
    totalWeight += weight;
  }
  const pixelCount = data.length / 4;
  return { buckets, totalWeight, pixelCount, averageLuminance: pixelCount ? luminanceSum / pixelCount : 1 };
}

function paletteFromHue(hue, dark) {
  if (dark) {
    // 深色图片：深表面 + 亮文字 + 提亮的强调色，保证对比度
    return {
      accent: hslToHex(hue, .5, .62),
      surface: hslToHex(hue, .24, .12),
      text: hslToHex(hue, .14, .93)
    };
  }
  return {
    accent: hslToHex(hue, .34, .42),
    surface: hslToHex(hue, .55, .975),
    text: hslToHex(hue, .24, .2)
  };
}

// 从缩样像素（RGBA 扁平数组）提取主色调，按可读性公式生成三色：
// accent 取主色相的中明度色，surface 固定为极浅底色，text 固定为深色——保证对比度可用。
// 近灰度图返回 null（沿用默认配色）。
// 近灰度图取不出主色相：按整体亮度给一套中性方案（偏冷灰蓝），深浅自动。
function neutralPalette(dark) {
  if (dark) {
    return { accent: hslToHex(220, .2, .62), surface: hslToHex(220, .14, .12), text: hslToHex(220, .1, .93) };
  }
  return { accent: hslToHex(220, .18, .42), surface: hslToHex(220, .3, .975), text: hslToHex(220, .16, .18) };
}

function paletteFromPixels(data) {
  const { buckets, totalWeight, pixelCount, averageLuminance } = hueBucketsFromPixels(data);
  if (totalWeight < pixelCount * .02) return neutralPalette(averageLuminance < .42);
  let best = 0, bestScore = -1;
  for (let i = 0; i < 36; i += 1) {
    const score = buckets[(i + 35) % 36] * .5 + buckets[i] + buckets[(i + 1) % 36] * .5;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return paletteFromHue(best * 10 + 5, averageLuminance < .42);
}

// 取色候选：按权重取前 N 个互相间隔 ≥30° 的色相桶，各生成一套配色（深浅随图片亮度）。
function paletteCandidatesFromPixels(data, count = 4) {
  const { buckets, totalWeight, pixelCount, averageLuminance } = hueBucketsFromPixels(data);
  if (totalWeight < pixelCount * .02) return [neutralPalette(averageLuminance < .42)];
  const dark = averageLuminance < .42;
  const scored = buckets
    .map((weight, i) => ({ i, score: buckets[(i + 35) % 36] * .5 + weight + buckets[(i + 1) % 36] * .5 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const entry of scored) {
    if (chosen.length >= count) break;
    const clash = chosen.some((taken) => {
      const distance = Math.abs(taken - entry.i);
      return Math.min(distance, 36 - distance) < 3;
    });
    if (!clash) chosen.push(entry.i);
  }
  return chosen.map((bucket) => paletteFromHue(bucket * 10 + 5, dark));
}

function themeEquals(a, b) {
  return JSON.stringify({ ...a, createdAt: 0 }) === JSON.stringify({ ...b, createdAt: 0 });
}

function dataUrlKilobytes(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const comma = dataUrl.indexOf(",");
  return Math.round((dataUrl.length - comma - 1) * 3 / 4 / 1024);
}

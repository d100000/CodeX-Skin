import coreSource from "../installer/manager/00-core.js?raw";

// 复用注入端的纯函数源码，保证 Studio 预览、校验与 Codex 最终渲染使用同一套规则。
const core = new Function(`${coreSource}; return {
  THEME_DEFAULTS, SAFE_ZONES, ANSI_KEYS, TERMINAL_PRESETS, SHADOW_PRESETS,
  normalizeTheme, themeCss, backgroundLayerValue, filterValue, themeEquals,
  contrastRatio, paletteFromPixels, paletteCandidatesFromPixels, dataUrlKilobytes,
  isVideoBackground, isDarkTheme
};`)();

export const {
  THEME_DEFAULTS,
  SAFE_ZONES,
  ANSI_KEYS,
  TERMINAL_PRESETS,
  SHADOW_PRESETS,
  normalizeTheme,
  themeCss,
  backgroundLayerValue,
  filterValue,
  themeEquals,
  contrastRatio,
  paletteFromPixels,
  paletteCandidatesFromPixels,
  dataUrlKilobytes,
  isVideoBackground,
  isDarkTheme
} = core;

export function makeThemeId(name = "custom") {
  const slug = String(name)
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "custom";
  return `${slug}-${Date.now().toString(36)}`;
}

export function exportableTheme(theme) {
  const { builtin, preview, ...portable } = theme;
  return portable;
}

export function cloneTheme(theme) {
  return structuredClone(theme);
}

export function dataUrlToCss(value) {
  return value && value !== "none" ? `url(${JSON.stringify(value)}) center / cover no-repeat` : "none";
}


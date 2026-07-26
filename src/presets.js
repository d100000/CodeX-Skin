import presetSource from "../installer/manager/presets.json";
import predictedSource from "./generated-image-themes.json";
import { call, isDesktop } from "./bridge";
import { normalizeTheme } from "./theme-core";

const assetCache = new Map();

// 113 套预测主题的背景不再打进安装包（省 ~15MB），托管在 GitHub 上按需拉取。
// 桌面端经 Rust 下载并落盘缓存；浏览器预览直接抓远程。4 套基础主题的资产仍然内置。
export const PRESET_REMOTE_BASE = "https://raw.githubusercontent.com/d100000/CodeX-Skin/main/preset-assets/";

function isRemotePresetAsset(name) {
  return name.startsWith("predicted-");
}

function publicAsset(reference) {
  if (!reference.startsWith("asset://")) return reference;
  const name = reference.slice("asset://".length);
  return isRemotePresetAsset(name) ? `${PRESET_REMOTE_BASE}${name}` : `/assets/${name}`;
}

async function assetDataUrl(reference) {
  if (!reference.startsWith("asset://")) return reference;
  if (assetCache.has(reference)) return assetCache.get(reference);
  const name = reference.slice("asset://".length);
  const promise = isDesktop && isRemotePresetAsset(name)
    ? call("cache_preset_asset", { name })
    : fetch(publicAsset(reference))
        .then((response) => {
          if (!response.ok) throw new Error(`无法加载内置素材：${reference}`);
          return response.blob();
        })
        .then((blob) => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        }));
  promise.catch(() => assetCache.delete(reference)); // 失败不缓存，允许重试
  assetCache.set(reference, promise);
  return promise;
}

async function resolveAssetTree(value) {
  if (typeof value === "string") return assetDataUrl(value);
  if (Array.isArray(value)) return Promise.all(value.map(resolveAssetTree));
  if (!value || typeof value !== "object") return value;
  const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await resolveAssetTree(item)]));
  return Object.fromEntries(entries);
}

export function previewForTheme(theme) {
  const source = theme.preview || theme.background;
  return typeof source === "string" && source.startsWith("asset://") ? publicAsset(source) : source;
}

export async function hydrateThemeAssets(theme) {
  if (!theme?.assetReference || (typeof theme.background === "string" && theme.background.startsWith("data:"))) return theme;
  const background = await assetDataUrl(theme.assetReference);
  return { ...theme, background };
}

export async function loadBuiltinThemes() {
  return Promise.all([...presetSource, ...predictedSource].map(async (preset) => {
    const preview = previewForTheme(preset);
    const hydrated = preset.predicted
      ? { ...preset, background: null, preview: null }
      : await resolveAssetTree(preset);
    return {
      ...normalizeTheme(hydrated),
      builtin: true,
      preview,
      assetReference: preset.predicted ? preset.background : null,
      predicted: Boolean(preset.predicted),
      category: preset.category || "基础主题",
      paletteLabel: preset.paletteLabel || "设计配色",
      tags: Array.isArray(preset.tags) ? preset.tags : [],
    };
  }));
}

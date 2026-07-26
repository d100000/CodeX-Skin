import presetSource from "../installer/manager/presets.json";
import predictedSource from "./generated-image-themes.json";
import { normalizeTheme } from "./theme-core";

const assetCache = new Map();

function publicAsset(reference) {
  return reference.startsWith("asset://") ? `/assets/${reference.slice("asset://".length)}` : reference;
}

async function assetDataUrl(reference) {
  if (!reference.startsWith("asset://")) return reference;
  if (assetCache.has(reference)) return assetCache.get(reference);
  const promise = fetch(publicAsset(reference))
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

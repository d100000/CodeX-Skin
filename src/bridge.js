import { invoke } from "@tauri-apps/api/core";
import packageJson from "../package.json";

export const isDesktop = Boolean(window.__TAURI_INTERNALS__);
const FALLBACK_KEY = "doll-skin-studio-library-v1";
const MODEL_FALLBACK_KEY = "doll-skin-studio-model-providers-v1";

function browserExport(filename, payload) {
  const blob = new Blob([payload], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return filename;
}

const fallbacks = {
  app_version: async () => packageJson.version,
  check_app_update: async () => ({ currentVersion: packageJson.version, available: false, version: null, notes: null, date: null }),
  install_app_update: async () => { throw new Error("桌面构建中才能安装更新"); },
  connection_status: async () => ({
    codexInstalled: true,
    codexPath: "/Applications/ChatGPT.app",
    codexVersion: "预览模式",
    testedVersion: "26.715.21425",
    verified: true,
    running: false,
    connected: false,
    managed: false,
    port: 9227,
    targetCount: 0,
    targetIds: [],
    managedTargetIds: [],
    state: "offline",
    message: "浏览器预览模式 · 可离线编辑"
  }),
  load_library: async () => {
    try {
      return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '{"themes":[],"settings":{}}');
    } catch {
      return { themes: [], settings: {} };
    }
  },
  save_library: async ({ payload }) => localStorage.setItem(FALLBACK_KEY, JSON.stringify(payload)),
  apply_theme: async ({ safeMode }) => ({ applied: 0, safeMode, targetIds: [] }),
  preview_theme: async () => 0,
  pause_skin: async () => 0,
  launch_codex: async () => { throw new Error("桌面构建中才能启动 Codex"); },
  restart_codex: async () => { throw new Error("桌面构建中才能重启 Codex"); },
  migrate_legacy_themes: async () => ({ themes: [], selectedId: null, error: null }),
  export_theme: async ({ filename, payload }) => browserExport(filename, payload),
  open_data_folder: async () => { throw new Error("桌面构建中才能打开数据目录"); },
  load_model_providers: async () => {
    try {
      return JSON.parse(localStorage.getItem(MODEL_FALLBACK_KEY) || '{"activeId":null,"providers":[]}');
    } catch {
      return { activeId: null, providers: [] };
    }
  },
  save_model_providers: async ({ payload }) => localStorage.setItem(MODEL_FALLBACK_KEY, JSON.stringify(payload)),
  read_live_model_config: async () => ({
    provider: null, providerName: null, baseUrl: null, wireApi: null,
    model: null, reasoningEffort: null, authMode: "none", apiKey: null, managed: false
  }),
  apply_model_provider: async () => { throw new Error("桌面构建中才能写入 Codex 配置"); },
  fetch_provider_models: async () => [
    { id: "demo-model-a", ownedBy: "preview" },
    { id: "demo-model-b", ownedBy: "preview" },
  ]
};

export async function call(command, args = {}) {
  if (isDesktop) return invoke(command, args);
  const fallback = fallbacks[command];
  if (!fallback) throw new Error(`Missing browser fallback: ${command}`);
  return fallback(args);
}

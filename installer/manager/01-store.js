// 存储层：IndexedDB 主题库 + localStorage 轻状态 + 内置预设装载。
const IDS = {
  base: "codex-doll-skin-runtime",
  override: "codex-doll-theme-override",
  managerStyle: "codex-doll-manager-style",
  trigger: "codex-doll-skin-menu",
  manager: "codex-doll-skin-manager"
};
const DB_NAME = "codex-doll-skin-library";
const STORE = "themes";
const CURRENT_KEY = "codexDollCurrentTheme";
const PAUSED_KEY = "codexDollSkinPaused";

let db = null;

const openDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
  request.onsuccess = () => { db = request.result; resolve(db); };
  request.onerror = () => reject(request.error);
});

const transaction = (mode, action) => new Promise((resolve, reject) => {
  const request = action(db.transaction(STORE, mode).objectStore(STORE));
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const allThemes = () => transaction("readonly", (store) => store.getAll());
const getTheme = (id) => transaction("readonly", (store) => store.get(id));
const putTheme = (theme) => transaction("readwrite", (store) => store.put(theme));
const deleteTheme = (id) => transaction("readwrite", (store) => store.delete(id));

// PRESETS 由装配器注入；preview 字段仅用于卡片缩略图，不进 schema。
const presetThemes = PRESETS.map((preset) => {
  const theme = normalizeTheme(preset);
  theme.builtin = true;
  theme.preview = typeof preset.preview === "string" ? preset.preview : theme.background;
  return theme;
});

const findPreset = (id) => presetThemes.find((preset) => preset.id === id) || null;

async function findTheme(id) {
  const preset = findPreset(id);
  if (preset) return preset;
  const stored = await getTheme(id);
  return stored ? normalizeTheme(stored) : null;
}

async function listThemes() {
  const stored = (await allThemes()).map(normalizeTheme);
  stored.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return [...presetThemes, ...stored];
}

const currentThemeId = () => localStorage.getItem(CURRENT_KEY) || presetThemes[0].id;
const setCurrentThemeId = (id) => localStorage.setItem(CURRENT_KEY, id);
const isPaused = () => localStorage.getItem(PAUSED_KEY) === "1";

// 皮肤切换按钮是全局用户设置：不随皮肤/预设变化，避免增加用户理解成本。
const TRIGGER_KEY = "codexDollTriggerConfig";
const DEFAULT_TRIGGER = { position: "top-center", icon: "D", autoHide: false };
function getTriggerConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(TRIGGER_KEY) || "{}");
    return {
      position: TRIGGER_POSITIONS.includes(raw.position) ? raw.position : DEFAULT_TRIGGER.position,
      icon: typeof raw.icon === "string" && raw.icon.trim() ? [...raw.icon.trim()].slice(0, 2).join("") : DEFAULT_TRIGGER.icon,
      autoHide: Boolean(raw.autoHide)
    };
  } catch {
    return { ...DEFAULT_TRIGGER };
  }
}
function setTriggerConfig(config) {
  localStorage.setItem(TRIGGER_KEY, JSON.stringify(config));
}

const makeThemeId = (name) => {
  const slug = String(name || "").toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "custom";
  return slug + "-" + Date.now().toString(36);
};

// 导出用：剥离运行时私有字段。
function exportableTheme(theme) {
  const { builtin, preview, ...clean } = theme;
  return clean;
}

//! Codex 大模型供应商配置（模型切换器）。
//!
//! Codex 桌面版的模型路由就两个文件：`~/.codex/config.toml`（顶层 `model_provider` /
//! `model` / `model_reasoning_effort` + `[model_providers.<id>]` 表）和
//! `~/.codex/auth.json`（`OPENAI_API_KEY` 或官方 OAuth `tokens`）。
//!
//! 写入原则（借鉴 cc-switch 的所有权哨兵模式）：
//! - 只编辑我们自己的 `[model_providers.aha-codex]` 表和三个顶层路由键，
//!   MCP 服务器表、notify、用户手写的其他 provider 表一概不碰（测试强制：本文件不得出现该表名）；
//! - `toml_edit` 保留注释与既有格式；
//! - 临时文件 + rename 原子写，第二个文件失败回滚第一个；
//! - 每次写入前把两个文件快照进 `~/.codex/backups-aha/`，保留最近 5 份；
//! - 覆盖官方 OAuth 登录前先备份 `auth.json.aha-official.bak`，切回官方时还原。

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use toml_edit::{value, DocumentMut, Item, Table};

/// 我们在 config.toml 里拥有的 provider 表 id。永不清理非此 id 的表。
const SENTINEL_PROVIDER_ID: &str = "aha-codex";
const OFFICIAL_AUTH_BACKUP: &str = "auth.json.aha-official.bak";
const BACKUP_DIR: &str = "backups-aha";
const BACKUP_KEEP: usize = 5;

/// 我们生成的模型目录文件名（config.toml 的 `model_catalog_json` 相对 CODEX_HOME 解析）。
/// 只有指针指向这个文件名时才允许清理——用户自己维护的外部目录一律不碰。
const CATALOG_FILENAME: &str = "aha-codex-model-catalog.json";
/// 目录条目模板（取自 cc-switch 的 native-responses 干净模板，MIT）：
/// 无 freeform apply_patch / web_search 工具键，shell_type=shell_command，
/// 且带 Codex 目录解析器强制要求的 base_instructions 字段。
const CATALOG_TEMPLATE: &str = include_str!("../resources/codex-model-template.json");
const CATALOG_DEFAULT_CONTEXT_WINDOW: u64 = 128_000;
/// 目录条目上限：聚合站 /v1/models 动辄几百个模型，全塞进 Codex 选择器没法用。
const CATALOG_MAX_MODELS: usize = 50;

fn codex_home() -> Result<PathBuf, String> {
    if let Some(custom) = std::env::var_os("CODEX_HOME").filter(|v| !v.is_empty()) {
        return Ok(PathBuf::from(custom));
    }
    std::env::var_os("HOME")
        .map(|home| PathBuf::from(home).join(".codex"))
        .ok_or_else(|| "无法定位用户目录".into())
}

fn providers_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("model-providers.json"))
        .map_err(|error| error.to_string())
}

/// 临时文件 + rename 原子写；文件权限收紧到 0600（里面可能有 API Key）。
fn atomic_write(path: &PathBuf, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("无法解析目标目录")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("aha-tmp");
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600));
    }
    fs::rename(&temporary, path).map_err(|error| error.to_string())
}

/// 写入前把 config.toml + auth.json 快照到 backups-aha/，轮换保留最近几份。
fn snapshot_live_files(home: &PathBuf) -> Result<(), String> {
    let dir = home.join(BACKUP_DIR);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    for name in ["config.toml", "auth.json"] {
        let source = home.join(name);
        if source.exists() {
            let target = dir.join(format!("{stamp}-{name}"));
            fs::copy(&source, &target).map_err(|error| error.to_string())?;
        }
    }
    // 轮换：按文件名（时间戳前缀）排序，超出份数的从最旧开始删
    let mut entries: Vec<_> = fs::read_dir(&dir)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .collect();
    entries.sort();
    let per_snapshot = 2; // 每次快照最多两个文件
    while entries.len() > BACKUP_KEEP * per_snapshot {
        let oldest = entries.remove(0);
        let _ = fs::remove_file(oldest);
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub preset_id: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default = "default_wire_api")]
    pub wire_api: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub reasoning_effort: String,
    /// official = 官方登录（不写 model_provider 指针，还原 OAuth 缓存）
    #[serde(default)]
    pub official: bool,
    /// 写入 Codex 模型选择器目录的模型列表（空 = 不生成目录，Codex 显示默认菜单）
    #[serde(default)]
    pub catalog_models: Vec<String>,
}

fn default_wire_api() -> String {
    "responses".into()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveModelConfig {
    pub provider: Option<String>,
    pub provider_name: Option<String>,
    pub base_url: Option<String>,
    pub wire_api: Option<String>,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub auth_mode: String, // "oauth" | "apiKey" | "none"
    pub api_key: Option<String>,
    pub managed: bool, // 当前指针是否指向我们的哨兵表
}

#[tauri::command]
pub fn load_model_providers(app: AppHandle) -> Result<Value, String> {
    let path = providers_store_path(&app)?;
    if !path.exists() {
        return Ok(json!({ "activeId": null, "providers": [] }));
    }
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| format!("供应商库文件损坏：{error}"))
}

#[tauri::command]
pub fn save_model_providers(app: AppHandle, payload: Value) -> Result<(), String> {
    let path = providers_store_path(&app)?;
    let bytes = serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?;
    atomic_write(&path, &bytes)
}

/// 回读 Codex 当前实际生效的模型配置，供页面展示与首次导入。
#[tauri::command]
pub fn read_live_model_config() -> Result<LiveModelConfig, String> {
    let home = codex_home()?;
    let config_path = home.join("config.toml");
    let doc = if config_path.exists() {
        let text = fs::read_to_string(&config_path).map_err(|error| error.to_string())?;
        text.parse::<DocumentMut>()
            .map_err(|error| format!("config.toml 解析失败：{error}"))?
    } else {
        DocumentMut::new()
    };

    let provider = doc
        .get("model_provider")
        .and_then(Item::as_str)
        .map(str::to_owned);
    let table = provider.as_deref().and_then(|id| {
        doc.get("model_providers")
            .and_then(Item::as_table_like)
            .and_then(|providers| providers.get(id))
            .and_then(Item::as_table_like)
    });

    let auth_path = home.join("auth.json");
    let (auth_mode, api_key) = if auth_path.exists() {
        let auth: Value = fs::read_to_string(&auth_path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or(Value::Null);
        if auth.get("tokens").map_or(false, |tokens| !tokens.is_null()) {
            ("oauth".to_owned(), None)
        } else if let Some(key) = auth.get("OPENAI_API_KEY").and_then(Value::as_str) {
            ("apiKey".to_owned(), Some(key.to_owned()))
        } else {
            ("none".to_owned(), None)
        }
    } else {
        ("none".to_owned(), None)
    };

    Ok(LiveModelConfig {
        provider_name: table
            .and_then(|t| t.get("name"))
            .and_then(Item::as_str)
            .map(str::to_owned),
        base_url: table
            .and_then(|t| t.get("base_url"))
            .and_then(Item::as_str)
            .map(str::to_owned),
        wire_api: table
            .and_then(|t| t.get("wire_api"))
            .and_then(Item::as_str)
            .map(str::to_owned),
        model: doc.get("model").and_then(Item::as_str).map(str::to_owned),
        reasoning_effort: doc
            .get("model_reasoning_effort")
            .and_then(Item::as_str)
            .map(str::to_owned),
        managed: provider.as_deref() == Some(SENTINEL_PROVIDER_ID),
        provider,
        auth_mode,
        api_key,
    })
}

// ---------- 模型列表自动拉取（机制取自 cc-switch 的 model_fetch 服务） ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedModel {
    pub id: String,
    pub owned_by: Option<String>,
}

/// 已知的「Anthropic/编码计划兼容子路径」后缀；按长度降序，最长后缀优先剥离。
const COMPAT_SUFFIXES: &[&str] = &[
    "/api/claudecode",
    "/api/anthropic",
    "/apps/anthropic",
    "/api/coding",
    "/claudecode",
    "/anthropic",
    "/step_plan",
    "/coding",
    "/claude",
];

/// baseURL 是否以 OpenAI 风格版本段 `/v{N}` 结尾（`/v1`、智谱 `.../paas/v4`）。
/// 这类 URL 版本号已在路径里，模型端点是 `{base}/models`，不能再补 `/v1`。
fn ends_with_version_segment(url: &str) -> bool {
    let last = url.rsplit('/').next().unwrap_or("");
    last.strip_prefix('v')
        .is_some_and(|digits| !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()))
}

/// 构造模型列表端点候选：版本段规则 → 兼容子路径剥离兜底，去重保序。
fn build_models_url_candidates(base_url: &str) -> Result<Vec<String>, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Base URL 为空".into());
    }
    let mut candidates: Vec<String> = Vec::new();
    if ends_with_version_segment(trimmed) {
        candidates.push(format!("{trimmed}/models"));
        if !trimmed.ends_with("/v1") {
            candidates.push(format!("{trimmed}/v1/models"));
        }
    } else {
        candidates.push(format!("{trimmed}/v1/models"));
    }
    if let Some(suffix) = COMPAT_SUFFIXES.iter().find(|s| trimmed.ends_with(**s)) {
        let root = trimmed[..trimmed.len() - suffix.len()].trim_end_matches('/');
        if !root.is_empty() && root.contains("://") {
            candidates.push(format!("{root}/v1/models"));
            candidates.push(format!("{root}/models"));
        }
    }
    let mut unique: Vec<String> = Vec::with_capacity(candidates.len());
    for url in candidates {
        if !unique.iter().any(|item| item == &url) {
            unique.push(url);
        }
    }
    Ok(unique)
}

/// 从供应商的 OpenAI 兼容 `GET /v1/models` 端点拉取可用模型列表。
#[tauri::command]
pub async fn fetch_provider_models(
    base_url: String,
    api_key: String,
) -> Result<Vec<FetchedModel>, String> {
    let key = api_key.trim().to_owned();
    if key.is_empty() {
        return Err("请先填写 API Key 再拉取模型".into());
    }
    let candidates = build_models_url_candidates(&base_url)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let mut last_error: Option<String> = None;
    for url in &candidates {
        let response = client
            .get(url)
            .header("Authorization", format!("Bearer {key}"))
            .send()
            .await
            .map_err(|error| format!("请求失败：{error}"))?;
        let status = response.status();
        if status.is_success() {
            let body: Value = response
                .json()
                .await
                .map_err(|error| format!("响应解析失败：{error}"))?;
            let mut models: Vec<FetchedModel> = body
                .get("data")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| {
                            Some(FetchedModel {
                                id: item.get("id")?.as_str()?.to_owned(),
                                owned_by: item
                                    .get("owned_by")
                                    .and_then(Value::as_str)
                                    .map(str::to_owned),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            models.sort_by(|a, b| a.id.cmp(&b.id));
            return Ok(models);
        }
        // 404/405 说明端点路径不对，换下一个候选；其余状态码直接报给用户
        if status.as_u16() == 404 || status.as_u16() == 405 {
            last_error = Some(format!("HTTP {status}"));
            continue;
        }
        let body: String = response.text().await.unwrap_or_default();
        let brief: String = body.chars().take(300).collect();
        return Err(format!("HTTP {status}: {brief}"));
    }
    Err(format!(
        "该供应商没有可用的模型列表端点（{}）",
        last_error.unwrap_or_else(|| "无候选".into())
    ))
}

// ---------- 预设主题资产：GitHub 托管，按需下载并缓存 ----------
// 安装包不再捆绑 113 套预测主题的背景图（~15MB）；用户首次启动选择同步后，
// 背景按需从固定仓库地址下载，落盘缓存到 App Support/preset-assets/。

const PRESET_ASSET_BASE: &str =
    "https://raw.githubusercontent.com/d100000/CodeX-Skin/main/preset-assets/";

/// 下载并缓存一张预设背景，返回 data URL。
/// 文件名白名单校验 + 固定下载域名：不存在路径穿越或任意 URL 拉取的口子。
#[tauri::command]
pub async fn cache_preset_asset(app: AppHandle, name: String) -> Result<String, String> {
    let valid = name.strip_prefix("predicted-").is_some_and(|rest| {
        rest.strip_suffix(".webp")
            .is_some_and(|hex| hex.len() == 12 && hex.bytes().all(|b| b.is_ascii_hexdigit()))
    });
    if !valid {
        return Err(format!("非法资产名：{name}"));
    }
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("preset-assets");
    let cached = cache_dir.join(&name);
    let bytes = if cached.exists() {
        fs::read(&cached).map_err(|error| error.to_string())?
    } else {
        let url = format!("{PRESET_ASSET_BASE}{name}");
        let response = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|error| error.to_string())?
            .get(&url)
            .send()
            .await
            .map_err(|error| format!("下载预设背景失败：{error}"))?;
        if !response.status().is_success() {
            return Err(format!("下载预设背景失败：HTTP {}", response.status()));
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|error| error.to_string())?
            .to_vec();
        atomic_write(&cached, &bytes)?;
        bytes
    };
    use base64::Engine as _;
    Ok(format!(
        "data:image/webp;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

// ---------- Codex 模型选择器目录（model_catalog_json，机制取自 cc-switch） ----------

/// 基于内置干净模板为每个模型生成目录条目。
fn catalog_entry(template: &Value, model: &str, priority: usize) -> Value {
    let mut entry = template.clone();
    if let Some(object) = entry.as_object_mut() {
        object.insert("slug".into(), json!(model));
        object.insert("display_name".into(), json!(model));
        object.insert("description".into(), json!(model));
        object.insert("context_window".into(), json!(CATALOG_DEFAULT_CONTEXT_WINDOW));
        object.insert("max_context_window".into(), json!(CATALOG_DEFAULT_CONTEXT_WINDOW));
        object.insert("priority".into(), json!(1000 + priority));
    }
    entry
}

/// 写入/清理模型目录文件与 config.toml 指针。
/// 所有权规则：`model_catalog_json` 只有为空或指向我们的文件名时才写/清，
/// 用户自己维护的外部目录绝不覆盖。
fn sync_model_catalog(
    doc: &mut DocumentMut,
    home: &PathBuf,
    models: &[String],
) -> Result<(), String> {
    let pointer = doc
        .get("model_catalog_json")
        .and_then(Item::as_str)
        .map(str::to_owned);
    let owned = pointer
        .as_deref()
        .map_or(true, |current| current.contains(CATALOG_FILENAME));
    if !owned {
        return Ok(()); // 外部目录在位：不写也不清，保持现状
    }

    let catalog_path = home.join(CATALOG_FILENAME);
    let cleaned: Vec<&String> = models
        .iter()
        .filter(|model| !model.trim().is_empty())
        .take(CATALOG_MAX_MODELS)
        .collect();
    if cleaned.is_empty() {
        doc.remove("model_catalog_json");
        let _ = fs::remove_file(&catalog_path);
        return Ok(());
    }

    let template: Value = serde_json::from_str(CATALOG_TEMPLATE)
        .map_err(|error| format!("内置目录模板损坏：{error}"))?;
    let entries: Vec<Value> = cleaned
        .iter()
        .enumerate()
        .map(|(index, model)| catalog_entry(&template, model, index))
        .collect();
    let bytes = serde_json::to_vec_pretty(&json!({ "models": entries }))
        .map_err(|error| error.to_string())?;
    atomic_write(&catalog_path, &bytes)?;
    doc["model_catalog_json"] = value(CATALOG_FILENAME);
    Ok(())
}

/// 切换供应商：编辑 config.toml（保留一切既有内容）+ 按需写 auth.json。
#[tauri::command]
pub fn apply_model_provider(profile: ModelProviderProfile) -> Result<(), String> {
    let home = codex_home()?;
    let config_path = home.join("config.toml");
    let auth_path = home.join("auth.json");

    snapshot_live_files(&home)?;

    let original_config = config_path
        .exists()
        .then(|| fs::read_to_string(&config_path))
        .transpose()
        .map_err(|error| error.to_string())?;
    let mut doc = original_config
        .as_deref()
        .unwrap_or("")
        .parse::<DocumentMut>()
        .map_err(|error| format!("config.toml 解析失败，已中止写入：{error}"))?;

    if profile.official {
        // 官方模式：去掉指针即回到官方默认端点；只清理我们自己的哨兵表。
        doc.remove("model_provider");
        if let Some(providers) = doc
            .get_mut("model_providers")
            .and_then(Item::as_table_like_mut)
        {
            providers.remove(SENTINEL_PROVIDER_ID);
        }
    } else {
        doc["model_provider"] = value(SENTINEL_PROVIDER_ID);
        if doc.get("model_providers").is_none() {
            let mut table = Table::new();
            table.set_implicit(true);
            doc["model_providers"] = Item::Table(table);
        }
        let mut entry = Table::new();
        entry["name"] = value(profile.name.as_str());
        entry["base_url"] = value(profile.base_url.trim_end_matches('/'));
        entry["wire_api"] = value(if profile.wire_api == "chat" {
            "chat"
        } else {
            "responses"
        });
        entry["requires_openai_auth"] = value(true);
        doc["model_providers"][SENTINEL_PROVIDER_ID] = Item::Table(entry);
    }

    if profile.model.trim().is_empty() {
        doc.remove("model");
    } else {
        doc["model"] = value(profile.model.trim());
    }

    // 模型目录：官方模式清掉我们的目录（回到 Codex 默认菜单），第三方按配置写入
    let catalog_models: Vec<String> = if profile.official {
        Vec::new()
    } else {
        profile.catalog_models.clone()
    };
    sync_model_catalog(&mut doc, &home, &catalog_models)?;
    match profile.reasoning_effort.as_str() {
        "low" | "medium" | "high" => {
            doc["model_reasoning_effort"] = value(profile.reasoning_effort.as_str());
        }
        _ => {
            doc.remove("model_reasoning_effort");
        }
    }

    let config_text = doc.to_string();
    // 写前校验，绝不落盘一个 Codex 读不了的配置
    toml::from_str::<toml::Table>(&config_text)
        .map_err(|error| format!("生成的 config.toml 未通过校验：{error}"))?;

    // ---------- auth.json ----------
    let original_auth = auth_path
        .exists()
        .then(|| fs::read(&auth_path))
        .transpose()
        .map_err(|error| error.to_string())?;
    let current_auth: Option<Value> = original_auth
        .as_deref()
        .and_then(|bytes| serde_json::from_slice(bytes).ok());
    let has_oauth = current_auth
        .as_ref()
        .and_then(|auth| auth.get("tokens"))
        .map_or(false, |tokens| !tokens.is_null());

    let next_auth: Option<Vec<u8>> = if profile.official {
        if has_oauth {
            None // 官方登录已在位，别碰
        } else {
            let backup = home.join(OFFICIAL_AUTH_BACKUP);
            backup
                .exists()
                .then(|| fs::read(&backup))
                .transpose()
                .map_err(|error| error.to_string())?
                .map(Some)
                .unwrap_or(None)
        }
    } else {
        if has_oauth {
            // 第一次从官方切走：把 OAuth 缓存备份好，切回官方时还原
            if let Some(bytes) = original_auth.as_deref() {
                atomic_write(&home.join(OFFICIAL_AUTH_BACKUP), bytes)?;
            }
        }
        let key = profile.api_key.trim();
        if key.is_empty() {
            return Err("请先填写 API Key".into());
        }
        Some(
            serde_json::to_vec_pretty(&json!({ "OPENAI_API_KEY": key }))
                .map_err(|error| error.to_string())?,
        )
    };

    // ---------- 两阶段原子写：config 失败无副作用，auth 失败回滚 config ----------
    atomic_write(&config_path, config_text.as_bytes())?;
    if let Some(bytes) = next_auth {
        if let Err(error) = atomic_write(&auth_path, &bytes) {
            match &original_config {
                Some(text) => {
                    let _ = atomic_write(&config_path, text.as_bytes());
                }
                None => {
                    let _ = fs::remove_file(&config_path);
                }
            }
            return Err(format!("auth.json 写入失败，config.toml 已回滚：{error}"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // CODEX_HOME 是进程级环境变量，测试并发跑会互相踩，串行化
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn with_temp_home<T>(run: impl FnOnce(&PathBuf) -> T) -> T {
        let _guard = ENV_LOCK.lock().unwrap();
        let home = std::env::temp_dir().join(format!(
            "aha-model-test-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&home);
        fs::create_dir_all(&home).unwrap();
        std::env::set_var("CODEX_HOME", &home);
        let result = run(&home);
        std::env::remove_var("CODEX_HOME");
        let _ = fs::remove_dir_all(&home);
        result
    }

    fn third_party() -> ModelProviderProfile {
        ModelProviderProfile {
            id: "p1".into(),
            name: "DeepSeek".into(),
            preset_id: "deepseek".into(),
            base_url: "https://api.deepseek.com/".into(),
            wire_api: "chat".into(),
            api_key: "sk-test-123".into(),
            model: "deepseek-v4-flash".into(),
            reasoning_effort: "high".into(),
            official: false,
            catalog_models: Vec::new(),
        }
    }

    #[test]
    fn model_url_candidates_follow_version_and_compat_rules() {
        // 纯根域 → /v1/models
        assert_eq!(
            build_models_url_candidates("https://api.siliconflow.cn").unwrap(),
            vec!["https://api.siliconflow.cn/v1/models"]
        );
        // 已带 /v1 → 不重复补版本段
        assert_eq!(
            build_models_url_candidates("https://api.moonshot.cn/v1/").unwrap(),
            vec!["https://api.moonshot.cn/v1/models"]
        );
        // 智谱 /v4 版本段：{base}/models 优先，/v1/models 兜底
        assert_eq!(
            build_models_url_candidates("https://open.bigmodel.cn/api/coding/paas/v4").unwrap(),
            vec![
                "https://open.bigmodel.cn/api/coding/paas/v4/models",
                "https://open.bigmodel.cn/api/coding/paas/v4/v1/models",
            ]
        );
        // 兼容子路径剥离兜底（最长后缀优先）
        assert_eq!(
            build_models_url_candidates("https://api.z.ai/api/anthropic").unwrap(),
            vec![
                "https://api.z.ai/api/anthropic/v1/models",
                "https://api.z.ai/v1/models",
                "https://api.z.ai/models",
            ]
        );
        assert!(build_models_url_candidates("  ").is_err());
    }

    #[test]
    fn catalog_written_with_pointer_and_cleared_on_official() {
        with_temp_home(|home| {
            let mut profile = third_party();
            profile.catalog_models = vec!["deepseek-v4-flash".into(), "deepseek-reasoner".into(), "  ".into()];
            apply_model_provider(profile).unwrap();

            let written = fs::read_to_string(home.join("config.toml")).unwrap();
            assert!(written.contains(&format!("model_catalog_json = \"{CATALOG_FILENAME}\"")), "必须写入目录指针");
            let catalog: Value = serde_json::from_str(&fs::read_to_string(home.join(CATALOG_FILENAME)).unwrap()).unwrap();
            let models = catalog["models"].as_array().unwrap();
            assert_eq!(models.len(), 2, "空白模型名应被过滤");
            assert_eq!(models[0]["slug"], "deepseek-v4-flash");
            assert_eq!(models[0]["priority"], 1000);
            assert_eq!(models[1]["priority"], 1001);
            // Codex 目录解析器的必填字段必须在
            assert!(models[0]["base_instructions"].is_string());
            assert_eq!(models[0]["shell_type"], "shell_command");
            // 干净模板不允许携带 freeform 工具键
            assert!(models[0].get("apply_patch_tool_type").is_none());
            assert!(models[0].get("tools").is_none());

            // 切回官方：指针与目录文件一并清理
            let official = ModelProviderProfile {
                id: "o".into(),
                name: "官方".into(),
                preset_id: "official".into(),
                base_url: String::new(),
                wire_api: "responses".into(),
                api_key: String::new(),
                model: String::new(),
                reasoning_effort: String::new(),
                official: true,
                catalog_models: Vec::new(),
            };
            apply_model_provider(official).unwrap();
            let written = fs::read_to_string(home.join("config.toml")).unwrap();
            assert!(!written.contains("model_catalog_json"), "官方模式应清掉目录指针");
            assert!(!home.join(CATALOG_FILENAME).exists(), "目录文件应删除");
        });
    }

    #[test]
    fn foreign_model_catalog_pointer_is_never_touched() {
        with_temp_home(|home| {
            fs::write(
                home.join("config.toml"),
                "model_catalog_json = \"my-own-catalog.json\"\n",
            )
            .unwrap();
            let mut profile = third_party();
            profile.catalog_models = vec!["m1".into()];
            apply_model_provider(profile).unwrap();
            let written = fs::read_to_string(home.join("config.toml")).unwrap();
            assert!(written.contains("model_catalog_json = \"my-own-catalog.json\""), "用户自己的目录指针必须原样保留");
            assert!(!home.join(CATALOG_FILENAME).exists(), "外部目录在位时不生成我们的目录");
        });
    }

    #[test]
    fn switch_preserves_user_config_and_routes_via_sentinel() {
        with_temp_home(|home| {
            // 模拟真实用户配置：手写 provider 表 + MCP 服务器表 + 注释
            let user_config = "# 用户注释\nmodel_provider = \"custom\"\nmodel = \"gpt-5.6-sol\"\n\n[model_providers.custom]\nname = \"custom\"\nbase_url = \"http://example.com/v1\"\n\n[mcp_servers.chrome]\ncommand = \"npx\"\n";
            fs::write(home.join("config.toml"), user_config).unwrap();
            fs::write(home.join("auth.json"), "{\"OPENAI_API_KEY\":\"old-key\"}").unwrap();

            apply_model_provider(third_party()).unwrap();

            let written = fs::read_to_string(home.join("config.toml")).unwrap();
            assert!(written.contains("model_provider = \"aha-codex\""), "指针应指向哨兵表");
            assert!(written.contains("base_url = \"https://api.deepseek.com\""), "尾斜杠应剔除");
            assert!(written.contains("wire_api = \"chat\""));
            assert!(written.contains("model = \"deepseek-v4-flash\""));
            assert!(written.contains("model_reasoning_effort = \"high\""));
            // 用户内容原样保留
            assert!(written.contains("# 用户注释"), "注释必须保留");
            assert!(written.contains("[model_providers.custom]"), "用户手写 provider 表必须保留");
            assert!(written.contains("[mcp_servers.chrome]"), "MCP 表必须保留");

            let auth: Value = serde_json::from_str(&fs::read_to_string(home.join("auth.json")).unwrap()).unwrap();
            assert_eq!(auth["OPENAI_API_KEY"], "sk-test-123");

            let live = read_live_model_config().unwrap();
            assert!(live.managed);
            assert_eq!(live.base_url.as_deref(), Some("https://api.deepseek.com"));
        });
    }

    #[test]
    fn official_switch_backs_up_and_restores_oauth_login() {
        with_temp_home(|home| {
            // 起点：官方 OAuth 登录
            fs::write(home.join("auth.json"), "{\"tokens\":{\"access\":\"secret\"}}").unwrap();

            // 切第三方：OAuth 缓存应被备份，auth 换成 API Key
            apply_model_provider(third_party()).unwrap();
            assert!(home.join(OFFICIAL_AUTH_BACKUP).exists(), "OAuth 缓存必须先备份");
            let auth: Value = serde_json::from_str(&fs::read_to_string(home.join("auth.json")).unwrap()).unwrap();
            assert_eq!(auth["OPENAI_API_KEY"], "sk-test-123");

            // 切回官方：指针清除、哨兵表清除、OAuth 还原
            let official = ModelProviderProfile {
                id: "o".into(),
                name: "官方".into(),
                preset_id: "official".into(),
                base_url: String::new(),
                wire_api: "responses".into(),
                api_key: String::new(),
                model: String::new(),
                reasoning_effort: String::new(),
                official: true,
                catalog_models: Vec::new(),
            };
            apply_model_provider(official).unwrap();
            let written = fs::read_to_string(home.join("config.toml")).unwrap();
            assert!(!written.contains("model_provider = "), "官方模式不应有指针");
            assert!(!written.contains("aha-codex"), "哨兵表应被清理");
            let auth: Value = serde_json::from_str(&fs::read_to_string(home.join("auth.json")).unwrap()).unwrap();
            assert_eq!(auth["tokens"]["access"], "secret", "OAuth 登录必须还原");
        });
    }

    #[test]
    fn missing_key_is_rejected_before_any_write() {
        with_temp_home(|home| {
            fs::write(home.join("config.toml"), "model = \"gpt-5.6-sol\"\n").unwrap();
            let mut profile = third_party();
            profile.api_key = "  ".into();
            let error = apply_model_provider(profile).unwrap_err();
            assert!(error.contains("API Key"));
            // config 不能被改坏
            assert_eq!(fs::read_to_string(home.join("config.toml")).unwrap(), "model = \"gpt-5.6-sol\"\n");
        });
    }
}

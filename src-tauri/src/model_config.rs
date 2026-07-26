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
        }
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

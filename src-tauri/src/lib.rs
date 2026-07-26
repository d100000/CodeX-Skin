mod model_config;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WindowEvent,
};
use tauri_plugin_updater::UpdaterExt;
use tokio::net::TcpStream;
use tokio::sync::Mutex as AsyncMutex;
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};

const DEFAULT_PORT: u16 = 9227;
const AGENT_SOURCE: &str = include_str!("../resources/skin-agent.js");
const MANIFEST: &str = include_str!("../../theme/manifest.json");

type DevtoolsSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// 常驻注入会话。持有它的后台任务独占 socket；丢弃 guard 会 abort 任务、关闭连接，
/// 从而让 Chromium 撤掉这一会话注册的 addScriptToEvaluateOnNewDocument 脚本。
struct SessionGuard(tokio::task::JoinHandle<()>);

impl Drop for SessionGuard {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// Page 域一旦启用，Chromium 就不再弹原生 confirm/alert，而是把对话框转交给调试端。
/// 这些会话为了保住脚本注册必须常驻，所以必须有人应答——否则页面里任何一次 confirm()
/// 都会永远阻塞，整个 Codex 渲染进程卡死。这里统一按"取消"应答并保持连接。
fn spawn_session_drain(mut socket: DevtoolsSocket) -> SessionGuard {
    SessionGuard(tokio::spawn(async move {
        let mut next_id = 1_000_000_u64;
        while let Some(Ok(message)) = socket.next().await {
            let Message::Text(text) = message else { continue };
            let Ok(value) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            if value.get("method").and_then(Value::as_str) != Some("Page.javascriptDialogOpening") {
                continue;
            }
            next_id += 1;
            let reply = json!({
                "id": next_id,
                "method": "Page.handleJavaScriptDialog",
                "params": { "accept": false }
            });
            if socket
                .send(Message::Text(reply.to_string().into()))
                .await
                .is_err()
            {
                break;
            }
        }
    }))
}

struct RuntimeState {
    port: Mutex<u16>,
    sessions: AsyncMutex<HashMap<String, SessionGuard>>,
}

impl Default for RuntimeState {
    fn default() -> Self {
        let port = std::env::var("DOLL_SKIN_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_PORT);
        Self {
            port: Mutex::new(port),
            sessions: AsyncMutex::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct DevtoolsTarget {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    url: String,
    #[serde(rename = "webSocketDebuggerUrl")]
    websocket_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionSnapshot {
    codex_installed: bool,
    codex_path: Option<String>,
    codex_version: Option<String>,
    tested_version: String,
    verified: bool,
    running: bool,
    connected: bool,
    managed: bool,
    port: u16,
    target_count: usize,
    target_ids: Vec<String>,
    managed_target_ids: Vec<String>,
    state: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplyResult {
    applied: usize,
    safe_mode: bool,
    target_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateSnapshot {
    current_version: String,
    available: bool,
    version: Option<String>,
    notes: Option<String>,
    date: Option<String>,
}

fn tested_version() -> String {
    serde_json::from_str::<Value>(MANIFEST)
        .ok()
        .and_then(|value| {
            value
                .get("minimumCodexVersion")?
                .as_str()
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "unknown".into())
}

#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
async fn check_app_update(app: AppHandle) -> Result<AppUpdateSnapshot, String> {
    let current_version = app.package_info().version.to_string();
    let update = app
        .updater()
        .map_err(|error| format!("更新服务初始化失败：{error}"))?
        .check()
        .await
        .map_err(|error| format!("检查 GitHub 更新失败：{error}"))?;
    Ok(match update {
        Some(update) => AppUpdateSnapshot {
            current_version,
            available: true,
            version: Some(update.version),
            notes: update.body,
            date: update.date.map(|value| value.to_string()),
        },
        None => AppUpdateSnapshot {
            current_version,
            available: false,
            version: None,
            notes: None,
            date: None,
        },
    })
}

#[tauri::command]
async fn install_app_update(app: AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|error| format!("更新服务初始化失败：{error}"))?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|error| format!("检查 GitHub 更新失败：{error}"))?
    else {
        return Err("当前已经是最新版本".into());
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("下载或安装更新失败：{error}"))?;
    app.restart();
}

fn candidate_codex_apps() -> Vec<PathBuf> {
    let mut paths = vec![
        PathBuf::from("/Applications/ChatGPT.app"),
        PathBuf::from("/Applications/Codex.app"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        paths.push(PathBuf::from(&home).join("Applications/ChatGPT.app"));
        paths.push(PathBuf::from(home).join("Applications/Codex.app"));
    }
    paths
}

fn codex_app_path() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("CODEX_APP_PATH").map(PathBuf::from) {
        if path.exists() {
            return Some(path);
        }
    }
    candidate_codex_apps()
        .into_iter()
        .find(|path| path.exists())
}

fn codex_executable(app: &Path) -> Option<PathBuf> {
    ["ChatGPT", "Codex"]
        .into_iter()
        .map(|name| app.join("Contents/MacOS").join(name))
        .find(|path| path.exists())
}

fn codex_version(app: &Path) -> Option<String> {
    let plist = app.join("Contents/Info.plist");
    let output = Command::new("/usr/bin/plutil")
        .args(["-extract", "CFBundleShortVersionString", "raw", "-o", "-"])
        .arg(plist)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn process_running(executable: &Path) -> bool {
    Command::new("/usr/bin/pgrep")
        .arg("-f")
        .arg(executable)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn configured_user_data_dir() -> Option<PathBuf> {
    std::env::var_os("DOLL_SKIN_USER_DATA_DIR")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn debug_process_marker(port: u16) -> String {
    format!("--remote-debugging-port={port}")
}

fn marker_process_running(marker: &str) -> bool {
    Command::new("/usr/bin/pgrep")
        .arg("-f")
        .arg(marker)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn codex_process_running(executable: &Path, port: u16) -> bool {
    if let Some(path) = configured_user_data_dir() {
        return marker_process_running(&format!("--user-data-dir={}", path.to_string_lossy()))
            || marker_process_running(&debug_process_marker(port));
    }
    process_running(executable)
}

fn terminate_processes(marker: &str) -> Result<(), String> {
    let status = Command::new("/usr/bin/pkill")
        .arg("-TERM")
        .arg("-f")
        .arg(marker)
        .status()
        .map_err(|error| format!("无法结束 Codex：{error}"))?;
    if status.success() || status.code() == Some(1) {
        Ok(())
    } else {
        Err(format!("无法结束 Codex（退出码 {:?}）", status.code()))
    }
}

fn is_main_target(target: &DevtoolsTarget) -> bool {
    target.kind == "page"
        && target.url.starts_with("app://")
        && !target.url.contains("avatar-overlay")
        && target.websocket_url.is_some()
}

async fn query_targets(port: u16) -> Result<Vec<DevtoolsTarget>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(1200))
        .build()
        .map_err(|error| error.to_string())?;
    let mut last_error = "Codex DevTools 未响应".to_string();
    let mut responded = false;
    let mut targets_by_id = HashMap::new();
    for host in ["127.0.0.1", "[::1]"] {
        let response = match client
            .get(format!("http://{host}:{port}/json/list"))
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_error = error.to_string();
                continue;
            }
        };
        match response.json::<Vec<DevtoolsTarget>>().await {
            Ok(targets) => {
                responded = true;
                for target in targets.into_iter().filter(is_main_target) {
                    targets_by_id.insert(target.id.clone(), target);
                }
            }
            Err(error) => last_error = error.to_string(),
        }
    }
    if responded {
        Ok(targets_by_id.into_values().collect())
    } else {
        Err(last_error)
    }
}

async fn cdp_call(
    socket: &mut DevtoolsSocket,
    next_id: &mut u64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let id = *next_id;
    *next_id += 1;
    let request = json!({ "id": id, "method": method, "params": params });
    socket
        .send(Message::Text(request.to_string().into()))
        .await
        .map_err(|error| error.to_string())?;
    loop {
        let message = tokio::time::timeout(Duration::from_secs(20), socket.next())
            .await
            .map_err(|_| format!("DevTools command timed out: {method}"))?
            .ok_or_else(|| "DevTools connection closed".to_string())?
            .map_err(|error| error.to_string())?;
        let text = match message {
            Message::Text(text) => text.to_string(),
            Message::Binary(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            _ => continue,
        };
        let reply: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
        if reply.get("id").and_then(Value::as_u64) != Some(id) {
            continue;
        }
        if let Some(error) = reply.get("error") {
            return Err(error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("DevTools error")
                .into());
        }
        return Ok(reply.get("result").cloned().unwrap_or(Value::Null));
    }
}

async fn connect_target(target: &DevtoolsTarget) -> Result<DevtoolsSocket, String> {
    let url = target
        .websocket_url
        .as_ref()
        .ok_or("Missing DevTools WebSocket URL")?;
    connect_async(url)
        .await
        .map(|(socket, _)| socket)
        .map_err(|error| error.to_string())
}

fn apply_safe_mode(theme: &mut Value) {
    if let Some(chrome) = theme.get_mut("chrome").and_then(Value::as_object_mut) {
        chrome.insert("enabled".into(), Value::Bool(false));
    }
    if let Some(panel) = theme.get_mut("sidePanel").and_then(Value::as_object_mut) {
        panel.insert("enabled".into(), Value::Bool(false));
    }
    if let Some(effects) = theme.get_mut("effects").and_then(Value::as_object_mut) {
        for (key, value) in [
            ("particles", "none"),
            ("typingFx", "none"),
            ("listFx", "none"),
            ("thinkingFx", "none"),
        ] {
            effects.insert(key.into(), Value::String(value.into()));
        }
    }
    if let Some(brand) = theme.get_mut("brand").and_then(Value::as_object_mut) {
        brand.insert("logo".into(), Value::Null);
        brand.insert("titlePrefix".into(), Value::String(String::new()));
    }
}

fn external_agent_expression(theme: &Value) -> Result<String, String> {
    let payload = serde_json::to_string(theme).map_err(|error| error.to_string())?;
    Ok(format!(
        "{AGENT_SOURCE};\n(async()=>{{await Promise.resolve(window.__CODEX_DOLL_SKIN_BOOTING__);const trigger=document.getElementById('codex-doll-skin-menu');if(trigger)trigger.hidden=true;return window.__CODEX_DOLL_SKIN_MANAGER__.applyTheme({payload});}})()"
    ))
}

fn checked_runtime_result(result: Value) -> Result<Value, String> {
    let Some(details) = result.get("exceptionDetails") else {
        return Ok(result);
    };
    let description = details
        .pointer("/exception/description")
        .and_then(Value::as_str)
        .or_else(|| details.get("text").and_then(Value::as_str))
        .unwrap_or("未知 JavaScript 异常");
    let location = match (
        details.get("lineNumber").and_then(Value::as_u64),
        details.get("columnNumber").and_then(Value::as_u64),
    ) {
        (Some(line), Some(column)) => format!("（第 {} 行，第 {} 列）", line + 1, column + 1),
        _ => String::new(),
    };
    Err(format!("Codex 皮肤脚本执行失败{location}：{description}"))
}

async fn runtime_evaluate(
    socket: &mut DevtoolsSocket,
    next_id: &mut u64,
    expression: &str,
    await_promise: bool,
) -> Result<Value, String> {
    let result = cdp_call(
        socket,
        next_id,
        "Runtime.evaluate",
        json!({ "expression": expression, "returnByValue": true, "awaitPromise": await_promise }),
    )
    .await?;
    checked_runtime_result(result)
}

async fn install_theme_on_target(
    target: &DevtoolsTarget,
    source: &str,
) -> Result<DevtoolsSocket, String> {
    let mut socket = connect_target(target).await?;
    let mut next_id = 1;
    cdp_call(&mut socket, &mut next_id, "Page.enable", json!({})).await?;
    cdp_call(&mut socket, &mut next_id, "Runtime.enable", json!({})).await?;
    let registered = cdp_call(
        &mut socket,
        &mut next_id,
        "Page.addScriptToEvaluateOnNewDocument",
        json!({ "source": source }),
    )
    .await?;
    registered
        .get("identifier")
        .and_then(Value::as_str)
        .ok_or_else(|| "Codex did not return a persistent script identifier".to_string())?;
    runtime_evaluate(&mut socket, &mut next_id, source, true).await?;
    Ok(socket)
}

async fn evaluate_all(
    port: u16,
    expression: &str,
    await_promise: bool,
) -> Result<Vec<Value>, String> {
    let targets = query_targets(port).await?;
    if targets.is_empty() {
        return Err("未找到可控制的 Codex 窗口".into());
    }
    let mut results = Vec::with_capacity(targets.len());
    for target in targets {
        let mut socket = connect_target(&target).await?;
        let mut next_id = 1;
        let result = runtime_evaluate(&mut socket, &mut next_id, expression, await_promise).await?;
        results.push(result);
    }
    Ok(results)
}

async fn target_has_skin_runtime(target: &DevtoolsTarget) -> bool {
    let Ok(mut socket) = connect_target(target).await else {
        return false;
    };
    let mut next_id = 1;
    let expression = "Boolean(window.__CODEX_DOLL_SKIN_MANAGER__?.applyTheme&&document.getElementById('codex-doll-skin-runtime')&&document.getElementById('codex-doll-theme-override'))";
    runtime_evaluate(&mut socket, &mut next_id, expression, false)
        .await
        .ok()
        .and_then(|value| value.pointer("/result/value").and_then(Value::as_bool))
        .unwrap_or(false)
}

async fn snapshot(port: u16) -> ConnectionSnapshot {
    let app_path = codex_app_path();
    let executable = app_path.as_deref().and_then(codex_executable);
    let installed = app_path.is_some();
    let running = executable
        .as_deref()
        .map(|executable| codex_process_running(executable, port))
        .unwrap_or(false);
    let version = app_path.as_deref().and_then(codex_version);
    let tested = tested_version();
    let verified = version.as_deref() == Some(tested.as_str());
    let targets = query_targets(port).await.unwrap_or_default();
    let connected = !targets.is_empty();
    let mut managed_target_ids = Vec::new();
    for target in &targets {
        if target_has_skin_runtime(target).await {
            managed_target_ids.push(target.id.clone());
        }
    }
    let managed = connected && managed_target_ids.len() == targets.len();
    let (state, message) = if !installed {
        ("missing", "未找到 Codex，请先安装桌面版")
    } else if connected {
        if !managed {
            ("connected", "已连接，正在同步当前皮肤")
        } else if verified {
            ("connected", "已连接，修改将实时应用")
        } else {
            ("compatibility", "已连接，当前版本将使用兼容模式")
        }
    } else if running {
        (
            "restartRequired",
            "Codex 不是由 Studio 启动，需要重启后接管",
        )
    } else {
        ("offline", "Codex 未运行，可离线编辑皮肤")
    };
    ConnectionSnapshot {
        codex_installed: installed,
        codex_path: app_path.map(|path| path.to_string_lossy().to_string()),
        codex_version: version,
        tested_version: tested,
        verified,
        running,
        connected,
        managed,
        port,
        target_count: targets.len(),
        target_ids: targets.into_iter().map(|target| target.id).collect(),
        managed_target_ids,
        state: state.into(),
        message: message.into(),
    }
}

#[tauri::command]
async fn connection_status(state: State<'_, RuntimeState>) -> Result<ConnectionSnapshot, String> {
    let port = *state.port.lock().map_err(|_| "运行时状态锁定失败")?;
    Ok(snapshot(port).await)
}

async fn launch_codex_process(port: u16) -> Result<(), String> {
    let app = codex_app_path().ok_or("未找到 Codex 桌面版")?;
    let executable = codex_executable(&app).ok_or("Codex 可执行文件不存在")?;
    let mut command = Command::new(executable);
    command.args([
        "--remote-debugging-address=127.0.0.1".to_string(),
        format!("--remote-debugging-port={port}"),
    ]);
    if let Some(path) = configured_user_data_dir() {
        fs::create_dir_all(&path).map_err(|error| format!("无法创建隔离数据目录：{error}"))?;
        command.arg(format!("--user-data-dir={}", path.to_string_lossy()));
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("无法启动 Codex：{error}"))?;
    Ok(())
}

async fn wait_for_codex(port: u16) -> Result<ConnectionSnapshot, String> {
    for _ in 0..100 {
        let current = snapshot(port).await;
        if current.connected {
            return Ok(current);
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    Err("Codex 已启动，但调试连接在 20 秒内没有就绪".into())
}

#[tauri::command]
async fn launch_codex(state: State<'_, RuntimeState>) -> Result<ConnectionSnapshot, String> {
    let port = *state.port.lock().map_err(|_| "运行时状态锁定失败")?;
    let current = snapshot(port).await;
    if current.connected {
        return Ok(current);
    }
    if current.running {
        return Err("RESTART_REQUIRED:Codex 正在以普通模式运行".into());
    }
    launch_codex_process(port).await?;
    wait_for_codex(port).await
}

#[tauri::command]
async fn restart_codex(state: State<'_, RuntimeState>) -> Result<ConnectionSnapshot, String> {
    let port = *state.port.lock().map_err(|_| "运行时状态锁定失败")?;
    if let Some(executable) = codex_app_path().as_deref().and_then(codex_executable) {
        let (marker, is_running): (String, Box<dyn Fn() -> bool + Send>) =
            if let Some(path) = configured_user_data_dir() {
                let marker = format!("--user-data-dir={}", path.to_string_lossy());
                let check = marker.clone();
                (marker, Box::new(move || marker_process_running(&check)))
            } else if query_targets(port)
                .await
                .is_ok_and(|targets| !targets.is_empty())
            {
                let marker = debug_process_marker(port);
                let check = marker.clone();
                (marker, Box::new(move || marker_process_running(&check)))
            } else {
                let marker = executable.to_string_lossy().to_string();
                let check = executable.clone();
                (marker, Box::new(move || process_running(&check)))
            };
        terminate_processes(&marker)?;
        for _ in 0..50 {
            if !is_running() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        if is_running() {
            return Err("Codex 在 5 秒内未退出，请手动退出后重试".into());
        }
    }
    launch_codex_process(port).await?;
    wait_for_codex(port).await
}

#[tauri::command]
async fn apply_theme(
    state: State<'_, RuntimeState>,
    mut theme: Value,
    safe_mode: bool,
) -> Result<ApplyResult, String> {
    if safe_mode {
        apply_safe_mode(&mut theme);
    }
    let source = external_agent_expression(&theme)?;
    let port = *state.port.lock().map_err(|_| "运行时状态锁定失败")?;
    let targets = query_targets(port).await?;
    if targets.is_empty() {
        return Err("Codex 尚未连接".into());
    }
    // Page.addScriptToEvaluateOnNewDocument registrations belong to the CDP session.
    // Keep the successful replacement sessions alive; dropping the old map removes old scripts.
    let mut sessions = state.sessions.lock().await;
    let mut updated_sessions = HashMap::new();
    let mut applied = Vec::new();
    for target in &targets {
        let socket = install_theme_on_target(target, &source).await?;
        updated_sessions.insert(target.id.clone(), spawn_session_drain(socket));
        applied.push(target.id.clone());
    }
    *sessions = updated_sessions;
    Ok(ApplyResult {
        applied: applied.len(),
        safe_mode,
        target_ids: applied,
    })
}

#[tauri::command]
async fn pause_skin(state: State<'_, RuntimeState>, paused: bool) -> Result<usize, String> {
    let port = *state.port.lock().map_err(|_| "运行时状态锁定失败")?;
    let expression = format!(
        "(()=>{{const api=window.__CODEX_DOLL_SKIN_MANAGER__;if(api&&api.pause)return api.pause({paused});for(const id of ['codex-doll-skin-runtime','codex-doll-theme-override']){{const el=document.getElementById(id);if(el)el.disabled={paused};}}return true;}})()"
    );
    evaluate_all(port, &expression, false)
        .await
        .map(|values| values.len())
}

#[tauri::command]
async fn preview_theme(
    state: State<'_, RuntimeState>,
    mut theme: Value,
    safe_mode: bool,
) -> Result<usize, String> {
    if safe_mode {
        apply_safe_mode(&mut theme);
    }
    let payload = serde_json::to_string(&theme).map_err(|error| error.to_string())?;
    let expression = format!(
        "(async()=>{{const api=window.__CODEX_DOLL_SKIN_MANAGER__;if(!api||!api.applyTheme)throw new Error('Skin Agent not installed');return api.applyTheme({payload});}})()"
    );
    let port = *state.port.lock().map_err(|_| "运行时状态锁定失败")?;
    evaluate_all(port, &expression, true)
        .await
        .map(|values| values.len())
}

#[tauri::command]
async fn migrate_legacy_themes(state: State<'_, RuntimeState>) -> Result<Value, String> {
    let port = *state.port.lock().map_err(|_| "运行时状态锁定失败")?;
    let expression = r#"new Promise((resolve)=>{const request=indexedDB.open('codex-doll-skin-library',1);request.onerror=()=>resolve({themes:[],selectedId:null,error:String(request.error||'open failed')});request.onsuccess=()=>{const db=request.result;try{const tx=db.transaction('themes','readonly');const all=tx.objectStore('themes').getAll();all.onerror=()=>resolve({themes:[],selectedId:localStorage.getItem('codexDollCurrentTheme'),error:String(all.error||'read failed')});all.onsuccess=()=>resolve({themes:all.result||[],selectedId:localStorage.getItem('codexDollCurrentTheme'),error:null});}catch(error){resolve({themes:[],selectedId:localStorage.getItem('codexDollCurrentTheme'),error:String(error.message||error)});}};})"#;
    let values = evaluate_all(port, expression, true).await?;
    values
        .first()
        .and_then(|value| value.get("result"))
        .and_then(|value| value.get("value"))
        .cloned()
        .ok_or_else(|| "无法读取旧主题库".into())
}

fn library_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("DOLL_SKIN_LIBRARY_PATH")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
    {
        return Ok(path);
    }
    app.path()
        .app_data_dir()
        .map(|path| path.join("library.json"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_library(app: AppHandle) -> Result<Value, String> {
    let path = library_path(&app)?;
    if !path.exists() {
        return Ok(json!({ "themes": [], "settings": {} }));
    }
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| format!("主题库文件损坏：{error}"))
}

#[tauri::command]
fn save_library(app: AppHandle, payload: Value) -> Result<(), String> {
    let path = library_path(&app)?;
    let parent = path.parent().ok_or("无法解析数据目录")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?;
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

#[tauri::command]
fn export_theme(filename: String, payload: String) -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .add_filter("Codex Skin", &["json"])
        .set_file_name(&filename)
        .save_file();
    let Some(path) = path else { return Ok(None) };
    fs::write(&path, payload).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let path = library_path(&app)?;
    let folder = path.parent().ok_or("无法解析数据目录")?;
    fs::create_dir_all(folder).map_err(|error| error.to_string())?;
    Command::new("/usr/bin/open")
        .arg(folder)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(RuntimeState::default())
        .invoke_handler(tauri::generate_handler![
            app_version,
            check_app_update,
            install_app_update,
            connection_status,
            launch_codex,
            restart_codex,
            apply_theme,
            preview_theme,
            pause_skin,
            migrate_legacy_themes,
            load_library,
            save_library,
            export_theme,
            open_data_folder,
            model_config::load_model_providers,
            model_config::save_model_providers,
            model_config::read_live_model_config,
            model_config::apply_model_provider
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "打开 aha-codex", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("aha-codex");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    if let Some(window) = tray.app_handle().get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            })
            .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let window_for_event = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_for_event.hide();
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running aha-codex");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_agent_is_separated_from_follow_up_expression() {
        let source = external_agent_expression(&json!({ "id": "test-theme" })).unwrap();
        assert!(source.contains(";\n(async()=>"));
    }

    #[test]
    fn runtime_exception_details_become_actionable_errors() {
        let error = checked_runtime_result(json!({
            "exceptionDetails": {
                "text": "Uncaught (in promise)",
                "lineNumber": 8,
                "columnNumber": 12,
                "exception": { "description": "Error: apply failed" }
            }
        }))
        .unwrap_err();
        assert!(error.contains("第 9 行，第 13 列"));
        assert!(error.contains("Error: apply failed"));
    }

    #[test]
    fn successful_runtime_result_is_preserved() {
        let value = json!({ "result": { "value": true } });
        assert_eq!(checked_runtime_result(value.clone()).unwrap(), value);
    }
}

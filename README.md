# aha-codex

独立的 Codex 皮肤创作与控制软件。aha-codex 拥有自己的窗口、Rust 运行时、主题库和菜单栏进程；Codex 只作为换肤目标，不再承载皮肤管理界面，也不再向 aha-codex 提供 Node.js 运行时。

## 下载安装

当前版本 **v0.4.0**（Apple Silicon macOS）。

**推荐：一行命令安装**（自动下载最新版、安装到“应用程序”并直接启动，无需右键绕过 Gatekeeper）：

```bash
curl -fsSL https://raw.githubusercontent.com/d100000/CodeX-Skin/main/install.sh | bash
```

也可以手动安装：从 [GitHub Releases](https://github.com/d100000/CodeX-Skin/releases/latest) 下载 `aha-codex_<版本号>_aarch64.dmg`，拖入“应用程序”，首次打开时右键 → “打开”（应用未经 Apple 公证，Gatekeeper 会提示一次）。

装好后无需再手动升级：应用启动时自动检查 GitHub Release，有新版本会提示一键更新并重启。

## 产品能力

- Studio 可以单独打开；Codex 未安装或未启动时仍能离线创作、保存、导入和导出主题。
- 从 Studio 启动 Codex 后，通过仅绑定本机 IPv4/IPv6 回环地址的 Chrome DevTools Protocol 实时应用皮肤。
- 不修改 `/Applications/ChatGPT.app`、ASAR 或 Codex 用户任务数据。
- 独立主题库保存在 `~/Library/Application Support/com.dollskin.studio/library.json`。
- 支持从旧 Codex 内嵌管理器的 IndexedDB 一次性迁移自定义主题。
- Codex 版本未经验证时自动启用安全兼容模式，关闭高风险 DOM 装饰。
- 主窗口关闭后驻留 macOS 菜单栏；从菜单栏可重新打开，选择“退出”才结束应用。
- 自动分析 `Image/` 中的 113 张图片，按人物风格与主色生成 113 套预测主题；构建时压缩为约 9 MB WebP 资产。
- 可通过 `npm run themes:sync-github` 自动读取 GitHub `Image/` 目录，下载新增图片并重建预测主题。
- 启动后检查 GitHub Release；发现新版本时提示，确认后自动下载、验证签名、安装并重启。

编辑器覆盖：

- 图片、视频、暗色背景、多图轮播、位置、全局/分区蒙层、亮度、饱和度和模糊；
- 亮色/暗色配色、WCAG 对比度、终端 ANSI 16 色；
- UI/代码字体、字号和最多两个嵌入字体；
- 侧栏宽度与透明度、圆角、阴影；
- 粒子、背景运动、输入反馈、列表和思考状态；
- Logo、标题前缀、右侧展示栏、装饰窗口框架；
- 原始 CSS Token 与自定义 CSS，外链 URL 和 `@import` 会在发射时清洗。

主题文件继续使用 `theme/theme.schema.json` 的 schema v3，兼容导入 v1/v2，导出格式为 `<id>.codexskin.json`。

## 使用

1. 安装并单独打开 **aha-codex**。
2. 在左侧选择主题，或从图片创建主题。
3. Codex 未运行时点击“启动 Codex”；如果 Codex 已普通启动，确认后由 Studio 重启并接管。
4. 打开“实时预览”后，编辑参数会同步到 Codex；“保存皮肤”才会写入 Studio 主题库。
5. 关闭 Studio 窗口后皮肤继续运行，需要管理时点击菜单栏图标。

普通方式启动的 Codex 没有 CDP 端口，Studio 无法直接接管。为了保持可逆且不修改 Codex 安装包，首次连接时必须由 Studio 启动或重新启动 Codex。

## 开发

环境要求：macOS 12+、Node.js 20+、Rust stable 和 Xcode Command Line Tools。

```bash
npm install
npm run dev
```

只启动浏览器预览：

```bash
npm run web:dev
```

运行测试与构建：

```bash
npm test
npm run build
npm run app:build
npm run release:check
```

从 GitHub 同步预设图片主题：

```bash
GITHUB_TOKEN="<你的 GitHub Token>" npm run themes:sync-github -- --ref main --prune
```

仓库为公开仓库时可以省略 `GITHUB_TOKEN`；私有仓库需要具有 `Contents: Read` 权限的 Token。同步器会保存远端文件清单，只下载新增或发生变化的图片。

macOS 产物位于：

```text
src-tauri/target/release/bundle/macos/aha-codex.app
src-tauri/target/release/bundle/dmg/aha-codex_0.4.0_aarch64.dmg
```

未配置 Apple Developer ID 时构建产物为本地/测试签名，首次在其他电脑打开会触发 Gatekeeper。正式分发前需要配置 Developer ID Application、notarization 和 stapling。

GitHub 自动更新的密钥和发布流程见 [UPDATE.md](./UPDATE.md)。

## 架构

```text
React Studio UI
  ├── 独立主题库与草稿状态
  ├── Codex 模拟预览
  └── Tauri invoke
        ├── Rust 进程控制器
        ├── 本地文件存储
        └── Rust CDP WebSocket 客户端
              └── Codex Skin Agent
                    ├── CSS Token / 背景
                    └── 可降级 DOM 装饰
```

- `src/`：独立 Studio React 界面、预览与桌面桥接。
- `src-tauri/`：macOS 应用、菜单栏、进程管理、独立存储和原生 CDP 客户端。
- `tools/build-skin-agent.mjs`：从现有纯函数核心生成自包含 Skin Agent。
- `tools/build-image-themes.py`：分类 `Image/` 的风格与主色，并生成压缩背景和预测主题清单。
- `installer/manager/00-core.js`：Studio 和注入端共用的主题归一化、校验和 CSS 编译核心。
- `theme/`：基础皮肤、manifest 和可移植主题 schema。

运行时仍遵循 loopback-only、no-ASAR、data-URL 资产和可逆退出四项安全约束。

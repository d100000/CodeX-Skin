<div align="center">

# aha-codex

### 你的 Codex，不该只有一种样子。

**一键换肤 · 视频背景 · 117 套主题 —— 让 AI 编程工具第一次拥有了审美。**

[![版本](https://img.shields.io/github/v/release/d100000/CodeX-Skin?label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC&color=e91e8c)](https://github.com/d100000/CodeX-Skin/releases/latest)
[![平台](https://img.shields.io/badge/macOS-Apple%20Silicon-black?logo=apple)](https://github.com/d100000/CodeX-Skin/releases/latest)
[![安全](https://img.shields.io/badge/%E9%9B%B6%E4%BF%AE%E6%94%B9-%E4%B8%8D%E7%A2%B0%20Codex%20%E5%AE%89%E8%A3%85%E5%8C%85-2ea44f)](#-安全是底线不是卖点)

<br/>

![aha-codex 实拍演示：视频皮肤实时应用](docs/media/demo.gif)

*↑ 实拍：挑一套视频皮肤，实时画布立刻会动 —— 你的 Codex 也一样*

</div>

---

你每天盯着 Codex 十个小时。它是你最常用的软件，却长着一张所有人都一样的脸。

**aha-codex 改变这件事。** 它是一款独立的 macOS 应用：打开它，挑一套主题，点一下"应用皮肤"——你的 Codex 瞬间变成你喜欢的样子。爱豆的照片、动态的视频、樱花色的梦、2007 年的经典蓝……你的工作区，终于开始像"你的"工作区。

## ⚡ 一行命令，30 秒拥有

```bash
curl -fsSL https://raw.githubusercontent.com/d100000/CodeX-Skin/main/install.sh | bash
```

不用拖 DMG，不用右键绕过 Gatekeeper，装完直接启动。之后的每次升级都由应用自动完成——**装一次，永远最新**。

> 手动派也可以从 [Releases](https://github.com/d100000/CodeX-Skin/releases/latest) 下载 DMG 安装包（首次打开需右键 → 打开）。

## ✨ 为什么是 aha-codex

### 🎬 会动的桌面，才叫桌面
别人还在换壁纸，你已经在用**视频背景**写代码。最大 30 MB、按完整时长无缝循环——把演唱会现场、雨夜霓虹、云海延时装进你的编辑器。

### 🖼️ 一张图片 = 一套主题
把任意图片拖进来，aha-codex 自动压缩、**自动提取配色**、自动生成一整套协调的界面主题。你只负责挑图，剩下的交给算法。

### 💯 117 套主题开箱即用
4 套精调基础主题 + 113 套按人物风格与主色智能生成的图片主题，从"暗夜科技·深海盐蓝"到"东方古韵·青瓷冷调"，总有一套是你的本命。

### 🔍 所见即所得
Studio 内置 1:1 的 Codex 模拟画布，改一个参数，预览立刻变；打开"实时预览"，真实的 Codex 窗口同步跟着变。**不用保存、不用重启、不用猜。**

<div align="center">

![aha-codex 主界面：左侧皮肤库，中间实时画布，右侧参数编辑器](docs/media/screenshot.png)

*左手皮肤库，右手编辑器，中间是你的 Codex —— 一屏搞定所有创作*

</div>

### 🎨 从"换个背景"到"重塑整个界面"
背景只是起点。亮色/暗色双配色、终端 ANSI 16 色、字体与嵌入字库、圆角与阴影、侧栏宽度、粒子特效、Logo 与标题、多图轮播、自定义 CSS……**每一个像素都听你的。**

### 🧳 主题即文件，审美可分享
每套主题都能导出为一个 `.codexskin.json` 文件。发给朋友、发到群里、发上网——对方双击导入，拥有和你一模一样的界面。

## 🛡️ 安全是底线，不是卖点

很多"美化工具"的原理是改安装包——升级就坏，出事难修。aha-codex 从第一行代码起就选择了另一条路：

| 承诺 | 实现 |
|---|---|
| **零修改** | 从不碰 `/Applications` 里的 Codex 安装包、ASAR 或你的任务数据 |
| **可逆** | 皮肤随时暂停、随时卸载，Codex 立刻回到原样 |
| **仅限本机** | 换肤通道只绑定本机回环地址，外部网络无法触碰 |
| **签名更新** | 每个更新包都经 minisign 签名校验，来源可验证 |
| **自动降级** | 遇到未验证的 Codex 版本，自动切换安全兼容模式，只应用稳定样式 |

## 🚀 上手只要三步

1. **打开 aha-codex** —— 独立应用，Codex 没装、没开都能先创作主题
2. **挑一套主题**，或从图片一键创建
3. **点"启动 Codex"** —— 皮肤实时应用，关掉 Studio 窗口皮肤也继续生效（应用驻留菜单栏）

> 普通方式启动的 Codex 没有换肤通道。为了保持可逆、不修改安装包，首次连接需要由 aha-codex 启动或重启 Codex——这是设计，不是限制。

## 🖥️ 开发者入口

<details>
<summary>展开：本地开发、测试与构建</summary>

环境要求：macOS 12+、Node.js 20+、Rust stable、Xcode Command Line Tools。

```bash
npm install
npm run dev          # Tauri Studio 开发模式
npm run web:dev      # 仅浏览器预览（127.0.0.1:5173）
npm test             # node --test
npm run app:build    # 构建 .app + .dmg
npm run release:check
```

从 GitHub 同步预设图片主题：

```bash
GITHUB_TOKEN="<你的 GitHub Token>" npm run themes:sync-github -- --ref main --prune
```

公开仓库可省略 `GITHUB_TOKEN`；私有仓库需要 `Contents: Read` 权限。同步器只下载新增或变化的图片，之后自动重建预测主题。

macOS 产物位于：

```text
src-tauri/target/release/bundle/macos/aha-codex.app
src-tauri/target/release/bundle/dmg/aha-codex_<版本号>_aarch64.dmg
```

未配置 Apple Developer ID 时为本地签名，其他电脑首次打开会触发 Gatekeeper（一键安装脚本已处理）。签名密钥与发布流程见 [UPDATE.md](./UPDATE.md)。

### 架构

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

- `src/`：独立 Studio React 界面、预览与桌面桥接
- `src-tauri/`：macOS 应用、菜单栏、进程管理、独立存储和原生 CDP 客户端
- `tools/build-skin-agent.mjs`：从纯函数核心生成自包含 Skin Agent
- `tools/build-image-themes.py`：分析 `Image/` 风格与主色，生成压缩背景和预测主题清单
- `installer/manager/00-core.js`：Studio 和注入端共用的主题归一化、校验与 CSS 编译核心
- `theme/`：基础皮肤、manifest 和可移植主题 schema（v3，兼容导入 v1/v2）

主题库保存在 `~/Library/Application Support/com.dollskin.studio/library.json`，支持从旧版内嵌管理器的 IndexedDB 一次性迁移。运行时始终遵循 loopback-only、no-ASAR、data-URL 资产、可逆退出四项安全约束。

</details>

---

<div align="center">

**工具决定效率，审美决定心情。**

两者你都值得拥有。

[⬇️ 立即安装](https://github.com/d100000/CodeX-Skin/releases/latest) · [🐛 反馈问题](https://github.com/d100000/CodeX-Skin/issues)

</div>

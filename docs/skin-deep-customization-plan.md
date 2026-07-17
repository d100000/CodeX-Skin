# Codex 皮肤 · 深度自定义方案（基于真机扫描）

版本：v1.0 ｜ 日期：2026-07-17 ｜ 前置文档：[skin-manager-prd.md](skin-manager-prd.md)、[skin-manager-redesign-plan.md](skin-manager-redesign-plan.md)

## 0. 调研方法与核心发现

通过 CDP 对正在运行的真实 Codex（26.707.91948）做了全量样式系统扫描，结论：

- 共 **1372 个 CSS 自定义属性**，分三层：`--vscode-*`（736 个，编辑器/终端层）、`--color-token-*` 语义层（约 207 个）、Tailwind 原子层（`--color-*` 调色板、`--tw-*`）。
- Codex 官方自己留了几个"主题旋钮"，我们可以直接搭车：
  - `--corner-radius-scale`（当前 1.25）——**一个变量控制全局圆角**，所有 `--radius-*` 都乘它
  - `--font-sans: var(--vscode-font-family, var(--font-sans-default))`、`--font-mono: var(--vscode-editor-font-family, ...)` ——字体栈有清晰的变量入口
  - `--codex-chat-font-size`、`--vscode-editor-font-size`（inline 在 html 上）——聊天/编辑器字号
  - `--spacing-token-sidebar: clamp(240px, 275px, min(520px, calc(100vw - 320px)))` ——侧栏宽度
  - `--startup-background`、`--startup-logo-shimmer-*` ——启动画面配色
  - `--shadow-sm..2xl`、`--blur-xs..2xl` ——阴影与毛玻璃强度整套 token
  - `--vscode-terminal-ansiBlack..White` ——终端 16 色 ANSI 调色板
- html 根节点有 `class="electron-light"` ——存在明暗双模式开关，可以做双套配色。
- 左上角品牌区在 `.app-shell-left-panel` 内，无独立 logo 类名；替换 logo 属于 DOM 级操作（C 级风险）。
- 滚动条已有 `::-webkit-scrollbar` 样式，可安全覆写。

## 1. 可定制维度总目录

风险分级：**A** = 纯 CSS 变量覆盖（最稳，Codex 更新几乎不破坏）；**B** = 依赖稳定类名的 CSS（现有 skin.css 同级风险）；**C** = 需 JS 改 DOM（MutationObserver 维持，版本更新易碎）；**D** = 不建议做。

### 1.1 背景系统（已有 → 增强）

| 项 | 现状 | 增强 | 级别 |
| --- | --- | --- | --- |
| 静态背景图 + 位置/遮罩/滤镜 | ✅ 已实现 | — | B |
| 多图轮播 / 按时段切换 | PRD P2 | `backgrounds[]` + interval/timeOfDay | B |
| **动态背景（视频/GIF/WebP 动图）** | 无 | `#root::before` 换成 `<video>` 层，data URL 内嵌 mp4/webm；须默认关闭+尊重 reduced-motion | C |
| 明暗双背景 | 无 | 跟随 `electron-light/dark` class 切换两张图 | B |

### 1.2 配色系统（3 色 → 完整主题）

| 项 | 说明 | 级别 |
| --- | --- | --- |
| 语义 token 全映射 | 现在只覆盖 accent/surface/text 派生的 7 个变量；扩展为可选的完整 `--color-token-*` 覆盖表（高级用户直接写 token 键值对，`tokens: {"--color-token-xxx": "#..."}`) | A |
| **明暗双套配色** | `colors` + `colorsDark`，监听 html class 切换应用 | A |
| 终端 ANSI 16 色 | `terminal: { black, red, ... }` → 覆盖 `--vscode-terminal-ansi*`；预置"樱花终端""Dracula""Nord"等方案 | A |
| Diff/代码高亮色 | `--diffs-*`、`--vscode-editor-*` 系列 | A |
| 图表色 | `--color-token-charts-*` | A |
| 自动取色升级 | 已有主色相取色 → 增加"从图片取 5 色候选，用户点选" | A |

### 1.3 字体排印（全新维度）

| 项 | 实现 | 级别 |
| --- | --- | --- |
| UI 字体 | 覆盖 `--font-sans`（预置：系统默认 / Inter / 霞鹜文楷 / LXGW 圆体等；自定义字体名输入） | A |
| 代码字体 | 覆盖 `--font-mono`（JetBrains Mono / Sarasa Mono SC / Menlo…） | A |
| 聊天字号 | `--codex-chat-font-size`（12–20px 滑杆） | A |
| 编辑器字号 | `--vscode-editor-font-size`（注意它是 inline style，需 `!important` 或 JS 同步） | A/C |
| 字重微调 | `--font-weight-*` | A |
| **自定义字体文件内嵌** | woff2 转 data URL + `@font-face` 注入；单字体 ≤2MB 限制（中文字体需子集化，工具链另议） | B |

### 1.4 形状与质感（全新维度）

| 项 | 实现 | 级别 |
| --- | --- | --- |
| **全局圆角风格** | 单滑杆映射 `--corner-radius-scale`（0 = 直角"工业风"，1.25 = 默认，2 = 全圆"可爱风"）——一行 CSS 撬动全 app | A |
| 阴影强度 | 预设三档（无阴影/默认/浮夸）覆盖 `--shadow-*` | A |
| 毛玻璃强度 | `--blur-*` 缩放 + 现有 backdrop-filter 参数化 | A/B |
| 描边浓度 | `--color-token-border*` 透明度系数 | A |

### 1.5 布局密度（全新维度）

| 项 | 实现 | 级别 |
| --- | --- | --- |
| 侧栏宽度 | 覆盖 `--spacing-token-sidebar`（220–400px 滑杆） | A |
| 工具栏高度 | `--height-toolbar`（紧凑 36 / 默认 46 / 宽松 56） | A |
| 内容最大宽度 | `--thread-content-max-width`（窄栏阅读 / 全宽） | A |
| 全局密度 | `--spacing`（.25rem 基数缩放，谨慎：牵一发动全身，只给 ±15%） | A（保守） |

### 1.6 品牌与识别（用户点名的 logo）

| 项 | 实现 | 级别 |
| --- | --- | --- |
| **左上角 logo 替换** | 无独立类名，需 JS 定位品牌节点后覆盖为用户图片（data URL）；MutationObserver 保活 | C |
| 隐藏 logo / 极简模式 | CSS 隐藏品牌区块 | B |
| 启动画面配色 | `--startup-background`、`--startup-logo-shimmer-*` 跟随主题色 | A |
| **D 按钮自定义** | 位置（四角/顶部）、图标（emoji/图片）、大小、自动隐藏（悬停显示） | B（自有元素，零风险） |
| 窗口标题前缀 | `document.title` 加装饰（如"🌸 "）；注意 Codex 会自己刷新 title，需要 hook | C |
| 分发注意 | 替换/隐藏 OpenAI 品牌仅限个人使用场景；产品化分发时默认关闭该项并加免责声明 | — |

### 1.7 组件级细节

| 项 | 实现 | 级别 |
| --- | --- | --- |
| 输入框（composer） | 圆角（`--composer-border-radius`）、聚焦光晕颜色、描边样式 | A/B |
| 滚动条 | 宽度/颜色/圆角，预设"隐形""细线""复古" | B |
| 选中文本色 | `::selection` + `--vscode-editor-selection*` | A/B |
| 光标（caret）颜色 | `caret-color` 全局 | B |
| 任务卡片 | 卡片透明度/描边/悬停效果（现有 skin.css 扩展参数化） | B |
| 侧栏活跃项样式 | `data-app-action-sidebar-thread-active`（已有选择器，参数化颜色） | B |

### 1.8 动效与氛围

| 项 | 实现 | 级别 |
| --- | --- | --- |
| 动效开关/倍率 | 全局 `transition-duration` 缩放；`prefers-reduced-motion` 恒尊重 | B |
| **氛围粒子层**（樱花飘落/雪/雨） | 独立 canvas 层，默认关，reduced-motion 下禁用，CPU 限帧 | C（自有元素，实为 B 风险） |
| 时段问候背景微调 | 早/午/夜三段自动微调遮罩亮度 | B |

### 1.9 明确不做（D 级）

- 修改 Codex 功能行为、注入第三方脚本/网络请求（破坏安全模型：注入包必须保持零外联）
- 按键音效（Electron 页面可实现，但干扰产品定位，且有权限争议）
- 伪造/篡改模型选择器、用量显示等功能性 UI

## 2. Schema v3 提案（向下兼容 v1/v2）

```jsonc
{
  "schemaVersion": 3,
  "id": "my-theme", "name": "…",
  "background": "data:… | none | null",
  "backgrounds": [{ "src": "data:…", "when": "light|dark|morning|night" }],   // 可选，覆盖 background
  "colors": { "accent": "#…", "surface": "#…", "text": "#…" },
  "colorsDark": { … },                                   // 可选：暗色模式套装
  "tokens": { "--color-token-…": "#…" },                 // 可选：高级逐 token 覆盖
  "terminal": { "black": "#…", …16 色 },                 // 可选
  "typography": {
    "sans": "LXGW WenKai, system-ui", "mono": "JetBrains Mono, monospace",
    "chatFontSize": 15, "editorFontSize": 13,
    "fontFaces": [{ "family": "…", "src": "data:font/woff2;base64,…" }]
  },
  "shape": { "radiusScale": 1.25, "shadow": "default|none|bold", "blurScale": 1 },
  "layout": { "x": 50, "y": 50, "veil": 50, "sidebarWidth": 275, "contentMaxWidth": null, "density": 1 },
  "filters": { "brightness": 100, "saturate": 100, "blur": 0 },
  "brand": { "logo": "data:… | hide | null", "startupTint": true, "titlePrefix": "🌸" },
  "effects": { "particles": "none|sakura|snow", "motionScale": 1, "scrollbar": "default|slim|hidden" },
  "trigger": { "position": "top-center|top-right|bottom-right", "icon": "D|🌸|data:…", "autoHide": false }
}
```

迁移规则：v1/v2 → v3 全部字段有默认值，`normalizeTheme` 继续单点收敛；导出时可选"精简导出"（只写非默认字段）。

## 3. 编辑器 UI 承载方式

现有右栏编辑器改为**分组 Tab**（保持面板尺寸不变）：

```
[背景] [配色] [字体] [布局] [品牌] [氛围]
```

- 背景：现有全部 + 明暗双图 + 轮播列表
- 配色：三色 + 暗色套装开关 + 终端色板（16 格点开取色）+ "高级 token 表"（折叠的 key-value 编辑器）
- 字体：两个字体选择器（预设下拉 + 自定义输入）+ 两个字号滑杆 + 字体文件导入
- 布局：圆角风格滑杆（带三档示意图标）、侧栏宽度、阴影三档、密度
- 品牌：logo 上传/隐藏、启动画面跟色开关、D 按钮设置
- 氛围：粒子选择、动效倍率、滚动条样式

迷你预览同步升级：侧栏宽度/圆角/字体在 mock 里实时体现（mock 的圆角/宽度绑定同一批变量即可）。

## 4. 实施路线

### Phase A「全 CSS 变量批」（收益最高、风险最低，建议先做）
1. schema v3 骨架 + normalize 迁移 + 导出精简
2. 圆角倍率、阴影、侧栏宽度、聊天字号、UI/代码字体栈（预设下拉）
3. 明暗双套配色（监听 html class）+ 启动画面跟色
4. 编辑器分组 Tab 改造 + 迷你预览绑定新变量
5. 终端 ANSI 色板 + 内置 2 个终端预设

验收：全部通过变量覆盖实现，`npm test` 扩展断言 schema v3 迁移与新 token 输出；真机截图归档。

### Phase B「组件与氛围批」
滚动条/选中色/光标色、composer 参数化、D 按钮自定义、动效倍率、密度（保守范围）、字体文件内嵌（woff2 ≤2MB）。

### Phase C「DOM 级批」（谨慎，逐项灰度）
logo 替换/隐藏（默认关）、窗口标题前缀、氛围粒子层、视频动态背景、多背景轮播/时段切换。
每项独立开关 + 失败自动降级（try/catch 后不影响其余皮肤）+ 版本门禁联动（Codex 版本变更时 C 级项先自动停用）。

## 5. 风险与对策

| 风险 | 对策 |
| --- | --- |
| Codex 改内部类名/变量名 | A 级项都走官方 token，破坏面最小；C 级项带独立开关和降级；`doctor` 增加"变量存活检查"（扫描关键 token 是否仍存在） |
| 注入包体积膨胀（字体/视频内嵌） | 字体强制 woff2 且提示子集化；视频限 5MB；导出时可选剥离大资产 |
| 全 token 覆盖把 UI 改坏 | tokens 高级表带"恢复默认"逐条开关；草稿模型天然兜底 |
| 品牌替换的合规问题 | 默认关闭、文档声明仅限个人使用、产品化分发时移除该功能 |

## 附录：本次真机扫描的关键变量清单

- 圆角：`--corner-radius-scale`（1.25）、`--radius-xs..3xl = base × scale`
- 字体：`--font-sans`、`--font-mono`、`--font-sans-default`、`--font-mono-default`、`--codex-chat-font-size`(16px 声明/14px 计算)、`--vscode-editor-font-size`(12px, html inline)、`--text-xs..base` 字号阶
- 布局：`--spacing-token-sidebar`(clamp 240–275)、`--height-toolbar`(46px)/`--height-toolbar-sm`(36px)、`--spacing`(.25rem)、`--composer-border-radius: var(--radius-3xl)`、`--thread-content-max-width`
- 阴影/模糊：`--shadow-sm..2xl`、`--shadow-hairline`、`--blur-xs..2xl`
- 启动画面：`--startup-background`、`--startup-logo-shimmer-base/peak`
- 终端：`--vscode-terminal-ansiBlack..ansiBrightWhite`（16 色）
- 语义色（已用）：`--color-token-side-bar-background`、`--color-token-main-surface-primary`、`--color-token-editor-background`、`--color-background-accent` 等
- 明暗：html `class="electron-light"`（存在 dark 对应态）
- 结构：`.app-shell-left-panel`、`.main-surface`、`.composer-surface-chrome`、`.app-shell-main-content-*`、`[data-app-action-sidebar-thread-active]`

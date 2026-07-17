# Codex 皮肤管理器 · 交互重设计与优化路径

配套文档：[skin-manager-prd.md](skin-manager-prd.md)（需求与优先级）

## 1. 新版面板交互设计

### 1.1 整体布局

面板从当前的单列 300px 小窗升级为 **左右双栏、720×520 左右的居中面板**（仍是注入的固定定位 div，不新开窗口）：

```
┌────────────────────────────────────────────────────────────┐
│  Codex 皮肤管理器            [皮肤开关 ●开] [导入] [✕关闭]  │
├──────────────────┬─────────────────────────────────────────┤
│  我的皮肤          │   ┌───────────────────────────────┐   │
│  ┌────────┐      │   │      迷你实时预览（16:10）        │   │
│  │缩略图 ✓ │      │   │  [侧栏][任务卡片 mock][输入框]    │   │
│  │樱花·默认 │      │   │  ← 当前编辑参数实时渲染          │   │
│  └────────┘      │   └───────────────────────────────┘   │
│  ┌────────┐      │   □ 显示构图安全区参考线                │   │
│  │缩略图   │      │                                       │
│  │晨光书房 │      │   背景图  [上传/拖拽更换]  1.2MB WebP   │   │
│  └────────┘      │   位置    （在预览图上拖拽 / 精调滑杆）   │   │
│  ┌────────┐      │   浅色遮罩 ────●────  62  ⚠对比度提示   │   │
│  │缩略图   │      │                                       │
│  │夜樱     │      │   配色    强调 ■  表面 ■  文字 ■        │   │
│  └────────┘      │                                       │
│  ＋ 新建皮肤       │        [保存]  [还原]  [导出] [删除]     │   │
└──────────────────┴─────────────────────────────────────────┘
```

关键交互决策：

1. **左栏 = 主题库**：竖向滚动的缩略图卡片。缩略图直接用主题背景图 + 三色色板条渲染；无背景的主题渲染纯色渐变。点击卡片 = 立即试穿（真实窗口生效）+ 右栏进入该主题编辑态。
2. **右栏 = 编辑器，顶部是迷你预览**：一块按 16:10 绘制的 Codex 窗口 mock（侧栏色块、四张任务卡片占位、输入框占位、示例正文两行），全部用当前编辑参数着色。这解决"面板挡住真实窗口、用户看不到全局效果"的问题。
3. **拖拽定位**：在迷你预览上按住拖动即改 `layout.x/y`，滑杆保留在下方做精调，二者双向同步。
4. **安全区参考线**：勾选后在迷你预览上叠加 `BACKGROUND_SPEC.md` 的分区半透明描边（右侧角色区、左侧导航安全区、输入框安全区），并配一句提示"人物请放在右侧高亮区内"。这是本项目独有的差异化能力——把构图规范产品化。
5. **草稿模型**：进入编辑即建立草稿（内存对象），所有改动实时应用到窗口但不落库；`保存` 写 IndexedDB，`还原` 回滚到进入编辑时的快照；关闭面板时有未保存草稿则自动还原并轻提示。
6. **示例主题**：内置 3 套完整主题（樱花·默认 / 一套暖色 / 一套低饱和夜色），背景图走与 hero 图相同的 data-URL 内嵌管线，让新用户第一次打开就能"点一下换一身"。

### 1.2 视觉风格

沿用现有樱花体系：`#76506f` 强调色、`#fff9fb` 表面、圆角 8-10px、`backdrop-filter: blur(18px)` 毛玻璃、`rgba(118,80,111,.2)` 描边。面板加入顶部拖动条可移动（`-webkit-app-region: no-drag` 维持）。所有动效在 `prefers-reduced-motion` 下关闭。

## 2. 技术方案

### 2.1 现状瓶颈

`theme-manager.mjs` 是一个返回巨型模板字符串的函数，所有 UI 用字符串内 DOM API 手写。300 行时还能维护，PRD 的功能量（约 1000+ 行 UI 代码）在模板字符串里会失控：无语法高亮校验、转义地狱、无法单测。

### 2.2 重构：源码化 + 构建期打包（不改变注入形态）

```
installer/
  manager-src/            ← 新增：真正的源码目录（普通 ESM + 模板 CSS）
    index.js              ← 入口 IIFE：状态机 + 装配
    store.js              ← IndexedDB / localStorage / schema v2 迁移
    ui/
      panel.js            ← 面板骨架、拖动、开关
      library.js          ← 主题卡片网格
      editor.js           ← 预览画布、拖拽定位、滑杆、取色器
      preview.js          ← 迷你 Codex mock 渲染 + 安全区参考线
    manager.css           ← 面板样式（构建期内联为字符串）
    presets/              ← 内置示例主题 JSON（背景图构建期转 data URL）
  build-manager.mjs       ← 构建脚本：esbuild --bundle --format=iife → 单字符串
  theme-manager.mjs       ← 保留同名导出 buildThemeManagerSource(css)，
                            内部改为读取构建产物 + 注入 baseCss
```

要点：

- **注入契约不变**：`buildThemeManagerSource(css)` 签名、`Page.addScriptToEvaluateOnNewDocument` 流程、四个注入元素 id、`codexDollSkinPaused` / `codexDollCurrentTheme` 键全部保留，`cli.mjs` / `cdp.mjs` / 现有测试不受影响。
- **构建仍零运行时依赖**：esbuild 仅作为 devDependency 在开发机上跑；`install-launcher` 复制的是构建产物（单文件），运行时依然只靠 Codex 自带 Node。若要绝对零构建依赖，备选方案是 `node build-manager.mjs` 用纯字符串拼接，但推荐 esbuild（体积小、可 minify、报错早）。
- **源码可单测**：store.js（schema 校验/迁移/取色）、preview.js（安全区几何换算）可在 node:test 里直接测，摆脱"用正则 grep 模板字符串"的测试方式。
- **迷你预览 mock 复用设计**：`src/`（Vite 预览应用）里已有 Codex 首页 mock 的布局认知，编辑器里的迷你预览按同一结构简化实现（纯 div 色块，无 React）。

### 2.3 数据层

- schema v2：新增 `filters`、`meta` 字段；`store.js` 打开库时对 v1 记录做一次性升级（补默认值），导出默认 v2。
- 内置主题以 `builtin: true` 标记，不入 IndexedDB（每次注入时从常量装载），"另存为副本"时才落库。
- 草稿不落库：编辑快照存内存，意外崩溃最多丢一次未保存编辑。

## 3. 优化路径（三阶段）

### Phase 1 · 核心体验重做（P0，先做）

范围 = PRD 所有 P0 项：

1. 搭建 `manager-src/` + 构建脚本，迁移现有功能（库、上传、滑杆、暂停、导入导出）到模块化源码，保持行为与元素 id 不变 —— *此步完成即可回归 `npm test` 与 `skin:status/pause/apply`*
2. 主题卡片缩略图网格 + 悬停操作 + 空状态引导（LIB-1/3/7）
3. 内置 3 套示例主题（LIB-2，需按 `BACKGROUND_SPEC.md` 生成两张新背景图）
4. 迷你实时预览 + 拖拽定位 + 安全区参考线 + 遮罩可视化（PRE-3、BG-1/2/3/4）
5. 三色取色器（CLR-1）+ 草稿保存/还原（PRE-2）
6. 导入确认预览（IO-2）、键盘可达性（A11Y-1/2）

**验收**：PRD 第 7 节 6 条全过；新增单测覆盖 store 迁移与安全区换算；在真实 Codex 26.707.72221 上运行时注入验证一遍并截图归档到 `generated/final/`。

### Phase 2 · 进阶编辑能力（P1）

1. 从背景图自动取色 + 配色预设（CLR-2/4）
2. 对比度实时检查与警告（CLR-3）
3. 亮度/饱和度/模糊滤镜（BG-6，schema v2 `filters` 正式启用）
4. 拖拽导入图片与主题文件（BG-5、IO-3）、导入冲突处理（IO-4）
5. 重命名、搜索、排序（LIB-4/5）、压缩体积提示（BG-7）

### Phase 3 · 生态与自动化（P2，按需）

1. 多背景轮播 / 定时切换（BG-8、RT-3）
2. 收藏置顶（LIB-6）、密集场景预览（PRE-4）
3. 远期：主题分享站 / 社区模板（对标输入法皮肤商城，需要另立项）

## 4. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 注入脚本体积膨胀（内置主题图 base64） | 内置图 WebP q85、≤400KB/张；esbuild minify；必要时内置主题降为 2 套 |
| Codex 改版导致 mock 预览失真 | 迷你预览只用抽象色块，不模仿具体控件；与 skin.css 一样只依赖稳定 class |
| 拖拽定位与 `-webkit-app-region` 冲突 | 面板与预览区全部显式 `no-drag`（现有做法延续） |
| 大量实时写样式引发卡顿 | rAF 节流写 style，IndexedDB 写入防抖 500ms |
| 重构回归破坏 CLI/测试 | Phase 1 第 1 步单独提交，先跑全量回归再叠加新功能 |

## 5. 调研来源

- 搜狗输入法皮肤编辑器：https://pinyin.sogou.com/help.php?list=5&q=3 、皮肤设计站 https://pinyin.sogou.com/skins/ac/
- 百度输入法皮肤商城：https://shurufa.baidu.com/skin
- Wallpaper Engine 功能与播放列表：https://www.wallpaperengine.io/en 、https://store.steampowered.com/news/app/431960/view/5278738040558267778
- VS Code 主题与实时预览：https://code.visualstudio.com/docs/configure/themes
- Telegram 云主题编辑器：https://themes.telegram.org/
- 深浅模式与对比度实践（WCAG 4.5:1、去饱和强调色等）：https://www.designstudiouiux.com/blog/dark-mode-ui-design-best-practices/

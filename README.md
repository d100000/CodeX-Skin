# Codex Doll Skin

An experimental, reversible skin system for the Codex desktop app. The current milestone provides the visual theme package, responsive preview, compatibility doctor, and opt-in enhancement payload. It does not modify the installed Codex application.

## Preview

```bash
npm install
npm run dev
```

## Compatibility Check

```bash
npm run doctor
```

Runtime injection is verified for Codex `26.707.72221`. Other versions stay in diagnostic mode until their compatibility is confirmed.

## Install the reversible launcher

```bash
npm run install-launcher
```

This creates `~/Applications/Codex Doll Skin.app`. It launches the signed Codex app with a localhost-only debugging endpoint and injects the theme at runtime. It never edits `/Applications/ChatGPT.app`.

The installer also creates a self-contained runtime at `~/.codex/codex-doll-skin` and uses the Node.js runtime bundled with Codex. The launcher does not depend on this source checkout or a separately installed Node.js.

Runtime controls:

```bash
npm run skin:status
npm run skin:pause
npm run skin:apply
```

The in-app `D` button opens the Codex Skin Manager without restarting Codex. It supports:

- a thumbnail card library with four built-in example themes (sakura, warm reading room, classic-blue 2007 retro IM, plain focus), plus search and one-click duplication;
- uploading PNG, JPEG, and WebP backgrounds with automatic compression and automatic palette extraction;
- a live mini preview of the Codex window with drag-to-position backgrounds;
- optional composition safe-zone guides derived from [BACKGROUND_SPEC.md](BACKGROUND_SPEC.md);
- a modal editor (背景 / 配色 / 字体 / 布局 / 氛围 / 品牌 tabs, with an always-visible live preview column) covering:
  - accent / surface / text color pickers plus brightness, saturation, and blur filters;
  - a global veil plus four regional veils (top / bottom / left sidebar / center content) with independent opacity;
  - video backgrounds (mp4/webm, muted loop, paused under reduced-motion), a separate dark-mode background, and multi-image slideshows;
  - an optional separate dark-mode palette and a themed startup splash;
  - the full terminal ANSI 16-color palette with 樱花 / Nord presets;
  - UI and code font stacks, chat and editor font sizes, and embeddable font files (woff2/ttf/otf packed into the theme);
  - the global corner-radius scale, shadow intensity, and sidebar width — all riding Codex's own CSS tokens;
  - scrollbar styles, sakura/snow particle layers, a motion kill-switch, and a customizable trigger button (position/icon/auto-hide);
  - best-effort logo replacement/hiding and a window-title prefix (DOM-level, personal use only);
  - an injected right-side display panel (title / character image / text card) with automatic content reflow — the "QQ friends column" building block;
  - WCAG contrast warnings, quick palette presets, and re-extractable palette candidates from the background image;
  - an advanced tab: raw token overrides (any of Codex's ~1300 CSS variables) and custom CSS (external URLs stripped, data: only);
  - drag-and-drop import of images and theme JSON files, with conflict resolution (overwrite or keep both);
- a draft model: edits apply live, `保存` persists, `还原` (or closing the panel) rolls back;
- saving edited built-in themes as copies, and deleting user themes;
- importing portable theme JSON with a confirmation preview, and exporting `<id>.codexskin.json`;
- pausing the skin while preserving the library;
- storing multiple themes in IndexedDB instead of the smaller localStorage image quota.

Theme files follow [theme/theme.schema.json](theme/theme.schema.json) (schema v3; v1/v2 files import transparently). A portable theme embeds its compressed background as a Data URL, or uses `"none"` for a plain color background. All v3 dimensions are optional and default to "follow Codex":

```json
{
  "schemaVersion": 3,
  "id": "my-sakura-theme",
  "name": "My Sakura Theme",
  "background": "data:image/jpeg;base64,...",
  "colors": { "accent": "#76506f", "surface": "#fff9fb", "text": "#3c2938" },
  "colorsDark": null,
  "terminal": null,
  "typography": { "sans": "", "mono": "", "chatFontSize": 0, "editorFontSize": 0 },
  "shape": { "radiusScale": null, "shadow": "default" },
  "layout": { "x": 50, "y": 50, "veil": 50, "sidebarWidth": 0 },
  "filters": { "brightness": 100, "saturate": 100, "blur": 0 },
  "brand": { "startupTint": false }
}
```

## Acknowledgements

The installation and CDP hardening work was informed by [HeiGe Codex Skin Studio](https://github.com/HeiGeAi/heige-codex-skin-studio), an MIT-licensed Codex theming project. This project keeps its own visual system and implementation while adopting the same no-ASAR, loopback-only security model.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A reversible skin/theme system for the Codex desktop app (macOS, installed at `/Applications/ChatGPT.app`). It never modifies the installed app — instead it launches Codex with a loopback-only Chrome DevTools Protocol (CDP) endpoint (`127.0.0.1:9227`) and injects CSS/JS at runtime. Injection is gated to the exact verified Codex version in `theme/manifest.json` (`minimumCodexVersion`).

## Commands

```bash
npm run dev              # Vite preview of the theme (mock Codex UI at 127.0.0.1)
npm test                 # node --test tests/*.test.mjs
node --test tests/cdp.test.mjs   # run a single test file
npm run doctor           # check installed Codex version compatibility
npm run install-launcher # build ~/Applications/Codex Doll Skin.app + runtime at ~/.codex/codex-doll-skin
npm run skin:status | skin:pause | skin:apply   # control a running skinned Codex over CDP
```

## Architecture

Two independent halves:

1. **Preview app** (`src/`, `index.html`, Vite + React): a mock of the Codex home screen used to design the theme visually. It is never shipped to Codex; it only mirrors the real app's DOM/class names so `theme/skin.css` can be checked.

2. **Runtime injection pipeline** (`installer/`):
   - `cli.mjs` — entry point for all npm scripts (`doctor`, `install-launcher`, `status`, `pause`, `apply`). `install-launcher` copies a self-contained file set to `~/.codex/codex-doll-skin` and writes a launcher .app whose shell script starts Codex with remote debugging and then runs `runtime.mjs` using the Node bundled inside Codex (`Contents/Resources/cua_node/bin/node`) — no dependency on this checkout or a system Node.
   - `runtime.mjs` — long-running daemon: waits for Codex pages, injects the skin into every main window, re-attaches to new windows every second, exits after 5 consecutive CDP failures (i.e., Codex quit).
   - `cdp.mjs` — minimal WebSocket CDP client plus injection helpers. `isMainCodexPage()` filters targets: only `app://` pages, excluding avatar-overlay windows — the pet/avatar overlay must never be skinned. Persistence uses `Page.addScriptToEvaluateOnNewDocument` + immediate `Runtime.evaluate`.
   - `theme-manager.mjs` — assembler: `buildThemeManagerSource(css)` (async) reads the `installer/manager/` fragments, inlines `manager.css` and `presets.json`, and returns a single self-contained IIFE string injected into Codex. `embedAssets()` lives here too: it replaces `asset://<name>` placeholders with base64 data URLs (used for both `skin.css` and preset backgrounds).
   - `manager/` — the in-app Skin Manager (the "D" button) source. Plain browser JS fragments concatenated into one IIFE scope, in order: `00-core.js` (pure functions: `normalizeTheme` v1→v2 migration, `themeCss`, `backgroundLayerValue`, `SAFE_ZONES` from BACKGROUND_SPEC — unit-testable via `new Function`), `01-store.js` (IndexedDB `codex-doll-skin-library`, localStorage keys, presets), `02-preview.js` (mini Codex mock with drag positioning + safe-zone overlay), `03-editor.js` (draft model: edits apply live, save persists, revert rolls back), `04-panel.js` (panel skeleton, card library, import/export, `boot()`). Fragments must stay framework-free with no import/export (a test enforces this). The mini preview and the real window share `backgroundLayerValue()` so preview === reality.
   - Presets: 4 built-in themes in `manager/presets.json` (backgrounds referenced as `asset://`, embedded at assembly), including `classic-blue-2007` which exercises customCss + sidePanel. Built-ins never enter IndexedDB; editing one saves a copy.
   - Security invariant: `tokens` and `customCss` are sanitized at the **emission point** (`rootExtraVars`/`themeCss`), not just at normalize — live draft edits bypass `normalizeTheme`, so sanitizing only there is insufficient. External `url()` and `@import` are stripped; only `data:` URLs survive.

3. **Theme package** (`theme/`):
   - `skin.css` — the runtime payload. Overrides Codex CSS custom properties (`--color-*` tokens) and targets stable Codex class names (`.app-shell-left-panel`, `.main-surface`, `.composer-surface-chrome`). Uses `asset://` URLs replaced at injection time. Tests assert these selectors and a `prefers-reduced-motion` block exist.
   - `manifest.json` — theme id, version, `minimumCodexVersion` (the only build injection is verified for; `doctor` refuses others).
   - `theme.schema.json` — portable theme JSON format (schemaVersion 1/2/3; background is a data URL, `"none"` for plain color, or null to inherit the base hero image). v2 added brightness/saturate/blur filters; v3 added colorsDark, terminal ANSI palette, typography (font stacks + sizes + embedded fontFaces), shape (radiusScale/shadow), layout.sidebarWidth, brand (startupTint/logo/titlePrefix), effects (scrollbar/particles/motion/slideshowMinutes), trigger (position/icon/autoHide), video backgrounds, backgroundDark, and a backgrounds[] slideshow — all optional, defaulting to "follow Codex" (null/0/""). CSS dimensions are emitted as variable overrides riding Codex's own tokens (`--corner-radius-scale`, `--font-sans`, `--spacing-token-sidebar`, `--vscode-terminal-ansi*`, `--startup-*`; dark palette targets `:root.electron-dark`); DOM-level dimensions (video element, particle canvas, logo swap, title prefix) live in `04-panel.js` as best-effort engines that degrade gracefully. See `docs/skin-deep-customization-plan.md` for the scanned token map.

Known injected element IDs shared across files (cli/cdp/theme-manager tests reference them): `codex-doll-skin-runtime` (base style), `codex-doll-theme-override`, `codex-doll-skin-menu` (trigger button), `codex-doll-skin-manager` (panel).

## Conventions

- Plain ESM `.mjs` with `node:` built-ins only — the installer/runtime must stay dependency-free because it runs on Codex's bundled Node.
- Tests use `node:test` and mostly assert invariants by reading source/config files (selector presence, schema shape, asset embedding) rather than mocking CDP.
- Security model: no ASAR modification, debugging endpoint bound to loopback only, assets embedded as data URLs so the injected page needs no file access.
- Background artwork must follow the composition zones and prompts in `BACKGROUND_SPEC.md` (character in right 27%, left 55% low-detail for readability, no text/UI/logos in images).
- UI strings in the injected manager and preview app are Simplified Chinese.
- **The skin-manager trigger button is a GLOBAL user setting** (`codexDollTriggerConfig` in localStorage, edited in the 氛围 tab): its icon/position/auto-hide must NEVER be changed by themes or presets — switching skins must not move or restyle the button, to keep user comprehension cost low. `theme.trigger` still exists in the schema for import compatibility but is ignored at apply time; new presets must not include a `trigger` field (a test enforces this).
- Image generation must go through `tools/image-gen.mjs` (the image-gen skill); credentials stay in gitignored `tools/image-api.local.json`.
- CDP hot-patches on a live Codex are transient: `applyExtras` rebuilds the chrome/side-panel/trigger DOM from the injected script on every theme apply or panel refresh, wiping inline patches. Any engine change must be verified by `npm run install-launcher` + a full Codex relaunch, not just a live patch.

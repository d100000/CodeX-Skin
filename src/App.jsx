import React, { useEffect, useMemo, useRef, useState } from "react";
import packageJson from "../package.json";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDot,
  CloudDownload,
  Columns3,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Image,
  Import,
  LayoutPanelTop,
  MonitorCog,
  MoreHorizontal,
  Palette,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { call, isDesktop } from "./bridge";
import ModelPanel from "./ModelPanel";
import { hydrateThemeAssets, loadBuiltinThemes } from "./presets";
import {
  ANSI_KEYS,
  TERMINAL_PRESETS,
  backgroundLayerValue,
  cloneTheme,
  contrastRatio,
  dataUrlKilobytes,
  exportableTheme,
  filterValue,
  isVideoBackground,
  makeThemeId,
  normalizeTheme,
  paletteFromPixels,
  themeEquals,
} from "./theme-core";

const DEFAULT_SETTINGS = {
  selectedId: "doll-sakura-default",
  livePreview: true,
  safeMode: true,
  showZones: false,
  paused: false,
  autoUpdate: true,
};

// connection_status 每 2 秒返回一个新对象；内容一致时必须复用旧引用，
// 否则整个 App 每 2 秒重渲染一次，视频主题下代价极高。
function statusEquals(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(b);
  if (keys.length !== Object.keys(a).length) return false;
  return keys.every((key) => {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => item === right[index]);
    }
    return left === right;
  });
}

const TABS = [
  ["background", "背景", Image],
  ["colors", "配色", Palette],
  ["typography", "字体", Type],
  ["layout", "布局", Columns3],
  ["effects", "动效", Sparkles],
  ["decor", "装饰", LayoutPanelTop],
  ["advanced", "高级", SlidersHorizontal],
];

const FONT_OPTIONS = [
  ["", "跟随 Codex"],
  ['Inter, "PingFang SC", system-ui, sans-serif', "Inter / 苹方"],
  ['"LXGW WenKai", "PingFang SC", sans-serif', "霞鹜文楷"],
  ['"Source Han Sans SC", "Noto Sans SC", "PingFang SC", sans-serif', "思源黑体"],
  ['"Songti SC", "STSong", serif', "宋体"],
];

const MONO_OPTIONS = [
  ["", "跟随 Codex"],
  ['"SF Mono", Menlo, monospace', "SF Mono"],
  ['"JetBrains Mono", ui-monospace, monospace', "JetBrains Mono"],
  ['"Fira Code", ui-monospace, monospace', "Fira Code"],
];

const EFFECT_OPTIONS = {
  scrollbar: [["default", "默认"], ["slim", "纤细"], ["hidden", "隐藏"]],
  particles: [["none", "关闭"], ["sakura", "樱花"], ["snow", "飘雪"], ["neon", "霓虹"], ["stardust", "星尘"]],
  bgMotion: [["none", "关闭"], ["breathe", "呼吸"], ["drift", "漂移"]],
  typingFx: [["none", "关闭"], ["sparkle", "火花"], ["petal", "花瓣"]],
  listFx: [["none", "关闭"], ["slide", "滑入"]],
  thinkingFx: [["none", "关闭"], ["subtle", "轻提示"], ["glow", "高亮"]],
};

function IconButton({ label, children, className = "", ...props }) {
  return <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="toggle-row">
      <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function RangeField({ label, value, min, max, step = 1, suffix = "", onChange }) {
  return (
    <label className="range-field">
      <span><strong>{label}</strong><output>{value}{suffix}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <span className="select-wrap">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </span>
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="color-field">
      <span>{label}</span>
      <i style={{ background: value }} aria-hidden="true"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /></i>
      <input value={text} maxLength={7} onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next);
      }} onBlur={() => setText(value)} />
    </label>
  );
}

function TokenEditor({ value, onChange }) {
  const [text, setText] = useState(() => JSON.stringify(value || {}, null, 2));
  const [error, setError] = useState("");
  useEffect(() => { setText(JSON.stringify(value || {}, null, 2)); setError(""); }, [value]);
  const commit = () => {
    try {
      const parsed = JSON.parse(text || "{}");
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("需要 JSON 对象");
      setError("");
      onChange(parsed);
    } catch (parseError) {
      setError(parseError.message || String(parseError));
    }
  };
  return <><textarea className="code-editor token-editor" value={text} spellCheck="false" onChange={(event) => setText(event.target.value)} onBlur={commit} /><div className={`editor-validation ${error ? "invalid" : ""}`}>{error || "离开输入框时校验并应用"}</div></>;
}

function TextField({ label, value, onChange, placeholder = "", maxLength = 120 }) {
  return (
    <label className="text-field">
      <span>{label}</span>
      <input value={value || ""} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Section({ title, description, children }) {
  return <section className="inspector-section"><header><strong>{title}</strong>{description && <small>{description}</small>}</header>{children}</section>;
}

function StatusBadge({ status, onClick }) {
  const map = {
    connected: ["connected", "已连接"],
    compatibility: ["warning", "兼容模式"],
    restartRequired: ["warning", "需要重启"],
    missing: ["danger", "未安装"],
    offline: ["offline", "离线编辑"],
    checking: ["offline", "检测中"],
  };
  const [kind, label] = map[status.state] || map.offline;
  return <button className={`status-badge ${kind}`} onClick={onClick}><CircleDot size={14} />{label}</button>;
}

function ThemeCard({ theme, selected, onSelect, onMore }) {
  const image = theme.preview || theme.background;
  const hasImage = image && image !== "none";
  const background = hasImage ? undefined : `linear-gradient(135deg, ${theme.colors.surface}, color-mix(in srgb, ${theme.colors.accent} 20%, ${theme.colors.surface}))`;
  return (
    <div className={`theme-card ${selected ? "selected" : ""}`}>
      <button className="theme-select" onClick={onSelect} aria-pressed={selected}>
        <span className="theme-thumb" style={{ background }}>
          {hasImage && <img src={image} alt="" loading="lazy" decoding="async" />}
          <span className="theme-swatches">
            {Object.values(theme.colors).map((color, index) => <i key={index} style={{ background: color }} />)}
          </span>
          {selected && <span className="selected-check"><Check size={13} /></span>}
        </span>
        <span className="theme-meta"><strong>{theme.name}</strong><small>{theme.predicted ? `${theme.category} · ${theme.paletteLabel}` : theme.builtin ? "内置主题" : "我的主题"}</small></span>
      </button>
      <IconButton label={`${theme.name} 操作`} className="theme-more" onClick={onMore}><MoreHorizontal size={16} /></IconButton>
    </div>
  );
}

// 与注入端 04-panel.js 的 applyVideo 保持同一套行为：data URL 转 blob URL（可 seek、不会被
// 媒体管线整串重解析而跳回开头），并按真实时长循环——容器时长缺失时 loop 会提前触发。
function VideoBackground({ src, style }) {
  const ref = useRef(null);
  const [objectUrl, setObjectUrl] = useState(null);

  // 解码必须放在 effect 里而不是 useMemo：useMemo 在 StrictMode 下会跑两遍，多出来的那个
  // Blob 没有任何清理时机，一段 30 MB 视频就永久泄漏一份；effect 的 cleanup 能保证
  // createObjectURL / revokeObjectURL 成对。顺带把上百 MB 的 atob 从渲染阶段挪走，不再挡首屏。
  useEffect(() => {
    if (!src) {
      setObjectUrl(null);
      return;
    }
    let url;
    try {
      const comma = src.indexOf(",");
      const mime = src.slice(5, comma).split(";")[0] || "video/mp4";
      const binary = atob(src.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    } catch { url = src; }
    setObjectUrl(url);
    return () => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      setObjectUrl(null);
    };
  }, [src]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const state = { duration: 0, probing: false };
    let probeTimer = 0;
    const rewind = () => { try { el.currentTime = 0; } catch {} el.play().catch(() => {}); };
    const endProbe = () => { state.probing = false; el.style.visibility = ""; window.clearTimeout(probeTimer); };
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) { state.duration = el.duration; return; }
      // duration 为 Infinity/NaN：seek 到极大值迫使浏览器读完索引，拿到真实时长后回到开头
      state.probing = true;
      el.style.visibility = "hidden";
      try { el.currentTime = 1e101; } catch { endProbe(); }
      probeTimer = window.setTimeout(() => { if (state.probing) { endProbe(); rewind(); } }, 3000);
    };
    const onDuration = () => {
      if (!Number.isFinite(el.duration) || el.duration <= 0) return;
      state.duration = el.duration;
      if (!state.probing) return;
      endProbe();
      rewind();
    };
    const onTime = () => {
      if (state.probing || el.seeking || !state.duration) return;
      if (el.currentTime >= state.duration - 0.06) rewind();
    };
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onDuration);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", rewind);
    return () => {
      window.clearTimeout(probeTimer);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onDuration);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", rewind);
    };
  }, [objectUrl]);

  if (!objectUrl) return null;
  return <video ref={ref} className="preview-video" src={objectUrl} style={style} muted loop autoPlay playsInline preload="auto" />;
}

function Preview({ theme, showZones, onPosition }) {
  const dragRef = useRef(null);
  const layer = useMemo(() => {
    if (!theme) return "none";
    const computed = backgroundLayerValue(theme);
    if (computed) return computed;
    if (theme.preview) return `linear-gradient(90deg,rgba(255,249,250,.55),rgba(255,249,250,.1)),url(${JSON.stringify(theme.preview)}) ${theme.layout.x}% ${theme.layout.y}% / cover no-repeat`;
    return `linear-gradient(135deg,${theme.colors.surface},color-mix(in srgb,${theme.colors.accent} 18%,${theme.colors.surface}))`;
  }, [theme]);

  const pointerDown = (event) => {
    if (!theme.background || theme.background === "none" || isVideoBackground(theme.background)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, startX: theme.layout.x, startY: theme.layout.y };
  };
  const pointerMove = (event) => {
    if (!dragRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, dragRef.current.startX + (event.clientX - dragRef.current.x) / rect.width * 100));
    const y = Math.max(0, Math.min(100, dragRef.current.startY + (event.clientY - dragRef.current.y) / rect.height * 100));
    onPosition(Math.round(x), Math.round(y));
  };
  const pointerUp = (event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (!theme) return <div className="preview-loading">正在装载主题引擎…</div>;
  return (
    <div
      className={`codex-preview ${theme.effects.motion === "off" ? "motion-off" : ""}`}
      style={{
        "--theme-accent": theme.colors.accent,
        "--theme-surface": theme.colors.surface,
        "--theme-text": theme.colors.text,
        "--theme-radius": theme.shape.radiusScale ?? 1.25,
        "--theme-sidebar": `${theme.layout.sidebarWidth || 252}px`,
      }}
    >
      <div
        className={`preview-background ${theme.effects.bgMotion !== "none" ? theme.effects.bgMotion : ""}`}
        style={{ background: layer, filter: filterValue(theme.filters) || undefined }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      />
      {isVideoBackground(theme.background) && <VideoBackground src={theme.background} style={{ objectPosition: `${theme.layout.x}% ${theme.layout.y}%`, filter: filterValue(theme.filters) || undefined }} />}
      <aside className="preview-sidebar">
        <div className="preview-brand"><span>D</span><strong>Codex</strong></div>
        <nav><b>＋</b><strong>新建任务</strong><span>⌘ N</span></nav>
        <small>项目</small>
        {["aha-codex", "主题适配测试", "发布独立应用"].map((item, index) => <p className={index === 0 ? "active" : ""} key={item}><i />{item}</p>)}
        <footer><span>AC</span><div><strong>aha-codex</strong><small>本地工作区</small></div></footer>
      </aside>
      <main className="preview-workspace">
        <header><div><strong>aha-codex</strong><small>独立皮肤工作流</small></div><span>•••</span></header>
        <section className="preview-conversation">
          <div className="preview-user">把皮肤管理器做成独立应用，并实时应用到 Codex。</div>
          <div className="preview-answer"><span>D</span><div><strong>正在应用主题</strong><p>主题引擎已连接。背景、配色和布局变化会同步出现在当前 Codex 窗口中。</p><code>connection: active</code></div></div>
        </section>
        <div className="preview-composer"><p>描述一个任务…</p><footer><span>＋</span><button>发送</button></footer></div>
      </main>
      {showZones && <div className="safe-zones" aria-hidden="true"><i className="zone-nav">导航区</i><i className="zone-character">角色区</i><i className="zone-composer">输入区</i></div>}
    </div>
  );
}

function Inspector({ tab, setTab, theme, update, uploadBackground, uploadDarkBackground, uploadSlides, uploadFont, uploadLogo, uploadPanelImage, onReset }) {
  if (!theme) return <aside className="inspector" />;
  const patch = (path, value) => update(path, value);
  const ratio = contrastRatio(theme.colors.text, theme.colors.surface);
  return (
    <aside className="inspector">
      <div className="inspector-tabs" role="tablist">
        {TABS.map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} title={label}><Icon size={16} /><span>{label}</span></button>)}
      </div>
      <div className="inspector-scroll">
        {tab === "background" && <>
          <Section title="背景素材" description="支持 PNG、JPEG、WebP 和视频（≤ 30 MB，按完整时长循环）">
            <div className="upload-row">
              <button className="secondary-button" onClick={uploadBackground}><Upload size={15} />更换背景</button>
              <button className="secondary-button icon-only" onClick={() => patch("background", "none")} title="移除背景"><Trash2 size={15} /></button>
            </div>
            <p className="asset-info">{theme.background === "none" ? "当前使用纯色背景" : theme.background ? `${isVideoBackground(theme.background) ? "视频" : "图片"} · 约 ${dataUrlKilobytes(theme.background)} KB` : "使用内置主题背景"}</p>
            <div className="upload-row secondary-upload-row"><button className="secondary-button" onClick={uploadDarkBackground}><Image size={14} />暗色背景</button><button className="secondary-button" onClick={uploadSlides}><Plus size={14} />轮播图片</button></div>
            {(theme.backgroundDark || theme.backgrounds.length > 0) && <p className="asset-info">暗色背景 {theme.backgroundDark ? "已设置" : "跟随亮色"} · 轮播 {theme.backgrounds.length} 张</p>}
          </Section>
          <Section title="构图位置" description="也可以直接拖动中间预览">
            <RangeField label="水平位置" value={theme.layout.x} min={0} max={100} suffix="%" onChange={(value) => patch("layout.x", value)} />
            <RangeField label="垂直位置" value={theme.layout.y} min={0} max={100} suffix="%" onChange={(value) => patch("layout.y", value)} />
            <RangeField label="全局蒙层" value={theme.layout.veil} min={0} max={100} suffix="%" onChange={(value) => patch("layout.veil", value)} />
          </Section>
          <Section title="图像调整">
            <RangeField label="亮度" value={theme.filters.brightness} min={20} max={160} suffix="%" onChange={(value) => patch("filters.brightness", value)} />
            <RangeField label="饱和度" value={theme.filters.saturate} min={0} max={180} suffix="%" onChange={(value) => patch("filters.saturate", value)} />
            <RangeField label="模糊" value={theme.filters.blur} min={0} max={20} suffix=" px" onChange={(value) => patch("filters.blur", value)} />
          </Section>
        </>}

        {tab === "colors" && <>
          <Section title="亮色配色" description={`正文对比度 ${ratio.toFixed(1)}:1`}>
            <ColorField label="强调色" value={theme.colors.accent} onChange={(value) => patch("colors.accent", value)} />
            <ColorField label="表面色" value={theme.colors.surface} onChange={(value) => patch("colors.surface", value)} />
            <ColorField label="正文色" value={theme.colors.text} onChange={(value) => patch("colors.text", value)} />
            <div className={`contrast-note ${ratio >= 4.5 ? "pass" : "fail"}`}>{ratio >= 4.5 ? <Check size={14} /> : <CircleAlert size={14} />}{ratio >= 4.5 ? "符合 WCAG AA" : "对比度不足，建议调整正文色"}</div>
          </Section>
          <Section title="暗色配色">
            <Toggle label="启用独立暗色方案" checked={Boolean(theme.colorsDark)} onChange={(checked) => patch("colorsDark", checked ? { accent: "#c9a2c4", surface: "#2a2129", text: "#f3e8ef" } : null)} />
            {theme.colorsDark && <>
              <ColorField label="暗色强调" value={theme.colorsDark.accent} onChange={(value) => patch("colorsDark.accent", value)} />
              <ColorField label="暗色表面" value={theme.colorsDark.surface} onChange={(value) => patch("colorsDark.surface", value)} />
              <ColorField label="暗色正文" value={theme.colorsDark.text} onChange={(value) => patch("colorsDark.text", value)} />
            </>}
          </Section>
          <Section title="终端 ANSI 色板">
            <div className="preset-row">
              <button onClick={() => patch("terminal", cloneTheme(TERMINAL_PRESETS.sakura))}>樱花</button>
              <button onClick={() => patch("terminal", cloneTheme(TERMINAL_PRESETS.nord))}>Nord</button>
              <button onClick={() => patch("terminal", null)}>跟随 Codex</button>
            </div>
            {theme.terminal && <div className="ansi-grid">{ANSI_KEYS.map((key) => <label key={key} title={key}><input type="color" value={theme.terminal[key]} onChange={(event) => patch(`terminal.${key}`, event.target.value)} /><span>{key.replace("bright", "+")}</span></label>)}</div>}
          </Section>
        </>}

        {tab === "typography" && <>
          <Section title="界面字体">
            <SelectField label="UI 字体" value={theme.typography.sans} options={FONT_OPTIONS} onChange={(value) => patch("typography.sans", value)} />
            <SelectField label="代码字体" value={theme.typography.mono} options={MONO_OPTIONS} onChange={(value) => patch("typography.mono", value)} />
          </Section>
          <Section title="字号">
            <RangeField label="对话字号" value={theme.typography.chatFontSize} min={0} max={22} suffix={theme.typography.chatFontSize ? " px" : " 默认"} onChange={(value) => patch("typography.chatFontSize", value)} />
            <RangeField label="编辑器字号" value={theme.typography.editorFontSize} min={0} max={18} suffix={theme.typography.editorFontSize ? " px" : " 默认"} onChange={(value) => patch("typography.editorFontSize", value)} />
          </Section>
          <Section title="嵌入字体" description="主题包最多保存 2 个字体文件，单个不超过 2 MB">
            <button className="secondary-button full" onClick={uploadFont}><Upload size={15} />添加字体文件</button>
            {theme.typography.fontFaces.length > 0 && <div className="embedded-list">{theme.typography.fontFaces.map((face, index) => <span key={`${face.family}-${index}`}><code>{face.family}</code><button onClick={() => patch("typography.fontFaces", theme.typography.fontFaces.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除 ${face.family}`}><X size={13} /></button></span>)}</div>}
          </Section>
        </>}

        {tab === "layout" && <>
          <Section title="工作区尺寸">
            <RangeField label="侧栏宽度" value={theme.layout.sidebarWidth} min={0} max={420} suffix={theme.layout.sidebarWidth ? " px" : " 默认"} onChange={(value) => patch("layout.sidebarWidth", value)} />
            <RangeField label="侧栏不透明度" value={theme.layout.sidebarOpacity} min={0} max={95} suffix={theme.layout.sidebarOpacity ? "%" : " 默认"} onChange={(value) => patch("layout.sidebarOpacity", value)} />
            <RangeField label="圆角倍率" value={theme.shape.radiusScale ?? 1.25} min={0} max={2.5} step={0.05} suffix="×" onChange={(value) => patch("shape.radiusScale", value)} />
            <SelectField label="阴影强度" value={theme.shape.shadow} options={[["default", "默认"], ["none", "无阴影"], ["bold", "增强"]]} onChange={(value) => patch("shape.shadow", value)} />
          </Section>
          <Section title="分区蒙层" description="针对文字密集区域单独增强可读性">
            <RangeField label="顶部" value={theme.layout.veils.top} min={0} max={100} suffix="%" onChange={(value) => patch("layout.veils.top", value)} />
            <RangeField label="底部" value={theme.layout.veils.bottom} min={0} max={100} suffix="%" onChange={(value) => patch("layout.veils.bottom", value)} />
            <RangeField label="左侧导航" value={theme.layout.veils.left} min={0} max={100} suffix="%" onChange={(value) => patch("layout.veils.left", value)} />
            <RangeField label="正文内容" value={theme.layout.veils.content} min={0} max={100} suffix="%" onChange={(value) => patch("layout.veils.content", value)} />
          </Section>
        </>}

        {tab === "effects" && <>
          <Section title="环境动效">
            <SelectField label="背景运动" value={theme.effects.bgMotion} options={EFFECT_OPTIONS.bgMotion} onChange={(value) => patch("effects.bgMotion", value)} />
            <SelectField label="氛围粒子" value={theme.effects.particles} options={EFFECT_OPTIONS.particles} onChange={(value) => patch("effects.particles", value)} />
            <SelectField label="滚动条" value={theme.effects.scrollbar} options={EFFECT_OPTIONS.scrollbar} onChange={(value) => patch("effects.scrollbar", value)} />
            <Toggle label="关闭全部动效" checked={theme.effects.motion === "off"} onChange={(checked) => patch("effects.motion", checked ? "off" : "default")} />
          </Section>
          <Section title="交互反馈">
            <SelectField label="输入反馈" value={theme.effects.typingFx} options={EFFECT_OPTIONS.typingFx} onChange={(value) => patch("effects.typingFx", value)} />
            <SelectField label="列表进入" value={theme.effects.listFx} options={EFFECT_OPTIONS.listFx} onChange={(value) => patch("effects.listFx", value)} />
            <SelectField label="思考状态" value={theme.effects.thinkingFx} options={EFFECT_OPTIONS.thinkingFx} onChange={(value) => patch("effects.thinkingFx", value)} />
            <RangeField label="轮播间隔" value={theme.effects.slideshowMinutes} min={0} max={120} suffix={theme.effects.slideshowMinutes ? " 分钟" : " 关闭"} onChange={(value) => patch("effects.slideshowMinutes", value)} />
          </Section>
        </>}

        {tab === "decor" && <>
          <Section title="品牌显示">
            <Toggle label="启动页着色" checked={theme.brand.startupTint} onChange={(checked) => patch("brand.startupTint", checked)} />
            <TextField label="标题前缀" value={theme.brand.titlePrefix} maxLength={12} placeholder="例如：Doll · " onChange={(value) => patch("brand.titlePrefix", value)} />
            <div className="upload-row"><button className="secondary-button" onClick={uploadLogo}><Upload size={15} />上传 Logo</button><button className="secondary-button" onClick={() => patch("brand.logo", theme.brand.logo === "hide" ? null : "hide")}>{theme.brand.logo === "hide" ? <Eye size={15} /> : <EyeOff size={15} />}{theme.brand.logo === "hide" ? "显示原 Logo" : "隐藏 Logo"}</button></div>
          </Section>
          <Section title="右侧展示栏">
            <Toggle label="启用右侧展示栏" checked={theme.sidePanel.enabled} onChange={(checked) => patch("sidePanel.enabled", checked)} />
            {theme.sidePanel.enabled && <>
              <RangeField label="面板宽度" value={theme.sidePanel.width} min={200} max={320} suffix=" px" onChange={(value) => patch("sidePanel.width", value)} />
              <TextField label="标题" value={theme.sidePanel.title} onChange={(value) => patch("sidePanel.title", value)} />
              <TextField label="人物名称" value={theme.sidePanel.subtitle} placeholder="名称 | LV 07" onChange={(value) => patch("sidePanel.subtitle", value)} />
              <TextField label="说明文字" value={theme.sidePanel.card} maxLength={300} onChange={(value) => patch("sidePanel.card", value)} />
              <button className="secondary-button full" onClick={uploadPanelImage}><Upload size={15} />上传人物图片</button>
            </>}
          </Section>
          <Section title="装饰窗口框架">
            <Toggle label="启用装饰框架" checked={theme.chrome.enabled} onChange={(checked) => patch("chrome.enabled", checked)} />
            {theme.chrome.enabled && <><TextField label="窗口标题" value={theme.chrome.title} onChange={(value) => patch("chrome.title", value)} /><Toggle label="显示底部状态栏" checked={theme.chrome.statusBar} onChange={(checked) => patch("chrome.statusBar", checked)} /></>}
          </Section>
        </>}

        {tab === "advanced" && <>
          <Section title="Token 覆盖" description="最多使用 100 个以 -- 开头的 CSS 自定义属性">
            <TokenEditor value={theme.tokens} onChange={(value) => patch("tokens", value)} />
          </Section>
          <Section title="自定义 CSS" description="外部 URL 和 @import 会在应用时自动移除">
            <textarea className="code-editor" value={theme.customCss || ""} spellCheck="false" placeholder="#root { ... }" onChange={(event) => patch("customCss", event.target.value)} />
          </Section>
          <Section title="主题信息">
            <TextField label="主题名称" value={theme.name} onChange={(value) => patch("name", value)} />
            <div className="readonly-field"><span>主题 ID</span><code>{theme.id}</code></div>
            <button className="secondary-button full" onClick={onReset}><RotateCcw size={15} />重置当前页参数</button>
          </Section>
        </>}
      </div>
    </aside>
  );
}

function App() {
  const [builtins, setBuiltins] = useState([]);
  const [customThemes, setCustomThemes] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState(null);
  const [snapshotTheme, setSnapshotTheme] = useState(null);
  const [status, setStatus] = useState({ state: "checking", connected: false, targetIds: [], message: "正在检测 Codex" });
  const [tab, setTab] = useState("background");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [menuThemeId, setMenuThemeId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState("skin"); // skin = 焕肤工作区 / model = Codex 大模型供应商切换
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [pendingTheme, setPendingTheme] = useState(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateState, setUpdateState] = useState({ checking: false, currentVersion: "-", available: false, version: null, notes: null, error: null });
  const importRef = useRef(null);
  const backgroundRef = useRef(null);
  const darkBackgroundRef = useRef(null);
  const slidesRef = useRef(null);
  const fontRef = useRef(null);
  const logoRef = useRef(null);
  const panelImageRef = useRef(null);
  const lastTargetKey = useRef("");
  const liveTimer = useRef(0);
  const toastTimer = useRef(0);

  const themes = useMemo(() => [...builtins, ...customThemes], [builtins, customThemes]);
  const categories = useMemo(() => ["all", "基础主题", ...new Set(builtins.filter((theme) => theme.predicted).map((theme) => theme.category))], [builtins]);
  const selectedTheme = themes.find((theme) => theme.id === settings.selectedId) || draft;
  // 视频主题下 themeEquals 也不便宜，别让每次无关渲染都重算一遍。
  const dirty = useMemo(() => Boolean(draft && snapshotTheme && !themeEquals(draft, snapshotTheme)), [draft, snapshotTheme]);
  const safeMode = !status.verified || settings.safeMode;

  const notify = (message, kind = "success") => {
    setToast({ message, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const persist = async (nextThemes = customThemes, nextSettings = settings) => {
    await call("save_library", { payload: { themes: nextThemes.map(exportableTheme), settings: nextSettings } });
  };

  const checkForUpdate = async (manual = false) => {
    setUpdateState((current) => ({ ...current, checking: true, error: null }));
    try {
      const result = await call("check_app_update");
      setUpdateState({ ...result, checking: false, error: null });
      if (result.available) setUpdateOpen(true);
      else if (manual) notify(`aha-codex ${result.currentVersion} 已是最新版本`);
      return result;
    } catch (error) {
      const message = error.message || String(error);
      setUpdateState((current) => ({ ...current, checking: false, error: message }));
      if (manual) notify(message, "error");
      return null;
    }
  };

  const installUpdate = async () => {
    setUpdateInstalling(true);
    try {
      await call("install_app_update");
    } catch (error) {
      setUpdateInstalling(false);
      notify(error.message || String(error), "error");
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([loadBuiltinThemes(), call("load_library"), call("connection_status")])
      .then(async ([builtinList, library, connection]) => {
        if (!active) return;
        const stored = Array.isArray(library.themes) ? library.themes.map(normalizeTheme) : [];
        const nextSettings = { ...DEFAULT_SETTINGS, ...(library.settings || {}) };
        const all = [...builtinList, ...stored];
        const selected = all.find((theme) => theme.id === nextSettings.selectedId) || all[0];
        const selectedDraft = await hydrateThemeAssets(selected);
        if (!active) return;
        setBuiltins(builtinList);
        setCustomThemes(stored);
        setSettings({ ...nextSettings, selectedId: selected.id });
        setDraft(cloneTheme(selectedDraft));
        setSnapshotTheme(cloneTheme(selectedDraft));
        setStatus(connection);
        setReady(true);
      })
      .catch((error) => notify(error.message || String(error), "error"));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    call("app_version").then((currentVersion) => {
      setUpdateState((current) => ({ ...current, currentVersion }));
    }).catch(() => {});
    if (settings.autoUpdate) checkForUpdate(false);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const poll = async () => {
      // 每 2 秒换一个新 status 对象就是每 2 秒重渲染整个 App。内容没变时保持原引用，
      // 否则视频主题下光是轮询就会把主线程占满，界面看起来像"点了没反应"。
      try {
        const next = await call("connection_status");
        setStatus((current) => statusEquals(current, next) ? current : next);
      } catch {}
    };
    const timer = window.setInterval(poll, 2000);
    return () => window.clearInterval(timer);
  }, [ready]);

  const applyFull = async (theme = draft, silent = false, force = false) => {
    if (!theme || (!status.connected && !force)) {
      if (!silent) notify("请先启动并连接 Codex", "error");
      return false;
    }
    setApplying(true);
    try {
      const result = await call("apply_theme", { theme: exportableTheme(normalizeTheme(theme)), safeMode });
      if (!silent) notify(`皮肤已应用到 ${result.applied} 个 Codex 窗口`);
      return true;
    } catch (error) {
      notify(error.message || String(error), "error");
      return false;
    } finally {
      setApplying(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (!status.connected) {
      lastTargetKey.current = "";
      return;
    }
    if (!draft) return;
    const key = [...(status.targetIds || [])].sort().join(",");
    const managedKey = [...(status.managedTargetIds || [])].sort().join(",");
    if (key && (key !== lastTargetKey.current || managedKey !== key)) {
      lastTargetKey.current = key;
      applyFull(draft, true);
    }
  }, [ready, status.connected, status.targetIds?.join(","), status.managedTargetIds?.join(",")]);

  useEffect(() => {
    if (!ready || !settings.livePreview || !status.connected || !draft || !dirty) return;
    window.clearTimeout(liveTimer.current);
    // 视频主题每次推送要过一遍几十 MB 的 base64，110ms 太密，会把播放打断
    const delay = isVideoBackground(draft.background) ? 400 : 110;
    liveTimer.current = window.setTimeout(async () => {
      try { await call("preview_theme", { theme: exportableTheme(normalizeTheme(draft)), safeMode }); } catch {}
    }, delay);
    return () => window.clearTimeout(liveTimer.current);
  }, [draft, ready, settings.livePreview, status.connected, safeMode]);

  const update = (path, value) => {
    setDraft((current) => {
      const next = cloneTheme(current);
      const parts = path.split(".");
      let target = next;
      for (let index = 0; index < parts.length - 1; index += 1) {
        if (!target[parts[index]] || typeof target[parts[index]] !== "object") target[parts[index]] = {};
        target = target[parts[index]];
      }
      target[parts.at(-1)] = value;
      return next;
    });
  };

  const applySelectedTheme = async (theme, themesToPersist = customThemes) => {
    setApplying(true);
    try {
      const hydrated = await hydrateThemeAssets(theme);
      const nextSettings = { ...settings, selectedId: theme.id };
      setSettings(nextSettings);
      setDraft(cloneTheme(hydrated));
      setSnapshotTheme(cloneTheme(hydrated));
      setMenuThemeId(null);
      await persist(themesToPersist, nextSettings);
      if (status.connected && settings.livePreview) await applyFull(hydrated, true);
    } catch (error) {
      notify(`主题背景加载失败：${error.message || error}`, "error");
    } finally {
      setApplying(false);
    }
  };

  const selectTheme = (theme) => {
    if (!theme || theme.id === settings.selectedId) return;
    if (dirty) {
      setPendingTheme(theme);
      return;
    }
    applySelectedTheme(theme);
  };

  const saveTheme = async () => {
    if (!draft) return { ok: false };
    setSaving(true);
    try {
      let clean = normalizeTheme(draft);
      let nextThemes;
      if (selectedTheme?.builtin || !customThemes.some((theme) => theme.id === clean.id)) {
        clean = { ...clean, id: makeThemeId(clean.name), name: selectedTheme?.builtin ? `${clean.name} 副本` : clean.name, createdAt: new Date().toISOString() };
        nextThemes = [clean, ...customThemes];
      } else {
        nextThemes = customThemes.map((theme) => theme.id === clean.id ? clean : theme);
      }
      const nextSettings = { ...settings, selectedId: clean.id };
      setCustomThemes(nextThemes);
      setSettings(nextSettings);
      setDraft(cloneTheme(clean));
      setSnapshotTheme(cloneTheme(clean));
      await persist(nextThemes, nextSettings);
      if (status.connected) await applyFull(clean, true);
      notify("皮肤已保存");
      return { ok: true, themes: nextThemes };
    } catch (error) {
      notify(error.message || String(error), "error");
      return { ok: false };
    } finally {
      setSaving(false);
    }
  };

  const revert = async () => {
    if (!snapshotTheme) return;
    const restored = cloneTheme(snapshotTheme);
    setDraft(restored);
    if (status.connected) await applyFull(restored, true);
    notify("已还原未保存修改");
  };

  const duplicateTheme = async (theme) => {
    const hydrated = await hydrateThemeAssets(theme);
    const copy = { ...normalizeTheme(hydrated), id: makeThemeId(theme.name), name: `${theme.name} 副本`, createdAt: new Date().toISOString() };
    const next = [copy, ...customThemes];
    setCustomThemes(next);
    await persist(next, settings);
    const nextSettings = { ...settings, selectedId: copy.id };
    setSettings(nextSettings);
    setDraft(cloneTheme(copy));
    setSnapshotTheme(cloneTheme(copy));
    setMenuThemeId(null);
    await persist(next, nextSettings);
    if (status.connected && settings.livePreview) await applyFull(copy, true);
    notify("已创建主题副本");
  };

  const deleteTheme = async (theme) => {
    if (theme.builtin) return notify("内置主题不能删除，可以先复制后编辑", "error");
    if (!window.confirm(`确定删除“${theme.name}”？`)) return;
    const next = customThemes.filter((item) => item.id !== theme.id);
    const fallback = builtins[0];
    const nextSettings = { ...settings, selectedId: fallback.id };
    setCustomThemes(next);
    setSettings(nextSettings);
    setDraft(cloneTheme(fallback));
    setSnapshotTheme(cloneTheme(fallback));
    await persist(next, nextSettings);
    notify("主题已删除");
  };

  const exportTheme = async (theme = draft) => {
    const clean = exportableTheme(normalizeTheme(theme));
    const result = await call("export_theme", { filename: `${clean.id}.codexskin.json`, payload: JSON.stringify(clean, null, 2) });
    if (result) notify("主题已导出");
  };

  const importTheme = async (file) => {
    try {
      const raw = JSON.parse(await file.text());
      if (![1, 2, 3].includes(raw.schemaVersion)) throw new Error("只支持 schemaVersion 1、2、3");
      let theme = normalizeTheme(raw);
      if (!theme.id) throw new Error("主题缺少合法 ID");
      if (themes.some((item) => item.id === theme.id)) theme = { ...theme, id: makeThemeId(theme.name), name: `${theme.name} 导入` };
      const next = [theme, ...customThemes];
      const nextSettings = { ...settings, selectedId: theme.id };
      setCustomThemes(next);
      setSettings(nextSettings);
      setDraft(cloneTheme(theme));
      setSnapshotTheme(cloneTheme(theme));
      await persist(next, nextSettings);
      notify("主题已导入");
    } catch (error) {
      notify(`导入失败：${error.message || error}`, "error");
    }
  };

  const readImage = (file, { compress = true } = {}) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      if (!compress) return resolve({ dataUrl: reader.result, palette: null });
      const image = new window.Image();
      image.onerror = () => reject(new Error("无法读取图片"));
      image.onload = () => {
        const scale = Math.min(1, 1920 / image.width, 1280 / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/webp", .86);
        const sample = document.createElement("canvas");
        sample.width = 64;
        sample.height = 64;
        const sampleContext = sample.getContext("2d");
        sampleContext.drawImage(image, 0, 0, 64, 64);
        const palette = paletteFromPixels(sampleContext.getImageData(0, 0, 64, 64).data);
        resolve({ dataUrl, palette });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  const backgroundPicked = async (file) => {
    if (!file) return;
    try {
      if (file.type.startsWith("video/")) {
        if (file.size > 30 * 1024 * 1024) throw new Error("视频不能超过 30 MB");
        const { dataUrl } = await readImage(file, { compress: false });
        update("background", dataUrl);
      } else {
        const { dataUrl, palette } = await readImage(file);
        setDraft((current) => ({ ...cloneTheme(current), background: dataUrl, colors: palette || current.colors, name: current.builtin ? file.name.replace(/\.[^.]+$/, "") : current.name }));
      }
      notify("背景已载入并自动提取配色");
    } catch (error) { notify(error.message || String(error), "error"); }
  };

  const logoPicked = async (file) => {
    if (!file) return;
    const { dataUrl } = await readImage(file);
    update("brand.logo", dataUrl);
  };

  const panelImagePicked = async (file) => {
    if (!file) return;
    const { dataUrl } = await readImage(file);
    update("sidePanel.image", dataUrl);
  };

  const darkBackgroundPicked = async (file) => {
    if (!file) return;
    try {
      const { dataUrl } = await readImage(file);
      update("backgroundDark", dataUrl);
      notify("暗色背景已载入");
    } catch (error) { notify(error.message || String(error), "error"); }
  };

  const slidesPicked = async (files) => {
    const list = [...(files || [])].slice(0, 4);
    if (!list.length) return;
    try {
      const images = await Promise.all(list.map((file) => readImage(file).then((result) => result.dataUrl)));
      update("backgrounds", images);
      notify(`已添加 ${images.length} 张轮播图片`);
    } catch (error) { notify(error.message || String(error), "error"); }
  };

  const fontPicked = async (file) => {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("字体文件不能超过 2 MB");
      const { dataUrl } = await readImage(file, { compress: false });
      const family = file.name.replace(/\.[^.]+$/, "").replace(/[<>]/g, "").slice(0, 60);
      update("typography.fontFaces", [...(draft.typography?.fontFaces || []), { family, src: dataUrl }].slice(-2));
      notify("字体已嵌入当前主题");
    } catch (error) { notify(error.message || String(error), "error"); }
  };

  const launch = async () => {
    try {
      if (status.state === "restartRequired") return setConfirmRestart(true);
      setApplying(true);
      const next = await call("launch_codex");
      setStatus(next);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await applyFull(draft, true, true);
      notify("Codex 已启动并应用当前皮肤");
    } catch (error) {
      if (String(error).includes("RESTART_REQUIRED")) setConfirmRestart(true);
      else notify(error.message || String(error), "error");
    } finally { setApplying(false); }
  };

  const restart = async () => {
    setConfirmRestart(false);
    setApplying(true);
    try {
      const next = await call("restart_codex");
      setStatus(next);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await applyFull(draft, true, true);
      notify("Codex 已重新启动并由 Studio 接管");
    } catch (error) { notify(error.message || String(error), "error"); }
    finally { setApplying(false); }
  };

  const togglePause = async () => {
    const paused = !settings.paused;
    try {
      if (status.connected) await call("pause_skin", { paused });
      const next = { ...settings, paused };
      setSettings(next);
      await persist(customThemes, next);
      notify(paused ? "皮肤已暂停" : "皮肤已恢复");
    } catch (error) { notify(error.message || String(error), "error"); }
  };

  const migrateLegacy = async () => {
    try {
      const legacy = await call("migrate_legacy_themes");
      if (legacy.error) throw new Error(legacy.error);
      const incoming = (legacy.themes || []).map(normalizeTheme);
      if (!incoming.length) return notify("旧 Codex 中没有可迁移的自定义主题", "error");
      const ids = new Set(customThemes.map((theme) => theme.id));
      const unique = incoming.map((theme) => ids.has(theme.id) ? { ...theme, id: makeThemeId(theme.name) } : theme);
      const next = [...unique, ...customThemes];
      setCustomThemes(next);
      await persist(next, settings);
      notify(`已迁移 ${unique.length} 套旧主题`);
    } catch (error) { notify(error.message || String(error), "error"); }
  };

  const setSetting = async (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    await persist(customThemes, next);
  };

  const filtered = themes.filter((theme) => {
    const categoryMatches = categoryFilter === "all"
      || (categoryFilter === "基础主题" ? theme.builtin && !theme.predicted : theme.category === categoryFilter);
    const haystack = [theme.name, theme.id, theme.category, theme.paletteLabel, ...(theme.tags || [])].join(" ").toLowerCase();
    return categoryMatches && (!query || haystack.includes(query.toLowerCase()));
  });

  const displayedVersion = updateState.currentVersion === "-" ? packageJson.version : updateState.currentVersion;

  return (
    <div className="studio-app">
      <header className="studio-topbar">
        <div className="app-brand"><span><WandSparkles size={19} /></span><div><strong>aha-codex <em className={updateState.available ? "app-version has-update" : "app-version"}>v{displayedVersion}</em></strong><small>独立皮肤创作与控制</small></div></div>
        <nav className="view-switch" aria-label="功能切换">
          <button className={view === "skin" ? "active" : ""} onClick={() => setView("skin")}><Palette size={15} />焕肤</button>
          <button className={view === "model" ? "active" : ""} onClick={() => setView("model")}><BrainCircuit size={15} />模型</button>
        </nav>
        <div className="connection-summary"><StatusBadge status={status} onClick={() => setSettingsOpen(true)} /><span>{status.message}</span></div>
        <div className="top-actions">
          <Toggle checked={settings.livePreview} onChange={(value) => setSetting("livePreview", value)} label="实时预览" />
          <IconButton label={settings.paused ? "恢复皮肤" : "暂停皮肤"} onClick={togglePause} disabled={!status.connected}>{settings.paused ? <Play size={17} /> : <Pause size={17} />}</IconButton>
          <button className="secondary-button compact" onClick={() => importRef.current?.click()}><Import size={16} />导入</button>
          {updateState.available && <IconButton label={`发现新版本 ${updateState.version}`} className="update-ready" onClick={() => setUpdateOpen(true)}><CloudDownload size={17} /></IconButton>}
          <IconButton label="设置" onClick={() => setSettingsOpen(true)}><Settings size={17} /></IconButton>
          <button className="primary-button" onClick={status.connected ? () => applyFull() : launch} disabled={applying || !ready}>{applying ? <RefreshCw className="spin" size={16} /> : status.connected ? <Sparkles size={16} /> : <Play size={16} />}{status.connected ? "应用皮肤" : "启动 Codex"}</button>
        </div>
      </header>

      {view === "model" && <ModelPanel status={status} notify={notify} restartCodex={restart} />}

      <main className="studio-layout" hidden={view !== "skin"}>
        <aside className="library">
          <div className="panel-heading"><div><strong>皮肤库</strong><small>{filtered.length === themes.length ? `${themes.length} 套主题` : `${filtered.length} / ${themes.length}`}</small></div><IconButton label="新建图片皮肤" onClick={() => backgroundRef.current?.click()}><Plus size={17} /></IconButton></div>
          <label className="search-box"><Search size={15} /><input type="search" placeholder="搜索皮肤" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button onClick={() => setQuery("")} aria-label="清除搜索"><X size={14} /></button>}</label>
          <label className="category-filter"><SlidersHorizontal size={14} /><select aria-label="风格分类" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>{categories.map((category) => <option value={category} key={category}>{category === "all" ? "全部风格" : category}</option>)}</select><ChevronDown size={13} aria-hidden="true" /></label>
          <div className="theme-list">
            {!ready && <div className="list-loading"><RefreshCw className="spin" size={17} />正在装载主题库</div>}
            {ready && filtered.map((theme) => <ThemeCard key={theme.id} theme={theme} selected={theme.id === settings.selectedId} onSelect={() => selectTheme(theme)} onMore={() => setMenuThemeId(menuThemeId === theme.id ? null : theme.id)} />)}
            {ready && !filtered.length && <div className="empty-state"><Search size={19} /><strong>没有匹配的主题</strong><span>换个关键词试试</span></div>}
          </div>
          <button className="new-theme-button" onClick={() => backgroundRef.current?.click()}><Image size={16} /><span><strong>从图片创建</strong><small>自动压缩并提取配色</small></span></button>
          {menuThemeId && (() => {
            const theme = themes.find((item) => item.id === menuThemeId);
            return <div className="theme-menu"><button onClick={() => duplicateTheme(theme)}><Copy size={15} />创建副本</button><button onClick={() => exportTheme(theme)}><Download size={15} />导出主题</button>{!theme.builtin && <button className="danger" onClick={() => deleteTheme(theme)}><Trash2 size={15} />删除主题</button>}</div>;
          })()}
        </aside>

        <section className="canvas-area">
          <div className="canvas-toolbar">
            <div><MonitorCog size={16} /><strong>Codex 实时画布</strong><span>16:10</span></div>
            <div>
              <button className={settings.showZones ? "active" : ""} onClick={() => setSetting("showZones", !settings.showZones)}><LayoutPanelTop size={15} />安全区</button>
              <button onClick={() => applyFull()} disabled={!status.connected || applying}><RefreshCw size={15} />同步</button>
            </div>
          </div>
          <div className="preview-stage"><Preview theme={draft} showZones={settings.showZones} onPosition={(x, y) => setDraft((current) => ({ ...cloneTheme(current), layout: { ...current.layout, x, y } }))} /></div>
          <div className="canvas-footer">
            <div className={`draft-state ${dirty ? "dirty" : ""}`}>{dirty ? <CircleAlert size={15} /> : <Check size={15} />}<span>{dirty ? "有未保存的修改" : "所有修改已保存"}</span></div>
            <div><button className="secondary-button" onClick={revert} disabled={!dirty}><RotateCcw size={15} />还原</button><button className="primary-button" onClick={saveTheme} disabled={!draft || saving}>{saving ? <RefreshCw className="spin" size={15} /> : <Save size={15} />}{selectedTheme?.builtin ? "另存为副本" : "保存皮肤"}</button></div>
          </div>
        </section>

        <Inspector
          tab={tab}
          setTab={setTab}
          theme={draft}
          update={update}
          uploadBackground={() => backgroundRef.current?.click()}
          uploadDarkBackground={() => darkBackgroundRef.current?.click()}
          uploadSlides={() => slidesRef.current?.click()}
          uploadFont={() => fontRef.current?.click()}
          uploadLogo={() => logoRef.current?.click()}
          uploadPanelImage={() => panelImageRef.current?.click()}
          onReset={() => setDraft(normalizeTheme({ id: draft.id, name: draft.name }))}
        />
      </main>

      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => { importTheme(event.target.files?.[0]); event.target.value = ""; }} />
      <input ref={backgroundRef} type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" hidden onChange={(event) => { backgroundPicked(event.target.files?.[0]); event.target.value = ""; }} />
      <input ref={darkBackgroundRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { darkBackgroundPicked(event.target.files?.[0]); event.target.value = ""; }} />
      <input ref={slidesRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => { slidesPicked(event.target.files); event.target.value = ""; }} />
      <input ref={fontRef} type="file" accept=".woff2,.ttf,.otf,font/woff2,font/ttf,font/otf" hidden onChange={(event) => { fontPicked(event.target.files?.[0]); event.target.value = ""; }} />
      <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { logoPicked(event.target.files?.[0]); event.target.value = ""; }} />
      <input ref={panelImageRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { panelImagePicked(event.target.files?.[0]); event.target.value = ""; }} />

      {settingsOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-label="Studio 设置"><header><div><strong>Studio 设置</strong><small>连接、兼容性与独立数据</small></div><IconButton label="关闭" onClick={() => setSettingsOpen(false)}><X size={18} /></IconButton></header><div className="settings-body">
        <Section title="Codex 连接"><div className="diagnostic-grid"><span>安装状态</span><strong>{status.codexInstalled ? "已安装" : "未安装"}</strong><span>当前版本</span><code>{status.codexVersion || "-"}</code><span>已验证版本</span><code>{status.testedVersion || "-"}</code><span>控制端口</span><code>localhost:{status.port || 9227}</code><span>窗口数量</span><strong>{status.targetCount || 0}</strong></div><button className="primary-button full" onClick={status.connected ? () => applyFull() : launch}>{status.connected ? <RefreshCw size={15} /> : <Play size={15} />}{status.connected ? "重新同步当前皮肤" : "启动 Codex 并连接"}</button></Section>
        <Section title="兼容与安全"><Toggle label="安全兼容模式" description="关闭 DOM 装饰，只应用稳定 CSS Token" checked={safeMode} onChange={(value) => setSetting("safeMode", value)} /><p className="settings-note">Codex 版本未经验证时会强制启用安全模式。调试端口仅绑定到本机回环地址。</p></Section>
        <Section title="独立数据"><button className="secondary-button full" onClick={migrateLegacy} disabled={!status.connected}><CloudDownload size={15} />从旧 Codex 面板迁移主题</button><button className="secondary-button full" onClick={() => call("open_data_folder").catch((error) => notify(String(error), "error"))}><FolderOpen size={15} />打开 aha-codex 数据目录</button><p className="settings-note">主题库由 aha-codex 独立保存，不再依赖 Codex 的 IndexedDB。</p></Section>
        <Section title="版本与更新"><div className="diagnostic-grid"><span>当前版本</span><strong>v{updateState.currentVersion}</strong><span>更新状态</span><strong>{updateState.checking ? "正在检查" : updateState.available ? `发现 v${updateState.version}` : updateState.error ? "检查失败" : "已是最新"}</strong></div><Toggle label="自动检查更新" description="启动后检查 GitHub Release，有新版本时提示" checked={settings.autoUpdate} onChange={(value) => setSetting("autoUpdate", value)} />{updateState.error && <p className="settings-note update-error">{updateState.error}</p>}<button className="secondary-button full" disabled={updateState.checking} onClick={() => checkForUpdate(true)}>{updateState.checking ? <RefreshCw className="spin" size={15} /> : <CloudDownload size={15} />}{updateState.checking ? "正在检查 GitHub" : updateState.available ? "查看并安装更新" : "检查更新"}</button></Section>
        <Section title="运行环境"><div className="diagnostic-grid"><span>应用模式</span><strong>{isDesktop ? "Tauri 独立应用" : "浏览器预览"}</strong><span>运行时</span><strong>{isDesktop ? "内置 Rust" : "Web Mock"}</strong><span>修改 Codex</span><strong>从不</strong></div></Section>
      </div></section></div>}

      {confirmRestart && <div className="modal-backdrop"><section className="confirm-modal" role="alertdialog" aria-modal="true"><span className="modal-icon"><RefreshCw size={22} /></span><strong>需要重新启动 Codex</strong><p>当前 Codex 是普通方式启动的，没有实时换肤连接。Studio 将正常退出 Codex，再以本机调试模式重新打开；任务数据不会被修改。</p><div><button className="secondary-button" onClick={() => setConfirmRestart(false)}>取消</button><button className="primary-button" onClick={restart}>重新启动并接管</button></div></section></div>}

      {pendingTheme && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPendingTheme(null)}><section className="confirm-modal theme-switch-modal" role="alertdialog" aria-modal="true" aria-label="切换皮肤"><span className="modal-icon"><CircleAlert size={22} /></span><strong>当前皮肤尚未保存</strong><p>{isVideoBackground(draft?.background) ? "视频背景仍在草稿中。切换后将丢失这段视频及其他未保存修改。" : "切换到“" + pendingTheme.name + "”会丢失当前未保存的修改。"}</p><div><button className="secondary-button" disabled={saving} onClick={() => setPendingTheme(null)}>取消</button><button className="secondary-button" disabled={saving} onClick={async () => { const theme = pendingTheme; const result = await saveTheme(); if (result.ok) { setPendingTheme(null); await applySelectedTheme(theme, result.themes); } }}>{saving ? "正在保存" : "保存并切换"}</button><button className="primary-button" disabled={applying} onClick={() => { const theme = pendingTheme; setPendingTheme(null); applySelectedTheme(theme); }}>放弃并切换</button></div></section></div>}

      {updateOpen && updateState.available && <div className="modal-backdrop"><section className="confirm-modal update-modal" role="alertdialog" aria-modal="true" aria-label="aha-codex 更新"><span className="modal-icon update"><CloudDownload size={22} /></span><strong>发现 aha-codex v{updateState.version}</strong><p>当前版本 v{updateState.currentVersion}。更新包将从 GitHub Release 下载、校验签名并自动安装，完成后 aha-codex 会重新启动。</p>{updateState.notes && <div className="update-notes">{updateState.notes}</div>}<div><button className="secondary-button" disabled={updateInstalling} onClick={() => setUpdateOpen(false)}>稍后</button><button className="primary-button" disabled={updateInstalling} onClick={installUpdate}>{updateInstalling ? <RefreshCw className="spin" size={15} /> : <CloudDownload size={15} />}{updateInstalling ? "下载并安装中" : "立即更新并重启"}</button></div></section></div>}

      {toast && <div className={`toast ${toast.kind}`}>{toast.kind === "error" ? <CircleAlert size={16} /> : <Check size={16} />}{toast.message}</div>}
    </div>
  );
}

export default App;

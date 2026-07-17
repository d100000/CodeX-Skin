// 编辑器：草稿模型 + 分组 Tab（背景/配色/字体/布局）。
// 所有改动实时应用到窗口（不落库），保存才写 IndexedDB，还原回滚快照。
const SANS_FONT_OPTIONS = [
  { label: "跟随 Codex 默认", value: "" },
  { label: "Inter", value: 'Inter, "PingFang SC", system-ui, sans-serif' },
  { label: "霞鹜文楷", value: '"LXGW WenKai", "PingFang SC", sans-serif' },
  { label: "苹方", value: '"PingFang SC", system-ui, sans-serif' },
  { label: "思源黑体", value: '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", sans-serif' },
  { label: "自定义…", value: "__custom__" }
];
const MONO_FONT_OPTIONS = [
  { label: "跟随 Codex 默认", value: "" },
  { label: "JetBrains Mono", value: '"JetBrains Mono", ui-monospace, monospace' },
  { label: "SF Mono", value: '"SF Mono", ui-monospace, Menlo, monospace' },
  { label: "Fira Code", value: '"Fira Code", ui-monospace, monospace' },
  { label: "更纱等宽 SC", value: '"Sarasa Mono SC", ui-monospace, monospace' },
  { label: "自定义…", value: "__custom__" }
];

function createEditor(handlers) {
  const el = document.createElement("div");
  el.className = "cds-editor";

  let draft = null;
  let snapshot = null;
  let snapshotBuiltin = false;
  let previewImage = null;
  const syncFns = [];

  // background 为 null 时窗口显示基础皮肤的樱花背景；迷你预览用 preview 图回退保持一致。
  const previewTheme = () => (draft && !draft.background && previewImage ? { ...draft, background: previewImage } : draft);

  // 同步应用：rAF 在窗口不渲染时（最小化/后台）不触发，会吞掉编辑操作。
  const applyLive = () => {
    if (!draft) return;
    handlers.applyLive(draft);
    preview.update(previewTheme());
    syncControls();
  };

  const preview = createMiniPreview({
    canDrag: () => Boolean(draft && draft.background && draft.background !== "none"),
    getPosition: () => ({ x: draft.layout.x, y: draft.layout.y }),
    onPosition: (x, y) => { draft.layout.x = x; draft.layout.y = y; applyLive(); }
  });

  const zonesRow = document.createElement("label");
  zonesRow.className = "cds-zones-toggle";
  const zonesCheck = document.createElement("input");
  zonesCheck.type = "checkbox";
  zonesCheck.addEventListener("change", () => preview.setZonesVisible(zonesCheck.checked));
  zonesRow.append(zonesCheck, document.createTextNode(" 显示构图安全区参考线"));

  const nameRow = document.createElement("div");
  nameRow.className = "cds-field";
  const nameLabel = document.createElement("span");
  nameLabel.textContent = "名称";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "cds-name-input";
  nameInput.maxLength = 80;
  nameInput.addEventListener("input", () => { if (draft) { draft.name = nameInput.value; syncActions(); } });
  nameRow.append(nameLabel, nameInput);

  // ---------- 通用控件 ----------
  const sliderRow = (labelText, min, max, step, get, set) => {
    const label = document.createElement("label");
    label.className = "cds-field cds-slider";
    const text = document.createElement("span");
    text.textContent = labelText;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const value = document.createElement("em");
    input.addEventListener("input", () => { if (!draft) return; set(Number(input.value)); applyLive(); });
    label.append(text, input, value);
    syncFns.push(() => {
      const current = get();
      input.value = String(current);
      value.textContent = String(current);
    });
    return { label, input };
  };

  // 可选滑杆：勾选=自定义，取消=跟随 Codex 默认（offValue 为 null 或 0）。
  const optionalSliderRow = (labelText, min, max, step, enableValue, offValue, get, set) => {
    const label = document.createElement("label");
    label.className = "cds-field cds-optslider";
    const check = document.createElement("input");
    check.type = "checkbox";
    const text = document.createElement("span");
    text.textContent = labelText;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const value = document.createElement("em");
    check.addEventListener("change", () => { if (!draft) return; set(check.checked ? enableValue : offValue); applyLive(); });
    input.addEventListener("input", () => { if (!draft) return; set(Number(input.value)); applyLive(); });
    label.append(check, text, input, value);
    syncFns.push(() => {
      const current = get();
      const active = current !== offValue && current !== null && current !== undefined;
      check.checked = active;
      input.disabled = !active;
      label.classList.toggle("cds-disabled", !active);
      input.value = String(active ? current : enableValue);
      value.textContent = active ? String(current) : "默认";
    });
    return label;
  };

  const checkRow = (labelText, get, set) => {
    const label = document.createElement("label");
    label.className = "cds-check-row";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.addEventListener("change", () => { if (!draft) return; set(check.checked); applyLive(); });
    label.append(check, document.createTextNode(" " + labelText));
    syncFns.push(() => { check.checked = Boolean(get()); });
    return label;
  };

  const noteRow = (textContent) => {
    const note = document.createElement("p");
    note.className = "cds-note";
    note.textContent = textContent;
    return note;
  };

  const selectRow = (labelText, options, get, set) => {
    const label = document.createElement("label");
    label.className = "cds-field";
    const text = document.createElement("span");
    text.textContent = labelText;
    const select = document.createElement("select");
    select.className = "cds-select";
    for (const [value, optionLabel] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = optionLabel;
      select.appendChild(option);
    }
    select.addEventListener("change", () => { if (!draft) return; set(select.value); applyLive(); });
    label.append(text, select);
    syncFns.push(() => { select.value = get(); });
    return label;
  };

  const textRow = (labelText, maxLength, placeholder, get, set) => {
    const label = document.createElement("label");
    label.className = "cds-field";
    const text = document.createElement("span");
    text.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "cds-name-input";
    input.maxLength = maxLength;
    input.placeholder = placeholder;
    input.addEventListener("change", () => { if (!draft) return; set(input.value); applyLive(); });
    label.append(text, input);
    syncFns.push(() => { input.value = get(); });
    return label;
  };

  // ---------- 背景页 ----------
  const bgInfo = document.createElement("span");
  bgInfo.className = "cds-bg-info";
  const uploadButton = cdsButton("上传 / 更换背景", true);
  uploadButton.addEventListener("click", async () => {
    const picked = await handlers.pickImage();
    if (!picked || !draft) return;
    draft.background = picked.dataUrl;
    if (picked.palette) {
      draft.colors = { ...picked.palette };
      if (handlers.notify) handlers.notify("已按图片自动取色，可在配色页微调");
    }
    applyLive();
  });
  const plainButton = cdsButton("移除背景（纯色）");
  plainButton.addEventListener("click", () => { if (!draft) return; draft.background = "none"; applyLive(); });
  const heroButton = cdsButton("默认樱花背景");
  heroButton.addEventListener("click", () => { if (!draft) return; draft.background = null; applyLive(); });
  const videoButton = cdsButton("上传视频背景");
  videoButton.addEventListener("click", async () => {
    const picked = await handlers.pickFile("video");
    if (!picked || !draft) return;
    draft.background = picked.dataUrl;
    if (handlers.notify) handlers.notify("视频背景已应用：静音循环播放，系统减弱动效时自动暂停");
    applyLive();
  });
  const bgActions = document.createElement("div");
  bgActions.className = "cds-actions";
  bgActions.append(uploadButton, videoButton, plainButton, heroButton, bgInfo);

  // 暗色模式单独背景
  const darkBgInfo = document.createElement("span");
  darkBgInfo.className = "cds-bg-info";
  const darkBgUpload = cdsButton("上传暗色背景");
  darkBgUpload.addEventListener("click", async () => {
    const picked = await handlers.pickImage();
    if (!picked || !draft) return;
    draft.backgroundDark = picked.dataUrl;
    applyLive();
  });
  const darkBgPlain = cdsButton("暗色纯色");
  darkBgPlain.addEventListener("click", () => { if (!draft) return; draft.backgroundDark = "none"; applyLive(); });
  const darkBgFollow = cdsButton("跟随亮色");
  darkBgFollow.addEventListener("click", () => { if (!draft) return; draft.backgroundDark = null; applyLive(); });
  const darkBgRow = document.createElement("div");
  darkBgRow.className = "cds-actions";
  darkBgRow.append(darkBgUpload, darkBgPlain, darkBgFollow, darkBgInfo);
  syncFns.push(() => {
    darkBgInfo.textContent = "暗色模式：" + (draft.backgroundDark === "none" ? "纯色" : draft.backgroundDark ? "独立背景图" : "跟随亮色");
  });

  // 多图轮播
  const slideshowThumbs = document.createElement("div");
  slideshowThumbs.className = "cds-thumbs";
  const slideshowAdd = cdsButton("＋ 添加轮播图");
  slideshowAdd.addEventListener("click", async () => {
    if (!draft || draft.backgrounds.length >= 4) return;
    const picked = await handlers.pickImage();
    if (!picked || !draft) return;
    draft.backgrounds.push(picked.dataUrl);
    applyLive();
  });
  const slideshowRow = document.createElement("div");
  slideshowRow.className = "cds-actions";
  slideshowRow.append(slideshowAdd, slideshowThumbs);
  syncFns.push(() => {
    slideshowAdd.disabled = draft.backgrounds.length >= 4;
    slideshowThumbs.textContent = "";
    draft.backgrounds.forEach((image, index) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "cds-thumb";
      thumb.title = "点击移除这张轮播图";
      thumb.style.backgroundImage = "url(" + JSON.stringify(image) + ")";
      thumb.addEventListener("click", () => { draft.backgrounds.splice(index, 1); applyLive(); });
      slideshowThumbs.appendChild(thumb);
    });
  });

  const positionSliders = [];
  const bgSliderBox = document.createElement("div");
  bgSliderBox.className = "cds-slider-box";
  const xSlider = sliderRow("水平位置", 0, 100, 1, () => draft.layout.x, (v) => { draft.layout.x = v; });
  const ySlider = sliderRow("垂直位置", 0, 100, 1, () => draft.layout.y, (v) => { draft.layout.y = v; });
  positionSliders.push(xSlider, ySlider);
  bgSliderBox.append(
    xSlider.label, ySlider.label,
    sliderRow("整体遮罩", 0, 100, 1, () => draft.layout.veil, (v) => { draft.layout.veil = v; }).label,
    sliderRow("亮度", 20, 200, 1, () => draft.filters.brightness, (v) => { draft.filters.brightness = v; }).label,
    sliderRow("饱和度", 0, 200, 1, () => draft.filters.saturate, (v) => { draft.filters.saturate = v; }).label,
    sliderRow("模糊", 0, 20, 1, () => draft.filters.blur, (v) => { draft.filters.blur = v; }).label
  );

  // 分区蒙层：按构图分区独立提亮，保证对应区域文字可读
  const veilTitle = document.createElement("strong");
  veilTitle.className = "cds-group-title";
  veilTitle.textContent = "分区蒙层";
  const veilSliderBox = document.createElement("div");
  veilSliderBox.className = "cds-slider-box";
  veilSliderBox.append(
    sliderRow("顶部蒙层", 0, 100, 1, () => draft.layout.veils.top, (v) => { draft.layout.veils.top = v; }).label,
    sliderRow("底部蒙层", 0, 100, 1, () => draft.layout.veils.bottom, (v) => { draft.layout.veils.bottom = v; }).label,
    sliderRow("左侧蒙层", 0, 100, 1, () => draft.layout.veils.left, (v) => { draft.layout.veils.left = v; }).label,
    sliderRow("内容区蒙层", 0, 100, 1, () => draft.layout.veils.content, (v) => { draft.layout.veils.content = v; }).label
  );
  const veilNote = noteRow("分区蒙层叠加在整体遮罩之上：顶部/底部/左侧对应边缘渐变，内容区蒙层提亮中央回答阅读区。");
  syncFns.push(() => {
    const hasMedia = Boolean(draft.background && draft.background !== "none");
    for (const slider of positionSliders) {
      slider.input.disabled = !hasMedia;
      slider.label.classList.toggle("cds-disabled", !hasMedia);
    }
    bgInfo.textContent = hasMedia
      ? (isVideoBackground(draft.background) ? "视频 ≈ " : "≈ ") + dataUrlKilobytes(draft.background) + " KB"
      : draft.background === "none" ? "纯色背景" : "默认樱花背景";
  });

  // ---------- 配色页 ----------
  const colorFieldRow = (labelText, key, target) => {
    const label = document.createElement("label");
    label.className = "cds-field cds-color";
    const text = document.createElement("span");
    text.textContent = labelText;
    const swatch = document.createElement("input");
    swatch.type = "color";
    const hex = document.createElement("input");
    hex.type = "text";
    hex.maxLength = 7;
    hex.spellcheck = false;
    const commit = (value) => {
      const object = draft && target();
      if (!object || !/^#[0-9a-f]{6}$/i.test(value)) return;
      object[key] = value.toLowerCase();
      applyLive();
    };
    swatch.addEventListener("input", () => commit(swatch.value));
    hex.addEventListener("change", () => commit(hex.value.trim()));
    label.append(text, swatch, hex);
    syncFns.push(() => {
      const object = target();
      if (!object) return;
      swatch.value = object[key];
      hex.value = object[key];
    });
    return label;
  };

  const lightColorBox = document.createElement("div");
  lightColorBox.className = "cds-color-box";
  lightColorBox.append(
    colorFieldRow("强调色", "accent", () => draft.colors),
    colorFieldRow("表面色", "surface", () => draft.colors),
    colorFieldRow("文字色", "text", () => draft.colors)
  );

  // WCAG 对比度警告
  const contrastWarning = document.createElement("p");
  contrastWarning.className = "cds-warning";
  syncFns.push(() => {
    const ratio = contrastRatio(draft.colors.text, draft.colors.surface);
    contrastWarning.hidden = ratio >= 4.5;
    contrastWarning.textContent = "⚠ 文字色对表面色对比度 " + ratio.toFixed(1) + ":1，低于 WCAG 4.5:1，正文可能看不清";
  });

  // 配色预设色板
  const PALETTE_PRESETS = [
    ["樱花", { accent: "#76506f", surface: "#fff9fb", text: "#3c2938" }],
    ["暖阳", { accent: "#8a5a44", surface: "#fff8f2", text: "#3d2f28" }],
    ["雾蓝", { accent: "#4a6b9a", surface: "#f4f8fc", text: "#243447" }],
    ["薄荷", { accent: "#3d8a6e", surface: "#f2fbf7", text: "#1f3a30" }],
    ["紫罗兰", { accent: "#6d5aa8", surface: "#f7f5fd", text: "#2f2a45" }],
    ["经典蓝", { accent: "#2a6feb", surface: "#eef4fd", text: "#1b2a41" }]
  ];
  const paletteChip = (label, colors, apply) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "cds-pal-chip";
    chip.title = label;
    chip.style.background = "linear-gradient(135deg," + colors.accent + " 0 34%," + colors.surface + " 34% 67%," + colors.text + " 67%)";
    chip.addEventListener("click", apply);
    return chip;
  };
  const paletteRow = document.createElement("div");
  paletteRow.className = "cds-pal-row";
  const paletteLabel = document.createElement("span");
  paletteLabel.textContent = "快速配色";
  paletteRow.appendChild(paletteLabel);
  for (const [label, colors] of PALETTE_PRESETS) {
    paletteRow.appendChild(paletteChip(label, colors, () => {
      if (!draft) return;
      draft.colors = { ...colors };
      applyLive();
    }));
  }

  // 按背景图取色候选
  const extractButton = cdsButton("按背景图取色");
  extractButton.addEventListener("click", async () => {
    if (!draft) return;
    const source = draft.background && draft.background.startsWith("data:image/") ? draft.background : previewImage;
    if (!source) { if (handlers.notify) handlers.notify("当前皮肤没有可取色的背景图"); return; }
    const candidates = await handlers.extractPalettes(source);
    candidateRow.textContent = "";
    if (!candidates.length) { if (handlers.notify) handlers.notify("图片接近灰度，取不出主色"); return; }
    const label = document.createElement("span");
    label.textContent = "候选：";
    candidateRow.appendChild(label);
    for (const palette of candidates) {
      candidateRow.appendChild(paletteChip(palette.accent, palette, () => {
        if (!draft) return;
        draft.colors = { ...palette };
        applyLive();
      }));
    }
  });
  const candidateRow = document.createElement("div");
  candidateRow.className = "cds-pal-row";
  const extractRow = document.createElement("div");
  extractRow.className = "cds-actions";
  extractRow.append(extractButton, candidateRow);

  const darkToggle = checkRow("暗色模式单独配色", () => draft.colorsDark, (on) => {
    draft.colorsDark = on ? { accent: draft.colors.accent, surface: "#2a2129", text: "#f3e8ef" } : null;
  });
  const darkColorBox = document.createElement("div");
  darkColorBox.className = "cds-color-box";
  darkColorBox.append(
    colorFieldRow("暗·强调", "accent", () => draft.colorsDark),
    colorFieldRow("暗·表面", "surface", () => draft.colorsDark),
    colorFieldRow("暗·文字", "text", () => draft.colorsDark)
  );
  syncFns.push(() => { darkColorBox.hidden = !draft.colorsDark; });

  const terminalToggle = checkRow("自定义终端配色（ANSI 16 色）", () => draft.terminal, (on) => {
    draft.terminal = on ? { ...TERMINAL_PRESETS.sakura } : null;
  });
  const terminalGrid = document.createElement("div");
  terminalGrid.className = "cds-term-grid";
  for (const key of ANSI_KEYS) {
    const cell = document.createElement("input");
    cell.type = "color";
    cell.title = key;
    cell.setAttribute("aria-label", "终端色 " + key);
    cell.addEventListener("input", () => {
      if (!draft || !draft.terminal) return;
      draft.terminal[key] = cell.value.toLowerCase();
      applyLive();
    });
    terminalGrid.appendChild(cell);
    syncFns.push(() => { cell.value = draft.terminal ? draft.terminal[key] : TERMINAL_PRESETS.sakura[key]; });
  }
  const terminalPresetRow = document.createElement("div");
  terminalPresetRow.className = "cds-actions";
  for (const [presetKey, presetLabel] of [["sakura", "樱花终端"], ["nord", "Nord"]]) {
    const button = cdsButton(presetLabel);
    button.addEventListener("click", () => {
      if (!draft) return;
      draft.terminal = { ...TERMINAL_PRESETS[presetKey] };
      applyLive();
    });
    terminalPresetRow.appendChild(button);
  }
  syncFns.push(() => { terminalGrid.hidden = terminalPresetRow.hidden = !draft.terminal; });

  // ---------- 品牌页 ----------
  const startupToggle = checkRow("启动画面跟随主题色", () => draft.brand.startupTint, (on) => { draft.brand.startupTint = on; });
  const logoInfo = document.createElement("span");
  logoInfo.className = "cds-bg-info";
  const logoUpload = cdsButton("上传 Logo 图片");
  logoUpload.addEventListener("click", async () => {
    const picked = await handlers.pickImage();
    if (!picked || !draft) return;
    draft.brand.logo = picked.dataUrl;
    applyLive();
  });
  const logoHide = cdsButton("隐藏 Logo");
  logoHide.addEventListener("click", () => { if (!draft) return; draft.brand.logo = "hide"; applyLive(); });
  const logoReset = cdsButton("恢复默认");
  logoReset.addEventListener("click", () => { if (!draft) return; draft.brand.logo = null; applyLive(); });
  const logoRow = document.createElement("div");
  logoRow.className = "cds-actions";
  logoRow.append(logoUpload, logoHide, logoReset, logoInfo);
  syncFns.push(() => {
    logoInfo.textContent = "Logo：" + (draft.brand.logo === "hide" ? "已隐藏" : draft.brand.logo ? "自定义图片" : "默认");
  });
  // 装饰 Chrome
  const chromeToggle = checkRow("启用复古窗口 Chrome（标题栏+工具栏）", () => draft.chrome.enabled, (on) => { draft.chrome.enabled = on; });
  const chromeStatusToggle = checkRow("底部状态栏", () => draft.chrome.statusBar, (on) => { draft.chrome.statusBar = on; });
  const chromeGroup = document.createElement("div");
  chromeGroup.className = "cds-subgroup";
  chromeGroup.append(
    chromeToggle,
    textRow("窗口标题", 30, "如：Codex 2007", () => draft.chrome.title, (v) => { draft.chrome.title = v.replace(/[<>]/g, "").slice(0, 30); }),
    textRow("工具栏项", 120, "逗号分隔，如：📝 新建任务,🧩 插件", () => draft.chrome.toolbar.join(","), (v) => {
      draft.chrome.toolbar = v.split(/[,，]/).map((item) => item.trim().replace(/[<>]/g, "").slice(0, 14)).filter(Boolean).slice(0, 8);
    }),
    chromeStatusToggle
  );
  syncFns.push(() => { chromeGroup.classList.toggle("cds-disabled-group", !draft.chrome.enabled); });

  const brandPaneContent = [
    startupToggle,
    logoRow,
    textRow("标题前缀", 12, "如：🌸 ", () => draft.brand.titlePrefix, (v) => { draft.brand.titlePrefix = v.replace(/[\n\r<>]/g, "").slice(0, 12); }),
    (() => { const t = document.createElement("strong"); t.className = "cds-group-title"; t.textContent = "复古窗口 Chrome"; return t; })(),
    chromeGroup,
    noteRow("Chrome 与 Logo 替换同为 DOM 级装饰：纯装饰不可点击，保留窗口拖拽，Codex 更新后可能需要适配；仅建议个人使用。")
  ];

  // ---------- 氛围页 ----------
  // 皮肤切换按钮是全局设置：直接读写 localStorage，不进主题草稿——换皮肤按钮样式保持一致
  const globalTriggerGroup = (() => {
    const wrap = document.createElement("div");
    wrap.className = "cds-subgroup";
    const commit = (mutate) => {
      const config = getTriggerConfig();
      mutate(config);
      setTriggerConfig(config);
      if (handlers.onTriggerChange) handlers.onTriggerChange();
    };
    const posLabel = document.createElement("label");
    posLabel.className = "cds-field";
    const posText = document.createElement("span");
    posText.textContent = "按钮位置";
    const posSelect = document.createElement("select");
    posSelect.className = "cds-select";
    for (const [value, label] of [["top-center", "顶部居中"], ["top-right", "右上角"], ["bottom-right", "右下角"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      posSelect.appendChild(option);
    }
    posSelect.addEventListener("change", () => commit((c) => { c.position = posSelect.value; }));
    posLabel.append(posText, posSelect);
    const iconLabel = document.createElement("label");
    iconLabel.className = "cds-field";
    const iconText = document.createElement("span");
    iconText.textContent = "按钮图标";
    const iconInput = document.createElement("input");
    iconInput.type = "text";
    iconInput.className = "cds-name-input";
    iconInput.maxLength = 2;
    iconInput.placeholder = "D 或 🌸";
    iconInput.addEventListener("change", () => commit((c) => { c.icon = iconInput.value.trim() ? [...iconInput.value.trim()].slice(0, 2).join("") : "D"; }));
    iconLabel.append(iconText, iconInput);
    const hideLabel = document.createElement("label");
    hideLabel.className = "cds-check-row";
    const hideCheck = document.createElement("input");
    hideCheck.type = "checkbox";
    hideCheck.addEventListener("change", () => commit((c) => { c.autoHide = hideCheck.checked; }));
    hideLabel.append(hideCheck, document.createTextNode(" 按钮平时半透明，悬停显示"));
    wrap.append(posLabel, iconLabel, hideLabel);
    syncFns.push(() => {
      const config = getTriggerConfig();
      posSelect.value = config.position;
      iconInput.value = config.icon;
      hideCheck.checked = config.autoHide;
    });
    return wrap;
  })();

  const ambiancePaneContent = [
    selectRow("滚动条", [["default", "默认"], ["slim", "纤细"], ["hidden", "隐藏"]], () => draft.effects.scrollbar, (v) => { draft.effects.scrollbar = v; }),
    selectRow("氛围粒子", [["none", "无"], ["sakura", "樱花花瓣"], ["snow", "雪花"]], () => draft.effects.particles, (v) => { draft.effects.particles = v; }),
    selectRow("界面动效", [["default", "默认"], ["off", "关闭动效"]], () => draft.effects.motion, (v) => { draft.effects.motion = v; }),
    optionalSliderRow("轮播间隔(分)", 1, 240, 1, 10, 0, () => draft.effects.slideshowMinutes, (v) => { draft.effects.slideshowMinutes = v; }),
    (() => { const t = document.createElement("strong"); t.className = "cds-group-title"; t.textContent = "皮肤切换按钮（全局设置）"; return t; })(),
    globalTriggerGroup,
    noteRow("按钮样式是全局的：改动立即保存，切换任何皮肤都保持一致，不随皮肤/预设变化。"),
    noteRow("粒子与视频背景在系统开启“减弱动态效果”时自动停用；轮播需在背景页添加至少一张轮播图。")
  ];

  // ---------- 字体页 ----------
  const fontRow = (labelText, options, get, set) => {
    const wrap = document.createElement("div");
    wrap.className = "cds-font-row";
    const label = document.createElement("label");
    label.className = "cds-field";
    const text = document.createElement("span");
    text.textContent = labelText;
    const select = document.createElement("select");
    select.className = "cds-select";
    for (const option of options) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      select.appendChild(el);
    }
    const custom = document.createElement("input");
    custom.type = "text";
    custom.className = "cds-name-input cds-font-custom";
    custom.placeholder = '如：\"LXGW WenKai\", sans-serif';
    custom.hidden = true;
    select.addEventListener("change", () => {
      if (!draft) return;
      if (select.value === "__custom__") { custom.hidden = false; custom.focus(); return; }
      custom.hidden = true;
      set(select.value);
      applyLive();
    });
    custom.addEventListener("change", () => { if (!draft) return; set(custom.value); applyLive(); });
    label.append(text, select);
    wrap.append(label, custom);
    syncFns.push(() => {
      const current = get() || "";
      const match = options.find((option) => option.value === current);
      if (match) { select.value = current; custom.hidden = true; }
      else { select.value = "__custom__"; custom.hidden = false; custom.value = current; }
    });
    return wrap;
  };

  // 内嵌字体文件：woff2/ttf/otf 转 data URL，随主题打包分发
  const importFontFace = async (slot) => {
    const picked = await handlers.pickFile("font");
    if (!picked || !draft) return;
    const family = (cleanFontStack(picked.fileName).replace(/[",]/g, "").trim() || "CustomFont").slice(0, 60);
    const faces = draft.typography.fontFaces.filter((face) => face.family !== family).slice(-1);
    faces.push({ family, src: picked.dataUrl });
    draft.typography.fontFaces = faces;
    if (slot === "sans") draft.typography.sans = '"' + family + '", "PingFang SC", sans-serif';
    else draft.typography.mono = '"' + family + '", ui-monospace, monospace';
    if (handlers.notify) handlers.notify("字体已内嵌并启用：" + family);
    applyLive();
  };
  const fontFaceInfo = document.createElement("span");
  fontFaceInfo.className = "cds-bg-info";
  const sansFaceButton = cdsButton("导入界面字体文件");
  sansFaceButton.addEventListener("click", () => importFontFace("sans"));
  const monoFaceButton = cdsButton("导入代码字体文件");
  monoFaceButton.addEventListener("click", () => importFontFace("mono"));
  const clearFacesButton = cdsButton("清除内嵌字体");
  clearFacesButton.addEventListener("click", () => { if (!draft) return; draft.typography.fontFaces = []; applyLive(); });
  const fontFaceRow = document.createElement("div");
  fontFaceRow.className = "cds-actions";
  fontFaceRow.append(sansFaceButton, monoFaceButton, clearFacesButton, fontFaceInfo);
  syncFns.push(() => {
    clearFacesButton.disabled = !draft.typography.fontFaces.length;
    fontFaceInfo.textContent = draft.typography.fontFaces.length
      ? "已内嵌：" + draft.typography.fontFaces.map((face) => face.family).join("、")
      : "未内嵌字体";
  });

  const fontPaneContent = [
    fontRow("界面字体", SANS_FONT_OPTIONS, () => draft.typography.sans, (v) => { draft.typography.sans = v; }),
    fontRow("代码字体", MONO_FONT_OPTIONS, () => draft.typography.mono, (v) => { draft.typography.mono = v; }),
    optionalSliderRow("聊天字号", 11, 22, 1, 15, 0, () => draft.typography.chatFontSize, (v) => { draft.typography.chatFontSize = v; }),
    optionalSliderRow("编辑器字号", 10, 18, 1, 13, 0, () => draft.typography.editorFontSize, (v) => { draft.typography.editorFontSize = v; }),
    fontFaceRow,
    noteRow("下拉选择的字体需本机已安装；「导入字体文件」（woff2/ttf/otf ≤2MB）会把字体内嵌进主题包，分享给别人也能生效。")
  ];

  // ---------- 布局页 ----------
  const shadowRow = document.createElement("label");
  shadowRow.className = "cds-field";
  const shadowText = document.createElement("span");
  shadowText.textContent = "阴影";
  const shadowSelect = document.createElement("select");
  shadowSelect.className = "cds-select";
  for (const [value, label] of [["default", "默认"], ["none", "无阴影 · 扁平"], ["bold", "加重 · 立体"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    shadowSelect.appendChild(option);
  }
  shadowSelect.addEventListener("change", () => { if (!draft) return; draft.shape.shadow = shadowSelect.value; applyLive(); });
  shadowRow.append(shadowText, shadowSelect);
  syncFns.push(() => { shadowSelect.value = draft.shape.shadow; });

  // 右侧展示面板
  const sideEnableToggle = checkRow("启用右侧展示面板", () => draft.sidePanel.enabled, (on) => { draft.sidePanel.enabled = on; });
  const sideImageInfo = document.createElement("span");
  sideImageInfo.className = "cds-bg-info";
  const sideImageUpload = cdsButton("上传形象图");
  sideImageUpload.addEventListener("click", async () => {
    const picked = await handlers.pickImage();
    if (!picked || !draft) return;
    draft.sidePanel.image = picked.dataUrl;
    applyLive();
  });
  const sideImageBuiltin = cdsButton("使用内置角色");
  sideImageBuiltin.addEventListener("click", () => {
    if (!draft || !handlers.builtinCharacter) return;
    draft.sidePanel.image = handlers.builtinCharacter;
    applyLive();
  });
  const sideImageClear = cdsButton("清除图片");
  sideImageClear.addEventListener("click", () => { if (!draft) return; draft.sidePanel.image = null; applyLive(); });
  const sideImageRow = document.createElement("div");
  sideImageRow.className = "cds-actions";
  sideImageRow.append(sideImageUpload, sideImageBuiltin, sideImageClear, sideImageInfo);
  const sidePanelGroup = document.createElement("div");
  sidePanelGroup.className = "cds-subgroup";
  sidePanelGroup.append(
    sideEnableToggle,
    sliderRow("面板宽度", 200, 320, 5, () => draft.sidePanel.width, (v) => { draft.sidePanel.width = v; }).label,
    textRow("面板标题", 20, "如：Codex 好友", () => draft.sidePanel.title, (v) => { draft.sidePanel.title = v.replace(/[<>]/g, "").slice(0, 20); }),
    textRow("名片行", 30, "名字|徽章，如：Codex 小蓝|LV 07", () => draft.sidePanel.subtitle, (v) => { draft.sidePanel.subtitle = v.replace(/[<>]/g, "").slice(0, 30); }),
    sideImageRow,
    textRow("文字卡片", 300, "面板里的一段介绍文字", () => draft.sidePanel.card, (v) => { draft.sidePanel.card = v.replace(/[<>]/g, "").slice(0, 300); }),
    textRow("图标行", 24, "一串 emoji，如：🖥⭐✉🧩📁", () => draft.sidePanel.icons, (v) => { draft.sidePanel.icons = v.replace(/[<>]/g, "").slice(0, 24); }),
    textRow("分组标题", 20, "如：我的好友 (2/8)", () => draft.sidePanel.heading, (v) => { draft.sidePanel.heading = v.replace(/[<>]/g, "").slice(0, 20); }),
    (() => {
      const upload = cdsButton("上传分组图（好友头像）");
      upload.addEventListener("click", async () => {
        const picked = await handlers.pickImage();
        if (!picked || !draft) return;
        draft.sidePanel.image2 = picked.dataUrl;
        applyLive();
      });
      const clear = cdsButton("清除分组图");
      clear.addEventListener("click", () => { if (!draft) return; draft.sidePanel.image2 = null; applyLive(); });
      const row = document.createElement("div");
      row.className = "cds-actions";
      row.append(upload, clear);
      return row;
    })(),
    textRow("底部搜索", 20, "如：查找好友…", () => draft.sidePanel.footer, (v) => { draft.sidePanel.footer = v.replace(/[<>]/g, "").slice(0, 20); })
  );
  syncFns.push(() => {
    sidePanelGroup.classList.toggle("cds-disabled-group", !draft.sidePanel.enabled);
    sideImageInfo.textContent = draft.sidePanel.image ? "已设置形象图" : "无图片";
  });

  const layoutPaneContent = [
    optionalSliderRow("圆角倍率", 0, 2.5, 0.05, 1.25, null, () => draft.shape.radiusScale, (v) => { draft.shape.radiusScale = v; }),
    optionalSliderRow("侧栏宽度", 220, 420, 5, 275, 0, () => draft.layout.sidebarWidth, (v) => { draft.layout.sidebarWidth = v; }),
    optionalSliderRow("侧栏不透明", 15, 95, 1, 62, 0, () => draft.layout.sidebarOpacity, (v) => { draft.layout.sidebarOpacity = v; }),
    shadowRow,
    noteRow("圆角 0 = 直角工业风，1.25 = Codex 默认，2+ = 圆润可爱风。侧栏不透明度越低，背景图透进左侧列表越多。"),
    (() => { const t = document.createElement("strong"); t.className = "cds-group-title"; t.textContent = "右侧展示面板"; return t; })(),
    sidePanelGroup,
    noteRow("右侧面板是注入的展示区（对标 QQ 好友栏）：主内容自动让位，样式跟随主题色。")
  ];

  // ---------- 高级页 ----------
  const tokensArea = document.createElement("textarea");
  tokensArea.className = "cds-textarea";
  tokensArea.rows = 6;
  tokensArea.placeholder = "--color-token-side-bar-background: #fff0f5\n--height-toolbar: 40px\n（每行一条：变量名: 值）";
  tokensArea.spellcheck = false;
  tokensArea.addEventListener("change", () => {
    if (!draft) return;
    const parsed = {};
    for (const line of tokensArea.value.split("\n")) {
      const match = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/);
      if (match) parsed[match[1]] = match[2];
    }
    draft.tokens = parsed;
    applyLive();
  });
  const customCssArea = document.createElement("textarea");
  customCssArea.className = "cds-textarea";
  customCssArea.rows = 10;
  customCssArea.placeholder = "/* 自定义 CSS：整容级改版从这里开始（外链 url 会被剔除） */";
  customCssArea.spellcheck = false;
  customCssArea.addEventListener("change", () => {
    if (!draft) return;
    draft.customCss = customCssArea.value;
    applyLive();
  });
  syncFns.push(() => {
    if (document.activeElement !== tokensArea) {
      tokensArea.value = Object.entries(draft.tokens || {}).map(([key, value]) => key + ": " + value).join("\n");
    }
    if (document.activeElement !== customCssArea) customCssArea.value = draft.customCss || "";
  });
  const advancedPaneContent = [
    (() => { const t = document.createElement("strong"); t.className = "cds-group-title"; t.textContent = "Token 覆盖表"; return t; })(),
    tokensArea,
    noteRow("直接覆盖 Codex 的任意 CSS 变量（约 1300 个可用），高级用户专用；非法行自动忽略。"),
    (() => { const t = document.createElement("strong"); t.className = "cds-group-title"; t.textContent = "自定义 CSS"; return t; })(),
    customCssArea,
    noteRow("追加在主题样式末尾、优先级最高。@import 与外链 url() 会被剔除，保证注入包零外联。")
  ];

  // ---------- Tab 骨架 ----------
  const tabsBar = document.createElement("div");
  tabsBar.className = "cds-tabs";
  tabsBar.setAttribute("role", "tablist");
  const panes = {};
  const tabButtons = {};
  const addPane = (key, labelText, children) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cds-tab";
    button.textContent = labelText;
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => switchTab(key));
    tabsBar.appendChild(button);
    const pane = document.createElement("div");
    pane.className = "cds-pane";
    pane.append(...children);
    panes[key] = pane;
    tabButtons[key] = button;
    return pane;
  };
  const switchTab = (key) => {
    for (const paneKey in panes) {
      panes[paneKey].hidden = paneKey !== key;
      tabButtons[paneKey].setAttribute("aria-selected", String(paneKey === key));
    }
  };
  addPane("bg", "背景", [bgActions, bgSliderBox, veilTitle, veilSliderBox, veilNote, darkBgRow, slideshowRow]);
  addPane("color", "配色", [lightColorBox, contrastWarning, paletteRow, extractRow, darkToggle, darkColorBox, terminalToggle, terminalPresetRow, terminalGrid]);
  addPane("font", "字体", fontPaneContent);
  addPane("layout", "布局", layoutPaneContent);
  addPane("ambiance", "氛围", ambiancePaneContent);
  addPane("brand", "品牌", brandPaneContent);
  addPane("advanced", "高级", advancedPaneContent);

  // ---------- 底部动作 ----------
  const actions = document.createElement("div");
  actions.className = "cds-actions cds-editor-actions";
  const saveButton = cdsButton("保存", true);
  saveButton.addEventListener("click", async () => {
    if (!draft) return;
    await handlers.onSave(structuredClone(draft), { asCopy: snapshotBuiltin });
  });
  const revertButton = cdsButton("还原");
  revertButton.addEventListener("click", () => revert());
  const duplicateButton = cdsButton("复制");
  duplicateButton.addEventListener("click", async () => {
    if (draft) await handlers.onDuplicate(structuredClone(draft));
  });
  const exportButton = cdsButton("导出");
  exportButton.addEventListener("click", () => { if (draft) handlers.onExport(structuredClone(draft)); });
  const deleteButton = cdsButton("删除");
  deleteButton.classList.add("cds-danger");
  deleteButton.addEventListener("click", () => { if (snapshot && !snapshotBuiltin) handlers.onDelete(snapshot.id); });
  actions.append(saveButton, revertButton, duplicateButton, exportButton, deleteButton);

  // 双栏：左侧 Tab+设置滚动区，右侧常驻预览与操作
  const main = document.createElement("div");
  main.className = "cds-editor-main";
  const paneScroll = document.createElement("div");
  paneScroll.className = "cds-pane-scroll";
  paneScroll.append(panes.bg, panes.color, panes.font, panes.layout, panes.ambiance, panes.brand, panes.advanced);
  main.append(tabsBar, paneScroll);
  const side = document.createElement("div");
  side.className = "cds-editor-side";
  side.append(preview.el, zonesRow, nameRow, actions);
  el.append(main, side);
  switchTab("bg");

  const isDirty = () => Boolean(draft && snapshot && !themeEquals(draft, snapshot));

  function syncActions() {
    const dirty = isDirty();
    saveButton.textContent = snapshotBuiltin ? "另存为副本" : "保存";
    saveButton.disabled = !dirty;
    revertButton.disabled = !dirty;
    duplicateButton.hidden = snapshotBuiltin;
    deleteButton.hidden = snapshotBuiltin;
  }

  function syncControls() {
    if (!draft) return;
    nameInput.value = draft.name;
    for (const sync of syncFns) sync();
    syncActions();
  }

  function load(theme) {
    const clean = structuredClone(theme);
    snapshotBuiltin = Boolean(clean.builtin);
    previewImage = typeof clean.preview === "string" && clean.preview !== "none" ? clean.preview : null;
    delete clean.preview;
    delete clean.builtin;
    snapshot = clean;
    draft = structuredClone(clean);
    preview.update(previewTheme());
    syncControls();
  }

  function revert() {
    if (!snapshot) return;
    load({ ...structuredClone(snapshot), builtin: snapshotBuiltin, preview: previewImage });
    handlers.applyLive(draft);
  }

  return { el, load, revert, isDirty, currentDraft: () => draft };
}

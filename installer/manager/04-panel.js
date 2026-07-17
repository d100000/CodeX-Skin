// 面板骨架 + 主题库 + 导入导出 + 启动流程。boot() 是注入脚本的返回值。
function cdsButton(text, primary = false) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = text;
  element.className = primary ? "cds-btn cds-btn-primary" : "cds-btn";
  return element;
}

function ensureStyle(id) {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement("style");
    element.id = id;
    document.head.appendChild(element);
  }
  return element;
}

async function init() {
  const baseStyle = ensureStyle(IDS.base);
  baseStyle.textContent = BASE_CSS;
  const overrideStyle = ensureStyle(IDS.override);
  const managerStyle = ensureStyle(IDS.managerStyle);
  managerStyle.textContent = MANAGER_CSS;
  document.documentElement.dataset.codexDollSkin = "active";

  // ---------- 顶层元素 ----------
  document.getElementById(IDS.trigger)?.remove();
  document.getElementById(IDS.manager)?.remove();
  document.getElementById("codex-doll-background-manager")?.remove();

  const trigger = document.createElement("button");
  trigger.id = IDS.trigger;
  trigger.type = "button";
  trigger.textContent = "D";
  trigger.title = "打开 Codex 皮肤管理器";
  trigger.setAttribute("aria-label", trigger.title);

  const backdrop = document.createElement("div");
  backdrop.className = "cds-backdrop";
  backdrop.hidden = true;

  const panel = document.createElement("section");
  panel.id = IDS.manager;
  panel.className = "cds-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Codex 皮肤管理器");
  panel.hidden = true;

  const toast = document.createElement("div");
  toast.className = "cds-toast";
  toast.hidden = true;
  let toastTimer = 0;
  const showToast = (message) => {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
  };

  // ---------- 暂停 ----------
  const setPaused = (paused) => {
    baseStyle.disabled = paused;
    overrideStyle.disabled = paused;
    localStorage.setItem(PAUSED_KEY, paused ? "1" : "0");
    trigger.classList.toggle("cds-trigger-paused", paused);
    trigger.style.opacity = ""; // CLI 的 skin:pause/apply 会写内联透明度，这里清除避免残留
    const video = document.getElementById("codex-doll-skin-video");
    if (video) {
      video.style.display = paused ? "none" : "";
      if (paused) video.pause(); else video.play().catch(() => {});
    }
    const particlesCanvas = document.getElementById("codex-doll-skin-particles");
    if (particlesCanvas) particlesCanvas.style.display = paused ? "none" : "";
    const sidePanelEl = document.getElementById("codex-doll-skin-sidepanel");
    if (sidePanelEl) sidePanelEl.style.display = paused ? "none" : "";
    const sidePanelStyle = document.getElementById("codex-doll-sidepanel-style");
    if (sidePanelStyle) sidePanelStyle.disabled = paused;
    pauseSwitch.checked = !paused;
    pauseText.textContent = paused ? "皮肤已暂停" : "皮肤已开启";
  };

  // ---------- 文件选择 ----------
  const backgroundInput = document.createElement("input");
  backgroundInput.type = "file";
  backgroundInput.accept = "image/png,image/jpeg,image/webp";
  backgroundInput.hidden = true;
  const configInput = document.createElement("input");
  configInput.type = "file";
  configInput.accept = "application/json,.json";
  configInput.hidden = true;

  const compressImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("无法读取图片"));
      image.onload = () => {
        const scale = Math.min(1, 1920 / image.width, 1280 / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL("image/webp", .85);
        if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", .88);
        // 小画布缩样取主题色
        const sample = document.createElement("canvas");
        sample.width = 64;
        sample.height = 64;
        const sampleContext = sample.getContext("2d");
        sampleContext.drawImage(image, 0, 0, 64, 64);
        let palette = null;
        try { palette = paletteFromPixels(sampleContext.getImageData(0, 0, 64, 64).data); } catch {}
        resolve({ dataUrl, palette });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  const FILE_ACCEPT = {
    image: "image/png,image/jpeg,image/webp",
    video: "video/mp4,video/webm",
    font: ".woff2,.ttf,.otf,font/woff2"
  };
  const FILE_MAX_BYTES = { video: 8 * 1024 * 1024, font: 2 * 1024 * 1024 };
  const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

  let pickWaiter = null;
  let pickKind = "image";
  const pickFile = (kind) => new Promise((resolve) => {
    pickKind = kind;
    pickWaiter = resolve;
    backgroundInput.accept = FILE_ACCEPT[kind] || FILE_ACCEPT.image;
    backgroundInput.value = "";
    backgroundInput.click();
  });
  const pickImage = () => pickFile("image");
  backgroundInput.addEventListener("change", async () => {
    const waiter = pickWaiter;
    const kind = pickKind;
    pickWaiter = null;
    const file = backgroundInput.files && backgroundInput.files[0];
    if (!waiter) return;
    if (!file) { waiter(null); return; }
    try {
      if (FILE_MAX_BYTES[kind] && file.size > FILE_MAX_BYTES[kind]) {
        throw new Error("文件超过 " + Math.round(FILE_MAX_BYTES[kind] / 1024 / 1024) + "MB 限制");
      }
      const fileName = file.name.replace(/\.[^.]+$/, "");
      if (kind === "image") {
        const { dataUrl, palette } = await compressImage(file);
        waiter({ dataUrl, palette, fileName });
      } else {
        let dataUrl = await readAsDataUrl(file);
        if (kind === "font" && dataUrl.startsWith("data:application/octet-stream")) {
          dataUrl = dataUrl.replace("data:application/octet-stream", "data:font/woff2");
        }
        waiter({ dataUrl, palette: null, fileName });
      }
    } catch (error) {
      alert("文件处理失败：" + error.message);
      waiter(null);
    }
  });

  // ---------- 运行时附加层：视频背景 / 粒子 / D 按钮 / 品牌 / 轮播 ----------
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastApplied = null;

  const applyVideo = (theme) => {
    const root = document.getElementById("root");
    let video = document.getElementById("codex-doll-skin-video");
    const src = isVideoBackground(theme.background) ? theme.background : null;
    if (!src || !root) { if (video) video.remove(); return; }
    if (!video) {
      video = document.createElement("video");
      video.id = "codex-doll-skin-video";
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("aria-hidden", "true");
    }
    // fixed 而非 absolute：不依赖 #root 盒子高度；仍在 #root 隔离堆叠上下文内，z-index 0 低于内容
    video.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;object-fit:cover;z-index:0;pointer-events:none;object-position:" + theme.layout.x + "% " + theme.layout.y + "%;filter:" + (filterValue(theme.filters) || "none");
    if (video.getAttribute("src") !== src) video.setAttribute("src", src);
    if (!video.isConnected) root.prepend(video);
    if (reducedMotion() || baseStyle.disabled) video.pause();
    else video.play().catch(() => {});
  };

  let particlesState = null;
  const stopParticles = () => {
    if (!particlesState) return;
    cancelAnimationFrame(particlesState.raf);
    particlesState.canvas.remove();
    particlesState = null;
  };
  const applyParticles = (theme) => {
    const kind = theme.effects.particles;
    if (kind === "none" || reducedMotion()) { stopParticles(); return; }
    if (particlesState && particlesState.kind === kind) return;
    stopParticles();
    const root = document.getElementById("root");
    if (!root) return;
    const canvas = document.createElement("canvas");
    canvas.id = "codex-doll-skin-particles";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none";
    root.appendChild(canvas);
    const context = canvas.getContext("2d");
    const spawn = (top) => ({
      x: Math.random(), y: top ? -0.05 : Math.random(),
      size: 2.5 + Math.random() * 4,
      vx: kind === "sakura" ? -(0.2 + Math.random() * 0.5) : (Math.random() - 0.5) * 0.3,
      vy: 0.35 + Math.random() * 0.75,
      rotation: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.03
    });
    const items = Array.from({ length: 26 }, () => spawn(false));
    const state = { canvas, kind, raf: 0 };
    const frame = () => {
      if (!canvas.isConnected) return;
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }
      const { width, height } = canvas;
      context.clearRect(0, 0, width, height);
      for (const item of items) {
        item.x += item.vx / 900;
        item.y += item.vy / 900;
        item.rotation += item.spin;
        if (item.y > 1.05 || item.x < -0.05) Object.assign(item, spawn(true), { x: Math.random() * 1.1 });
        context.save();
        context.translate(item.x * width, item.y * height);
        context.rotate(item.rotation);
        if (kind === "sakura") {
          context.fillStyle = "rgba(244,177,199,.72)";
          context.beginPath();
          context.ellipse(0, 0, item.size, item.size * 0.62, 0, 0, Math.PI * 2);
          context.fill();
        } else {
          context.fillStyle = "rgba(255,255,255,.8)";
          context.beginPath();
          context.arc(0, 0, item.size * 0.55, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }
      state.raf = requestAnimationFrame(frame);
    };
    particlesState = state;
    frame(); // 同步画首帧：后台/最小化时 rAF 不触发，至少保证有静态画面
  };

  const applyTrigger = (theme) => {
    trigger.textContent = theme.trigger.icon;
    trigger.dataset.pos = theme.trigger.position;
    trigger.dataset.autohide = theme.trigger.autoHide ? "1" : "0";
  };

  // 品牌：窗口标题前缀 + 左上角 Logo（尽力而为，失败不影响其余皮肤）
  let titlePrefixDesired = "";
  let titlePrefixApplied = "";
  const enforceTitle = () => {
    let base = document.title;
    if (titlePrefixApplied && base.startsWith(titlePrefixApplied)) base = base.slice(titlePrefixApplied.length);
    const next = (titlePrefixDesired || "") + base;
    titlePrefixApplied = titlePrefixDesired;
    if (document.title !== next) document.title = next;
  };
  const titleElement = document.querySelector("title");
  if (titleElement) new MutationObserver(enforceTitle).observe(titleElement, { childList: true, characterData: true, subtree: true });

  const applyLogo = (mode) => {
    const panelElement = document.querySelector(".app-shell-left-panel");
    if (!panelElement) return;
    const image = document.getElementById("codex-doll-skin-logo");
    const marked = panelElement.querySelector("[data-codex-doll-brand]");
    if (!mode) {
      if (image) image.remove();
      if (marked) { marked.style.display = ""; delete marked.dataset.codexDollBrand; }
      return;
    }
    const settled = marked && marked.isConnected &&
      ((mode === "hide" && !image) || (mode !== "hide" && image && image.isConnected && image.getAttribute("src") === mode));
    if (settled) return;
    if (image) image.remove();
    if (marked) { marked.style.display = ""; delete marked.dataset.codexDollBrand; }
    const node = [...panelElement.querySelectorAll("*")].find((element) =>
      element.childElementCount === 0 &&
      element.textContent.trim() === "Codex" &&
      element.getBoundingClientRect().top < 90);
    if (!node) return;
    node.dataset.codexDollBrand = "1";
    node.style.display = "none";
    if (mode !== "hide") {
      const logo = document.createElement("img");
      logo.id = "codex-doll-skin-logo";
      logo.src = mode;
      logo.alt = "";
      logo.style.cssText = "height:22px;max-width:130px;object-fit:contain;vertical-align:middle;pointer-events:none";
      node.before(logo);
    }
  };
  let brandTimer = 0;
  const brandObserver = new MutationObserver(() => {
    clearTimeout(brandTimer);
    brandTimer = setTimeout(() => { if (lastApplied) applyBrand(lastApplied); }, 800);
  });
  let brandObserving = false;
  const applyBrand = (theme) => {
    titlePrefixDesired = theme.brand.titlePrefix || "";
    enforceTitle();
    try { applyLogo(theme.brand.logo); } catch {}
    const needsWatch = Boolean(theme.brand.logo);
    if (needsWatch && !brandObserving && document.body) {
      brandObserver.observe(document.body, { childList: true, subtree: true });
      brandObserving = true;
    } else if (!needsWatch && brandObserving) {
      brandObserver.disconnect();
      brandObserving = false;
    }
  };

  // 右侧展示面板：注入 fixed 右栏 + 让主内容让位，样式跟随主题色
  const applySidePanel = (theme) => {
    const config = theme.sidePanel;
    let panelEl = document.getElementById("codex-doll-skin-sidepanel");
    let reserveStyle = document.getElementById("codex-doll-sidepanel-style");
    if (!config || !config.enabled) {
      if (panelEl) panelEl.remove();
      if (reserveStyle) reserveStyle.remove();
      return;
    }
    if (!reserveStyle) {
      reserveStyle = document.createElement("style");
      reserveStyle.id = "codex-doll-sidepanel-style";
      document.head.appendChild(reserveStyle);
    }
    reserveStyle.textContent = ".app-shell-main-content-frame{margin-right:" + (config.width + 16) + "px!important}";
    if (!panelEl) {
      panelEl = document.createElement("aside");
      panelEl.id = "codex-doll-skin-sidepanel";
      panelEl.setAttribute("aria-label", "皮肤右侧面板");
      document.body.appendChild(panelEl);
    }
    panelEl.style.cssText = "position:fixed;top:52px;right:10px;bottom:14px;width:" + config.width + "px;z-index:9;display:flex;flex-direction:column;gap:10px;padding:12px;overflow:auto;border:1px solid color-mix(in srgb," + theme.colors.accent + " 32%,transparent);border-radius:calc(10px * var(--corner-radius-scale,1.25) / 1.25);background:color-mix(in srgb," + theme.colors.surface + " 90%,transparent);backdrop-filter:blur(14px) saturate(1.05);color:" + theme.colors.text + ";font:13px/1.55 var(--font-sans,system-ui);-webkit-app-region:no-drag";
    panelEl.textContent = "";
    if (config.title) {
      const title = document.createElement("strong");
      title.textContent = config.title;
      title.style.cssText = "font-size:13.5px;color:" + theme.colors.accent + ";border-bottom:1px solid color-mix(in srgb," + theme.colors.accent + " 22%,transparent);padding-bottom:7px";
      panelEl.appendChild(title);
    }
    if (config.image) {
      const image = document.createElement("img");
      image.src = config.image;
      image.alt = "";
      image.style.cssText = "width:100%;border-radius:calc(8px * var(--corner-radius-scale,1.25) / 1.25);object-fit:cover";
      panelEl.appendChild(image);
    }
    if (config.card) {
      const card = document.createElement("p");
      card.textContent = config.card;
      card.style.cssText = "margin:0;padding:10px;border-radius:calc(8px * var(--corner-radius-scale,1.25) / 1.25);background:color-mix(in srgb," + theme.colors.accent + " 8%,transparent);border:1px solid color-mix(in srgb," + theme.colors.accent + " 18%,transparent)";
      panelEl.appendChild(card);
    }
  };

  let slideshowTimer = 0;
  let slideshowIndex = 0;
  const applySlideshow = (theme) => {
    clearInterval(slideshowTimer);
    slideshowTimer = 0;
    slideshowIndex = 0;
    const list = [theme.background, ...(theme.backgrounds || [])].filter((item) => typeof item === "string" && item.startsWith("data:image/"));
    if (!theme.effects.slideshowMinutes || list.length < 2) return;
    slideshowTimer = setInterval(() => {
      slideshowIndex = (slideshowIndex + 1) % list.length;
      overrideStyle.textContent = themeCss({ ...theme, background: list[slideshowIndex] });
    }, theme.effects.slideshowMinutes * 60000);
  };

  const applyExtras = (theme) => {
    applyVideo(theme);
    applyParticles(theme);
    applyTrigger(theme);
    applyBrand(theme);
    applySlideshow(theme);
    applySidePanel(theme);
  };
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => { if (lastApplied) applyExtras(lastApplied); });

  // ---------- 主题应用 ----------
  const applyLive = (theme) => {
    lastApplied = theme;
    overrideStyle.textContent = themeCss(theme);
    applyExtras(theme);
    if (baseStyle.disabled) setPaused(false);
  };

  const selectTheme = async (theme, { skipDirtyCheck = false } = {}) => {
    if (!skipDirtyCheck && editor.isDirty() && !confirm("当前皮肤有未保存的修改，放弃并切换？")) return false;
    setCurrentThemeId(theme.id);
    applyLive(theme);
    editor.load(theme);
    await renderLibrary();
    return true;
  };

  // ---------- 编辑器 ----------
  // 从已有背景图重新计算取色候选（3-4 套按色相权重排序的配色）
  const extractPalettes = (dataUrl) => new Promise((resolve) => {
    const image = new Image();
    image.onerror = () => resolve([]);
    image.onload = () => {
      try {
        const sample = document.createElement("canvas");
        sample.width = 64;
        sample.height = 64;
        const context = sample.getContext("2d");
        context.drawImage(image, 0, 0, 64, 64);
        resolve(paletteCandidatesFromPixels(context.getImageData(0, 0, 64, 64).data, 4));
      } catch { resolve([]); }
    };
    image.src = dataUrl;
  });

  const editor = createEditor({
    applyLive,
    pickImage,
    pickFile,
    extractPalettes,
    builtinCharacter: (presetThemes.find((preset) => preset.sidePanel && preset.sidePanel.image) || { sidePanel: {} }).sidePanel.image || null,
    notify: showToast,
    onDuplicate: async (draft) => {
      const theme = normalizeTheme(draft);
      theme.id = makeThemeId(theme.name);
      theme.name = theme.name + " 副本";
      theme.createdAt = new Date().toISOString();
      await putTheme(exportableTheme(theme));
      await selectTheme(theme, { skipDirtyCheck: true });
      showToast("已复制为新皮肤");
    },
    onSave: async (draft, { asCopy }) => {
      const theme = normalizeTheme(draft);
      if (asCopy || findPreset(theme.id)) {
        theme.id = makeThemeId(theme.name);
        theme.name = asCopy ? theme.name + " 副本" : theme.name;
        theme.createdAt = new Date().toISOString();
      }
      await putTheme(exportableTheme(theme));
      await selectTheme(theme, { skipDirtyCheck: true });
      showToast(asCopy ? "已另存为副本" : "已保存");
    },
    onDelete: async (id) => {
      if (!confirm("确定删除该皮肤？此操作不可撤销。")) return;
      await deleteTheme(id);
      showToast("已删除");
      if (currentThemeId() === id) await selectTheme(presetThemes[0], { skipDirtyCheck: true });
      else await renderLibrary();
    },
    onExport: (theme) => {
      const clean = exportableTheme(normalizeTheme(theme));
      const payload = JSON.stringify(clean, null, 2);
      if (payload.length > 5 * 1024 * 1024) showToast("主题包较大（含视频/字体），分享请留意体积");
      const blob = new Blob([payload], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = clean.id + ".codexskin.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
  });

  // ---------- 主题库 ----------
  const library = document.createElement("aside");
  library.className = "cds-library";
  const libraryTitle = document.createElement("strong");
  libraryTitle.textContent = "我的皮肤";
  const cards = document.createElement("div");
  cards.className = "cds-cards";
  const emptyHint = document.createElement("p");
  emptyHint.className = "cds-hint";
  emptyHint.textContent = "上传一张背景图，自动按图取色，30 秒做一套自己的皮肤。";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "cds-name-input cds-search";
  searchInput.placeholder = "搜索皮肤…";
  searchInput.addEventListener("input", () => renderLibrary());
  const newButton = cdsButton("＋ 自定义图片（自动取色）", true);
  newButton.addEventListener("click", async () => {
    const picked = await pickImage();
    if (!picked) return;
    await createThemeFromImage(picked.dataUrl, picked.palette, picked.fileName);
  });
  library.append(libraryTitle, searchInput, cards, emptyHint, newButton);

  const cardThumbBackground = (theme) => {
    const image = theme.preview || theme.background;
    if (image && image !== "none") return "url(" + JSON.stringify(image) + ") center/cover no-repeat";
    if (theme.background === "none") return theme.colors.surface;
    return "linear-gradient(135deg,#f2cdd8,#fff)";
  };

  async function renderLibrary() {
    const query = searchInput.value.trim().toLowerCase();
    const themes = (await listThemes()).filter((theme) => !query || theme.name.toLowerCase().includes(query) || theme.id.includes(query));
    const selectedId = currentThemeId();
    cards.textContent = "";
    for (const theme of themes) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "cds-card";
      card.setAttribute("aria-pressed", String(theme.id === selectedId));
      const thumb = document.createElement("span");
      thumb.className = "cds-card-thumb";
      thumb.style.background = cardThumbBackground(theme);
      const chips = document.createElement("span");
      chips.className = "cds-card-chips";
      for (const key of ["accent", "surface", "text"]) {
        const chip = document.createElement("i");
        chip.style.background = theme.colors[key];
        chips.appendChild(chip);
      }
      thumb.appendChild(chips);
      const meta = document.createElement("span");
      meta.className = "cds-card-meta";
      const name = document.createElement("span");
      name.className = "cds-card-name";
      name.textContent = theme.name;
      const badges = document.createElement("span");
      badges.className = "cds-card-badges";
      if (theme.builtin) badges.appendChild(Object.assign(document.createElement("em"), { textContent: "内置" }));
      if (theme.id === selectedId) badges.appendChild(Object.assign(document.createElement("em"), { textContent: "当前", className: "cds-badge-current" }));
      meta.append(name, badges);
      card.append(thumb, meta);
      card.addEventListener("click", () => selectTheme(theme));
      cards.appendChild(card);
    }
    emptyHint.hidden = themes.some((theme) => !theme.builtin);
  }

  // ---------- 导入（带确认预览） ----------
  const importConfirm = document.createElement("div");
  importConfirm.className = "cds-import";
  importConfirm.hidden = true;
  const showImportConfirm = async (theme) => {
    importConfirm.textContent = "";
    const box = document.createElement("div");
    box.className = "cds-import-box";
    const thumb = document.createElement("div");
    thumb.className = "cds-import-thumb";
    thumb.style.background = cardThumbBackground(theme);
    const info = document.createElement("div");
    info.className = "cds-import-info";
    const title = document.createElement("strong");
    title.textContent = theme.name;
    const idLine = document.createElement("code");
    idLine.textContent = theme.id;
    const note = document.createElement("p");
    let conflict = false;
    if (findPreset(theme.id)) {
      theme.id = makeThemeId(theme.name);
      note.textContent = "与内置主题重名，将以新 ID 导入。";
    } else if (await getTheme(theme.id)) {
      conflict = true;
      note.textContent = "已存在同 ID 皮肤：可覆盖，或保留两者。";
    } else {
      note.textContent = "确认后导入并立即应用。";
    }
    info.append(title, idLine, note);
    const actions = document.createElement("div");
    actions.className = "cds-actions";
    const importAs = async (finalTheme) => {
      importConfirm.hidden = true;
      await putTheme(exportableTheme(finalTheme));
      await selectTheme(finalTheme, { skipDirtyCheck: true });
      showToast("已导入皮肤");
    };
    const ok = cdsButton("确认导入", true);
    ok.addEventListener("click", () => importAs(theme));
    actions.append(ok);
    if (conflict) {
      const keepBoth = cdsButton("保留两者");
      keepBoth.addEventListener("click", () => importAs({ ...theme, id: makeThemeId(theme.name) }));
      actions.append(keepBoth);
    }
    const cancel = cdsButton("取消");
    cancel.addEventListener("click", () => { importConfirm.hidden = true; });
    actions.append(cancel);
    box.append(thumb, info, actions);
    importConfirm.appendChild(box);
    importConfirm.hidden = false;
  };
  const importThemeText = async (text) => {
    try {
      const raw = JSON.parse(text);
      if (![1, 2, 3].includes(raw.schemaVersion)) throw new Error("仅支持 schemaVersion 1 / 2 / 3");
      const theme = normalizeTheme(raw);
      if (!theme.id) throw new Error("主题配置缺少合法 id");
      await showImportConfirm(theme);
    } catch (error) {
      alert("主题导入失败：" + error.message);
    }
  };
  const importThemeFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => importThemeText(reader.result);
    reader.readAsText(file);
  };
  configInput.addEventListener("change", () => {
    const file = configInput.files && configInput.files[0];
    if (file) importThemeFile(file);
    configInput.value = "";
  });

  // 拖拽导入：图片文件 → 新建皮肤；JSON → 导入流程
  const createThemeFromImage = async (dataUrl, palette, name) => {
    const theme = normalizeTheme({
      id: makeThemeId(name),
      name: name || "我的皮肤",
      background: dataUrl,
      colors: palette || undefined
    });
    await putTheme(exportableTheme(theme));
    await selectTheme(theme);
    showToast(palette ? "已创建新皮肤 · 已按图片自动取色" : "已创建新皮肤");
  };
  panel.addEventListener("dragover", (event) => {
    event.preventDefault();
    panel.classList.add("cds-dropping");
  });
  panel.addEventListener("dragleave", () => panel.classList.remove("cds-dropping"));
  panel.addEventListener("drop", async (event) => {
    event.preventDefault();
    panel.classList.remove("cds-dropping");
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    const baseName = file.name.replace(/\.[^.]+$/, "");
    if (/\.json$/i.test(file.name) || file.type === "application/json") {
      importThemeFile(file);
    } else if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
      try {
        const { dataUrl, palette } = await compressImage(file);
        await createThemeFromImage(dataUrl, palette, baseName);
      } catch (error) {
        alert("图片处理失败：" + error.message);
      }
    } else {
      showToast("支持拖入图片（png/jpg/webp）或主题 JSON");
    }
  });

  // ---------- 面板骨架 ----------
  const header = document.createElement("header");
  header.className = "cds-header";
  const headline = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "Codex 皮肤管理器";
  const subtitle = document.createElement("p");
  subtitle.textContent = "上传背景、实时预览并管理本地皮肤";
  headline.append(title, subtitle);
  const headerActions = document.createElement("div");
  headerActions.className = "cds-header-actions";
  const pauseLabel = document.createElement("label");
  pauseLabel.className = "cds-pause";
  const pauseSwitch = document.createElement("input");
  pauseSwitch.type = "checkbox";
  const pauseText = document.createElement("span");
  pauseSwitch.addEventListener("change", () => setPaused(!pauseSwitch.checked));
  pauseLabel.append(pauseSwitch, pauseText);
  const importButton = cdsButton("导入主题");
  importButton.addEventListener("click", () => { configInput.value = ""; configInput.click(); });
  const closeButton = cdsButton("✕");
  closeButton.classList.add("cds-close");
  closeButton.setAttribute("aria-label", "关闭皮肤管理器");
  headerActions.append(pauseLabel, importButton, closeButton);
  header.append(headline, headerActions);

  const body = document.createElement("div");
  body.className = "cds-body";
  body.append(library, editor.el);
  panel.append(header, body, importConfirm, toast, backgroundInput, configInput);

  const hidePanel = () => { panel.hidden = true; backdrop.hidden = true; };
  const closePanel = () => {
    if (panel.hidden) return;
    if (editor.isDirty()) {
      editor.revert();
      showToast("已还原未保存的修改");
      setTimeout(hidePanel, 600);
      return;
    }
    hidePanel();
  };
  closeButton.addEventListener("click", closePanel);
  backdrop.addEventListener("click", closePanel);
  trigger.addEventListener("click", () => {
    if (panel.hidden) { panel.hidden = false; backdrop.hidden = false; refresh(); }
    else closePanel();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) closePanel();
  });

  document.body.append(backdrop, trigger, panel);

  // ---------- 自愈：Codex 重绘 DOM 时恢复注入元素 ----------
  const keepAlive = new MutationObserver(() => {
    if (document.head && !baseStyle.isConnected) document.head.append(baseStyle, overrideStyle, managerStyle);
    if (document.body && !trigger.isConnected) document.body.append(backdrop, trigger, panel);
  });
  keepAlive.observe(document.documentElement, { childList: true, subtree: false });
  if (document.body) keepAlive.observe(document.body, { childList: true });

  // ---------- 状态 ----------
  async function refresh() {
    const id = currentThemeId();
    const theme = (await findTheme(id)) || presetThemes[0];
    // 异步读库期间用户已切换主题：放弃这次刷新，避免旧结果覆盖新选择。
    if (currentThemeId() !== id) return;
    setCurrentThemeId(theme.id);
    lastApplied = theme;
    overrideStyle.textContent = themeCss(theme);
    applyExtras(theme);
    setPaused(isPaused());
    editor.load(theme);
    await renderLibrary();
  }
  const state = () => ({
    installed: true,
    active: !baseStyle.disabled,
    menu: true,
    skinManager: true,
    selectedId: currentThemeId()
  });

  window.__CODEX_DOLL_SKIN_MANAGER__ = { refresh, state, applyTheme: (theme) => selectTheme(normalizeTheme(theme), { skipDirtyCheck: true }) };
  await refresh();
  return state();
}

function boot() {
  if (window.__CODEX_DOLL_SKIN_BOOTING__) return window.__CODEX_DOLL_SKIN_BOOTING__;
  window.__CODEX_DOLL_SKIN_BOOTING__ = new Promise((resolve) => {
    const start = () => {
      openDb()
        .then(init)
        .then(resolve)
        .catch((error) => {
          console.error("Codex Doll Skin 启动失败:", error);
          resolve({ installed: false, error: String((error && error.message) || error) });
        });
    };
    const wait = () => {
      if (document.head && document.body) start();
      else requestAnimationFrame(wait);
    };
    wait();
  });
  return window.__CODEX_DOLL_SKIN_BOOTING__;
}

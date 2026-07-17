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
    for (const id of ["codex-doll-skin-chrome", "codex-doll-skin-statusbar"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = paused ? "none" : "";
    }
    const chromeStyle = document.getElementById("codex-doll-chrome-style");
    if (chromeStyle) chromeStyle.disabled = paused;
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
    const accent = theme.colors.accent;
    if (kind === "none" || reducedMotion()) { stopParticles(); return; }
    if (particlesState && particlesState.kind === kind && particlesState.accent === accent) return;
    stopParticles();
    const root = document.getElementById("root");
    if (!root) return;
    const canvas = document.createElement("canvas");
    canvas.id = "codex-doll-skin-particles";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none";
    root.appendChild(canvas);
    const context = canvas.getContext("2d");
    const rising = kind === "neon";
    const still = kind === "stardust";
    const spawn = (edge) => ({
      x: Math.random(),
      y: edge ? (rising ? 1.05 : -0.05) : Math.random(),
      size: still ? 1.5 + Math.random() * 2.5 : (kind === "neon" ? 1.5 + Math.random() * 2.2 : 2.5 + Math.random() * 4),
      vx: kind === "sakura" ? -(0.2 + Math.random() * 0.5) : (Math.random() - 0.5) * (still ? 0.05 : 0.3),
      vy: rising ? -(0.15 + Math.random() * 0.35) : (still ? 0 : 0.35 + Math.random() * 0.75),
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.03,
      phase: Math.random() * Math.PI * 2
    });
    const items = Array.from({ length: kind === "neon" ? 34 : 26 }, () => spawn(false));
    const state = { canvas, kind, accent, raf: 0 };
    const frame = () => {
      if (!canvas.isConnected) return;
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }
      const { width, height } = canvas;
      const now = performance.now() / 1000;
      context.clearRect(0, 0, width, height);
      for (const item of items) {
        item.x += item.vx / 900;
        item.y += item.vy / 900;
        item.rotation += item.spin;
        if (item.y > 1.05 || item.y < -0.05 || item.x < -0.05 || item.x > 1.05) {
          Object.assign(item, spawn(true), still ? { y: Math.random() } : null, { x: Math.random() * 1.05 });
        }
        context.save();
        context.translate(item.x * width, item.y * height);
        if (kind === "sakura") {
          context.rotate(item.rotation);
          context.fillStyle = "rgba(244,177,199,.72)";
          context.beginPath();
          context.ellipse(0, 0, item.size, item.size * 0.62, 0, 0, Math.PI * 2);
          context.fill();
        } else if (kind === "snow") {
          context.fillStyle = "rgba(255,255,255,.8)";
          context.beginPath();
          context.arc(0, 0, item.size * 0.55, 0, Math.PI * 2);
          context.fill();
        } else if (kind === "neon") {
          // 霓虹光尘：强调色光点上浮 + 呼吸透明度 + 发光
          const pulse = .35 + .35 * Math.sin(now * 1.4 + item.phase);
          context.globalAlpha = pulse;
          context.shadowBlur = 8;
          context.shadowColor = accent;
          context.fillStyle = accent;
          context.beginPath();
          context.arc(0, 0, item.size, 0, Math.PI * 2);
          context.fill();
        } else {
          // 星尘：原地闪烁的小四角星
          const twinkle = .25 + .55 * Math.abs(Math.sin(now * 1.8 + item.phase));
          context.globalAlpha = twinkle;
          context.rotate(item.rotation);
          context.fillStyle = "#ffffff";
          context.beginPath();
          for (let i = 0; i < 8; i += 1) {
            const radius = i % 2 === 0 ? item.size * 1.6 : item.size * 0.55;
            const angle = i * Math.PI / 4;
            if (i === 0) context.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
            else context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
          }
          context.closePath();
          context.fill();
        }
        context.restore();
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
      state.raf = requestAnimationFrame(frame);
    };
    particlesState = state;
    frame(); // 同步画首帧：后台/最小化时 rAF 不触发，至少保证有静态画面
  };

  // 按钮样式来自全局设置（getTriggerConfig），刻意不读 theme.trigger：换皮肤按钮保持一致
  // ---------- 互动动效：输入火花 + 列表进入（页面内纯渲染，无任何网络/数据行为） ----------
  let fxConfig = { typingFx: "none", listFx: "none", accent: "#76506f" };
  let fxCanvas = null;
  let fxContext = null;
  let fxParticles = [];
  let fxRaf = 0;

  const ensureFxCanvas = () => {
    if (fxCanvas && fxCanvas.isConnected) return;
    fxCanvas = document.createElement("canvas");
    fxCanvas.id = "codex-doll-skin-fx";
    fxCanvas.setAttribute("aria-hidden", "true");
    fxCanvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:30;pointer-events:none";
    document.body.appendChild(fxCanvas);
    fxContext = fxCanvas.getContext("2d");
  };

  const fxLoop = () => {
    if (!fxCanvas) { fxRaf = 0; return; }
    if (fxCanvas.width !== fxCanvas.clientWidth || fxCanvas.height !== fxCanvas.clientHeight) {
      fxCanvas.width = fxCanvas.clientWidth || innerWidth;
      fxCanvas.height = fxCanvas.clientHeight || innerHeight;
    }
    fxContext.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    const now = performance.now();
    fxParticles = fxParticles.filter((p) => now - p.born < p.life);
    for (const p of fxParticles) {
      const t = (now - p.born) / p.life;
      const x = p.x + p.vx * t * 60;
      const y = p.y + p.vy * t * 60 + 40 * t * t;
      fxContext.globalAlpha = 1 - t;
      fxContext.save();
      fxContext.translate(x, y);
      fxContext.rotate(p.rot + t * p.spin);
      fxContext.fillStyle = p.color;
      fxContext.beginPath();
      if (p.kind === "petal") {
        fxContext.ellipse(0, 0, p.size, p.size * .6, 0, 0, Math.PI * 2);
      } else {
        for (let i = 0; i < 8; i += 1) {
          const radius = i % 2 === 0 ? p.size : p.size * .38;
          const angle = i * Math.PI / 4;
          if (i === 0) fxContext.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
          else fxContext.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        fxContext.closePath();
      }
      fxContext.fill();
      fxContext.restore();
    }
    fxContext.globalAlpha = 1;
    if (fxParticles.length) fxRaf = requestAnimationFrame(fxLoop);
    else { fxRaf = 0; fxCanvas.remove(); fxCanvas = null; }
  };

  const spawnBurst = (x, y, count, big) => {
    if (fxConfig.typingFx === "none" || reducedMotion()) return;
    ensureFxCanvas();
    const petal = fxConfig.typingFx === "petal";
    const colors = petal ? ["#f4b1c7", "#f8cdd9", fxConfig.accent] : [fxConfig.accent, "#ffd76e", "#ffffff"];
    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI / 2 + (Math.random() - .5) * (big ? Math.PI : 1.6);
      const speed = (big ? 2.2 : 1.2) + Math.random() * (big ? 2.4 : 1.2);
      fxParticles.push({
        kind: petal ? "petal" : "spark",
        x: x + (Math.random() - .5) * 24,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: (big ? 4 : 3) + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI,
        spin: (Math.random() - .5) * 4,
        born: performance.now(),
        life: 550 + Math.random() * 350
      });
    }
    if (fxParticles.length > 120) fxParticles.splice(0, fxParticles.length - 120);
    if (!fxRaf) fxRaf = requestAnimationFrame(fxLoop);
  };

  let lastTypeBurst = 0;
  const isComposerInput = (el) => el && (el.tagName === "TEXTAREA" || el.isContentEditable) &&
    el.closest && el.closest('.composer-surface-chrome, [class*="composer"]');
  document.addEventListener("keydown", (event) => {
    if (fxConfig.typingFx === "none" || reducedMotion()) return;
    const target = event.target;
    if (!isComposerInput(target)) return;
    const now = performance.now();
    const isEnter = event.key === "Enter" && !event.shiftKey;
    if (!isEnter && now - lastTypeBurst < 80) return;
    lastTypeBurst = now;
    const rect = target.getBoundingClientRect();
    const textLength = (target.value !== undefined ? target.value : target.textContent || "").length;
    const x = rect.left + Math.min(rect.width - 16, 24 + Math.min(textLength * 7, rect.width - 48));
    spawnBurst(x, rect.top + 10, isEnter ? 18 : 4, isEnter);
  }, true);

  let listObserver = null;
  const applyListFx = () => {
    if (fxConfig.listFx === "slide" && !reducedMotion()) {
      if (listObserver) return;
      listObserver = new MutationObserver((mutations) => {
        let budget = 6;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (budget <= 0) return;
            if (node.nodeType !== 1) continue;
            if (node.id && node.id.startsWith("codex-doll")) continue;
            if (node.closest && node.closest("#codex-doll-skin-manager,#codex-doll-skin-sidepanel,#codex-doll-skin-chrome")) continue;
            const rect = node.getBoundingClientRect();
            if (rect.height < 24 || rect.width < 120) continue;
            budget -= 1;
            try {
              node.animate(
                [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "translateY(0)" }],
                { duration: 260, easing: "cubic-bezier(.2,.7,.3,1)" }
              );
            } catch {}
          }
        }
      });
      const host = document.querySelector(".app-shell-main-content-viewport") || document.getElementById("root");
      if (host) listObserver.observe(host, { childList: true, subtree: true });
    } else if (listObserver) {
      listObserver.disconnect();
      listObserver = null;
    }
  };

  const applyInteractionFx = (theme) => {
    fxConfig = { typingFx: theme.effects.typingFx, listFx: theme.effects.listFx, accent: theme.colors.accent };
    applyListFx();
    if (fxConfig.typingFx === "none") fxParticles = [];
  };

  // AI 工作反馈：轮询"停止"按钮是否存在，切换 documentElement 的工作标记（CSS 负责视觉）
  let workingWatcher = 0;
  let workingBar = null;
  let wasWorking = false;
  const ensureWorkingBar = () => {
    if (workingBar && workingBar.isConnected) return;
    workingBar = document.getElementById("codex-doll-working-bar") || document.createElement("div");
    workingBar.id = "codex-doll-working-bar";
    workingBar.setAttribute("aria-hidden", "true");
    if (!workingBar.isConnected) document.body.appendChild(workingBar);
  };
  const isCodexWorking = () => Boolean(
    document.querySelector('[aria-label="停止"],[aria-label="Stop"],[aria-label*="停止"],[aria-label*="Stop"]')
  );
  const startWorkingWatcher = () => {
    ensureWorkingBar();
    if (workingWatcher) return;
    workingWatcher = setInterval(() => {
      ensureWorkingBar();
      const working = isCodexWorking() && !reducedMotion() && !baseStyle.disabled;
      const flag = working ? "1" : "0";
      if (document.documentElement.dataset.codexDollWorking !== flag) {
        document.documentElement.dataset.codexDollWorking = flag;
      }
      // 工作结束瞬间：在输入框上方来一次小庆祝迸发（若配置了输入反馈）
      if (wasWorking && !working && fxConfig.typingFx !== "none" && !reducedMotion()) {
        const composer = document.querySelector(".composer-surface-chrome");
        if (composer) {
          const rect = composer.getBoundingClientRect();
          spawnBurst(rect.left + rect.width / 2, rect.top + 8, 14, true);
        }
      }
      wasWorking = working;
    }, 350);
  };

  const applyTrigger = (theme) => {
    const config = getTriggerConfig();
    trigger.textContent = config.icon;
    trigger.dataset.pos = config.position;
    trigger.dataset.autohide = config.autoHide ? "1" : "0";
    // Chrome 开启时把按钮挪进标题栏：右上角被宠物头像悬浮窗（独立原生窗口，页面 z-index 压不过）
    // 和假窗口按钮占用，需要避让
    trigger.style.top = "";
    trigger.style.right = "";
    trigger.style.bottom = "";
    trigger.style.left = "";
    trigger.style.transform = "";
    const chromeOn = theme.chrome && theme.chrome.enabled;
    if (chromeOn) {
      if (config.position === "top-right") {
        trigger.style.top = "2px";
        trigger.style.right = "146px";
      } else if (config.position === "top-center") {
        // Electron 计算拖拽区域时忽略 CSS transform：translateX(-50%) 会让 no-drag
        // 豁口偏移 15px、按钮实际位置落进标题栏拖拽区导致点击变成拖窗。改用纯 left 定位。
        trigger.style.top = "2px";
        trigger.style.left = "calc(50% - 15px)";
        trigger.style.transform = "none";
      } else if (config.position === "bottom-right" && theme.chrome.statusBar) {
        trigger.style.bottom = "32px";
      }
    }
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
    // 对 viewport（而非 frame）让位：环境信息等浮层挂在 viewport 上，只推 frame 会导致内容错位
    reserveStyle.textContent = ".app-shell-main-content-viewport{margin-right:" + (config.width + 16) + "px!important}";
    if (!panelEl) {
      panelEl = document.createElement("aside");
      panelEl.id = "codex-doll-skin-sidepanel";
      panelEl.setAttribute("aria-label", "皮肤右侧面板");
      document.body.appendChild(panelEl);
    }
    const chromeOn = theme.chrome && theme.chrome.enabled;
    const top = chromeOn ? 92 : 52;
    const bottom = chromeOn && theme.chrome.statusBar ? 40 : 14;
    const radius = "calc(8px * var(--corner-radius-scale,1.25) / 1.25)";
    const accentBorder = "1px solid color-mix(in srgb," + theme.colors.accent + " 32%,transparent)";
    panelEl.style.cssText = "position:fixed;top:" + top + "px;right:10px;bottom:" + bottom + "px;width:" + config.width + "px;z-index:9;display:flex;flex-direction:column;gap:9px;padding:11px;overflow:auto;border:" + accentBorder + ";border-radius:" + radius + ";background:color-mix(in srgb," + theme.colors.surface + " 92%,transparent);backdrop-filter:blur(14px) saturate(1.05);color:" + theme.colors.text + ";font:13px/1.55 var(--font-sans,system-ui);-webkit-app-region:no-drag";
    panelEl.textContent = "";
    const heading = (text) => {
      const el = document.createElement("strong");
      el.textContent = text;
      el.style.cssText = "font-size:13px;color:" + theme.colors.accent + ";padding:5px 8px;border-radius:" + radius + ";background:linear-gradient(180deg,color-mix(in srgb," + theme.colors.accent + " 14%,transparent),color-mix(in srgb," + theme.colors.accent + " 7%,transparent))";
      panelEl.appendChild(el);
    };
    if (config.title) heading(config.title);
    if (config.image) {
      const image = document.createElement("img");
      image.src = config.image;
      image.alt = "";
      image.style.cssText = "width:100%;border-radius:" + radius + ";object-fit:cover;border:" + accentBorder;
      panelEl.appendChild(image);
    }
    if (config.subtitle) {
      const subtitle = document.createElement("div");
      const parts = config.subtitle.split("|");
      const name = document.createElement("b");
      name.textContent = "✅ " + parts[0].trim();
      subtitle.appendChild(name);
      if (parts[1]) {
        const badge = document.createElement("em");
        badge.textContent = parts[1].trim();
        badge.style.cssText = "margin-left:7px;font-style:normal;font-size:10.5px;font-weight:700;color:#fff;padding:1px 7px;border-radius:3px;background:linear-gradient(180deg,#ffb340,#f08c1a)";
        subtitle.appendChild(badge);
      }
      panelEl.appendChild(subtitle);
    }
    if (config.card) {
      const card = document.createElement("p");
      card.textContent = config.card;
      card.style.cssText = "margin:0;padding:10px;border-radius:" + radius + ";background:#fff;border:" + accentBorder;
      panelEl.appendChild(card);
    }
    if (config.icons) {
      const iconRow = document.createElement("div");
      iconRow.style.cssText = "display:flex;gap:6px;padding:4px 2px;border-top:1px solid color-mix(in srgb," + theme.colors.accent + " 16%,transparent);border-bottom:1px solid color-mix(in srgb," + theme.colors.accent + " 16%,transparent)";
      for (const icon of [...config.icons.replace(/\s/g, "")]) {
        const cell = document.createElement("span");
        cell.textContent = icon;
        cell.style.cssText = "font-size:15px;padding:3px 6px;border-radius:4px;cursor:default";
        iconRow.appendChild(cell);
      }
      panelEl.appendChild(iconRow);
    }
    if (config.heading) heading(config.heading);
    if (config.image2) {
      const image2 = document.createElement("img");
      image2.src = config.image2;
      image2.alt = "";
      image2.style.cssText = "width:100%;border-radius:" + radius + ";object-fit:cover;border:" + accentBorder;
      panelEl.appendChild(image2);
    }
    if (config.footer) {
      const footer = document.createElement("div");
      footer.textContent = "🔍 " + config.footer;
      footer.style.cssText = "margin-top:auto;padding:7px 10px;border-radius:99px;border:" + accentBorder + ";background:#fff;color:color-mix(in srgb," + theme.colors.text + " 55%,transparent);font-size:12px";
      panelEl.appendChild(footer);
    }
  };

  // 装饰 Chrome：XP 风标题栏 + 图标工具栏 + 底部状态栏。纯装饰，保留系统拖拽。
  let chromeClockTimer = 0;
  const applyChrome = (theme) => {
    const config = theme.chrome;
    let chromeEl = document.getElementById("codex-doll-skin-chrome");
    let statusEl = document.getElementById("codex-doll-skin-statusbar");
    let reserveStyle = document.getElementById("codex-doll-chrome-style");
    clearInterval(chromeClockTimer);
    if (!config || !config.enabled) {
      if (chromeEl) chromeEl.remove();
      if (statusEl) statusEl.remove();
      if (reserveStyle) reserveStyle.remove();
      return;
    }
    const accent = theme.colors.accent;
    const headerHeight = 34 + (config.toolbar.length ? 46 : 0);
    if (!reserveStyle) {
      reserveStyle = document.createElement("style");
      reserveStyle.id = "codex-doll-chrome-style";
      document.head.appendChild(reserveStyle);
    }
    // 第一层容器用 100%（而非 100vh）让内容随 padding 收缩，否则输入框会被顶出屏幕
    reserveStyle.textContent = "#root{padding-top:" + headerHeight + "px!important;padding-bottom:" + (config.statusBar ? 26 : 0) + "px!important;box-sizing:border-box!important}#root>div{height:100%!important;min-height:0!important}";
    if (!chromeEl) {
      chromeEl = document.createElement("div");
      chromeEl.id = "codex-doll-skin-chrome";
      chromeEl.setAttribute("aria-hidden", "true");
      document.body.appendChild(chromeEl);
    }
    chromeEl.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:8;font:13px var(--font-sans,system-ui)";
    chromeEl.textContent = "";
    // 标题栏：刻意不设 -webkit-app-region:drag——Electron 的拖拽区计算对覆盖元素的
    // no-drag 豁口不可靠，会吞掉皮肤管理器按钮的点击；窗口拖拽交给下方 Codex 原生顶栏
    const titlebar = document.createElement("div");
    titlebar.style.cssText = "height:34px;display:flex;align-items:center;gap:8px;padding:0 10px 0 84px;color:#fff;font-weight:700;text-shadow:0 1px 2px rgba(0,20,60,.45);background:linear-gradient(180deg,color-mix(in srgb," + accent + " 62%,#9cc2ff) 0%," + accent + " 45%,color-mix(in srgb," + accent + " 72%,#08245e) 100%)";
    const titleIcon = document.createElement("span");
    titleIcon.textContent = theme.trigger.icon;
    titleIcon.style.cssText = "font-size:16px;font-weight:400;text-shadow:none";
    const titleText = document.createElement("span");
    titleText.textContent = config.title || document.title;
    titlebar.append(titleIcon, titleText);
    const winButtons = document.createElement("div");
    // 右侧留出 Codex 宠物/头像悬浮按钮的位置，避免重叠
    winButtons.style.cssText = "margin-left:auto;margin-right:44px;display:flex;gap:3px;-webkit-app-region:no-drag";
    for (const [glyph, bg] of [["─", "linear-gradient(180deg,#7fb1f7,#2f6fd8)"], ["□", "linear-gradient(180deg,#7fb1f7,#2f6fd8)"], ["✕", "linear-gradient(180deg,#f2937f,#d43518)"]]) {
      const button = document.createElement("span");
      button.textContent = glyph;
      button.style.cssText = "width:26px;height:22px;display:grid;place-items:center;border-radius:4px;border:1px solid rgba(255,255,255,.55);background:" + bg + ";font-size:11px;font-weight:700;cursor:default";
      winButtons.appendChild(button);
    }
    titlebar.appendChild(winButtons);
    chromeEl.appendChild(titlebar);
    // 工具栏
    if (config.toolbar.length) {
      const toolbar = document.createElement("div");
      toolbar.style.cssText = "height:46px;display:flex;align-items:center;gap:4px;padding:0 12px;background:linear-gradient(180deg,#fdfeff,color-mix(in srgb," + accent + " 14%,#fff));border-bottom:1px solid color-mix(in srgb," + accent + " 45%,transparent)";
      for (const item of config.toolbar) {
        const button = document.createElement("span");
        button.textContent = item;
        button.style.cssText = "display:flex;align-items:center;gap:5px;padding:6px 11px;border-radius:5px;color:" + theme.colors.text + ";font-size:13px;cursor:default";
        button.addEventListener("mouseenter", () => { button.style.background = "color-mix(in srgb," + accent + " 14%,transparent)"; });
        button.addEventListener("mouseleave", () => { button.style.background = "transparent"; });
        toolbar.appendChild(button);
      }
      chromeEl.appendChild(toolbar);
    }
    // 状态栏
    if (config.statusBar) {
      if (!statusEl) {
        statusEl = document.createElement("div");
        statusEl.id = "codex-doll-skin-statusbar";
        statusEl.setAttribute("aria-hidden", "true");
        document.body.appendChild(statusEl);
      }
      statusEl.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:26px;z-index:8;display:flex;align-items:center;gap:14px;padding:0 12px;color:#fff;font:12px var(--font-sans,system-ui);background:linear-gradient(180deg,color-mix(in srgb," + accent + " 68%,#8cb8ff)," + accent + " 60%,color-mix(in srgb," + accent + " 74%,#0a2a66))";
      const left = document.createElement("span");
      left.textContent = "🛡 安全 ✓";
      const right = document.createElement("span");
      right.style.marginLeft = "auto";
      const clock = document.createElement("span");
      const tick = () => {
        const now = new Date();
        clock.textContent = "📶 " + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      };
      tick();
      chromeClockTimer = setInterval(tick, 30000);
      right.appendChild(clock);
      statusEl.textContent = "";
      statusEl.append(left, right);
    } else if (statusEl) {
      statusEl.remove();
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
    applyInteractionFx(theme);
    applyTrigger(theme);
    applyBrand(theme);
    applySlideshow(theme);
    applyChrome(theme);
    applySidePanel(theme);
    startWorkingWatcher();
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
    onTriggerChange: () => { if (lastApplied) applyTrigger(lastApplied); },
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
  // 云端同步：页面保持零外联——只写 localStorage 标记，由守护进程轮询后在 Node 侧拉取
  const cloudSyncButton = cdsButton("☁ 同步云端主题");
  cloudSyncButton.addEventListener("click", () => {
    localStorage.setItem("codexDollSyncRequest", String(Date.now()));
    showToast("已请求同步，正在从 GitHub 拉取主题…");
  });
  library.append(libraryTitle, searchInput, cards, emptyHint, newButton, cloudSyncButton);

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
  subtitle.textContent = "上传背景、实时预览并管理本地皮肤 · v" + (typeof VERSION === "string" ? VERSION : "?");
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

  window.__CODEX_DOLL_SKIN_MANAGER__ = { refresh, state, notify: showToast, applyTheme: (theme) => selectTheme(normalizeTheme(theme), { skipDirtyCheck: true }) };
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

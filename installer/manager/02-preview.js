// 迷你实时预览：按 Codex 窗口比例的抽象 mock，与真实窗口共用 backgroundLayerValue 公式。
function createMiniPreview(handlers) {
  const el = document.createElement("div");
  el.className = "cds-pv";
  el.title = "按住拖拽调整背景位置";

  const bg = document.createElement("div");
  bg.className = "cds-pv-bg";

  const ui = document.createElement("div");
  ui.className = "cds-pv-ui";
  const sidebar = document.createElement("div");
  sidebar.className = "cds-pv-sidebar";
  for (let i = 0; i < 4; i += 1) {
    const item = document.createElement("i");
    if (i === 1) item.className = "cds-pv-active";
    sidebar.appendChild(item);
  }
  const main = document.createElement("div");
  main.className = "cds-pv-main";
  const cards = document.createElement("div");
  cards.className = "cds-pv-cards";
  for (let i = 0; i < 4; i += 1) cards.appendChild(document.createElement("b"));
  const sample = document.createElement("p");
  sample.className = "cds-pv-sample";
  sample.textContent = "示例正文：拖动遮罩滑杆，确认这行文字始终清晰可读。";
  const composer = document.createElement("div");
  composer.className = "cds-pv-composer";
  composer.textContent = "要求后续变更";
  main.append(cards, sample, composer);
  ui.append(sidebar, main);

  const zones = document.createElement("div");
  zones.className = "cds-pv-zones";
  zones.hidden = true;
  for (const zone of SAFE_ZONES) {
    const box = document.createElement("div");
    box.className = "cds-pv-zone cds-pv-zone-" + zone.key;
    box.style.left = zone.x + "%";
    box.style.top = zone.y + "%";
    box.style.width = zone.w + "%";
    box.style.height = zone.h + "%";
    const label = document.createElement("span");
    label.textContent = zone.label;
    box.appendChild(label);
    zones.appendChild(box);
  }

  el.append(bg, ui, zones);

  // 拖拽平移背景：指针向右拖 → 画面右移（background-position x 减小）。
  let dragging = null;
  el.addEventListener("pointerdown", (event) => {
    if (!handlers.canDrag()) return;
    dragging = { startX: event.clientX, startY: event.clientY, ...handlers.getPosition() };
    el.classList.add("cds-pv-dragging");
    el.setPointerCapture(event.pointerId);
  });
  el.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, dragging.x - (event.clientX - dragging.startX) / rect.width * 100));
    const y = Math.max(0, Math.min(100, dragging.y - (event.clientY - dragging.startY) / rect.height * 100));
    handlers.onPosition(Math.round(x), Math.round(y));
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = null;
    el.classList.remove("cds-pv-dragging");
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
  };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);

  return {
    el,
    setZonesVisible(visible) { zones.hidden = !visible; },
    update(theme) {
      const layer = backgroundLayerValue(theme);
      bg.style.background = layer || "linear-gradient(135deg,#f9e8ed,#fff)";
      bg.style.filter = filterValue(theme.filters);
      el.style.setProperty("--cds-accent", theme.colors.accent);
      el.style.setProperty("--cds-surface", theme.colors.surface);
      el.style.setProperty("--cds-text", theme.colors.text);
      // v3 形状/布局/字体旋钮同步到 mock（与真实窗口同一批参数）
      const shape = theme.shape || {};
      const radiusScale = shape.radiusScale === null || shape.radiusScale === undefined ? 1.25 : shape.radiusScale;
      el.style.setProperty("--cds-rs", String(radiusScale / 1.25));
      const sidebarWidth = (theme.layout && theme.layout.sidebarWidth) || 275;
      sidebar.style.width = Math.min(30, 18 * sidebarWidth / 275) + "%";
      const typography = theme.typography || {};
      sample.style.fontFamily = typography.sans || "";
      sample.style.fontSize = (10.5 * ((typography.chatFontSize || 14) / 14)).toFixed(1) + "px";
      el.classList.toggle("cds-pv-videomode", isVideoBackground(theme.background));
      el.classList.toggle("cds-pv-draggable", handlers.canDrag());
    }
  };
}

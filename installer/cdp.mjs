import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildThemeManagerSource, embedAssets } from "./theme-manager.mjs";

export async function waitForPage(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page" && target.url.startsWith("app://"));
      if (page) return page;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`No Codex page appeared on localhost:${port}.`);
}

export async function listPages(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await response.json();
  return targets.filter((target) => target.type === "page" && target.url.startsWith("app://"));
}

export function isMainCodexPage(target) {
  return Boolean(
    target &&
    target.type === "page" &&
    typeof target.url === "string" &&
    target.url.startsWith("app://") &&
    !target.url.includes("avatar-overlay") &&
    !target.url.includes("avatar-overlay-native")
  );
}

export function connect(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("Unable to connect to Codex DevTools.")), { once: true });
  });
  return {
    async send(method, params = {}) {
      await opened;
      const id = nextId++;
      const result = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`DevTools command timed out: ${method}`));
        }, 8_000);
        pending.set(id, {
          resolve(value) { clearTimeout(timer); resolve(value); },
          reject(error) { clearTimeout(timer); reject(error); },
        });
      });
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    },
    close() { socket.close(); },
  };
}

export async function loadSkinCss(rootUrl) {
  const css = await readFile(new URL("theme/skin.css", rootUrl), "utf8");
  return embedAssets(css, new URL("public/assets/", rootUrl));
}

export async function injectSkin(client, css) {
  const expression = `(() => {
    const id = "codex-doll-skin-runtime";
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = ${JSON.stringify(css)};
    document.documentElement.dataset.codexDollSkin = "active";
    return { injected: true, url: location.href, title: document.title };
  })()`;
  const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error("Codex rejected the theme payload.");
  return response.result.value;
}

export async function installPersistentSkin(client, css) {
  const source = await buildThemeManagerSource(css);
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source });
  const response = await client.send("Runtime.evaluate", {
    expression: source,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) throw new Error("Codex rejected the skin manager payload.");
  return response.result.value;
}

export async function evaluateSkinState(client) {
  const response = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const style = document.getElementById("codex-doll-skin-runtime");
      return { installed: Boolean(style), active: Boolean(style && !style.disabled), menu: Boolean(document.getElementById("codex-doll-skin-menu")), skinManager: Boolean(document.getElementById("codex-doll-skin-manager")) };
    })()`,
    returnByValue: true,
  });
  return response.result.value;
}

export async function setSkinPaused(client, paused) {
  const response = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const style = document.getElementById("codex-doll-skin-runtime");
      if (!style) return false;
      style.disabled = ${paused ? "true" : "false"};
      const backgroundStyle = document.getElementById("codex-doll-custom-background");
      if (backgroundStyle) backgroundStyle.disabled = ${paused ? "true" : "false"};
      const overrideStyle = document.getElementById("codex-doll-theme-override");
      if (overrideStyle) overrideStyle.disabled = ${paused ? "true" : "false"};
      localStorage.setItem("codexDollSkinPaused", ${JSON.stringify(paused ? "1" : "0")});
      const menu = document.getElementById("codex-doll-skin-menu");
      if (menu) menu.style.opacity = ${paused ? '".42"' : '"1"'};
      return true;
    })()`,
    returnByValue: true,
  });
  return response.result.value;
}

export function workspaceRootUrl() {
  return new URL("../", import.meta.url);
}

export function workspaceRootPath() {
  return fileURLToPath(workspaceRootUrl());
}

export { pathToFileURL };

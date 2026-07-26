import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const port = Number(process.env.DOLL_SKIN_TEST_PORT || 9237);
const agentSource = await readFile(new URL("../src-tauri/resources/skin-agent.js", import.meta.url), "utf8");
const presets = JSON.parse(await readFile(new URL("../installer/manager/presets.json", import.meta.url), "utf8"));

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function targetList() {
  let lastError = new Error("DevTools target query failed");
  for (const host of ["127.0.0.1", "[::1]"]) {
    try {
      const response = await fetch(`http://${host}:${port}/json/list`);
      if (!response.ok) throw new Error(`DevTools target query failed: ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function waitForTarget(timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const targets = await targetList();
      const target = targets.find((item) => item.type === "page"
        && item.url.startsWith("app://")
        && !item.url.includes("avatar-overlay")
        && item.webSocketDebuggerUrl);
      if (target) return target;
    } catch {}
    await sleep(200);
  }
  throw new Error(`No isolated Codex page found on localhost:${port}`);
}

async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const rejectPending = (error) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  };
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    if (message.error) reject(new Error(message.error.message || "CDP error"));
    else resolve(message.result || {});
  });
  socket.addEventListener("close", () => rejectPending(new Error("CDP connection closed")));
  socket.addEventListener("error", () => rejectPending(new Error("CDP connection failed")));
  return {
    close: () => socket.close(),
    call(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP command timed out: ${method}`));
        }, 15_000);
        pending.set(id, { resolve, reject, timer });
        try {
          socket.send(JSON.stringify({ id, method, params }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        }
      });
    },
  };
}

function makeTheme(id, accent, surface) {
  return {
    ...structuredClone(presets[0]),
    id,
    name: `Integration ${id}`,
    background: null,
    preview: null,
    colors: { accent, surface, text: "#18202a" },
    effects: {
      ...presets[0].effects,
      particles: "none",
      typingFx: "none",
      listFx: "none",
      bgMotion: "none",
    },
  };
}

function expressionFor(theme) {
  return `${agentSource};\n(async()=>{await Promise.resolve(window.__CODEX_DOLL_SKIN_BOOTING__);const trigger=document.getElementById('codex-doll-skin-menu');if(trigger)trigger.hidden=true;return window.__CODEX_DOLL_SKIN_MANAGER__.applyTheme(${JSON.stringify(theme)});})()`;
}

function assertEvaluationSucceeded(result) {
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(description || "Runtime.evaluate failed");
  }
  return result;
}

async function inspect(runtime) {
  const result = assertEvaluationSucceeded(await runtime.call("Runtime.evaluate", {
    expression: `({
      runtime: Boolean(document.getElementById('codex-doll-skin-runtime')),
      override: Boolean(document.getElementById('codex-doll-theme-override')),
      css: document.getElementById('codex-doll-theme-override')?.textContent || '',
      triggerHidden: document.getElementById('codex-doll-skin-menu')?.hidden === true,
      selectedId: window.__CODEX_DOLL_SKIN_MANAGER__?.state()?.selectedId || null,
      external: window.__DOLL_SKIN_EXTERNAL__ === true
    })`,
    returnByValue: true,
  }));
  return result.result?.value;
}

async function registerAndApply(runtime, theme) {
  const expression = expressionFor(theme);
  const registered = await runtime.call("Page.addScriptToEvaluateOnNewDocument", { source: expression });
  try {
    assertEvaluationSucceeded(await runtime.call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }));
  } catch (error) {
    await runtime.call("Page.removeScriptToEvaluateOnNewDocument", { identifier: registered.identifier });
    throw error;
  }
  return registered.identifier;
}

async function probeExpectedTheme(expectedId, expectedAccent, reload = false) {
  let reloaded = false;
  const deadline = Date.now() + 25_000;
  let latest = null;
  while (Date.now() < deadline) {
    let runtime;
    try {
      const target = await waitForTarget(3000);
      runtime = await connect(target);
      await runtime.call("Runtime.enable");
      if (reload && !reloaded) {
        await runtime.call("Page.enable");
        await runtime.call("Page.reload", { ignoreCache: true });
        reloaded = true;
        runtime.close();
        await sleep(1200);
        continue;
      }
      latest = await inspect(runtime);
      runtime.close();
      if (latest?.selectedId === expectedId && (!expectedAccent || latest.css.toLowerCase().includes(expectedAccent.toLowerCase()))) {
        console.log(JSON.stringify({ ok: true, port, expectedId, expectedAccent, reloaded, targetId: target.id }));
        return;
      }
    } catch {
      runtime?.close();
    }
    await sleep(350);
  }
  throw new Error(`Expected Studio theme was not observed: ${expectedId} ${expectedAccent}; latest=${JSON.stringify(latest)}`);
}

if (process.env.DOLL_SKIN_EXPECT_ID) {
  await probeExpectedTheme(
    process.env.DOLL_SKIN_EXPECT_ID,
    process.env.DOLL_SKIN_EXPECT_ACCENT || "",
    process.env.DOLL_SKIN_RELOAD === "1",
  );
  process.exit(0);
}

const firstTheme = makeTheme("integration-first", "#ff2d55", "#fff4f7");
const secondTheme = makeTheme("integration-second", "#19a974", "#f1fff9");
console.log("[isolated] waiting for Codex target");
let target = await waitForTarget();
let runtime = await connect(target);
await runtime.call("Page.enable");
await runtime.call("Runtime.enable");

console.log("[isolated] applying first theme");
await registerAndApply(runtime, firstTheme);
let state = await inspect(runtime);
assert.equal(state.runtime, true);
assert.equal(state.override, true);
assert.equal(state.triggerHidden, true);
assert.equal(state.external, true);
assert.equal(state.selectedId, firstTheme.id);
assert.match(state.css, /#ff2d55/i);

const secondRuntime = await connect(target);
await secondRuntime.call("Page.enable");
await secondRuntime.call("Runtime.enable");
console.log("[isolated] applying replacement theme");
const secondIdentifier = await registerAndApply(secondRuntime, secondTheme);
runtime.close();
runtime = secondRuntime;
await sleep(350);
state = await inspect(runtime);
assert.equal(state.selectedId, secondTheme.id, "external re-entry must not restore the old local theme");
assert.match(state.css, /#19a974/i);

const invalid = await runtime.call("Runtime.evaluate", {
  expression: "(()=>{throw new Error('DOLL_SKIN_TEST_ERROR')})()",
  returnByValue: true,
});
assert.ok(invalid.exceptionDetails, "CDP JavaScript exceptions must be surfaced to Studio");
assert.match(invalid.exceptionDetails.exception?.description || "", /DOLL_SKIN_TEST_ERROR/);

console.log("[isolated] reloading Codex page");
await runtime.call("Page.reload", { ignoreCache: true });
runtime.close();
await sleep(1500);
target = await waitForTarget();
runtime = await connect(target);
await runtime.call("Runtime.enable");
const deadline = Date.now() + 10_000;
do {
  try {
    state = await inspect(runtime);
    if (state?.selectedId === secondTheme.id && /#19a974/i.test(state.css)) break;
  } catch {}
  await sleep(200);
} while (Date.now() < deadline);

if (state?.selectedId !== secondTheme.id) {
  console.log("[isolated] repairing missing runtime after reload");
  await registerAndApply(runtime, secondTheme);
  state = await inspect(runtime);
}
assert.equal(state?.selectedId, secondTheme.id, "Studio health repair must restore the newest skin after reload");
assert.match(state.css, /#19a974/i);
assert.equal(state.triggerHidden, true);
runtime.close();

console.log(JSON.stringify({
  ok: true,
  port,
  targetId: target.id,
  persistentIdentifier: secondIdentifier,
  selectedId: state.selectedId,
  accent: secondTheme.colors.accent,
}));

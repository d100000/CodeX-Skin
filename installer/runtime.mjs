#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { connect, installPersistentSkin, isMainCodexPage, listPages, loadSkinCss, waitForPage, workspaceRootUrl } from "./cdp.mjs";

const port = Number(process.env.CODEX_SKIN_PORT || process.argv[2] || 9227);
const screenshotPath = process.env.CODEX_SKIN_SCREENSHOT;
try {
  await waitForPage(port);
  const css = await loadSkinCss(workspaceRootUrl());
  const attached = new Map();
  let lastResult = null;
  const attachAll = async () => {
    const pages = (await listPages(port)).filter(isMainCodexPage);
    for (const target of pages) {
      if (attached.has(target.id)) continue;
      const client = connect(target.webSocketDebuggerUrl);
      try {
        await client.send("Page.enable");
        await client.send("Runtime.enable");
        lastResult = await installPersistentSkin(client, css);
        attached.set(target.id, client);
      } catch (error) {
        client.close();
        console.error(`Unable to skin target ${target.id}: ${error.message}`);
      }
    }
    for (const [id, client] of attached) {
      if (!pages.some((page) => page.id === id)) {
        client.close();
        attached.delete(id);
      }
    }
    return pages;
  };
  const pages = await attachAll();
  if (screenshotPath && pages.length) {
    const main = pages.find((page) => !page.url.includes("initialRoute")) || pages[0];
    const client = attached.get(main.id);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const shot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(screenshotPath, Buffer.from(shot.data, "base64"));
  }
  console.log(JSON.stringify({ ok: true, targets: pages.map((page) => page.url), result: lastResult, screenshotPath: screenshotPath || null }, null, 2));
  // 后台自动维护：云端主题同步 + （可选）运行时自更新。失败静默，不影响换肤。
  if (!screenshotPath && process.env.CODEX_SKIN_ONCE !== "1") {
    (async () => {
      try {
        const { syncThemes, selfUpdate } = await import("./updater.mjs");
        const synced = await syncThemes(port);
        if (synced.ok && synced.pulled.length) console.log(`[updater] 云端主题已同步: ${synced.pulled.join(", ")}`);
        const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../theme/manifest.json", import.meta.url), "utf8"));
        if (manifest.updates && manifest.updates.auto) {
          const updated = await selfUpdate();
          if (updated.updated) console.log(`[updater] ${updated.localVersion} -> ${updated.remoteVersion}，重启后生效`);
        }
      } catch (error) {
        console.error(`[updater] 跳过自动维护: ${error.message}`);
      }
    })();
  }
  if (!screenshotPath && process.env.CODEX_SKIN_ONCE !== "1") {
    let consecutiveFailures = 0;
    // 面板"同步云端主题"按钮通过 localStorage 标记发请求，守护进程每 5 秒轮询一次
    let lastSyncRequest = "0";
    let syncTick = 0;
    let syncRunning = false;
    const pollSyncRequest = async () => {
      syncTick += 1;
      if (syncTick % 5 !== 0 || syncRunning || !attached.size) return;
      const client = attached.values().next().value;
      try {
        const response = await client.send("Runtime.evaluate", {
          expression: `localStorage.getItem("codexDollSyncRequest") || "0"`,
          returnByValue: true,
        });
        const request = response.result.value;
        if (request === "0" || request === lastSyncRequest) return;
        lastSyncRequest = request;
        syncRunning = true;
        try {
          const { syncThemes } = await import("./updater.mjs");
          const result = await syncThemes(port, { notifyAlways: true });
          console.log(`[updater] 手动同步: ${JSON.stringify(result.pulled)}`);
        } catch (error) {
          await client.send("Runtime.evaluate", {
            expression: `window.__CODEX_DOLL_SKIN_MANAGER__ && window.__CODEX_DOLL_SKIN_MANAGER__.notify && window.__CODEX_DOLL_SKIN_MANAGER__.notify(${JSON.stringify("云端同步失败：")} + ${JSON.stringify(String(error?.message || ""))})`,
            returnByValue: true,
          });
        } finally {
          syncRunning = false;
        }
      } catch {}
    };
    const timer = setInterval(async () => {
      try {
        await attachAll();
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 5) stop();
        else console.error(error.message);
      }
      pollSyncRequest();
    }, 1_000);
    const stop = () => {
      clearInterval(timer);
      for (const client of attached.values()) client.close();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    await new Promise(() => {});
  } else {
    for (const client of attached.values()) client.close();
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message, port }, null, 2));
  process.exitCode = 1;
}

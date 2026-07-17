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
  if (!screenshotPath && process.env.CODEX_SKIN_ONCE !== "1") {
    let consecutiveFailures = 0;
    const timer = setInterval(async () => {
      try {
        await attachAll();
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 5) stop();
        else console.error(error.message);
      }
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

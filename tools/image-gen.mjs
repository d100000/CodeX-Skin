#!/usr/bin/env node
// 图片生成插件：POST {baseUrl}/v1/images/generations，失败自动重试（默认 3 次）。
// 凭据从环境变量或 tools/image-api.local.json（已 gitignore）读取，绝不入库。
//
// 用法：
//   node tools/image-gen.mjs --prompt "..." --out generated/foo.png [--size 1024x1024] [--retries 3]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const localConfigPath = join(dirname(fileURLToPath(import.meta.url)), "image-api.local.json");

function loadConfig() {
  let local = {};
  if (existsSync(localConfigPath)) local = JSON.parse(readFileSync(localConfigPath, "utf8"));
  const config = {
    baseUrl: process.env.IMAGE_API_BASE || local.baseUrl,
    apiKey: process.env.IMAGE_API_KEY || local.apiKey,
    model: process.env.IMAGE_API_MODEL || local.model || "gpt-image-2"
  };
  if (!config.baseUrl || !config.apiKey) {
    throw new Error("缺少凭据：设置 IMAGE_API_BASE/IMAGE_API_KEY 环境变量，或创建 tools/image-api.local.json（{baseUrl, apiKey, model}）");
  }
  return config;
}

export async function generateImage({ prompt, size = "1024x1024", retries = 3, timeoutMs = 180000 }) {
  const { baseUrl, apiKey, model } = loadConfig();
  const url = baseUrl.replace(/\/+$/, "") + "/v1/images/generations";
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, prompt, n: 1, size })
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      const payload = await response.json();
      const item = payload.data && payload.data[0];
      if (!item) throw new Error("响应缺少 data[0]: " + JSON.stringify(payload).slice(0, 300));
      if (item.b64_json) return Buffer.from(item.b64_json, "base64");
      if (item.url) {
        const image = await fetch(item.url);
        if (!image.ok) throw new Error(`下载生成图失败 HTTP ${image.status}`);
        return Buffer.from(await image.arrayBuffer());
      }
      throw new Error("data[0] 既无 b64_json 也无 url");
    } catch (error) {
      lastError = error;
      console.error(`[image-gen] 第 ${attempt}/${retries} 次失败: ${error.message}`);
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  throw new Error(`图片生成失败（已重试 ${retries} 次）: ${lastError.message}`);
}

// CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  if (!args.prompt || !args.out) {
    console.error('用法: node tools/image-gen.mjs --prompt "..." --out path.png [--size 1024x1024] [--retries 3]');
    process.exit(2);
  }
  try {
    const bytes = await generateImage({
      prompt: args.prompt,
      size: args.size || "1024x1024",
      retries: Number(args.retries || 3)
    });
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, bytes);
    console.log(JSON.stringify({ ok: true, out: args.out, bytes: bytes.length }));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exit(1);
  }
}

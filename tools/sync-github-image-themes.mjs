#!/usr/bin/env node

/**
 * Mirror the repository Image/ folder and rebuild predicted themes.
 *
 * Usage:
 *   npm run themes:sync-github
 *   npm run themes:sync-github -- --repo owner/name --ref main --prune
 *
 * GITHUB_TOKEN is optional. It raises the GitHub API rate limit and should
 * only be provided through the environment or GitHub Actions secrets.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const imageDirectory = join(root, "Image");
const manifestPath = join(root, ".cache", "github-image-sync.json");
const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const defaultRepo = process.env.GITHUB_IMAGE_REPO || "d100000/CodeX-Skin";
const defaultRef = process.env.GITHUB_IMAGE_REF || process.env.GITHUB_REF_NAME || "main";

export function parseArgs(argv = process.argv.slice(2)) {
  const options = { repo: defaultRepo, ref: defaultRef, prune: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--repo") options.repo = argv[++index];
    else if (argument === "--ref") options.ref = argv[++index];
    else if (argument === "--prune") options.prune = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`未知参数：${argument}`);
  }
  if (!options.repo || !/^[^/]+\/[^/]+$/.test(options.repo)) throw new Error("--repo 必须是 owner/repository");
  if (!options.ref) throw new Error("--ref 不能为空");
  return options;
}

function printHelp() {
  console.log(`从 GitHub Image/ 同步并生成预测主题\n\n用法：\n  npm run themes:sync-github\n  npm run themes:sync-github -- --repo owner/name --ref main --prune\n\n选项：\n  --repo <owner/name>  GitHub 仓库，默认 d100000/CodeX-Skin\n  --ref <branch/tag>   分支、标签或提交，默认 main\n  --prune              删除上次同步但已从远端移除的图片\n  --dry-run            只读取清单，不下载、不生成文件`);
}

function headers() {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "Doll-Skin-Studio-image-sync",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

async function githubJson(url) {
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 404) {
      throw new Error(`GitHub Image 目录不可访问：仓库可能是私有仓库或路径不存在。私有仓库请设置 GITHUB_TOKEN（需要 Contents: Read 权限）。`);
    }
    throw new Error(`GitHub API ${response.status}：${detail.slice(0, 240)}`);
  }
  return response.json();
}

export async function listRemoteImages({ repo, ref }) {
  const url = `https://api.github.com/repos/${repo}/contents/Image?ref=${encodeURIComponent(ref)}`;
  const entries = await githubJson(url);
  if (!Array.isArray(entries)) throw new Error("GitHub Image 路径不是目录");
  return entries
    .filter((entry) => entry.type === "file" && supportedExtensions.has(extname(entry.name).toLowerCase()))
    .map((entry) => ({ name: basename(entry.name), sha: entry.sha, size: entry.size, downloadUrl: entry.download_url }))
    .filter((entry) => entry.downloadUrl && /^https:\/\/raw\.githubusercontent\.com\//.test(entry.downloadUrl))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { repo: null, ref: null, files: {} };
    throw error;
  }
}

async function downloadImage(entry, destination) {
  const response = await fetch(entry.downloadUrl, { headers: { "User-Agent": "Doll-Skin-Studio-image-sync" } });
  if (!response.ok) throw new Error(`下载 ${entry.name} 失败：HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  return { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

async function runThemeBuilder() {
  await new Promise((resolvePromise, reject) => {
    const child = spawn("python3", [join(root, "tools", "build-image-themes.py")], { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`主题生成器退出码：${code}`)));
  });
}

export async function syncImages(options) {
  const remoteImages = await listRemoteImages(options);
  const previous = await loadManifest();
  await mkdir(imageDirectory, { recursive: true });
  const files = {};
  let downloaded = 0;
  let skipped = 0;
  for (const entry of remoteImages) {
    const destination = join(imageDirectory, entry.name);
    const previousFile = previous.files?.[entry.name];
    if (previousFile?.sha === entry.sha && await stat(destination).then(() => true).catch(() => false)) {
      files[entry.name] = entry;
      skipped += 1;
      continue;
    }
    if (options.dryRun) {
      files[entry.name] = entry;
      downloaded += 1;
      continue;
    }
    const downloadedFile = await downloadImage(entry, destination);
    files[entry.name] = { ...entry, ...downloadedFile };
    downloaded += 1;
  }
  if (options.prune && !options.dryRun) {
    for (const previousName of Object.keys(previous.files || {})) {
      if (!files[previousName]) await rm(join(imageDirectory, previousName), { force: true });
    }
  }
  if (!options.dryRun) {
    await mkdir(join(root, ".cache"), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify({ repo: options.repo, ref: options.ref, syncedAt: new Date().toISOString(), files }, null, 2)}\n`);
    await runThemeBuilder();
  }
  return { remote: remoteImages.length, downloaded, skipped, manifestPath };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  try {
    const options = parseArgs();
    if (options.help) {
      printHelp();
    } else {
      console.log(`读取 GitHub ${options.repo}/Image @ ${options.ref}`);
      const result = await syncImages(options);
      console.log(`同步完成：远端 ${result.remote} 张，下载 ${result.downloaded} 张，跳过 ${result.skipped} 张`);
    }
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

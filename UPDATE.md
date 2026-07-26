# Doll Skin Studio 自动更新发布

Studio 使用 Tauri 官方签名更新器，并从以下 GitHub Release 地址检查版本：

```text
https://github.com/d100000/CodeX-Skin/releases/latest/download/latest.json
```

## 首次配置 GitHub Secret

本机更新私钥保存在以下被 Git 忽略的目录，不要提交或公开：

```text
.release-secrets/doll-skin-updater.key
```

在 GitHub 仓库 `Settings → Secrets and variables → Actions` 新建：

- `TAURI_SIGNING_PRIVATE_KEY`：私钥文件的完整文本。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：当前密钥未设置密码，填写空字符串即可；也可以重新生成带密码的密钥后填写密码。

公钥已经写入 `src-tauri/tauri.conf.json`。更换密钥时必须同时更新应用公钥；已经发布的旧应用无法验证新密钥签出的更新包，因此不要随意更换或丢失私钥。

## 发布新版本

1. 同步更新 `package.json`、`src-tauri/Cargo.toml` 与 `src-tauri/tauri.conf.json` 的版本号。
2. 运行 `npm run release:check`。
3. 提交并推送代码。
4. 创建并推送版本标签，例如：

```bash
git tag v0.4.1
git push origin v0.4.1
```

`.github/workflows/release.yml` 会自动：

- 根据 `Image/` 重建预测主题和压缩背景；
- 运行测试；
- 构建 macOS App、DMG 和签名更新包；
- 创建 GitHub Release；
- 上传 `latest.json`，供已安装软件自动检查和安装。

图片主题也可以直接从 GitHub 同步：

```bash
npm run themes:sync-github
```

默认读取 `d100000/CodeX-Skin` 的 `Image/` 目录和 `main` 分支。可用 `--repo`、`--ref` 指定其他仓库/版本，`--prune` 清理已从远端删除的旧图片；如果仓库是私有的，必须设置具有 `Contents: Read` 权限的 `GITHUB_TOKEN`。同步完成后会自动运行图片风格、主色分析并重建预测主题。

## 本机生成签名更新包

Tauri 2 需要将私钥文本传入 `TAURI_SIGNING_PRIVATE_KEY`，本项目可在仓库根目录运行：

```bash
TAURI_SIGNING_PRIVATE_KEY="$(<.release-secrets/doll-skin-updater.key)" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
npm run app:build -- --bundles app
```

成功后会在 `src-tauri/target/release/bundle/macos/` 生成 `.app.tar.gz` 和 `.sig`。不要使用 `TAURI_SIGNING_PRIVATE_KEY_PATH`，当前 Tauri CLI 不会从该变量读取私钥。

## 手动发布（不经 CI，v0.4.0 即按此流程发布）

每次发布新版本时：

1. **同步版本号**（三处必须一致）：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
2. **更新 README.md**：“下载安装”一节的版本号与 DMG 文件名。
3. 本机构建全部产物（app + dmg + 签名更新包）：

   ```bash
   TAURI_SIGNING_PRIVATE_KEY="$(<.release-secrets/doll-skin-updater.key)" \
   TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
   npm run app:build
   ```

4. 生成 `latest.json`（`signature` 填 `.sig` 文件全文，`url` 指向本次 Release 的 `.app.tar.gz`）：

   ```json
   {
     "version": "<版本号>",
     "notes": "<更新说明>",
     "pub_date": "<ISO 时间>",
     "platforms": {
       "darwin-aarch64": {
         "signature": "<aha-codex.app.tar.gz.sig 内容>",
         "url": "https://github.com/d100000/CodeX-Skin/releases/download/v<版本号>/aha-codex.app.tar.gz"
       }
     }
   }
   ```

5. 提交代码、创建 Release 并上传四个文件：

   ```bash
   git tag v<版本号> && git push origin main --tags
   gh release create v<版本号> \
     src-tauri/target/release/bundle/dmg/aha-codex_<版本号>_aarch64.dmg \
     src-tauri/target/release/bundle/macos/aha-codex.app.tar.gz \
     src-tauri/target/release/bundle/macos/aha-codex.app.tar.gz.sig \
     src-tauri/target/release/bundle/latest.json \
     --title "aha-codex v<版本号>" --notes "<更新说明>"
   ```

6. 验证更新端点返回 200 且版本正确：

   ```bash
   curl -sL https://github.com/d100000/CodeX-Skin/releases/latest/download/latest.json
   ```

## 客户端行为

- 默认在 Studio 启动后检查一次 GitHub Release。
- 发现新版时显示版本提示，不会在用户不知情时中断工作。
- 用户确认后自动下载、验证 minisign 签名、替换 App 并重新启动。
- 可在“设置 → 版本与更新”关闭自动检查，仍可手动检查。

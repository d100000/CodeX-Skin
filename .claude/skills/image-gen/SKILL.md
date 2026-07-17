---
name: image-gen
description: 本项目统一的图片生成插件。任何需要生成图片（背景、头像、素材）的任务都必须用它，不要另写请求代码。调用 /v1/images/generations（gpt-image-2），失败自动重试 3 次。
---

# 图片生成插件

所有图片生成走这一个入口：

```bash
node tools/image-gen.mjs --prompt "英文提示词" --out generated/xxx.png [--size 1024x1024] [--retries 3]
```

- 凭据在 `tools/image-api.local.json`（已 gitignore，勿提交）或环境变量 `IMAGE_API_BASE` / `IMAGE_API_KEY` / `IMAGE_API_MODEL`。
- 失败自动重试（默认 3 次，指数退避）；返回 b64 或 URL 均可处理。
- 生成皮肤素材时：先落到 `generated/`，用 `sips` 压缩后再拷入 `public/assets/`（背景 ≤400KB，头像 ≤60KB），并遵守 `BACKGROUND_SPEC.md` 的构图规范。
- 也可作为模块使用：`import { generateImage } from "./tools/image-gen.mjs"`。

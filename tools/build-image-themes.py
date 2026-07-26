#!/usr/bin/env python3
"""Compress Image/ portraits and predict usable Doll Skin Studio themes."""

from __future__ import annotations

import colorsys
import hashlib
import json
import shutil
import subprocess
from collections import Counter
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "Image"
ASSET_DIR = ROOT / "public" / "assets"
OUTPUT_JSON = ROOT / "src" / "generated-image-themes.json"
CWEBP = shutil.which("cwebp")
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

CATEGORY_RULES = [
    ("东方古韵", ["古装", "古风", "仙侠", "新中式", "民族", "民国", "中山装", "剑客", "古典"]),
    ("奇幻梦境", ["奇幻", "梦幻", "花仙子", "公主", "二次元", "漫撕", "妖姬", "银发", "战损", "战甲"]),
    ("暗夜科技", ["科技", "霓虹", "雨夜", "暗黑", "黑色", "黑西装", "黑白", "泼墨", "冷感", "冷艳", "清冷"]),
    ("舞台戏剧", ["舞台", "亮片", "红色头发", "薄纱", "戏剧", "性感", "鎏金", "红毯"]),
    ("街头潮酷", ["街头", "皮衣", "皮夹克", "机车", "墨镜", "朋克", "高街", "潮", "叠穿", "bomber", "y2k", "千禧", "甜酷", "前卫"]),
    ("商务雅致", ["西装", "礼服", "大衣", "高领", "白衬衫", "儒雅", "贵气", "总裁", "财阀", "老钱", "斯文", "知性"]),
    ("清新自然", ["海边", "泳池", "度假", "户外", "露营", "雪山", "森系", "花园", "樱花", "春日", "清新", "港口", "运动"]),
    ("杂志时装", ["杂志", "时尚大片", "elle", "fendi", "prada", "versace", "封面", "大片"]),
    ("温柔日常", ["居家", "毛衣", "针织", "日常", "休闲", "白t", "条纹", "衬衫", "暖男", "文艺", "松弛", "甜美", "少年"]),
]


def classify_style(name: str) -> str:
    lowered = name.lower()
    for category, keywords in CATEGORY_RULES:
        if any(keyword in lowered for keyword in keywords):
            return category
    return "都市人像"


def rgb_hex(rgb: tuple[int, int, int]) -> str:
    return "#" + "".join(f"{max(0, min(255, channel)):02x}" for channel in rgb)


def mix(rgb: tuple[int, int, int], target: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(channel * (1 - amount) + target[index] * amount) for index, channel in enumerate(rgb))


def palette_label(rgb: tuple[int, int, int]) -> str:
    hue, saturation, lightness = colorsys.rgb_to_hls(*(channel / 255 for channel in rgb))
    if saturation < 0.11:
        return "雾灰中性" if lightness > 0.38 else "黑白灰阶"
    prefix = "深" if lightness < 0.32 else ""
    degree = hue * 360
    if degree < 15 or degree >= 345:
        return f"{prefix}赤红暖调"
    if degree < 42:
        return f"{prefix}琥珀橙调"
    if degree < 70:
        return f"{prefix}鎏金黄调"
    if degree < 155:
        return f"{prefix}森系绿调"
    if degree < 195:
        return f"{prefix}青瓷冷调"
    if degree < 250:
        return f"{prefix}海盐蓝调"
    if degree < 285:
        return f"{prefix}暮色紫调"
    if degree < 345:
        return f"{prefix}樱粉玫调"
    return "自然综合色"


def analyze_image(path: Path) -> dict[str, object]:
    with Image.open(path) as source:
        image = source.convert("RGB")
        image.thumbnail((96, 96), Image.Resampling.LANCZOS)
        pixels = list(image.getdata())
    average = tuple(round(sum(pixel[index] for pixel in pixels) / len(pixels)) for index in range(3))
    quantized = image.quantize(colors=10, method=Image.Quantize.MEDIANCUT).convert("RGB")
    counts = Counter(quantized.getdata())
    candidates = []
    for color, count in counts.most_common(10):
        hue, saturation, lightness = colorsys.rgb_to_hls(*(channel / 255 for channel in color))
        if 0.24 <= lightness <= 0.82:
            candidates.append((count * (0.35 + saturation), saturation, color))
    accent = max(candidates, default=(0, 0, average))[2]
    _, accent_saturation, accent_lightness = colorsys.rgb_to_hls(*(channel / 255 for channel in accent))
    if accent_lightness < 0.3 and accent_saturation >= 0.11:
        accent = mix(accent, (255, 255, 255), 0.24)
    avg_lightness = colorsys.rgb_to_hls(*(channel / 255 for channel in average))[2]
    veil = 58 if avg_lightness < 0.34 else 48 if avg_lightness < 0.62 else 38
    return {
        "accent": rgb_hex(accent),
        "surface": rgb_hex(mix(accent, (255, 255, 255), 0.93)),
        "text": rgb_hex(mix(accent, (18, 22, 30), 0.86)),
        "darkAccent": rgb_hex(mix(accent, (255, 255, 255), 0.32)),
        "darkSurface": rgb_hex(mix(accent, (10, 14, 22), 0.86)),
        "paletteLabel": palette_label(accent),
        "veil": veil,
    }


def compress_image(source: Path, destination: Path) -> None:
    if destination.exists() and destination.stat().st_mtime >= source.stat().st_mtime:
        return
    if not CWEBP:
        raise RuntimeError("未找到 cwebp。macOS 请先运行 `brew install webp`。")
    with Image.open(source) as image:
        width, height = image.size
    resize = ["-resize", "1920", "0"] if width >= height else ["-resize", "0", "1920"]
    subprocess.run(
        [CWEBP, "-quiet", "-mt", "-m", "6", "-q", "76", *resize, str(source), "-o", str(destination)],
        check=True,
    )


def theme_name(path: Path) -> str:
    value = path.stem.replace("_Codeyes背景", "").replace("Codeyes樱花背景_", "樱花 · ")
    return value.replace("_", " · ")


def build() -> list[dict[str, object]]:
    if not CWEBP:
        raise SystemExit("Missing cwebp. Install it with `brew install webp`.")
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    themes = []
    sources = sorted(
        (path for path in SOURCE_DIR.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS),
        key=lambda path: path.name,
    )
    for source in sources:
        digest = hashlib.sha1(source.name.encode("utf-8")).hexdigest()[:12]
        asset_name = f"predicted-{digest}.webp"
        compress_image(source, ASSET_DIR / asset_name)
        analysis = analyze_image(source)
        category = classify_style(source.stem)
        display_name = theme_name(source)
        particle = "none"
        if "樱花" in source.stem or "春日" in source.stem:
            particle = "sakura"
        elif "雪山" in source.stem:
            particle = "snow"
        elif category == "暗夜科技":
            particle = "neon"
        elif category == "奇幻梦境":
            particle = "stardust"
        themes.append({
            "schemaVersion": 3,
            "id": f"image-{digest}",
            "name": display_name,
            "background": f"asset://{asset_name}",
            "preview": f"asset://{asset_name}",
            "colors": {
                "accent": analysis["accent"],
                "surface": analysis["surface"],
                "text": analysis["text"],
            },
            "colorsDark": {
                "accent": analysis["darkAccent"],
                "surface": analysis["darkSurface"],
                "text": "#f5f7fb",
            },
            "layout": {
                "x": 50,
                "y": 50,
                "veil": analysis["veil"],
                "sidebarOpacity": 48,
                "veils": {"content": 18, "left": 8, "bottom": 10},
            },
            "shape": {"radiusScale": 1.3, "shadow": "default"},
            "effects": {
                "scrollbar": "slim",
                "particles": particle,
                "motion": "default",
                "typingFx": "none",
                "listFx": "slide",
                "bgMotion": "none",
                "thinkingFx": "subtle",
            },
            "brand": {"startupTint": True},
            "category": category,
            "paletteLabel": analysis["paletteLabel"],
            "tags": [source.name.split("_")[0], category, analysis["paletteLabel"], source.stem],
            "predicted": True,
            "createdAt": "2026-07-26T00:00:00.000Z",
        })
    keep_assets = {theme["background"].removeprefix("asset://") for theme in themes}
    for asset in ASSET_DIR.glob("predicted-*.webp"):
        if asset.name not in keep_assets:
            asset.unlink()
    OUTPUT_JSON.write_text(json.dumps(themes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return themes


if __name__ == "__main__":
    generated = build()
    total_bytes = sum((ASSET_DIR / theme["background"].removeprefix("asset://")).stat().st_size for theme in generated)
    print(f"Generated {len(generated)} predicted themes ({total_bytes / 1024 / 1024:.1f} MB)")

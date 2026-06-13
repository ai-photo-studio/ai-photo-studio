from __future__ import annotations

import io
import math
import os
import re

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps

DEFAULT_THRESHOLD = float(os.getenv("CLASSIFIER_THRESHOLD", "0.36"))

app = FastAPI(title="AI Photo Studio Product Classifier", version="0.1.0")

KEYWORDS: dict[str, tuple[str, ...]] = {
    "perfume": ("perfume", "fragrance", "cologne", "scent", "spray"),
    "cosmetics": ("cosmetic", "makeup", "lipstick", "foundation", "concealer", "skincare", "serum", "cream", "lotion", "beauty"),
    "shoes": ("shoe", "sneaker", "trainer", "boot", "loafer", "heel", "sandals"),
    "fashion": ("fashion", "shirt", "dress", "jacket", "trouser", "pants", "hoodie", "tshirt", "apparel", "cloth"),
    "furniture": ("furniture", "sofa", "table", "chair", "desk", "cabinet", "shelf", "bed", "stool"),
    "electronics": ("electronics", "charger", "cable", "phone", "headphone", "earbud", "speaker", "adapter", "powerbank", "watch band"),
    "food": ("food", "snack", "drink", "tea", "coffee", "spice", "sauce", "meal", "fruit", "vegetable", "honey"),
    "jewelry": ("jewelry", "jewellery", "ring", "necklace", "earring", "bracelet", "pendant"),
    "watch": ("watch", "timepiece", "smartwatch"),
    "handbag": ("handbag", "bag", "purse", "clutch", "tote"),
    "human-model": ("model", "human", "portrait", "person", "mannequin"),
    "vehicle": ("vehicle", "car", "bike", "motorcycle", "scooter", "automobile", "truck"),
}

PROFILE_BY_CATEGORY = {
    "perfume": "luxury-shadow",
    "cosmetics": "beauty-finish",
    "shoes": "shoe-catalog",
    "fashion": "fashion-studio",
    "furniture": "room-frame",
    "electronics": "tech-catalog",
    "food": "freshness",
    "jewelry": "jewelry-focus",
    "watch": "watch-focus",
    "handbag": "handbag-focus",
    "human-model": "portrait-separate",
    "vehicle": "vehicle-showroom",
    "general-product": "general-studio",
}


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        return ImageOps.exif_transpose(image)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid image file") from exc


def _aspect_ratio(image: Image.Image) -> float:
    width, height = image.size
    return width / max(1, height)


def _filename_text(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _keyword_score(text: str, category: str) -> float:
    if not text:
        return 0.0
    return sum(1.0 for keyword in KEYWORDS.get(category, ()) if keyword in text)


def _foreground_coverage(image: Image.Image) -> float:
    rgb = image.convert("RGB")
    width, height = rgb.size
    sample = max(1, min(width, height) // 12)
    corners = [
        (0, 0, sample, sample),
        (width - sample, 0, width, sample),
        (0, height - sample, sample, height),
        (width - sample, height - sample, width, height),
    ]
    samples: list[tuple[int, int, int]] = []
    for box in corners:
        samples.extend(list(rgb.crop(box).getdata()))
    if not samples:
        return 0.25

    avg = (
        sum(px[0] for px in samples) / len(samples),
        sum(px[1] for px in samples) / len(samples),
        sum(px[2] for px in samples) / len(samples),
    )

    pixels = list(rgb.getdata())
    foreground = 0
    for red, green, blue in pixels:
        distance = math.sqrt((red - avg[0]) ** 2 + (green - avg[1]) ** 2 + (blue - avg[2]) ** 2)
        if distance > 26:
            foreground += 1
    return foreground / max(1, len(pixels))


def _brightness(image: Image.Image) -> float:
    gray = image.convert("L")
    pixels = list(gray.getdata())
    return sum(pixels) / max(1, len(pixels)) / 255.0


def _saturation(image: Image.Image) -> float:
    rgb = image.convert("RGB")
    pixels = list(rgb.getdata())
    total = 0.0
    sample = pixels[:: max(1, len(pixels) // 2000)]
    for red, green, blue in sample:
        max_channel = max(red, green, blue)
        min_channel = min(red, green, blue)
        if max_channel == 0:
            continue
        total += (max_channel - min_channel) / max_channel
    return _clamp(total / max(1, len(sample)) if sample else 0.0, 0.0, 1.0)


def _score_category(image: Image.Image, file_name: str, category: str) -> float:
    text = _filename_text(file_name)
    ratio = _aspect_ratio(image)
    coverage = _foreground_coverage(image)
    bright = _brightness(image)
    saturation = _saturation(image)
    keyword = _keyword_score(text, category)

    score = 0.05 + keyword * 0.35

    if category in {"perfume", "cosmetics", "jewelry", "watch"}:
        score += max(0.0, 0.16 - abs(ratio - 0.78)) * 0.45
        score += max(0.0, 0.36 - coverage) * 0.18
        score += (1.0 - saturation) * 0.1
    elif category == "shoes":
        score += max(0.0, 1.15 - abs(ratio - 1.2)) * 0.18
        score += coverage * 0.2
    elif category in {"fashion", "human-model"}:
        score += max(0.0, 1.25 - abs(ratio - 0.9)) * 0.17
        score += coverage * 0.18
        score += saturation * 0.08
    elif category == "furniture":
        score += max(0.0, 1.55 - abs(ratio - 1.45)) * 0.16
        score += coverage * 0.15
    elif category == "electronics":
        score += max(0.0, 1.25 - abs(ratio - 1.0)) * 0.14
        score += (1.0 - bright) * 0.06
    elif category == "food":
        score += bright * 0.12
        score += saturation * 0.14
        score += max(0.0, 0.45 - coverage) * 0.1
    elif category == "handbag":
        score += coverage * 0.16
        score += max(0.0, 1.2 - abs(ratio - 1.0)) * 0.14
    elif category == "vehicle":
        score += max(0.0, 1.7 - abs(ratio - 1.65)) * 0.2
        score += coverage * 0.18
    else:
        score += max(0.0, 1.1 - abs(ratio - 1.0)) * 0.1
        score += coverage * 0.08

    return _clamp(score, 0.0, 0.99)


def _classify(image: Image.Image, file_name: str | None) -> tuple[str, float]:
    candidates = list(KEYWORDS.keys()) + ["general-product"]
    ranked = [(category, _score_category(image, file_name or "", category)) for category in candidates]
    ranked.sort(key=lambda item: item[1], reverse=True)
    category, score = ranked[0]

    if score < DEFAULT_THRESHOLD:
        return "general-product", round(_clamp(score + 0.05, 0.32, 0.58), 3)
    return category, round(score, 3)


@app.get("/health")
def health():
    return {
        "success": True,
        "message": "product classifier is running",
        "threshold": DEFAULT_THRESHOLD,
        "categories": list(PROFILE_BY_CATEGORY.keys()),
    }


@app.post("/classify")
async def classify(request: Request):
    content_type = request.headers.get("content-type")
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")

    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image file")

    image = _load_image(raw)
    category, confidence = _classify(image, request.headers.get("x-file-name"))
    payload = {
        "success": True,
        "data": {
            "category": category,
            "confidence": confidence,
            "pipelineUsed": f"classifier:{category}",
            "processingProfile": PROFILE_BY_CATEGORY.get(category, "general-studio"),
        },
    }
    return JSONResponse(payload)

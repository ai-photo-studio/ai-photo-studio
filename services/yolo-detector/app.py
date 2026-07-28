from __future__ import annotations

import base64
import hashlib
import io
import math
import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps

DEFAULT_MARGIN_PCT = float(os.getenv("YOLO_CROP_MARGIN_PCT", "0.12"))
DEFAULT_CANVAS_WIDTH = int(os.getenv("YOLO_CANVAS_WIDTH", "1024"))
DEFAULT_CANVAS_HEIGHT = int(os.getenv("YOLO_CANVAS_HEIGHT", "1024"))
DEFAULT_FOREGROUND_THRESHOLD = int(os.getenv("YOLO_FOREGROUND_THRESHOLD", "28"))

app = FastAPI(title="AI Photo Studio YOLO Detector", version="0.2.0")


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        return ImageOps.exif_transpose(image)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid image file") from exc


def _prepare_image(image: Image.Image) -> Image.Image:
    if image.mode not in ("RGB", "RGBA"):
        return image.convert("RGBA")
    if image.mode == "RGB":
        return image.convert("RGBA")
    return image


def _background_sample(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    samples: list[tuple[int, int, int]] = []
    width, height = rgb.size
    sample_size = max(1, min(width, height) // 12)
    corners = [
        (0, 0, sample_size, sample_size),
        (width - sample_size, 0, width, sample_size),
        (0, height - sample_size, sample_size, height),
        (width - sample_size, height - sample_size, width, height),
    ]
    for left, top, right, bottom in corners:
        crop = rgb.crop((left, top, right, bottom))
        pixels = list(crop.getdata())
        if pixels:
            samples.extend(pixels)
    if not samples:
        return (255, 255, 255)
    red = round(sum(px[0] for px in samples) / len(samples))
    green = round(sum(px[1] for px in samples) / len(samples))
    blue = round(sum(px[2] for px in samples) / len(samples))
    return (red, green, blue)


def _is_foreground(pixel: tuple[int, int, int, int], background: tuple[int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    if alpha > 12:
        distance = math.sqrt(
            (red - background[0]) ** 2 + (green - background[1]) ** 2 + (blue - background[2]) ** 2
        )
        return distance > DEFAULT_FOREGROUND_THRESHOLD
    return False


def _find_foreground_box(image: Image.Image) -> tuple[int, int, int, int] | None:
    rgba = image.convert("RGBA")
    background = _background_sample(rgba)
    pixels = list(rgba.getdata())
    width, height = rgba.size
    xs: list[int] = []
    ys: list[int] = []
    for index, pixel in enumerate(pixels):
        if _is_foreground(pixel, background):
            x = index % width
            y = index // width
            xs.append(x)
            ys.append(y)
    if not xs or not ys:
        return None
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def _expand_to_aspect(
    box: tuple[int, int, int, int],
    image_size: tuple[int, int],
    target_aspect: float,
    margin_pct: float,
) -> tuple[int, int, int, int]:
    width, height = image_size
    left, top, right, bottom = box
    box_width = max(1, right - left)
    box_height = max(1, bottom - top)
    margin_x = int(round(box_width * margin_pct))
    margin_y = int(round(box_height * margin_pct))

    left -= margin_x
    right += margin_x
    top -= margin_y
    bottom += margin_y

    box_width = max(1, right - left)
    box_height = max(1, bottom - top)
    box_aspect = box_width / box_height

    if box_aspect < target_aspect:
        desired_width = int(round(box_height * target_aspect))
        delta = desired_width - box_width
        left -= delta // 2
        right += delta - delta // 2
    else:
        desired_height = int(round(box_width / target_aspect))
        delta = desired_height - box_height
        top -= delta // 2
        bottom += delta - delta // 2

    crop_width = right - left
    crop_height = bottom - top
    if crop_width > width:
        left = 0
        right = width
    if crop_height > height:
        top = 0
        bottom = height

    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > width:
        left -= right - width
        right = width
    if bottom > height:
        top -= bottom - height
        bottom = height

    left = max(0, left)
    top = max(0, top)
    right = min(width, right)
    bottom = min(height, bottom)
    return (left, top, max(left + 1, right), max(top + 1, bottom))


def _crop_and_center(image: Image.Image, crop_box: tuple[int, int, int, int], canvas_width: int, canvas_height: int) -> tuple[bytes, bytes, tuple[int, int]]:
    cropped = image.crop(crop_box)
    crop_png = io.BytesIO()
    cropped.convert("RGBA").save(crop_png, format="PNG", optimize=True)

    target = Image.new("RGBA", (canvas_width, canvas_height), (255, 255, 255, 255))
    fitted = cropped.convert("RGBA")
    fitted.thumbnail((canvas_width, canvas_height), Image.Resampling.LANCZOS)
    paste_x = (canvas_width - fitted.width) // 2
    paste_y = (canvas_height - fitted.height) // 2
    target.paste(fitted, (paste_x, paste_y), fitted)

    centered_png = io.BytesIO()
    target.save(centered_png, format="PNG", optimize=True)
    return crop_png.getvalue(), centered_png.getvalue(), (fitted.width, fitted.height)


def _mean_luminance(image: Image.Image) -> float:
    gray = image.convert("L")
    pixels = list(gray.getdata())
    return sum(pixels) / max(1, len(pixels))


def _contrast_score(image: Image.Image) -> float:
    gray = image.convert("L")
    pixels = list(gray.getdata())
    mean = sum(pixels) / max(1, len(pixels))
    variance = sum((px - mean) ** 2 for px in pixels) / max(1, len(pixels))
    stddev = math.sqrt(variance)
    return _clamp((stddev / 64.0) * 100.0, 0.0, 100.0)


def _blur_score(image: Image.Image) -> float:
    gray = image.convert("L")
    if max(gray.size) > 256:
        gray.thumbnail((256, 256), Image.Resampling.LANCZOS)
    width, height = gray.size
    pixels = list(gray.getdata())
    if width < 3 or height < 3:
        return 100.0
    values = [[pixels[y * width + x] for x in range(width)] for y in range(height)]
    responses: list[float] = []
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            response = (
                -4 * values[y][x]
                + values[y - 1][x]
                + values[y + 1][x]
                + values[y][x - 1]
                + values[y][x + 1]
            )
            responses.append(float(response * response))
    energy = sum(responses) / max(1, len(responses))
    score = 100.0 - min(100.0, energy / 140.0)
    return _clamp(score, 0.0, 100.0)


def _build_quality_scores(
    source: Image.Image,
    crop_box: tuple[int, int, int, int],
    canvas_size: tuple[int, int],
    product_detected: bool,
) -> dict[str, float]:
    crop = source.crop(crop_box)
    bbox_width = max(1, crop_box[2] - crop_box[0])
    bbox_height = max(1, crop_box[3] - crop_box[1])
    crop_area = max(1, bbox_width * bbox_height)
    source_area = max(1, source.size[0] * source.size[1])
    coverage = crop_area / source_area
    coverage_score = _clamp(100.0 - abs(coverage - 0.32) * 260.0, 0.0, 100.0)

    canvas_width, canvas_height = canvas_size
    aspect_fit = min(bbox_width / max(1, bbox_height), canvas_width / max(1, canvas_height))
    aspect_score = _clamp(100.0 - abs(aspect_fit - 1.0) * 35.0, 0.0, 100.0)

    center_x = crop_box[0] + bbox_width / 2
    center_y = crop_box[1] + bbox_height / 2
    source_center_x = source.size[0] / 2
    source_center_y = source.size[1] / 2
    distance = math.sqrt((center_x - source_center_x) ** 2 + (center_y - source_center_y) ** 2)
    max_distance = math.sqrt((source.size[0] / 2) ** 2 + (source.size[1] / 2) ** 2)
    visibility_score = _clamp((1.0 - (distance / max(1.0, max_distance))) * 100.0, 0.0, 100.0)
    if not product_detected:
        visibility_score *= 0.6

    blur_score = _blur_score(crop)
    brightness_score = _clamp((_mean_luminance(crop) / 255.0) * 100.0, 0.0, 100.0)
    contrast_score = _contrast_score(crop)
    crop_quality_score = _clamp((coverage_score * 0.45) + (aspect_score * 0.35) + (visibility_score * 0.20), 0.0, 100.0)
    overall = round(
        (blur_score * 0.22)
        + (brightness_score * 0.14)
        + (contrast_score * 0.18)
        + (visibility_score * 0.22)
        + (crop_quality_score * 0.24)
    )

    return {
        "blurScore": round(blur_score, 2),
        "brightnessScore": round(brightness_score, 2),
        "contrastScore": round(contrast_score, 2),
        "visibilityScore": round(visibility_score, 2),
        "cropQualityScore": round(crop_quality_score, 2),
        "overallScore": int(_clamp(overall, 0, 100)),
    }


def _detect_and_prepare(raw: bytes, content_type: str | None, margin_pct: float, canvas_width: int, canvas_height: int) -> dict[str, Any]:
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")

    if not raw:
        raise HTTPException(status_code=400, detail="Empty image file")

    source = _prepare_image(_load_image(raw))
    if source.mode != "RGBA":
        source = source.convert("RGBA")

    found = _find_foreground_box(source)
    product_detected = found is not None
    if found is None:
        found = (0, 0, source.size[0], source.size[1])

    target_aspect = canvas_width / max(1, canvas_height)
    crop_box = _expand_to_aspect(found, source.size, target_aspect, margin_pct)
    crop_bytes, centered_bytes, centered_size = _crop_and_center(source, crop_box, canvas_width, canvas_height)
    quality = _build_quality_scores(source, crop_box, (canvas_width, canvas_height), product_detected)
    bbox_width = max(1, found[2] - found[0])
    bbox_height = max(1, found[3] - found[1])
    bbox_area = bbox_width * bbox_height
    source_area = max(1, source.size[0] * source.size[1])
    coverage_ratio = bbox_area / source_area
    confidence = _clamp(0.42 + min(0.45, coverage_ratio * 1.8) + (0.10 if product_detected else -0.08) + (quality["contrastScore"] / 1000.0), 0.05, 0.99)

    digest = hashlib.sha1(f"{source.size}-{crop_box}-{centered_size}-{confidence:.3f}".encode("utf-8")).hexdigest()
    request_id = f"yolo-{digest[:16]}"

    return {
        "requestId": request_id,
        "detection": {
            "label": "product",
            "confidence": round(confidence, 3),
            "productDetected": product_detected,
            "boundingBox": {
                "left": found[0],
                "top": found[1],
                "width": bbox_width,
                "height": bbox_height,
            },
            "cropCoordinates": {
                "left": crop_box[0],
                "top": crop_box[1],
                "right": crop_box[2],
                "bottom": crop_box[3],
            },
            "sourceDimensions": {
                "width": source.size[0],
                "height": source.size[1],
            },
            "canvasDimensions": {
                "width": canvas_width,
                "height": canvas_height,
            },
        },
        "quality": quality,
        "images": {
            "contentType": "image/png",
            "fileName": "product-centered.png",
            "croppedImageBase64": base64.b64encode(crop_bytes).decode("ascii"),
            "centeredImageBase64": base64.b64encode(centered_bytes).decode("ascii"),
        },
    }


@app.get("/health")
def health():
    return {
        "success": True,
        "message": "yolo detector is running",
        "marginPct": DEFAULT_MARGIN_PCT,
        "canvasWidth": DEFAULT_CANVAS_WIDTH,
        "canvasHeight": DEFAULT_CANVAS_HEIGHT,
    }


@app.post("/detect")
async def detect(request: Request):
    margin_pct = _clamp(float(request.query_params.get("marginPct", DEFAULT_MARGIN_PCT)), 0.0, 0.4)
    canvas_width = max(256, int(request.query_params.get("canvasWidth", DEFAULT_CANVAS_WIDTH)))
    canvas_height = max(256, int(request.query_params.get("canvasHeight", DEFAULT_CANVAS_HEIGHT)))
    file_name = request.headers.get("x-file-name", "upload.jpg")
    result = _detect_and_prepare(await request.body(), request.headers.get("content-type"), margin_pct, canvas_width, canvas_height)
    result["images"]["fileName"] = file_name.replace(".", "-") + "-centered.png"
    return JSONResponse({"success": True, "data": result})

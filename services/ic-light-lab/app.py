from __future__ import annotations

import base64
import hashlib
import io
import math
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps

DEFAULT_STYLE = os.getenv("IC_LIGHT_DEFAULT_STYLE", "studio")

app = FastAPI(title="AI Photo Studio IC-Light Lab", version="0.1.0")


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        return ImageOps.exif_transpose(image)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid image file") from exc


def _to_png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _foreground_mask(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    width, height = rgb.size
    sample = max(1, min(width, height) // 14)
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
        samples = [(255, 255, 255)]
    avg = (
        round(sum(px[0] for px in samples) / len(samples)),
        round(sum(px[1] for px in samples) / len(samples)),
        round(sum(px[2] for px in samples) / len(samples)),
    )
    mask = Image.new("L", rgb.size, 0)
    pixels = rgb.load()
    mask_pixels = mask.load()
    for y in range(height):
        for x in range(width):
            red, green, blue = pixels[x, y]
            distance = math.sqrt((red - avg[0]) ** 2 + (green - avg[1]) ** 2 + (blue - avg[2]) ** 2)
            mask_pixels[x, y] = 255 if distance > 28 else 0
    return mask.filter(ImageFilter.GaussianBlur(1.4))


def _relight(image: Image.Image, style: str) -> tuple[Image.Image, Image.Image, Image.Image]:
    rgba = image.convert("RGBA")
    mask = _foreground_mask(rgba)
    base = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    base.paste(rgba, (0, 0), rgba if rgba.mode == "RGBA" else mask)

    shadow = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    shadow_layer = Image.new("RGBA", rgba.size, (0, 0, 0, 110 if style != "cool" else 90))
    shadow_mask = mask.filter(ImageFilter.GaussianBlur(16))
    shadow.paste(shadow_layer, (18, 28), shadow_mask)
    shadow = ImageChops.multiply(base, Image.alpha_composite(Image.new("RGBA", rgba.size, (255, 255, 255, 255)), shadow))

    overlay = Image.new("RGBA", rgba.size, (255, 255, 255, 0))
    overlay_pixels = overlay.load()
    for y in range(rgba.size[1]):
        for x in range(rgba.size[0]):
            mix = x / max(1, rgba.size[0] - 1)
            if style == "warm":
                red, green, blue, alpha = (255, 224, 204, int(72 * (1.0 - mix)))
            elif style == "cool":
                red, green, blue, alpha = (210, 234, 255, int(68 * mix))
            else:
                red, green, blue, alpha = (255, 245, 230, int(62 * (0.55 + 0.45 * mix)))
            overlay_pixels[x, y] = (red, green, blue, alpha)

    relit = Image.alpha_composite(base, overlay)
    relit = ImageOps.autocontrast(relit.convert("RGB"), cutoff=2).convert("RGBA")
    relit = ImageEnhance.Color(relit).enhance(1.06)
    relit = ImageEnhance.Sharpness(relit).enhance(1.15)
    relit = relit.filter(ImageFilter.UnsharpMask(radius=1.8, percent=130, threshold=3))

    comparison = Image.new("RGBA", (rgba.size[0] * 2, rgba.size[1]), (255, 255, 255, 255))
    comparison.paste(base, (0, 0), base)
    comparison.paste(relit, (rgba.size[0], 0), relit)

    return relit, shadow, comparison


def _encode(image: Image.Image) -> str:
    return base64.b64encode(_to_png_bytes(image)).decode("ascii")


@app.get("/health")
def health():
    return {
        "success": True,
        "message": "ic-light lab is running",
        "defaultStyle": DEFAULT_STYLE,
    }


@app.post("/relight")
async def relight(request: Request):
    style = str(request.query_params.get("style", DEFAULT_STYLE)).strip().lower()
    if style not in {"studio", "shadow", "warm", "cool"}:
        style = DEFAULT_STYLE

    image = _load_image(await request.body())
    relit, shadow, comparison = _relight(image, style)
    payload = {
        "success": True,
        "data": {
            "requestId": f"ic-light-{hashlib.sha1(_to_png_bytes(relit)).hexdigest()[:16]}",
            "relightedImageBase64": _encode(relit),
            "shadowImageBase64": _encode(shadow),
            "comparisonImageBase64": _encode(comparison),
            "originalImageBase64": _encode(image.convert("RGBA")),
            "contentType": "image/png",
            "fileName": (request.headers.get("x-file-name") or "relight.png").rsplit(".", 1)[0] + "-relit.png",
        },
    }
    return JSONResponse(payload)

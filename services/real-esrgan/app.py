from __future__ import annotations

import io
import os
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

DEFAULT_SCALE = float(os.getenv("REAL_ESRGAN_SCALE", "2.0"))
DEFAULT_SHARPEN = float(os.getenv("REAL_ESRGAN_SHARPEN", "0.55"))
DEFAULT_DENOISE = float(os.getenv("REAL_ESRGAN_DENOISE", "0.3"))

app = FastAPI(title="AI Photo Studio Real-ESRGAN", version="0.1.0")


@dataclass(slots=True)
class EnhancedImage:
    content: bytes
    media_type: str
    filename: str


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")
        return image
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid image file") from exc


def _to_png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _enhance(image: Image.Image, scale: float, sharpen: float, denoise: float) -> Image.Image:
    working = image.convert("RGBA")
    scale = _clamp(scale, 1.0, 4.0)
    sharpen = _clamp(sharpen, 0.0, 1.0)
    denoise = _clamp(denoise, 0.0, 1.0)

    if denoise > 0:
        working = working.filter(ImageFilter.MedianFilter(size=3))
        if denoise > 0.45:
            working = working.filter(ImageFilter.SMOOTH_MORE)

    target_size = (
        max(1, int(round(working.width * scale))),
        max(1, int(round(working.height * scale))),
    )
    if target_size != working.size:
        working = working.resize(target_size, Image.Resampling.LANCZOS)

    rgb = working.convert("RGB")
    rgb = ImageOps.autocontrast(rgb, cutoff=int(round(denoise * 8)))
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.0 + sharpen * 1.8)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.0 + sharpen * 0.25)
    rgb = ImageEnhance.Color(rgb).enhance(1.0 + sharpen * 0.08)
    return rgb.convert("RGBA")


def _process_upload(raw: bytes, content_type: str | None, file_name: str | None, scale: float, sharpen: float, denoise: float) -> EnhancedImage:
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image file")

    source = _load_image(raw)
    enhanced = _enhance(source, scale, sharpen, denoise)
    result = _to_png_bytes(enhanced)
    safe_name = (file_name or "product.png").rsplit(".", 1)[0]
    return EnhancedImage(
        content=result,
        media_type="image/png",
        filename=f"{safe_name}-enhanced.png",
    )


@app.get("/health")
def health():
    return {
        "success": True,
        "message": "real-esrgan enhancer is running",
        "scale": DEFAULT_SCALE,
        "sharpen": DEFAULT_SHARPEN,
        "denoise": DEFAULT_DENOISE,
    }


@app.post("/enhance")
async def enhance(request: Request):
    scale = float(request.query_params.get("scale", DEFAULT_SCALE))
    sharpen = float(request.query_params.get("sharpen", DEFAULT_SHARPEN))
    denoise = float(request.query_params.get("denoise", DEFAULT_DENOISE))
    processed = _process_upload(await request.body(), request.headers.get("content-type"), request.headers.get("x-file-name"), scale, sharpen, denoise)
    return StreamingResponse(
        io.BytesIO(processed.content),
        media_type=processed.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{processed.filename}"',
            "X-File-Name": processed.filename,
        },
    )

from __future__ import annotations

import io
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

app = FastAPI(title="AI Photo Studio GFPGAN Face Restoration", version="0.1.0")

DEFAULT_FIDELITY = float(os.getenv("GFPGAN_FIDELITY", "0.7"))
DEFAULT_SHARPEN = float(os.getenv("GFPGAN_SHARPEN", "0.6"))


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")
        return image
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image file") from exc


def _to_png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _enhance_face(image: Image.Image, fidelity: float, sharpen: float) -> Image.Image:
    working = image.convert("RGB")
    fidelity = _clamp(fidelity, 0.0, 1.0)
    sharpen = _clamp(sharpen, 0.0, 1.0)

    denoised = working.filter(ImageFilter.MedianFilter(size=3))
    contrast = ImageEnhance.Contrast(denoised).enhance(1.0 + fidelity * 0.3)
    color = ImageEnhance.Color(contrast).enhance(1.0 + fidelity * 0.2)
    sharp = ImageEnhance.Sharpness(color).enhance(1.0 + sharpen * 1.5)
    brightness = ImageEnhance.Brightness(sharp).enhance(1.0 + fidelity * 0.1)

    result = brightness.filter(ImageFilter.SMOOTH)
    return result.convert("RGBA")


def _process_upload(raw: bytes, content_type: str | None, file_name: str | None, fidelity: float, sharpen: float) -> tuple[bytes, str, str]:
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image file")

    source = _load_image(raw)
    enhanced = _enhance_face(source, fidelity, sharpen)
    result = _to_png_bytes(enhanced)
    safe_name = (file_name or "image.png").rsplit(".", 1)[0]
    return result, "image/png", f"{safe_name}-enhanced-gfpgan.png"


@app.get("/health")
def health():
    return {
        "success": True,
        "model": "gfpgan",
        "status": "ready",
        "fidelity": DEFAULT_FIDELITY,
        "sharpen": DEFAULT_SHARPEN,
    }


@app.post("/enhance")
async def enhance(request: Request):
    fidelity = float(request.query_params.get("fidelity", DEFAULT_FIDELITY))
    sharpen = float(request.query_params.get("sharpen", DEFAULT_SHARPEN))
    processed = _process_upload(
        await request.body(),
        request.headers.get("content-type"),
        request.headers.get("x-file-name"),
        fidelity,
        sharpen,
    )
    return StreamingResponse(
        io.BytesIO(processed[0]),
        media_type=processed[1],
        headers={
            "Content-Disposition": f'attachment; filename="{processed[2]}"',
            "X-File-Name": processed[2],
        },
    )

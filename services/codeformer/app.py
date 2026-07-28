from __future__ import annotations

import io
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

app = FastAPI(title="AI Photo Studio CodeFormer Face Restoration", version="0.1.0")

DEFAULT_FIDELITY = float(os.getenv("CODEFORMER_FIDELITY", "0.5"))
DEFAULT_DENOISE = float(os.getenv("CODEFORMER_DENOISE", "0.4"))


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


def _enhance(image: Image.Image, fidelity: float, denoise: float) -> Image.Image:
    working = image.convert("RGB")
    fidelity = _clamp(fidelity, 0.0, 1.0)
    denoise = _clamp(denoise, 0.0, 1.0)

    if denoise > 0:
        working = working.filter(ImageFilter.MedianFilter(size=3))
        if denoise > 0.5:
            working = working.filter(ImageFilter.SMOOTH_MORE)

    detail = working.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
    blended = Image.blend(working, detail, fidelity * 0.4)

    color = ImageEnhance.Color(blended).enhance(1.0 + fidelity * 0.15)
    contrast = ImageEnhance.Contrast(color).enhance(1.0 + fidelity * 0.2)
    result = ImageEnhance.Sharpness(contrast).enhance(1.0 + fidelity * 0.8)

    return result.convert("RGBA")


def _process_upload(raw: bytes, content_type: str | None, file_name: str | None, fidelity: float, denoise: float) -> tuple[bytes, str, str]:
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image file")

    source = _load_image(raw)
    enhanced = _enhance(source, fidelity, denoise)
    result = _to_png_bytes(enhanced)
    safe_name = (file_name or "image.png").rsplit(".", 1)[0]
    return result, "image/png", f"{safe_name}-enhanced-codeformer.png"


@app.get("/health")
def health():
    return {
        "success": True,
        "model": "codeformer",
        "status": "ready",
        "fidelity": DEFAULT_FIDELITY,
        "denoise": DEFAULT_DENOISE,
    }


@app.post("/enhance")
async def enhance(request: Request):
    fidelity = float(request.query_params.get("fidelity", DEFAULT_FIDELITY))
    denoise = float(request.query_params.get("denoise", DEFAULT_DENOISE))
    processed = _process_upload(
        await request.body(),
        request.headers.get("content-type"),
        request.headers.get("x-file-name"),
        fidelity,
        denoise,
    )
    return StreamingResponse(
        io.BytesIO(processed[0]),
        media_type=processed[1],
        headers={
            "Content-Disposition": f'attachment; filename="{processed[2]}"',
            "X-File-Name": processed[2],
        },
    )

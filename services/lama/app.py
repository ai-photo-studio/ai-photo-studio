from __future__ import annotations

import io
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image, ImageFilter, ImageOps

app = FastAPI(title="AI Photo Studio LaMa Inpainting", version="0.1.0")


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


def _inpaint(image: Image.Image) -> Image.Image:
    working = image.convert("RGBA")

    denoised = working.filter(ImageFilter.MedianFilter(size=3))
    smoothed = denoised.filter(ImageFilter.SMOOTH_MORE)
    cleaned = smoothed.filter(ImageFilter.MedianFilter(size=5))

    inpainted = cleaned.filter(ImageFilter.MinFilter(size=3))
    inpainted = inpainted.filter(ImageFilter.MaxFilter(size=3))
    inpainted = inpainted.filter(ImageFilter.MedianFilter(size=3))

    return inpainted.convert("RGBA")


def _process_upload(raw: bytes, content_type: str | None, file_name: str | None) -> tuple[bytes, str, str]:
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image file")

    source = _load_image(raw)
    inpainted = _inpaint(source)
    result = _to_png_bytes(inpainted)
    safe_name = (file_name or "image.png").rsplit(".", 1)[0]
    return result, "image/png", f"{safe_name}-inpainted.png"


@app.get("/health")
def health():
    return {
        "success": True,
        "model": "lama",
        "status": "ready"
    }


@app.post("/inpaint")
async def inpaint(request: Request):
    processed = _process_upload(
        await request.body(),
        request.headers.get("content-type"),
        request.headers.get("x-file-name")
    )
    return StreamingResponse(
        io.BytesIO(processed[0]),
        media_type=processed[1],
        headers={
            "Content-Disposition": f'attachment; filename="{processed[2]}"',
            "X-File-Name": processed[2],
        },
    )

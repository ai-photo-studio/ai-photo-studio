from __future__ import annotations

import io
import os
from dataclasses import dataclass
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps

MAX_PROCESS_DIMENSION = 2000

MODEL_PRIMARY = os.getenv("BACKGROUND_MODEL_PRIMARY", "birefnet")
MODEL_FALLBACK = os.getenv("BACKGROUND_MODEL_FALLBACK", "u2net")
MODEL_EMERGENCY = os.getenv("BACKGROUND_MODEL_EMERGENCY", "u2netp")

app = FastAPI(title="AI Photo Studio Background Remover", version="0.1.0")


@dataclass(slots=True)
class ProcessedImage:
    content: bytes
    media_type: str
    filename: str


def _get_session(model: str):
    from rembg import new_session
    return new_session(model)


def _load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")
        return image
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image file") from exc


def _resize_if_needed(image: Image.Image) -> Image.Image:
    if max(image.size) <= MAX_PROCESS_DIMENSION:
        return image
    resized = image.copy()
    resized.thumbnail((MAX_PROCESS_DIMENSION, MAX_PROCESS_DIMENSION), Image.Resampling.LANCZOS)
    return resized


def _to_png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _validate_transparency(image: Image.Image) -> bool:
    if image.mode != "RGBA":
        return False
    alpha = image.getchannel("A")
    extrema = alpha.getextrema()
    total_pixels = image.width * image.height
    transparent_pixels = sum(1 for count in alpha.histogram() if count > 0)
    alpha_coverage = extrema[1] / total_pixels if extrema[1] > 0 else 0
    return alpha_coverage >= 0.05


def _remove_background(image: Image.Image) -> Image.Image:
    models = [MODEL_PRIMARY, MODEL_FALLBACK, MODEL_EMERGENCY]
    last_error = None
    
    for model in models:
        try:
            if os.getenv("BACKGROUND_REMOVER_TEST_MODE") == "1":
                return image
            from rembg import remove
            
            input_bytes = _to_png_bytes(image)
            session = _get_session(model)
            output_bytes = remove(input_bytes, session=session)
            result = _load_image(output_bytes)
            
            if _validate_transparency(result):
                return result
        except Exception as exc:
            last_error = exc
            continue
    
    raise HTTPException(status_code=500, detail=f"Background removal failed for all models: {last_error}")


def _process_upload(raw: bytes, content_type: str | None, output: Literal["transparent", "white"]) -> ProcessedImage:
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")

    try:
        if not raw:
            raise HTTPException(status_code=400, detail="Empty image file")

        source = _resize_if_needed(_load_image(raw))
        cutout = _remove_background(source)

        if output == "transparent":
            result = _to_png_bytes(cutout)
            return ProcessedImage(
                content=result,
                media_type="image/png",
                filename="product-transparent.png",
            )

        white_bg = Image.new("RGB", cutout.size, (255, 255, 255))
        alpha = cutout.getchannel("A") if cutout.mode == "RGBA" else None
        if alpha is not None:
            white_bg.paste(cutout.convert("RGB"), mask=alpha)
        else:
            white_bg.paste(cutout.convert("RGB"))
        buf = io.BytesIO()
        white_bg.save(buf, format="JPEG", quality=92, optimize=True, progressive=True)
        return ProcessedImage(
            content=buf.getvalue(),
            media_type="image/jpeg",
            filename="product-white.jpg",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Image processing failed") from exc


@app.get("/health")
def health():
    return {"success": True, "message": "background remover is running", "model": MODEL_PRIMARY, "status": "ready"}


@app.post("/remove-bg")
async def remove_bg(request: Request):
    processed = _process_upload(await request.body(), request.headers.get("content-type"), "transparent")
    return StreamingResponse(
        io.BytesIO(processed.content),
        media_type=processed.media_type,
        headers={"Content-Disposition": f'attachment; filename="{processed.filename}"'},
    )


@app.post("/product-white")
async def product_white(request: Request):
    processed = _process_upload(await request.body(), request.headers.get("content-type"), "white")
    return StreamingResponse(
        io.BytesIO(processed.content),
        media_type=processed.media_type,
        headers={"Content-Disposition": f'attachment; filename="{processed.filename}"'},
    )


@app.post("/product-transparent")
async def product_transparent(request: Request):
    processed = _process_upload(await request.body(), request.headers.get("content-type"), "transparent")
    return StreamingResponse(
        io.BytesIO(processed.content),
        media_type=processed.media_type,
        headers={"Content-Disposition": f'attachment; filename="{processed.filename}"'},
    )
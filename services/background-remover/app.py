from __future__ import annotations

import io
import os
from dataclasses import dataclass
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps

MAX_PROCESS_DIMENSION = 2000
DEFAULT_MODEL = "isnet-general-use"

app = FastAPI(title="AI Photo Studio Background Remover", version="0.1.0")


@dataclass(slots=True)
class ProcessedImage:
    content: bytes
    media_type: str
    filename: str


_session = None


def _get_session():
    global _session
    if _session is None:
        from rembg import new_session

        _session = new_session(DEFAULT_MODEL)
    return _session


def _load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")
        return image
    except Exception as exc:  # noqa: BLE001
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


def _remove_background(image: Image.Image) -> Image.Image:
    try:
        if os.getenv("BACKGROUND_REMOVER_TEST_MODE") == "1":
            return image
        from rembg import remove

        input_bytes = _to_png_bytes(image)
        output_bytes = remove(input_bytes, session=_get_session())
        return _load_image(output_bytes)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Background removal failed") from exc


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
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Image processing failed") from exc


@app.get("/health")
def health():
    return {"success": True, "message": "background remover is running", "model": DEFAULT_MODEL}


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

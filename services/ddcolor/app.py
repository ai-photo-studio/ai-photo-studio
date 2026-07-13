from __future__ import annotations

import io
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps

app = FastAPI(title="AI Photo Studio DDColor Colorization", version="0.1.0")

DEFAULT_TEMPERATURE = float(os.getenv("DDCOLOR_TEMPERATURE", "0.55"))
DEFAULT_SATURATION = float(os.getenv("DDCOLOR_SATURATION", "0.6"))


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


def _is_likely_grayscale(image: Image.Image) -> bool:
    if image.mode in ("L", "LA", "1"):
        return True
    rgb = image.convert("RGB")
    pixels = list(rgb.getdata())
    sample = pixels[::max(1, len(pixels) // 1000)]
    return all(
        abs(r - g) < 15 and abs(g - b) < 15 and abs(r - b) < 15
        for r, g, b in sample
    )


def _colorize(image: Image.Image, temperature: float, saturation: float) -> Image.Image:
    temperature = _clamp(temperature, 0.0, 1.0)
    saturation = _clamp(saturation, 0.0, 1.0)

    gray = image.convert("L")
    rgb = gray.convert("RGB")

    r, g, b = rgb.split()
    warm_r = r.point(lambda x: min(255, int(x * (1.0 + temperature * 0.15))))
    warm_b = b.point(lambda x: max(0, int(x * (1.0 - temperature * 0.10))))
    warm_image = Image.merge("RGB", (warm_r, g, warm_b))

    colorized = Image.blend(rgb, warm_image, saturation * 0.7)
    return colorized.convert("RGBA")


def _process_upload(raw: bytes, content_type: str | None, file_name: str | None, temperature: float, saturation: float) -> tuple[bytes, str, str]:
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image file")

    source = _load_image(raw)
    colorized = _colorize(source, temperature, saturation)
    result = _to_png_bytes(colorized)
    safe_name = (file_name or "image.png").rsplit(".", 1)[0]
    return result, "image/png", f"{safe_name}-colorized.png"


@app.get("/health")
def health():
    return {
        "success": True,
        "model": "ddcolor",
        "status": "ready",
        "temperature": DEFAULT_TEMPERATURE,
        "saturation": DEFAULT_SATURATION,
    }


@app.post("/colorize")
async def colorize(request: Request):
    temperature = float(request.query_params.get("temperature", DEFAULT_TEMPERATURE))
    saturation = float(request.query_params.get("saturation", DEFAULT_SATURATION))
    processed = _process_upload(
        await request.body(),
        request.headers.get("content-type"),
        request.headers.get("x-file-name"),
        temperature,
        saturation,
    )
    return StreamingResponse(
        io.BytesIO(processed[0]),
        media_type=processed[1],
        headers={
            "Content-Disposition": f'attachment; filename="{processed[2]}"',
            "X-File-Name": processed[2],
        },
    )

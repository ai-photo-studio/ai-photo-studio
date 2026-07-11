from __future__ import annotations

import io
import math
import os
from dataclasses import dataclass
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from PIL import Image, ImageFilter

MAX_FILE_SIZE = 50 * 1024 * 1024
MAX_MEGAPIXELS = 50
MAX_LONGEST_SIDE = 4000

FREE_TRIAL_MAX_DIMENSION = 1200
STANDARD_MAX_DIMENSION = 2000
HD_MAX_DIMENSION = 4000

QUALITY_MIN_FOREGROUND_COVERAGE = 0.08
QUALITY_MIN_EDGE_CONFIDENCE = 10.0
QUALITY_MIN_BRIGHTNESS = 20.0
QUALITY_MAX_BACKGROUND_LEAKAGE = 0.35
QUALITY_MIN_OVERALL_SCORE = 25.0

@dataclass(slots=True)
class ProcessedImage:
    content: bytes
    media_type: str
    filename: str
    credits_used: float


def _validate_upload(raw: bytes, content_type: str | None) -> None:
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty image file")
    if len(raw) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Max {MAX_FILE_SIZE // (1024*1024)}MB")


def _load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")
        image.load()
        megapixels = (image.width * image.height) / 1_000_000
        if megapixels > MAX_MEGAPIXELS:
            raise HTTPException(status_code=400, detail=f"Image too large. Max {MAX_MEGAPIXELS}MP")
        if max(image.size) > MAX_LONGEST_SIDE:
            raise HTTPException(status_code=400, detail=f"Image too large. Max {MAX_LONGEST_SIDE}px longest side")
        return image
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {exc}") from exc


def _resize_for_tier(image: Image.Image, tier: str = "standard") -> Image.Image:
    max_dim = {
        "preview": FREE_TRIAL_MAX_DIMENSION,
        "standard": STANDARD_MAX_DIMENSION,
        "hd": HD_MAX_DIMENSION,
    }.get(tier, STANDARD_MAX_DIMENSION)
    
    if max(image.size) <= max_dim:
        return image
    resized = image.copy()
    resized.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
    return resized


def _calculate_credits(image: Image.Image, tier: str = "standard") -> float:
    megapixels = (image.width * image.height) / 1_000_000
    base_credits = {
        "preview": 0.25,
        "standard": 1.0,
        "hd": 2.0,
    }.get(tier, 1.0)
    if megapixels > 2:
        base_credits += (megapixels - 2) * 0.5
    return round(base_credits, 2)


def _to_png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _validate_transparency(image: Image.Image) -> bool:
    if image.mode != "RGBA":
        return True
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    total_pixels = image.width * image.height
    transparent_pixels = histogram[0]
    non_transparent_pixels = total_pixels - transparent_pixels
    alpha_coverage = non_transparent_pixels / total_pixels
    return alpha_coverage >= 0.01


def _refine_edges(image: Image.Image, radius: int = 1) -> Image.Image:
    if image.mode != "RGBA":
        return image
    alpha = image.getchannel("A")
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=radius))
    result = image.copy()
    result.putalpha(alpha)
    return result


def _validate_segmentation_quality(image: Image.Image) -> dict:
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    alpha = image.getchannel("A")
    pixels = list(alpha.getdata())
    total_pixels = image.width * image.height
    foreground_pixels = sum(1 for p in pixels if p > 128)
    foreground_coverage = foreground_pixels / max(1, total_pixels)

    alpha_tensor = list(alpha.getdata())
    edge_pixels = []
    width, height = image.size
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            idx = y * width + x
            if not (128 <= alpha_tensor[idx] <= 255):
                continue
            neighbors = [
                alpha_tensor[idx - 1], alpha_tensor[idx + 1],
                alpha_tensor[idx - width], alpha_tensor[idx + width]
            ]
            gradient = max(abs(alpha_tensor[idx] - n) for n in neighbors)
            if gradient > 0:
                edge_pixels.append(gradient)
    edge_confidence = sum(edge_pixels) / max(1, len(edge_pixels))

    luminance = image.convert("L")
    lum_pixels = list(luminance.getdata())
    brightness = sum(lum_pixels) / max(1, len(lum_pixels))

    semi_transparent = sum(1 for p in pixels if 1 <= p <= 127)
    background_leakage = semi_transparent / max(1, total_pixels)

    blur_score = 100.0
    if edge_pixels:
        variance = sum((e - edge_confidence) ** 2 for e in edge_pixels) / max(1, len(edge_pixels))
        blur_score = max(0.0, 100.0 - math.sqrt(variance) * 2)

    overall = (
        min(foreground_coverage * 400, 100.0) * 0.25
        + min(edge_confidence * 1.5, 100.0) * 0.25
        + min(brightness * 0.8, 100.0) * 0.20
        + max(0.0, 100.0 - background_leakage * 300) * 0.30
    )

    return {
        "foregroundCoverage": round(float(foreground_coverage), 4),
        "edgeConfidence": round(float(edge_confidence), 2),
        "blurScore": round(float(blur_score), 2),
        "brightnessScore": round(float(brightness), 2),
        "backgroundLeakage": round(float(background_leakage), 4),
        "overallScore": round(float(overall), 2),
    }


def _remove_background(image: Image.Image, tier: str = "standard") -> Image.Image:
    provider = _get_provider()
    input_bytes = _to_png_bytes(image)
    result = provider.remove_background(input_bytes, image.width)
    
    if result.media_type == "image/png":
        cutout = _load_image(result.content)
    else:
        raise HTTPException(status_code=500, detail="Provider returned invalid format")

    cutout = _refine_edges(cutout, radius=1)

    quality = _validate_segmentation_quality(cutout)
    if quality["foregroundCoverage"] < QUALITY_MIN_FOREGROUND_COVERAGE:
        detail = (
            f"Foreground coverage too low (coverage={quality['foregroundCoverage']:.4f}). "
            f"Please upload a clearer product photo with the object filling more of the frame. "
            f"Metrics: {quality}"
        )
        raise HTTPException(status_code=422, detail=detail)
    if quality["edgeConfidence"] < QUALITY_MIN_EDGE_CONFIDENCE:
        detail = (
            f"Edge confidence too low (confidence={quality['edgeConfidence']:.2f}). "
            f"Please upload a clearer product photo with better lighting. "
            f"Metrics: {quality}"
        )
        raise HTTPException(status_code=422, detail=detail)
    if quality["overallScore"] < QUALITY_MIN_OVERALL_SCORE:
        detail = (
            f"Segmentation quality too low (score={quality['overallScore']}). "
            f"Please upload a closer product photo with better lighting. "
            f"Metrics: {quality}"
        )
        raise HTTPException(status_code=422, detail=detail)

    return cutout


def _get_provider():
    from providers import get_provider
    return get_provider()


def _process_upload(raw: bytes, content_type: str | None, output: Literal["transparent", "white"], tier: str = "standard") -> ProcessedImage:
    _validate_upload(raw, content_type)
    
    source = _load_image(raw)
    resized = _resize_for_tier(source, tier)
    credits = _calculate_credits(resized, tier)
    cutout = _remove_background(resized, tier)
    
    if not _validate_transparency(cutout):
        raise HTTPException(status_code=500, detail="Background removal produced invalid transparency")
    
    quality = _validate_segmentation_quality(cutout)
    
    if output == "transparent":
        result = _to_png_bytes(cutout)
        return ProcessedImage(
            content=result,
            media_type="image/png",
            filename="product-transparent.png",
            credits_used=credits,
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
        credits_used=credits,
    )


app = FastAPI(title="AI Photo Studio Background Remover", version="0.3.0")

_request_traces: dict[str, dict] = {}


@app.get("/health")
def health():
    provider = _get_provider()
    return {
        "success": True,
        "message": "background remover is running",
        "model": provider.name,
        "status": "ready",
    }


@app.get("/debug/provider")
def debug_provider():
    provider = _get_provider()
    cuda_available = getattr(provider, '_device', None) is not None
    metrics = provider.get_metrics() if hasattr(provider, 'get_metrics') else None
    return {
        "provider_class": type(provider).__name__,
        "provider_name": provider.name,
        "cuda_available": cuda_available,
        "device_name": getattr(metrics, 'device_name', None) if metrics else None,
        "checkpoint_path": getattr(metrics, 'checkpoint_path', None) if metrics else None,
        "object_aware_prompts": os.getenv("OBJECT_AWARE_PROMPTS", "false"),
        "segmentation_routing": os.getenv("SEGMENTATION_ROUTING", "not-set"),
        "gpu_segmentation_model": os.getenv("GPU_SEGMENTATION_MODEL", "not-set"),
        "sam2_checkpoint": os.getenv("SAM2_CHECKPOINT", "not-set"),
        "debug_mask_diagnostics": os.getenv("DEBUG_MASK_DIAGNOSTICS", "false"),
    }


@app.post("/remove-bg")
async def remove_bg(request: Request):
    tier = request.headers.get("X-Image-Tier", "standard")
    request_id = request.headers.get("X-Request-ID", f"req-{os.urandom(4).hex()}")
    processed = _process_upload(await request.body(), request.headers.get("content-type"), "transparent", tier)
    return StreamingResponse(
        io.BytesIO(processed.content),
        media_type=processed.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{processed.filename}"',
            "X-Credits-Used": str(processed.credits_used),
            "X-Request-ID": request_id,
        },
    )


@app.post("/product-white")
async def product_white(request: Request):
    tier = request.headers.get("X-Image-Tier", "standard")
    request_id = request.headers.get("X-Request-ID", f"req-{os.urandom(4).hex()}")
    processed = _process_upload(await request.body(), request.headers.get("content-type"), "white", tier)
    return StreamingResponse(
        io.BytesIO(processed.content),
        media_type=processed.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{processed.filename}"',
            "X-Credits-Used": str(processed.credits_used),
            "X-Request-ID": request_id,
        },
    )


@app.post("/product-transparent")
async def product_transparent(request: Request):
    tier = request.headers.get("X-Image-Tier", "standard")
    request_id = request.headers.get("X-Request-ID", f"req-{os.urandom(4).hex()}")
    processed = _process_upload(await request.body(), request.headers.get("content-type"), "transparent", tier)
    return StreamingResponse(
        io.BytesIO(processed.content),
        media_type=processed.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{processed.filename}"',
            "X-Credits-Used": str(processed.credits_used),
            "X-Request-ID": request_id,
        },
    )


@app.get("/debug/runtime")
def debug_runtime():
    import os
    debug_enabled = os.getenv("DEBUG_MASK_DIAGNOSTICS", "false").lower() == "true"
    if not debug_enabled:
        raise HTTPException(status_code=404, detail="Debug endpoint not available")
    
    provider = _get_provider()
    metrics = provider.get_metrics()
    
    return {
        "debug_enabled": debug_enabled,
        "model": provider.name,
        "cuda_available": metrics.cuda_available if metrics else False,
        "device_name": metrics.device_name if metrics else None,
        "vram_allocated_mb": metrics.vram_allocated_mb if metrics else 0,
        "vram_reserved_mb": metrics.vram_reserved_mb if metrics else 0,
        "checkpoint_path": metrics.checkpoint_path if metrics else None,
        "config_path": metrics.config_path if metrics else None,
    }


@app.get("/debug/mask")
def debug_mask():
    debug_enabled = os.getenv("DEBUG_MASK_DIAGNOSTICS", "false").lower() == "true"
    if not debug_enabled:
        raise HTTPException(status_code=404, detail="Debug endpoint not available")
    
    provider = _get_provider()
    diagnostics = provider.get_diagnostics()
    
    if not diagnostics:
        raise HTTPException(status_code=404, detail="No diagnostics available. Process an image first.")
    
    return {
        "prompt_count": diagnostics.prompt_count,
        "prompt_coordinates": diagnostics.prompt_coordinates,
        "returned_mask_count": diagnostics.returned_mask_count,
        "raw_mask": diagnostics.raw_mask_stats,
        "postprocess_mask": diagnostics.postprocess_mask_stats,
        "final_png_mask": diagnostics.final_png_mask_stats,
    }


@app.get("/debug/components")
def debug_components():
    debug_enabled = os.getenv("DEBUG_MASK_DIAGNOSTICS", "false").lower() == "true"
    if not debug_enabled:
        raise HTTPException(status_code=404, detail="Debug endpoint not available")
    
    provider = _get_provider()
    diagnostics = provider.get_diagnostics()
    
    if not diagnostics:
        raise HTTPException(status_code=404, detail="No diagnostics available. Process an image first.")
    
    return {
        "connected_component_count": diagnostics.connected_component_count,
        "bounding_boxes": diagnostics.bounding_boxes,
        "centroids": diagnostics.centroids,
        "foreground_pct": diagnostics.foreground_pct,
        "largest_component_pct": diagnostics.largest_component_pct,
    }


@app.get("/debug/request/{request_id}")
def debug_request(request_id: str):
    trace = _request_traces.get(request_id)
    if not trace:
        raise HTTPException(status_code=404, detail=f"No trace found for request {request_id}")
    return trace
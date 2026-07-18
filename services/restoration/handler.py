"""RunPod Serverless handler for Old Photo Restoration.

Consolidated restoration endpoint handling all stages internally:
Damage Detection -> LaMa Inpainting -> Face Restoration -> Colorization -> Upscaling

All models are loaded once and kept resident in memory.
No HTTP communication between stages.
"""

import io
import json
import base64
import traceback
import os
import logging
import time

logger = logging.getLogger(__name__)


def handler(job):
    """RunPod handler for restoration jobs."""
    start_time = time.time()
    
    job_input = job.get("input", {})
    
    # Support test commands
    action = job_input.get("action", "restore")
    
    if action == "health":
        return _handle_health()
    if action == "gpu_info":
        return _handle_gpu_info()
    if action == "model_info":
        return _handle_model_info()
    if action == "benchmark":
        return _handle_benchmark(job_input)
    
    # Default: restore
    image_data = job_input.get("image") or job_input.get("input_image")
    if not image_data:
        return {"error": "No image provided", "status": "FAILED"}
    
    if image_data.startswith("data:"):
        image_data = image_data.split(",", 1)[1]
    
    raw_bytes = base64.b64decode(image_data)
    content_type = job_input.get("content_type", "image/png")
    file_name = job_input.get("file_name", "restored.png")
    lama_denoise = float(job_input.get("lama_denoise", os.environ.get("RESTORATION_LAMA_DENOISE", "0.3")))
    
    try:
        from app import _process_restoration
        
        processed = _process_restoration(
            raw=raw_bytes,
            content_type=content_type,
            file_name=file_name,
            lama_denoise=lama_denoise,
        )
        
        elapsed = time.time() - start_time
        output_b64 = base64.b64encode(processed.content).decode("utf-8")
        
        return {
            "image": output_b64,
            "media_type": processed.media_type,
            "filename": processed.filename,
            "credits_used": processed.credits_used,
            "processing_stages": processed.stages,
            "latency_seconds": round(elapsed, 3),
            "status": "COMPLETED",
        }
    except Exception as e:
        traceback.print_exc()
        logger.error(f"Restoration failed: {e}")
        return {
            "error": str(e),
            "status": "FAILED",
        }


def _handle_health():
    """Return endpoint health status."""
    try:
        import torch
        cuda_available = torch.cuda.is_available()
        gpu_name = torch.cuda.get_device_name(0) if cuda_available else None
        vram_total = torch.cuda.get_device_properties(0).total_memory / 1e9 if cuda_available else None
    except ImportError:
        cuda_available = False
        gpu_name = None
        vram_total = None
    
    from app import model_cache
    
    return {
        "status": "healthy",
        "device": "cuda" if cuda_available else "cpu",
        "gpu_name": gpu_name,
        "vram_total_gb": vram_total,
        "models_loaded": {
            "lama": model_cache.lama is not None,
            "gfpgan": model_cache.gfpgan is not None,
            "codeformer": model_cache.codeformer is not None,
            "ddcolor": model_cache.ddcolor is not None,
            "realesrgan": model_cache.realsrgan is not None,
        }
    }


def _handle_gpu_info():
    """Return detailed GPU information."""
    try:
        import torch
        if not torch.cuda.is_available():
            return {"cuda_available": False, "error": "CUDA not available"}
        
        info = {
            "cuda_available": True,
            "cuda_version": torch.version.cuda,
            "device_count": torch.cuda.device_count(),
            "devices": []
        }
        
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            info["devices"].append({
                "name": props.name,
                "total_vram_gb": round(props.total_memory / 1e9, 2),
                "compute_capability": f"{props.major}.{props.minor}",
            })
        
        return info
    except Exception as e:
        return {"error": str(e)}


def _handle_model_info():
    """Return model loading information."""
    from app import model_cache
    import os
    
    models = ["lama.pth", "GFPGAN.pth", "codeformer.pth", "ddcolor.pth", "RealESRGAN_x4.pth"]
    checkpoint_info = {}
    
    for m in models:
        path = f"/models/{m}"
        checkpoint_info[m] = {
            "exists": os.path.exists(path),
            "size_mb": round(os.path.getsize(path) / 1e6, 2) if os.path.exists(path) else None,
        }
    
    return {
        "model_cache": {
            "lama": model_cache.lama is not None,
            "gfpgan": model_cache.gfpgan is not None,
            "codeformer": model_cache.codeformer is not None,
            "ddcolor": model_cache.ddcolor is not None,
            "realesrgan": model_cache.realsrgan is not None,
        },
        "checkpoints": checkpoint_info,
    }


def _handle_benchmark(job_input):
    """Run a benchmark by processing a built-in test image."""
    from PIL import Image
    
    import numpy as np
    
    results = {}
    
    # Generate test images of different types
    test_images = {
        "grayscale_small": Image.new("L", (400, 300), color=128),
        "color_medium": Image.new("RGB", (640, 480), color=(180, 160, 140)),
        "color_large": Image.new("RGB", (1024, 1024), color=(200, 180, 160)),
    }
    
    for name, img in test_images.items():
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_bytes = buf.getvalue()
        
        from app import _process_restoration
        stage_times = {}
        overall_start = time.time()
        
        processed = _process_restoration(
            raw=img_bytes,
            content_type="image/png",
            file_name=f"benchmark-{name}.png",
        )
        
        overall_time = time.time() - overall_start
        
        results[name] = {
            "input_size": img.size,
            "output_size": Image.open(io.BytesIO(processed.content)).size,
            "stages": processed.stages,
            "latency_seconds": round(overall_time, 3),
            "credits": processed.credits_used,
        }
    
    return {
        "status": "COMPLETED",
        "benchmark_results": results,
    }


from app import app as fastapi_app

if __name__ == "__main__":
    import runpod
    runpod.serverless.start({"handler": handler})
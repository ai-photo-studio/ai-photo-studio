"""RunPod Serverless handler for Old Photo Restoration."""
import io, json, base64, traceback, os, logging, time

logger = logging.getLogger(__name__)

def handler(job):
    start_time = time.time()
    job_input = job.get("input", {})
    action = job_input.get("action", "restore")

    if action == "health":
        return _handle_health()

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
        processed = _process_restoration(raw=raw_bytes, content_type=content_type, file_name=file_name, lama_denoise=lama_denoise)
        return {
            "image": base64.b64encode(processed.content).decode("utf-8"),
            "media_type": processed.media_type,
            "filename": processed.filename,
            "credits_used": processed.credits_used,
            "processing_stages": processed.stages,
            "latency_seconds": round(time.time() - start_time, 3),
            "status": "COMPLETED",
        }
    except Exception as e:
        traceback.print_exc()
        logger.error(f"Restoration failed: {e}")
        return {"error": str(e), "status": "FAILED"}

def _handle_health():
    try:
        import torch
        cuda = torch.cuda.is_available()
        gpu = torch.cuda.get_device_name(0) if cuda else None
        vram = torch.cuda.get_device_properties(0).total_memory / 1e9 if cuda else None
    except:
        cuda, gpu, vram = False, None, None
    from app import model_cache
    return {
        "status": "healthy",
        "device": "cuda" if cuda else "cpu",
        "gpu_name": gpu,
        "vram_total_gb": vram,
        "models_loaded": {
            "lama": model_cache.lama is not None,
            "gfpgan": model_cache.gfpgan is not None,
            "codeformer": model_cache.codeformer is not None,
            "ddcolor": model_cache.ddcolor is not None,
            "realesrgan": model_cache.realesrgan is not None,
        }
    }

if __name__ == "__main__":
    import runpod
    runpod.serverless.start({"handler": handler})
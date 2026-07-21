"""RunPod Serverless handler for Old Photo Restoration."""
import io, json, base64, traceback, os, logging, time, gc, threading

import torch

logger = logging.getLogger(__name__)

QUEUE_TIMEOUT_SECONDS = int(os.getenv("QUEUE_TIMEOUT_SECONDS", "60"))
PROCESSING_TIMEOUT_SECONDS = int(os.getenv("PROCESSING_TIMEOUT_SECONDS", "90"))
ABSOLUTE_TIMEOUT_SECONDS = int(os.getenv("ABSOLUTE_TIMEOUT_SECONDS", "150"))

def _gpu_cleanup():
    try:
        start = time.time()
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
        torch.cuda.ipc_collect()
        gc.collect()
        elapsed = round(time.time() - start, 3)
        logger.info(f"GPU_CLEANUP completed in {elapsed}s")
    except Exception as e:
        logger.error(f"GPU_CLEANUP failed: {e}")

def handler(job):
    start_time = time.time()
    job_input = job.get("input", {})
    action = job_input.get("action", "restore")

    if action == "health":
        return _handle_health()

    queue_wait = job_input.get("__queue_wait_seconds", 0)
    if queue_wait > QUEUE_TIMEOUT_SECONDS:
        logger.warning(f"QUEUE_TIMEOUT job exceeded {QUEUE_TIMEOUT_SECONDS}s queue wait (waited {queue_wait}s)")
        return {"error": f"Queue timeout after {queue_wait}s", "status": "TIMED_OUT", "timeout_type": "queue"}

    now = time.time()
    if now - start_time > ABSOLUTE_TIMEOUT_SECONDS:
        logger.warning(f"ABSOLUTE_TIMEOUT job exceeded {ABSOLUTE_TIMEOUT_SECONDS}s absolute timeout")
        return {"error": f"Absolute timeout after {ABSOLUTE_TIMEOUT_SECONDS}s", "status": "TIMED_OUT", "timeout_type": "absolute"}

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
        from app import _process_restoration, TENSOR_STATS, TENSOR_STATS_LOCK
        processing_start = time.time()
        processed = _process_restoration(raw=raw_bytes, content_type=content_type, file_name=file_name, lama_denoise=lama_denoise)
        processing_time = round(time.time() - processing_start, 3)
        
        # Capture tensor stats
        tensor_info = {}
        with TENSOR_STATS_LOCK:
            if TENSOR_STATS:
                tensor_info = dict(TENSOR_STATS)
                TENSOR_STATS.clear()
        
        if processing_time > PROCESSING_TIMEOUT_SECONDS:
            logger.warning(f"PROCESSING_TIMEOUT exceeded {PROCESSING_TIMEOUT_SECONDS}s (took {processing_time}s)")
            return {"error": f"Processing timeout after {processing_time}s", "status": "TIMED_OUT", "timeout_type": "processing"}
        
        total_time = round(time.time() - start_time, 3)
        logger.info(f"QUEUE_WAIT={queue_wait}s PROCESSING_TIME={processing_time}s TOTAL_TIME={total_time}s")
        
        result = {
            "image": base64.b64encode(processed.content).decode("utf-8"),
            "media_type": processed.media_type,
            "filename": processed.filename,
            "credits_used": processed.credits_used,
            "processing_stages": processed.stages,
            "latency_seconds": total_time,
            "status": "COMPLETED",
        }
        
        if tensor_info:
            result["tensor_stats"] = tensor_info
            logger.info(f"TENSOR_STATS included in response: {json.dumps(tensor_info, default=str)}")
        
        return result
    except Exception as e:
        traceback.print_exc()
        logger.error(f"Restoration failed: {e}")
        return {"error": str(e), "status": "FAILED"}
    finally:
        _gpu_cleanup()

def _handle_health():
    try:
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
            "realesrgan": model_cache.realsrgan is not None,
        }
    }

if __name__ == "__main__":
    import runpod
    runpod.serverless.start({"handler": handler})

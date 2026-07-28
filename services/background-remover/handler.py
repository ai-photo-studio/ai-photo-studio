"""RunPod Serverless handler for background remover."""
import io, json, base64, traceback, os, gc, time, logging

import numpy as np
import torch

from PIL import Image
from app import _process_upload, ProcessedImage

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
    output = job_input.get("output", "transparent")
    tier = job_input.get("tier", "standard")

    try:
        processing_start = time.time()
        result: ProcessedImage = _process_upload(
            raw=raw_bytes,
            content_type=content_type,
            output=output,
            tier=tier,
        )
        processing_time = round(time.time() - processing_start, 3)

        if processing_time > PROCESSING_TIMEOUT_SECONDS:
            logger.warning(f"PROCESSING_TIMEOUT exceeded {PROCESSING_TIMEOUT_SECONDS}s (took {processing_time}s)")
            return {"error": f"Processing timeout after {processing_time}s", "status": "TIMED_OUT", "timeout_type": "processing"}

        total_time = round(time.time() - start_time, 3)
        logger.info(f"QUEUE_WAIT={queue_wait}s PROCESSING_TIME={processing_time}s TOTAL_TIME={total_time}s")

        output_b64 = base64.b64encode(result.content).decode("utf-8")

        return {
            "image": output_b64,
            "media_type": result.media_type,
            "filename": result.filename,
            "credits_used": result.credits_used,
            "status": "COMPLETED",
        }
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "status": "FAILED"}
    finally:
        _gpu_cleanup()

app = __import__("app").app

if __name__ == "__main__":
    import runpod
    runpod.serverless.start({"handler": handler})

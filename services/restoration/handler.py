"""RunPod Serverless handler for Old Photo Restoration.

Consolidated restoration endpoint handling all stages internally:
Damage Detection → LaMa Inpainting → Face Restoration → Colorization → Upscaling

All models are loaded once and kept resident in memory.
No HTTP communication between stages.
"""

import io
import json
import base64
import traceback
import os
import logging

logger = logging.getLogger(__name__)


def handler(job):
    """RunPod handler for restoration jobs."""
    
    job_input = job.get("input", {})
    
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
        
        output_b64 = base64.b64encode(processed.content).decode("utf-8")
        
        return {
            "image": output_b64,
            "media_type": processed.media_type,
            "filename": processed.filename,
            "credits_used": processed.credits_used,
            "processing_stages": processed.stages,
            "status": "COMPLETED",
        }
    except Exception as e:
        traceback.print_exc()
        logger.error(f"Restoration failed: {e}")
        return {
            "error": str(e),
            "status": "FAILED",
        }


from app import app as fastapi_app

if __name__ == "__main__":
    import runpod
    runpod.serverless.start({"handler": handler})
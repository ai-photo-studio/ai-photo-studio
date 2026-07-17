"""RunPod Serverless handler for background remover.

Wraps the existing FastAPI _process_upload function for RunPod Serverless execution.
Uses the same processing logic, only the transport layer changes.
"""

import io
import json
import base64
import traceback
from typing import Literal

from PIL import Image

# Import existing processing function
from app import _process_upload, ProcessedImage


def handler(job):
    """RunPod handler for background removal jobs."""
    
    job_input = job.get("input", {})
    
    # Support both direct base64 and data URI formats
    image_data = job_input.get("image") or job_input.get("input_image")
    if not image_data:
        return {"error": "No image provided", "status": "FAILED"}
    
    # Decode base64 (handle data URI prefix)
    if image_data.startswith("data:"):
        image_data = image_data.split(",", 1)[1]
    
    raw_bytes = base64.b64decode(image_data)
    content_type = job_input.get("content_type", "image/png")
    output = job_input.get("output", "transparent")
    tier = job_input.get("tier", "standard")
    
    try:
        result: ProcessedImage = _process_upload(
            raw=raw_bytes,
            content_type=content_type,
            output=output,
            tier=tier,
        )
        
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
        return {
            "error": str(e),
            "status": "FAILED",
        }


# Keep the original FastAPI app available for local development
app = __import__("app").app


if __name__ == "__main__":
    # When running directly with `python handler.py`, start RunPod serverless
    import runpod
    runpod.serverless.start({"handler": handler})

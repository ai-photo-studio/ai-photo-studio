"""RunPod Serverless handler for Real-ESRGAN upscaling."""

import io
import json
import base64
import traceback
import os

import sys
sys.path.insert(0, os.path.dirname(__file__))

from app import _process_upload, EnhancedImage


def handler(job):
    job_input = job.get("input", {})
    image_data = job_input.get("image") or job_input.get("input_image")
    if not image_data:
        return {"error": "No image provided", "status": "FAILED"}
    if image_data.startswith("data:"):
        image_data = image_data.split(",", 1)[1]
    raw_bytes = base64.b64decode(image_data)
    content_type = job_input.get("content_type", "image/png")
    file_name = job_input.get("file_name", "product.png")
    scale = float(job_input.get("scale", os.environ.get("REAL_ESRGAN_SCALE", "2.0")))
    sharpen = float(job_input.get("sharpen", os.environ.get("REAL_ESRGAN_SHARPEN", "0.55")))
    denoise = float(job_input.get("denoise", os.environ.get("REAL_ESRGAN_DENOISE", "0.3")))
    try:
        result: EnhancedImage = _process_upload(raw_bytes, content_type, file_name, scale, sharpen, denoise)
        output_b64 = base64.b64encode(result.content).decode("utf-8")
        return {"image": output_b64, "media_type": result.media_type, "filename": result.filename, "status": "COMPLETED"}
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "status": "FAILED"}


from app import app as fastapi_app

if __name__ == "__main__":
    import runpod
    runpod.serverless.start({"handler": handler})

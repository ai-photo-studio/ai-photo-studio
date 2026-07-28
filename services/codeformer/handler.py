"""RunPod Serverless handler for CodeFormer face enhancement."""

import io
import json
import base64
import traceback
import os

import sys
sys.path.insert(0, os.path.dirname(__file__))

from app import _process_upload


def handler(job):
    job_input = job.get("input", {})
    image_data = job_input.get("image") or job_input.get("input_image")
    if not image_data:
        return {"error": "No image provided", "status": "FAILED"}
    if image_data.startswith("data:"):
        image_data = image_data.split(",", 1)[1]
    raw_bytes = base64.b64decode(image_data)
    content_type = job_input.get("content_type", "image/png")
    file_name = job_input.get("file_name", "image.png")
    fidelity = float(job_input.get("fidelity", os.environ.get("CODEFORMER_FIDELITY", "0.5")))
    denoise = float(job_input.get("denoise", os.environ.get("CODEFORMER_DENOISE", "0.4")))
    try:
        result_bytes, result_type, result_name = _process_upload(raw_bytes, content_type, file_name, fidelity, denoise)
        output_b64 = base64.b64encode(result_bytes).decode("utf-8")
        return {"image": output_b64, "media_type": result_type, "filename": result_name, "status": "COMPLETED"}
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "status": "FAILED"}


from app import app as fastapi_app

if __name__ == "__main__":
    import runpod
    runpod.serverless.start({"handler": handler})

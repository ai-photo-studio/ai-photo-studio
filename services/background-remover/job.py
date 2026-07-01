from __future__ import annotations

import os
import sys
import io
import json
import urllib.request
import urllib.error
from PIL import Image
from rembg import new_session

_session = None

def get_session():
    global _session
    if _session is None:
        model = os.getenv("REMBG_MODEL", "u2netp")
        _session = new_session(model)
    return _session

def download_image(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=300) as response:
        content_type = response.headers.get("Content-Type", "image/jpeg")
        return response.read(), content_type

def upload_image(url: str, data: bytes, content_type: str) -> str:
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": content_type},
        method="PUT"
    )
    with urllib.request.urlopen(req, timeout=300) as response:
        return response.headers.get("Location", url)

def remove_background(image_bytes: bytes) -> bytes:
    session = get_session()
    return session.process(image_bytes)

def process_job(job_data: dict) -> dict:
    storage_key = job_data["storageKey"]
    r2_url = job_data["r2Url"]
    processing_job_id = job_data["processingJobId"]
    callback_url = job_data["callbackUrl"]
    
    try:
        image_bytes, content_type = download_image(r2_url)
        result_bytes = remove_background(image_bytes)
        
        result_url = upload_image(
            f"{r2_url}?processed=true",
            result_bytes,
            "image/png"
        )
        
        urllib.request.urlopen(
            urllib.request.Request(
                callback_url,
                data=json.dumps({
                    processingJobId: processing_job_id,
                    resultUrl: result_url,
                    status: "completed"
                }).encode(),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
        )
        
        return {"status": "completed", "processingJobId": processing_job_id}
    except Exception as e:
        return {"status": "failed", "processingJobId": processing_job_id, "error": str(e)}

def main():
    job_data = json.loads(sys.argv[1] if len(sys.argv) > 1 else "{}")
    result = process_job(job_data)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
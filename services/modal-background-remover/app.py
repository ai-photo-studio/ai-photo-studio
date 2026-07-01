import io
import os
import base64
from typing import Tuple

import modal
from PIL import Image

app = modal.App("background-remover")

image = modal.Image.pip_install(
    "rembg",
    "pillow",
    "fastapi",
    "uvicorn",
)

volume = modal.Volume.from_name("background-remover-vol") if os.getenv("MODAL_VOLUME") else None

def preprocess_image(image_bytes: bytes, max_dimension: int) -> Tuple[bytes, int, int]:
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    
    width, height = img.size
    if max(width, height) > max_dimension:
        ratio = max_dimension / max(width, height)
        new_size = (int(width * ratio), int(height * ratio))
        img = img.resize(new_size, Image.Resampling.LANCZOS)
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue(), img.width, img.height

@app.function(image=image, volumes={} if not volume else {"/data": volume})
def remove_background_modal(image_bytes: bytes, max_dimension: int = 2000) -> bytes:
    processed_bytes, width, height = preprocess_image(image_bytes, max_dimension)
    
    from rembg import remove
    output_bytes = remove(processed_bytes)
    return output_bytes

@app.local_entrypoint()
def main(image_path: str, max_dimension: int = 2000):
    with open(image_path, "rb") as f:
        image_bytes = f.read()
    
    result = remove_background_modal.remote(image_bytes, max_dimension)
    
    output_path = image_path.replace(".", "_transparent.")
    with open(output_path, "wb") as f:
        f.write(result)
    
    print(f"Saved to {output_path}")

@app.web_endpoint()
def web_remove_background(request: modal.Request) -> bytes:
    image_b64 = request.query_params.get("image")
    max_dim = int(request.query_params.get("max_dimension", "2000"))
    
    if not image_b64:
        return {"error": "Missing 'image' parameter"}, 400
    
    image_bytes = base64.b64decode(image_b64)
    result = remove_background_modal.remote(image_bytes, max_dim)
    return result
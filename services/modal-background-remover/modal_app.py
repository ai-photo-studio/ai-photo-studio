import io
import os
import base64

import modal
from PIL import Image

app = modal.App("background-remover")
image_volume = modal.CachedVolume.from_name("background-remover-images")

@app.function(volumes={"/images": image_volume})
def remove_background_modal(image_bytes: bytes, max_dimension: int = 2000) -> bytes:
    from rembg import remove
    
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    
    width, height = img.size
    if max(width, height) > max_dimension:
        ratio = max_dimension / max(width, height)
        new_size = (int(width * ratio), int(height * ratio))
        img = img.resize(new_size, Image.Resampling.LANCZOS)
    
    output_bytes = remove(img.convert("RGB"))
    return output_bytes

@app.web_endpoint()
def web_remove_background(request: dict) -> bytes:
    image_b64 = request.get("image")
    max_dimension = request.get("max_dimension", 2000)
    
    if not image_b64:
        return {"error": "Missing image parameter"}, 400
    
    image_bytes = base64.b64decode(image_b64)
    result = remove_background_modal.remote(image_bytes, max_dimension)
    return result

@app.local_entrypoint()
def main(image_path: str, max_dimension: int = 2000):
    with open(image_path, "rb") as f:
        image_bytes = f.read()
    
    result = remove_background_modal.remote(image_bytes, max_dimension)
    
    output_path = image_path.replace(".", "_transparent.")
    with open(output_path, "wb") as f:
        f.write(result)
    
    print(f"Saved to {output_path}")
from __future__ import annotations

import os
import io

from PIL import Image

from . import BackgroundRemoverProvider, ImageResult

_model = None

def _get_model():
    global _model
    if _model is None:
        from rembg import new_session
        model_name = os.getenv("REMBG_MODEL", "u2net")
        _model = new_session(model_name)
    return _model

class LocalRembgProvider(BackgroundRemoverProvider):
    @property
    def name(self) -> str:
        return "rembg-local"
    
    @property
    def is_enabled(self) -> bool:
        return True
    
    def remove_background(self, image_bytes: bytes, max_dimension: int) -> ImageResult:
        session = _get_model()
        pil_image = Image.open(io.BytesIO(image_bytes))
        results = session.predict(pil_image)
        result_image = results[0] if results else pil_image
        if result_image.mode == "L":
            rgba = pil_image.convert("RGBA")
            r, g, b = rgba.split()[:3]
            result_image = Image.merge("RGBA", (r, g, b, result_image))
        elif result_image.mode != "RGBA":
            result_image = result_image.convert("RGBA")
        buf = io.BytesIO()
        result_image.save(buf, format="PNG")
        output_bytes = buf.getvalue()
        credits = 0.0
        
        return ImageResult(
            content=output_bytes,
            media_type="image/png",
            credits_used=credits,
        )
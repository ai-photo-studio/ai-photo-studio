from __future__ import annotations

import io

from PIL import Image

from . import BackgroundRemoverProvider, ImageResult


class LocalRembgProvider(BackgroundRemoverProvider):
    @property
    def name(self) -> str:
        return "rembg-local"
    
    @property
    def is_enabled(self) -> bool:
        return True
    
    def remove_background(self, image_bytes: bytes, max_dimension: int) -> ImageResult:
        from rembg import remove
        
        output_bytes = remove(image_bytes)
        credits = 0.0
        
        return ImageResult(
            content=output_bytes,
            media_type="image/png",
            credits_used=credits,
        )
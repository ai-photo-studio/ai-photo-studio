from __future__ import annotations

import base64
import io
import os

import requests

from . import BackgroundRemoverProvider, ImageResult


class ModalProvider(BackgroundRemoverProvider):
    @property
    def name(self) -> str:
        return "modal"
    
    @property
    def is_enabled(self) -> bool:
        return os.getenv("MODAL_ENABLED") == "1" and os.getenv("MODAL_API_KEY")
    
    def remove_background(self, image_bytes: bytes, max_dimension: int) -> ImageResult:
        api_key = os.getenv("MODAL_API_KEY")
        endpoint = os.getenv("MODAL_ENDPOINT")
        timeout = int(os.getenv("MODAL_TIMEOUT", "120"))
        
        if not endpoint:
            raise ValueError("MODAL_ENDPOINT not configured")
        
        image_b64 = base64.b64encode(image_bytes).decode()
        
        response = requests.post(
            f"{endpoint}/web-remove-background",
            json={"image": image_b64, "max_dimension": max_dimension},
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )
        response.raise_for_status()
        
        output_bytes = response.content
        credits = self._calculate_credits(image_bytes)
        
        return ImageResult(
            content=output_bytes,
            media_type="image/png",
            credits_used=credits,
        )
    
    def _calculate_credits(self, image_bytes: bytes) -> float:
        image = Image.open(io.BytesIO(image_bytes))
        megapixels = (image.width * image.height) / 1_000_000
        return round(max(0.1, megapixels * 0.4), 2)
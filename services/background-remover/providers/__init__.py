from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass

import requests


@dataclass
class ImageResult:
    content: bytes
    media_type: str
    credits_used: float


class BackgroundRemoverProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass
    
    @property
    @abstractmethod
    def is_enabled(self) -> bool:
        pass
    
    @abstractmethod
    def remove_background(self, image_bytes: bytes, max_dimension: int) -> ImageResult:
        pass


def get_provider() -> BackgroundRemoverProvider:
    if os.getenv("MODAL_ENABLED") == "1":
        from providers.modal import ModalProvider
        return ModalProvider()
    from local import LocalRembgProvider
    return LocalRembgProvider()
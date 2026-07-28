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


_gpu_provider = None
_cpu_provider = None


def get_provider() -> BackgroundRemoverProvider:
    global _gpu_provider, _cpu_provider
    
    routing = os.getenv("SEGMENTATION_ROUTING", "hybrid")
    
    if routing == "gpu":
        if _gpu_provider is None:
            from providers.gpu_provider import GPUSAM2Provider
            _gpu_provider = GPUSAM2Provider()
        if _gpu_provider.is_enabled:
            return _gpu_provider
    
    if routing == "cpu":
        if _cpu_provider is None:
            from providers.local import LocalRembgProvider
            _cpu_provider = LocalRembgProvider()
        return _cpu_provider
    
    if routing == "hybrid":
        if _gpu_provider is None:
            from providers.gpu_provider import GPUSAM2Provider
            _gpu_provider = GPUSAM2Provider()
        if _gpu_provider.is_enabled:
            return _gpu_provider
    
    if os.getenv("MODAL_ENABLED") == "1":
        from providers.modal import ModalProvider
        return ModalProvider()
    
    if _cpu_provider is None:
        from providers.local import LocalRembgProvider
        _cpu_provider = LocalRembgProvider()
    return _cpu_provider
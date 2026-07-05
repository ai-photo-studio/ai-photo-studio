"""
GPU Segmentation Provider using SAM2

This provider uses Segment Anything Model 2 (SAM2) for GPU-accelerated
background removal. It requires CUDA-enabled PyTorch.

Usage:
    Set SEGMENTATION_ROUTING=gpu and GPU_SEGMENTATION_MODEL=sam2

Environment Variables:
    SAM2_CHECKPOINT: Path to SAM2 checkpoint (default: /models/sam2_hiera_base_plus.pt)
    GPU_SEGMENTATION_MODEL: Model variant (default: sam2)
"""
from __future__ import annotations

import os
import io
import time
from dataclasses import dataclass

import torch
from PIL import Image
from hydra import compose, initialize_config_dir
from hydra.core.global_hydra import GlobalHydra

from . import BackgroundRemoverProvider, ImageResult


@dataclass
class GPUMetrics:
    cuda_available: bool
    device_name: str | None
    vram_allocated_mb: float
    vram_reserved_mb: float
    latency_ms: float
    checkpoint_path: str
    config_path: str


class GPUSAM2Provider(BackgroundRemoverProvider):
    def __init__(self):
        self._model = None
        self._device = None
        self._checkpoint_path = os.getenv("SAM2_CHECKPOINT", "/models/sam2_hiera_base_plus.pt")
        self._config_dir = "/usr/local/lib/python3.11/dist-packages/sam2/configs/sam2"
        self._model_name = os.getenv("GPU_SEGMENTATION_MODEL", "sam2_hiera_base_plus")

    @property
    def name(self) -> str:
        return "gpu-sam2"

    @property
    def is_enabled(self) -> bool:
        return (
            os.getenv("SEGMENTATION_ROUTING") == "gpu"
            and torch.cuda.is_available()
            and os.path.exists(self._checkpoint_path)
        )

    def _get_device(self):
        if self._device is None:
            self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        return self._device

    def _load_model(self):
        if self._model is not None:
            return self._model

        from sam2.build_sam import build_sam2

        device = self._get_device()

        config_path = os.path.join(self._config_dir, f"{self._model_name}.yaml")
        if not os.path.exists(config_path):
            available_configs = []
            if os.path.exists(self._config_dir):
                available_configs = [f for f in os.listdir(self._config_dir) if f.endswith('.yaml')]
            raise FileNotFoundError(
                f"SAM2 config not found: {config_path}. "
                f"Available configs: {available_configs}"
            )

        if not os.path.exists(self._checkpoint_path):
            raise FileNotFoundError(
                f"SAM2 checkpoint not found: {self._checkpoint_path}"
            )

        GlobalHydra.instance().clear()
        with initialize_config_dir(config_dir=self._config_dir, version_base="1.1"):
            cfg = compose(config_name=f"{self._model_name}")

        self._model = build_sam2(
            model_cfg=cfg,
            checkpoint=self._checkpoint_path,
            device=device,
        )
        self._model.eval()

        return self._model

    def remove_background(self, image_bytes: bytes, max_dimension: int) -> ImageResult:
        start_time = time.time()

        model = self._load_model()
        device = self._get_device()

        pil_image = Image.open(io.BytesIO(image_bytes))
        if pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")

        if max(pil_image.size) > max_dimension:
            scale = max_dimension / max(pil_image.size)
            new_size = (int(pil_image.width * scale), int(pil_image.height * scale))
            pil_image = pil_image.resize(new_size, Image.Resampling.LANCZOS)

        image_tensor = torch.tensor(
            self._image_to_tensor(pil_image),
            device=device,
        )

        with torch.no_grad():
            masks, _, _ = model.predict(
                image_tensor.unsqueeze(0),
                point_coords=None,
                point_labels=None,
            )

        mask = masks[0, 0].cpu().numpy().astype("uint8") * 255
        mask_pil = Image.fromarray(mask).convert("RGBA")

        original_rgba = pil_image.convert("RGBA")
        alpha_channel = Image.fromarray(mask).convert("L")
        result_image = Image.merge("RGBA", [*original_rgba.split()[:3], alpha_channel])

        buf = io.BytesIO()
        result_image.save(buf, format="PNG")
        output_bytes = buf.getvalue()

        latency_ms = (time.time() - start_time) * 1000
        vram_allocated = torch.cuda.memory_allocated(device) / 1024 / 1024
        vram_reserved = torch.cuda.memory_reserved(device) / 1024 / 1024

        metrics = GPUMetrics(
            cuda_available=torch.cuda.is_available(),
            device_name=torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            vram_allocated_mb=vram_allocated,
            vram_reserved_mb=vram_reserved,
            latency_ms=latency_ms,
            checkpoint_path=self._checkpoint_path,
            config_path=os.path.join(self._config_dir, f"{self._model_name}.yaml"),
        )

        self._metrics = metrics
        self._last_mask_size = mask.shape if hasattr(mask, 'shape') else None

        credits = 0.0
        return ImageResult(
            content=output_bytes,
            media_type="image/png",
            credits_used=credits,
        )

    def _image_to_tensor(self, image: Image.Image) -> list:
        import numpy as np
        img_array = np.array(image)
        img_normalized = img_array.astype("float32") / 255.0
        return img_normalized.transpose(2, 0, 1).tolist()

    def get_metrics(self) -> GPUMetrics | None:
        return getattr(self, '_metrics', None)
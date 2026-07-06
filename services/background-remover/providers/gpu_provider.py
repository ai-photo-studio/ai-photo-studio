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
import logging
from dataclasses import dataclass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
        logger.info("MARKER 001: __init__ start")
        self._model = None
        self._device = None
        self._checkpoint_path = os.getenv("SAM2_CHECKPOINT", "/models/sam2_hiera_base_plus.pt")
        self._config_dir = "/usr/local/lib/python3.11/dist-packages/sam2/configs/sam2"
        self._model_name = os.getenv("GPU_SEGMENTATION_MODEL", "sam2_hiera_base_plus")
        logger.info("MARKER 002: __init__ complete")

    @property
    def name(self) -> str:
        return "gpu-sam2"

    @property
    def is_enabled(self) -> bool:
        logger.info("MARKER 003: is_enabled check start")
        result = (
            os.getenv("SEGMENTATION_ROUTING") == "gpu"
            and torch.cuda.is_available()
            and os.path.exists(self._checkpoint_path)
        )
        logger.info(f"MARKER 004: is_enabled result={result}, cuda={torch.cuda.is_available()}, checkpoint_exists={os.path.exists(self._checkpoint_path)}")
        return result

    def _get_device(self):
        logger.info("MARKER 005: _get_device start")
        if self._device is None:
            logger.info("MARKER 006: CUDA available check")
            if torch.cuda.is_available():
                self._device = torch.device("cuda")
                logger.info("MARKER 007: Device set to cuda")
            else:
                self._device = torch.device("cpu")
                logger.info("MARKER 007b: Device set to cpu")
        logger.info(f"MARKER 008: _get_device complete device={self._device}")
        return self._device

    def _load_model(self):
        logger.info("MARKER 009: _load_model start")
        if self._model is not None:
            logger.info("MARKER 010: model already loaded")
            return self._model

        logger.info("MARKER 011: importing build_sam2")
        from sam2.build_sam import build_sam2
        logger.info("MARKER 012: build_sam2 imported")

        device = self._get_device()

        config_path = os.path.join(self._config_dir, f"{self._model_name}.yaml")
        logger.info(f"MARKER 013: config_path={config_path}")
        
        if not os.path.exists(config_path):
            logger.error(f"MARKER 013b: config NOT found at {config_path}")
            available_configs = []
            if os.path.exists(self._config_dir):
                available_configs = [f for f in os.listdir(self._config_dir) if f.endswith('.yaml')]
            raise FileNotFoundError(
                f"SAM2 config not found: {config_path}. "
                f"Available configs: {available_configs}"
            )
        logger.info("MARKER 014: config file exists")

        if not os.path.exists(self._checkpoint_path):
            logger.error(f"MARKER 015: checkpoint NOT found at {self._checkpoint_path}")
            raise FileNotFoundError(
                f"SAM2 checkpoint not found: {self._checkpoint_path}"
            )
        logger.info("MARKER 016: checkpoint file exists")

        logger.info("MARKER 017: clearing GlobalHydra")
        GlobalHydra.instance().clear()
        logger.info("MARKER 018: initializing config_dir with Hydra")
        with initialize_config_dir(config_dir=self._config_dir, version_base="1.1"):
            logger.info("MARKER 019: composing config")
            cfg = compose(config_name=f"{self._model_name}")
            logger.info(f"MARKER 020: config composed cfg={cfg}")

        logger.info("MARKER 021: calling build_sam2 start")
        try:
            self._model = build_sam2(
                model_cfg=cfg,
                checkpoint=self._checkpoint_path,
                device=device,
            )
            logger.info("MARKER 022: build_sam2 completed")
        except Exception as e:
            logger.error(f"MARKER 022x: build_sam2 failed with error: {e}")
            raise
        
        logger.info("MARKER 023: setting model to eval mode")
        self._model.eval()
        logger.info("MARKER 024: _load_model complete")

        return self._model

    def remove_background(self, image_bytes: bytes, max_dimension: int) -> ImageResult:
        logger.info("MARKER 100: remove_background start")
        start_time = time.time()

        logger.info("MARKER 101: loading model")
        model = self._load_model()
        logger.info("MARKER 102: model loaded")
        
        logger.info("MARKER 103: getting device")
        device = self._get_device()
        logger.info(f"MARKER 104: device={device}")

        logger.info("MARKER 105: opening image")
        pil_image = Image.open(io.BytesIO(image_bytes))
        logger.info("MARKER 106: image opened")
        
        if pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")
            logger.info("MARKER 107: image converted to RGB")

        if max(pil_image.size) > max_dimension:
            scale = max_dimension / max(pil_image.size)
            new_size = (int(pil_image.width * scale), int(pil_image.height * scale))
            pil_image = pil_image.resize(new_size, Image.Resampling.LANCZOS)
            logger.info(f"MARKER 108: image resized to {new_size}")

        logger.info("MARKER 109: converting image to tensor")
        image_tensor_data = self._image_to_tensor(pil_image)
        logger.info(f"MARKER 110: tensor data shape={len(image_tensor_data)}x{len(image_tensor_data[0])}x{len(image_tensor_data[0][0])}")
        
        logger.info("MARKER 111: creating torch tensor on device")
        image_tensor = torch.tensor(
            image_tensor_data,
            device=device,
        )
        logger.info(f"MARKER 112: tensor created shape={image_tensor.shape}")

        logger.info("MARKER 113: unsqueezing tensor")
        image_tensor = image_tensor.unsqueeze(0)
        logger.info(f"MARKER 114: tensor unsqueezed shape={image_tensor.shape}")

        logger.info("MARKER 115: entering torch.no_grad() context")
        with torch.no_grad():
            logger.info("MARKER 116: calling model.predict()")
            try:
                masks, _, _ = model.predict(
                    image_tensor,
                    point_coords=None,
                    point_labels=None,
                )
                logger.info(f"MARKER 117: predict completed, masks shape={masks.shape}")
            except Exception as e:
                logger.error(f"MARKER 117x: predict failed with error: {type(e).__name__}: {e}")
                raise

        logger.info("MARKER 118: extracting mask")
        mask = masks[0, 0].cpu().numpy().astype("uint8") * 255
        logger.info(f"MARKER 119: mask extracted shape={mask.shape}")
        
        logger.info("MARKER 120: converting mask to PIL RGBA")
        mask_pil = Image.fromarray(mask).convert("RGBA")
        logger.info("MARKER 121: mask converted to PIL")

        logger.info("MARKER 122: creating result image")
        original_rgba = pil_image.convert("RGBA")
        alpha_channel = Image.fromarray(mask).convert("L")
        result_image = Image.merge("RGBA", [*original_rgba.split()[:3], alpha_channel])
        logger.info("MARKER 123: result image created")

        logger.info("MARKER 124: encoding to PNG")
        buf = io.BytesIO()
        result_image.save(buf, format="PNG")
        output_bytes = buf.getvalue()
        logger.info(f"MARKER 125: PNG encoded size={len(output_bytes)}")

        latency_ms = (time.time() - start_time) * 1000
        logger.info(f"MARKER 126: latency={latency_ms}ms")
        
        vram_allocated = 0
        vram_reserved = 0
        if device.type == "cuda":
            vram_allocated = torch.cuda.memory_allocated(device) / 1024 / 1024
            vram_reserved = torch.cuda.memory_reserved(device) / 1024 / 1024
        logger.info(f"MARKER 127: VRAM allocated={vram_allocated}MB reserved={vram_reserved}MB")

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
        logger.info("MARKER 128: returning ImageResult")
        return ImageResult(
            content=output_bytes,
            media_type="image/png",
            credits_used=credits,
        )

    def _image_to_tensor(self, image: Image.Image) -> list:
        logger.info("MARKER 200: _image_to_tensor start")
        import numpy as np
        img_array = np.array(image)
        img_normalized = img_array.astype("float32") / 255.0
        result = img_normalized.transpose(2, 0, 1).tolist()
        logger.info("MARKER 201: _image_to_tensor complete")
        return result

    def get_metrics(self) -> GPUMetrics | None:
        return getattr(self, '_metrics', None)
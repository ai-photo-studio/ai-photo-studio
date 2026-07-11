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
import torch.nn.functional as F
import numpy as np
from PIL import Image, ImageFilter

from . import BackgroundRemoverProvider, ImageResult
from .prompt_strategies import get_prompt_points, STRATEGIES

PROMPT_STRATEGY = os.getenv("PROMPT_STRATEGY", "strategy_7")
OBJECT_AWARE_PROMPTS = os.getenv("OBJECT_AWARE_PROMPTS", "false").lower() == "true"
DEBUG_MASK_DIAGNOSTICS = os.getenv("DEBUG_MASK_DIAGNOSTICS", "false").lower() == "true"


@dataclass
class GPUMetrics:
    cuda_available: bool
    device_name: str | None
    vram_allocated_mb: float
    vram_reserved_mb: float
    latency_ms: float
    checkpoint_path: str
    config_path: str


@dataclass
class MaskDiagnostics:
    prompt_count: int
    prompt_coordinates: list
    returned_mask_count: int
    connected_component_count: int
    bounding_boxes: list
    centroids: list
    foreground_pct: float
    largest_component_pct: float
    raw_mask_stats: dict
    postprocess_mask_stats: dict
    final_png_mask_stats: dict


def _compute_mask_diagnostics(mask_array: np.ndarray, threshold: float = 0.5) -> dict:
    from scipy import ndimage
    binary = mask_array > threshold
    labeled, num_components = ndimage.label(binary)
    component_areas = [np.sum(labeled == i) for i in range(1, num_components + 1)]
    total_pixels = mask_array.shape[0] * mask_array.shape[1]
    fg_pixels = int(np.sum(binary))
    fg_pct = fg_pixels / max(1, total_pixels)
    
    bounding_boxes = []
    centroids = []
    for i in range(1, num_components + 1):
        coords = np.where(labeled == i)
        min_y, max_y = int(coords[0].min()), int(coords[0].max())
        min_x, max_x = int(coords[1].min()), int(coords[1].max())
        centroid_y = float(np.mean(coords[0]))
        centroid_x = float(np.mean(coords[1]))
        bounding_boxes.append([min_x, min_y, max_x, max_y])
        centroids.append([centroid_x, centroid_y])
    
    largest_pct = max(component_areas) / max(1, total_pixels) if component_areas else 0.0
    
    return {
        "connected_component_count": num_components,
        "foreground_pixels": fg_pixels,
        "foreground_pct": round(fg_pct, 6),
        "largest_component_pct": round(largest_pct, 6),
        "component_areas": [int(a) for a in component_areas],
        "bounding_boxes": bounding_boxes,
        "centroids": centroids,
    }


class GPUSAM2Provider(BackgroundRemoverProvider):
    def __init__(self):
        logger.info("MARKER 001: __init__ start")
        self._model = None
        self._device = None
        self._checkpoint_path = os.getenv("SAM2_CHECKPOINT", "/models/sam2_hiera_base_plus.pt")
        self._config_dir = "/usr/local/lib/python3.11/dist-packages/sam2/configs/sam2"
        model_name = os.getenv("GPU_SEGMENTATION_MODEL", "sam2_hiera_base_plus")
        if model_name == "sam2_hiera_base_plus":
            model_name = "sam2_hiera_b+"
        self._model_name = model_name
        self._mean = [0.485, 0.456, 0.406]
        self._std = [0.229, 0.224, 0.225]
        self._bb_feat_sizes = [(256, 256), (128, 128), (64, 64)]
        logger.info("MARKER 002: __init__ complete")

    @property
    def name(self) -> str:
        return "gpu-sam2"

    @property
    def is_enabled(self) -> bool:
        logger.info("MARKER 003: is_enabled check start")
        result = (
            torch.cuda.is_available()
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

        logger.info("MARKER 017: calling build_sam2")
        try:
            self._model = build_sam2(
                config_file=self._model_name,
                ckpt_path=self._checkpoint_path,
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

        logger.info("MARKER 109: preprocessing image")
        import torchvision.transforms as T
        target_size = self._model.image_size
        resize = T.Resize((target_size, target_size), interpolation=T.InterpolationMode.BILINEAR)
        to_tensor = T.ToTensor()
        normalize = T.Normalize(mean=self._mean, std=self._std)
        input_tensor = normalize(to_tensor(resize(pil_image))).unsqueeze(0).to(device)
        orig_hw = (pil_image.height, pil_image.width)
        logger.info(f"MARKER 110: input tensor shape={input_tensor.shape}")

        logger.info("MARKER 111: computing image embeddings")
        backbone_out = self._model.forward_image(input_tensor)
        _, vision_feats, _, _ = self._model._prepare_backbone_features(backbone_out)
        if self._model.directly_add_no_mem_embed:
            vision_feats[-1] = vision_feats[-1] + self._model.no_mem_embed
        feats = [
            feat.permute(1, 2, 0).view(1, -1, *feat_size)
            for feat, feat_size in zip(vision_feats[::-1], self._bb_feat_sizes[::-1])
        ][::-1]
        image_embed = feats[-1]
        high_res_feats = feats[:-1]
        logger.info(f"MARKER 112: image_embed shape={image_embed.shape}")

        logger.info("MARKER 113: encoding prompts")
        with torch.no_grad():
            h, w = orig_hw
            
            if OBJECT_AWARE_PROMPTS:
                logger.info(f"MARKER 113a: Using object-aware prompts (strategy={PROMPT_STRATEGY})")
                
                prompt_points = get_prompt_points(input_tensor, target_size, (h, w))
                
                if prompt_points:
                    logger.info(f"MARKER 113b: Found {len(prompt_points)} prompt points")
                    prompt_point = torch.tensor([[[p[0], p[1]] for p in prompt_points]], 
                                               device=device, dtype=torch.float)
                    prompt_label = torch.tensor([[1] * len(prompt_points)], device=device)
                else:
                    prompt_point = torch.tensor([[[w // 2, h // 2]]], device=device, dtype=torch.float)
                    prompt_label = torch.tensor([[1]], device=device)
                    logger.info("MARKER 113c: No prompt points, using center point")
            
            else:
                logger.info("MARKER 113d: Using center point prompt (default)")
                prompt_point = torch.tensor([[[w // 2, h // 2]]], device=device, dtype=torch.float)
                prompt_label = torch.tensor([[1]], device=device)
            
            sparse_embeddings, dense_embeddings = self._model.sam_prompt_encoder(
                points=(prompt_point, prompt_label), boxes=None, masks=None,
            )
            image_pe = self._model.sam_prompt_encoder.get_dense_pe()
            logger.info(f"MARKER 114: sparse_embeddings shape={sparse_embeddings.shape}")

            logger.info("MARKER 115: decoding masks")
            low_res_masks, iou_predictions, _, _ = self._model.sam_mask_decoder(
                image_embeddings=image_embed,
                image_pe=image_pe,
                sparse_prompt_embeddings=sparse_embeddings,
                dense_prompt_embeddings=dense_embeddings,
                multimask_output=False,
                repeat_image=False,
                high_res_features=high_res_feats,
            )
            logger.info(f"MARKER 116: low_res_masks shape={low_res_masks.shape}")

            # INSTRUMENTATION: Save raw decoder output
            import os
            diag_dir = os.path.expanduser("~/diagnostics")
            os.makedirs(diag_dir, exist_ok=True)
            
            raw_mask_np = low_res_masks[0, 0].cpu().numpy()
            raw_mask_resized = F.interpolate(
                low_res_masks, orig_hw, mode="bilinear", align_corners=False
            )[0, 0].cpu().numpy()
            
            # Save raw mask (resized to original dimensions)
            raw_mask_img = (raw_mask_resized * 255).astype("uint8")
            Image.fromarray(raw_mask_img).save(f"{diag_dir}/raw_mask.png")
            np.save(f"{diag_dir}/raw_mask.npy", raw_mask_resized)
            
            # Save binary mask
            binary = (raw_mask_resized > 0.5).astype(np.uint8) * 255
            Image.fromarray(binary).save(f"{diag_dir}/raw_mask_binary.png")
            
            # Log mask statistics
            from scipy import ndimage
            binary_bool = raw_mask_resized > 0.5
            labeled, num_components = ndimage.label(binary_bool)
            component_areas = [np.sum(labeled == i) for i in range(1, num_components + 1)]
            total_pixels = h * w
            fg_pixels = np.sum(binary_bool)
            fg_ratio = fg_pixels / total_pixels
            
            logger.info(f"MARKER 116a: RAW_MASK_DIAGNOSTICS")
            logger.info(f"  mask_shape: {raw_mask_resized.shape}")
            logger.info(f"  mask_count: 1 (single output)")
            logger.info(f"  mask_area: {fg_pixels}")
            logger.info(f"  connected_components: {num_components}")
            logger.info(f"  largest_component_pct: {max(component_areas)/total_pixels*100:.2f}%")
            logger.info(f"  foreground_pct: {fg_ratio*100:.2f}%")
            logger.info(f"  iou_predictions: {iou_predictions[0, 0].item():.4f}")
            
            # Log component details
            logger.info(f"MARKER 116b: COMPONENT_DETAILS")
            for i, area in enumerate(component_areas):
                coords = np.where(labeled == (i + 1))
                min_y, max_y = coords[0].min(), coords[0].max()
                min_x, max_x = coords[1].min(), coords[1].max()
                centroid_y = int(np.mean(coords[0]))
                centroid_x = int(np.mean(coords[1]))
                logger.info(f"  Component {i+1}: area={area}, bbox=[{min_x},{min_y},{max_x},{max_y}], centroid=[{centroid_x},{centroid_y}]")
            
            # Save mask overlay
            overlay = np.zeros((h, w, 3), dtype=np.uint8)
            overlay[binary_bool] = [255, 0, 0]
            Image.fromarray(overlay).save(f"{diag_dir}/raw_mask_overlay.png")

            masks = F.interpolate(low_res_masks, orig_hw, mode="bilinear", align_corners=False)
            masks = masks > 0.0
            logger.info(f"MARKER 117: masks shape={masks.shape}")

        logger.info("MARKER 118: extracting mask")
        mask_np = masks[0, 0].cpu().numpy()
        foreground_ratio = mask_np.mean()
        logger.info(f"MARKER 118b: foreground ratio={foreground_ratio:.4f}")
        
        # If mask is nearly empty (<1% foreground), invert it
        # SAM2 without prompts can produce inverted masks
        if foreground_ratio < 0.01:
            logger.info("MARKER 118c: mask near-empty, inverting")
            mask_np = ~mask_np.astype(bool)
        
        mask = (mask_np * 255).astype("uint8")
        logger.info(f"MARKER 119: mask extracted shape={mask.shape}")
        
        mask_pil = Image.fromarray(mask).convert("RGBA")
        logger.info("MARKER 121: mask converted to PIL")
        
        # INSTRUMENTATION: Postprocess diagnostics
        postprocess_mask = mask_pil.filter(ImageFilter.GaussianBlur(radius=1))
        postprocess_mask.save(f"{diag_dir}/postprocess_mask.png")
        
        postprocess_arr = np.array(postprocess_mask.getchannel('A'))
        post_labeled, post_num = ndimage.label(postprocess_arr > 128)
        post_fg = np.sum(postprocess_arr > 128)
        logger.info(f"MARKER 120a: POSTPROCESS_DIAGNOSTICS")
        logger.info(f"  connected_components: {post_num}")
        logger.info(f"  foreground_pixels: {post_fg}")
        logger.info(f"  foreground_pct: {post_fg/(h*w)*100:.2f}%")
        
        # INSTRUMENTATION: Pre-PNG diagnostics
        pre_png_mask = np.array(postprocess_mask.getchannel('A'))
        pre_png_labeled, pre_png_num = ndimage.label(pre_png_mask > 128)
        pre_png_fg = np.sum(pre_png_mask > 128)
        Image.fromarray(pre_png_mask).save(f"{diag_dir}/pre_png_mask.png")
        logger.info(f"MARKER 120b: PRE_PNG_DIAGNOSTICS")
        logger.info(f"  connected_components: {pre_png_num}")
        logger.info(f"  foreground_pixels: {pre_png_fg}")
        logger.info(f"  foreground_pct: {pre_png_fg/(h*w)*100:.2f}%")
        
        logger.info("MARKER 120: converting mask to PIL RGBA")
        logger.info("MARKER 121: mask converted to PIL")

        logger.info("MARKER 122: creating result image")
        original_rgba = pil_image.convert("RGBA")
        alpha_channel = Image.fromarray(mask).convert("L")
        result_image = Image.merge("RGBA", [*original_rgba.split()[:3], alpha_channel])
        
        # INSTRUMENTATION: Final PNG diagnostics
        final_alpha = np.array(result_image.getchannel('A'))
        final_labeled, final_num = ndimage.label(final_alpha > 128)
        final_fg = np.sum(final_alpha > 128)
        logger.info(f"MARKER 122a: FINAL_PNG_DIAGNOSTICS")
        logger.info(f"  connected_components: {final_num}")
        logger.info(f"  foreground_pixels: {final_fg}")
        logger.info(f"  foreground_pct: {final_fg/(h*w)*100:.2f}%")
        
        result_image.save(f"{diag_dir}/final_png_mask.png")
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

        if DEBUG_MASK_DIAGNOSTICS:
            self._last_diagnostics = self._compute_diagnostics(
                raw_mask_resized, postprocess_arr, final_alpha,
                prompt_point, prompt_label, iou_predictions, h, w
            )
        else:
            self._last_diagnostics = None

        credits = 0.0
        logger.info("MARKER 128: returning ImageResult")
        return ImageResult(
            content=output_bytes,
            media_type="image/png",
            credits_used=credits,
        )

    def get_metrics(self) -> GPUMetrics | None:
        return getattr(self, '_metrics', None)

    def get_diagnostics(self) -> MaskDiagnostics | None:
        return getattr(self, '_last_diagnostics', None)

    def _compute_diagnostics(self, raw_mask: np.ndarray, postprocess_mask: np.ndarray,
                            final_mask: np.ndarray, prompt_point: torch.Tensor,
                            prompt_label: torch.Tensor, iou_predictions: torch.Tensor,
                            h: int, w: int) -> MaskDiagnostics | None:
        if not DEBUG_MASK_DIAGNOSTICS:
            return None
        
        prompt_coords = prompt_point.cpu().numpy().flatten().tolist()
        prompt_count = len(prompt_coords) // 2
        
        raw_diag = _compute_mask_diagnostics(raw_mask)
        postprocess_diag = _compute_mask_diagnostics(postprocess_mask / 255.0 if postprocess_mask.max() > 1 else postprocess_mask)
        final_diag = _compute_mask_diagnostics(final_mask / 255.0 if final_mask.max() > 1 else final_mask)
        
        logger.info("DEBUG_MASK_DIAGNOSTICS")
        logger.info(f"  prompt_count: {prompt_count}")
        logger.info(f"  prompt_coordinates: {prompt_coords}")
        logger.info(f"  returned_mask_count: 1")
        logger.info(f"  raw_mask_connected_components: {raw_diag['connected_component_count']}")
        logger.info(f"  raw_mask_foreground_pct: {raw_diag['foreground_pct']}")
        logger.info(f"  postprocess_mask_connected_components: {postprocess_diag['connected_component_count']}")
        logger.info(f"  postprocess_mask_foreground_pct: {postprocess_diag['foreground_pct']}")
        logger.info(f"  final_png_mask_connected_components: {final_diag['connected_component_count']}")
        logger.info(f"  final_png_mask_foreground_pct: {final_diag['foreground_pct']}")
        
        return MaskDiagnostics(
            prompt_count=prompt_count,
            prompt_coordinates=prompt_coords,
            returned_mask_count=1,
            connected_component_count=final_diag['connected_component_count'],
            bounding_boxes=final_diag['bounding_boxes'],
            centroids=final_diag['centroids'],
            foreground_pct=final_diag['foreground_pct'],
            largest_component_pct=final_diag['largest_component_pct'],
            raw_mask_stats=raw_diag,
            postprocess_mask_stats=postprocess_diag,
            final_png_mask_stats=final_diag,
        )
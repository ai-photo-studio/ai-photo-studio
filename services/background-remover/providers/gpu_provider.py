"""
GPU Segmentation Provider using SAM2 - Enhanced Version

This provider uses Segment Anything Model 2 (SAM2) for GPU-accelerated
background removal with multi-object support, label preservation, and 
thin structure enhancement.

Usage:
    Set SEGMENTATION_ROUTING=gpu and GPU_SEGMENTATION_MODEL=sam2

Environment Variables:
    SAM2_CHECKPOINT: Path to SAM2 checkpoint (default: /models/sam2_hiera_base_plus.pt)
    GPU_SEGMENTATION_MODEL: Model variant (default: sam2)
    PROMPT_STRATEGY: Prompt generation strategy (default: strategy_7)
    MULTI_OBJECT_INFERENCE: Enable multi-object inference (default: true)
    PRESERVE_LABELS: Preserve text/labels in mask (default: true)
    ENHANCE_THIN_STRUCTURES: Enhance thin structures (default: true)
"""
from __future__ import annotations

import os
import io
import time
import logging
import numpy as np
from dataclasses import dataclass
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import torch
import torch.nn.functional as F
from PIL import Image, ImageFilter
from scipy import ndimage
from scipy.ndimage import gaussian_filter

from . import BackgroundRemoverProvider, ImageResult
from .prompt_strategies import get_prompt_points, STRATEGIES

MODEL_INSTANCE = None
MODEL_LOCK = None

def get_model_instance():
    global MODEL_INSTANCE, MODEL_LOCK
    if MODEL_INSTANCE is None:
        if MODEL_LOCK is None:
            import threading
            MODEL_LOCK = threading.Lock()
        with MODEL_LOCK:
            if MODEL_INSTANCE is None:
                MODEL_INSTANCE = _create_model()
    return MODEL_INSTANCE

def _create_model():
    from sam2.build_sam import build_sam2
    
    checkpoint_path = os.getenv("SAM2_CHECKPOINT", "/models/sam2_hiera_base_plus.pt")
    model_name = os.getenv("GPU_SEGMENTATION_MODEL", "sam2_hiera_base_plus")
    if model_name == "sam2_hiera_base_plus":
        model_name = "sam2_hiera_b+"
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    model = build_sam2(
        config_file=model_name,
        ckpt_path=checkpoint_path,
        device=device,
    )
    model.eval()
    return model

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
    binary = mask_array > threshold
    labeled, num_components = ndimage.label(binary)
    component_areas = [int(np.sum(labeled == i)) for i in range(1, num_components + 1)]
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
        self._model = get_model_instance()
        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        self._multi_object = os.getenv("MULTI_OBJECT_INFERENCE", "true").lower() == "true"
        self._preserve_labels = os.getenv("PRESERVE_LABELS", "true").lower() == "true"
        self._enhance_thin = os.getenv("ENHANCE_THIN_STRUCTURES", "true").lower() == "true"

    @property
    def name(self) -> str:
        return "gpu-sam2-enhanced"

    @property
    def is_enabled(self) -> bool:
        return torch.cuda.is_available() and os.path.exists(self._checkpoint_path)

    def _get_device(self):
        return self._device

    def remove_background(self, image_bytes: bytes, max_dimension: int) -> ImageResult:
        start_time = time.time()
        
        pil_image = Image.open(io.BytesIO(image_bytes))
        
        if pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")

        if max(pil_image.size) > max_dimension:
            scale = max_dimension / max(pil_image.size)
            new_size = (int(pil_image.width * scale), int(pil_image.height * scale))
            pil_image = pil_image.resize(new_size, Image.Resampling.LANCZOS)

        orig_hw = (pil_image.height, pil_image.width)
        target_size = self._model.image_size
        
        import torchvision.transforms as T
        resize = T.Resize((target_size, target_size), interpolation=T.InterpolationMode.BILINEAR)
        to_tensor = T.ToTensor()
        normalize = T.Normalize(mean=self._mean, std=self._std)
        input_tensor = normalize(to_tensor(resize(pil_image))).unsqueeze(0).to(self._device)

        with torch.no_grad():
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

            h, w = orig_hw
            
            prompt_points = get_prompt_points(input_tensor, target_size, (h, w))
            
            if prompt_points:
                prompt_point = torch.tensor([[[p[0], p[1]] for p in prompt_points]], 
                                           device=self._device, dtype=torch.float)
                prompt_label = torch.tensor([[1] * len(prompt_points)], device=self._device)
            else:
                prompt_point = torch.tensor([[[w // 2, h // 2]]], device=self._device, dtype=torch.float)
                prompt_label = torch.tensor([[1]], device=self._device)
            
            sparse_embeddings, dense_embeddings = self._model.sam_prompt_encoder(
                points=(prompt_point, prompt_label), boxes=None, masks=None,
            )
            image_pe = self._model.sam_prompt_encoder.get_dense_pe()

            low_res_masks, iou_predictions, _, _ = self._model.sam_mask_decoder(
                image_embeddings=image_embed,
                image_pe=image_pe,
                sparse_prompt_embeddings=sparse_embeddings,
                dense_prompt_embeddings=dense_embeddings,
                multimask_output=False,
                repeat_image=False,
                high_res_features=high_res_feats,
            )

            masks = F.interpolate(low_res_masks, orig_hw, mode="bilinear", align_corners=False)
            masks = masks > 0.0
            mask_np = masks[0, 0].cpu().numpy()

            foreground_ratio = mask_np.mean()
            
            if foreground_ratio < 0.01:
                mask_np = ~mask_np.astype(bool)
            
            mask_np = (mask_np * 255).astype(np.uint8)

        if self._multi_object:
            import logging
            logger = logging.getLogger(__name__)
            masks_list = self._infer_multiple_objects(
                pil_image, input_tensor, image_embed, image_pe,
                sparse_embeddings, dense_embeddings, high_res_feats, orig_hw
            )
            logger.info(f"MULTIOBJ_INFERENCE: mask_count={len(masks_list)}, multi_object_enabled={self._multi_object}")
            logger.info(f"MULTIOBJ_INFERENCE: first_mask_shape={masks_list[0].shape if masks_list else 'N/A'}")
            logger.info(f"MULTIOBJ_INFERENCE: first_mask_mean={masks_list[0].mean() if masks_list else 'N/A'}")
            if len(masks_list) > 1:
                weights = [float(iou_predictions[0, 0].item())] * len(masks_list)
                logger.info(f"MERGE_MASKS_CALL: weights_sum={sum(weights)}, num_masks={len(masks_list)}")
                mask_np = self._merge_masks(masks_list, weights)

        if self._preserve_labels:
            mask_np = self._preserve_text_regions(mask_np, pil_image)

        if self._enhance_thin:
            mask_np = self._enhance_thin_structures(mask_np, pil_image)

        alpha = mask_np.astype(np.float32) / 255.0
        alpha = gaussian_filter(alpha, sigma=1.0)
        alpha = np.clip(alpha * 255, 0, 255).astype(np.uint8)
        
        result_image = pil_image.copy()
        result_image.putalpha(alpha)

        latency_ms = (time.time() - start_time) * 1000
        
        vram_allocated = 0
        vram_reserved = 0
        if self._device.type == "cuda":
            vram_allocated = torch.cuda.memory_allocated(self._device) / 1024 / 1024
            vram_reserved = torch.cuda.memory_reserved(self._device) / 1024 / 1024

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

        buf = io.BytesIO()
        result_image.save(buf, format="PNG")
        output_bytes = buf.getvalue()

        credits = 0.0
        return ImageResult(
            content=output_bytes,
            media_type="image/png",
            credits_used=credits,
        )

    def _infer_multiple_objects(self, pil_image: Image.Image, input_tensor, 
                                 image_embed, image_pe, sparse_embeddings,
                                 dense_embeddings, high_res_feats, orig_hw) -> list:
        """Generate masks for multiple objects using different prompt strategies."""
        import logging
        logger = logging.getLogger(__name__)
        
        masks = []
        h, w = orig_hw
        
        strategies_to_try = ['center', 'corners', 'edges', 'text_regions']
        
        prompt_points_sets = []
        
        prompt_points_sets.append([[w // 2, h // 2]])
        
        prompt_points_sets.append([
            [int(w * 0.25), int(h * 0.25)],
            [int(w * 0.75), int(h * 0.75)]
        ])
        
        prompt_points_sets.append([
            [int(w * 0.1), int(h * 0.5)],
            [int(w * 0.9), int(h * 0.5)]
        ])
        
        try:
            gray = np.array(pil_image.convert('L'))
            from scipy.ndimage import sobel
            edges = sobel(gray)
            edge_coords = np.where(edges > np.percentile(edges, 80))
            if len(edge_coords[0]) > 0:
                indices = np.random.choice(len(edge_coords[0]), min(3, len(edge_coords[0])), replace=False)
                for idx in indices:
                    prompt_points_sets.append([
                        [int(edge_coords[1][idx]), int(edge_coords[0][idx])]
                    ])
        except Exception as e:
            logger.info(f"MULTIOBJ_EDGE_DETECTION_ERROR: {e}")
            pass

        logger.info(f"MULTIOBJ_PROMPT_SETS: count={len(prompt_points_sets)}")
        
        for prompt_idx, prompt_points in enumerate(prompt_points_sets):
            if len(masks) >= 3:
                break
                
            prompt_point = torch.tensor([[[p[0], p[1]] for p in prompt_points]], 
                                       device=self._device, dtype=torch.float)
            prompt_label = torch.tensor([[1] * len(prompt_points)], device=self._device)
            
            sparse_emb, dense_emb = self._model.sam_prompt_encoder(
                points=(prompt_point, prompt_label), boxes=None, masks=None,
            )
            
            low_res_masks, iou_preds, _, _ = self._model.sam_mask_decoder(
                image_embeddings=image_embed,
                image_pe=image_pe,
                sparse_prompt_embeddings=sparse_emb,
                dense_prompt_embeddings=dense_emb,
                multimask_output=False,
                repeat_image=False,
                high_res_features=high_res_feats,
            )
            
            decoded_masks = F.interpolate(low_res_masks, orig_hw, mode="bilinear", align_corners=False)
            decoded_masks = decoded_masks > 0.0
            
            for mask in decoded_masks:
                mask_np = mask[0].cpu().numpy()
                mean_val = mask_np.mean()
                if mean_val > 0.01:
                    masks.append(mask_np)
                    logger.info(f"MULTIOBJ_MASK_ADDED: prompt_idx={prompt_idx}, mask_idx={len(masks)-1}, mean={mean_val:.4f}")
                else:
                    logger.info(f"MULTIOBJ_MASK_FILTERED: prompt_idx={prompt_idx}, mean={mean_val:.4f}, reason=below_threshold")
        
        logger.info(f"MULTIOBJ_FINAL: mask_count={len(masks)}")
        return masks

    def _merge_masks(self, masks: list, weights: list) -> np.ndarray:
        """Merge multiple masks using weighted average."""
        import logging
        logger = logging.getLogger(__name__)
        
        if not masks:
            logger.info(f"MERGE_MASK_EMPTY: mask_count=0, returned_shape=(512, 512), reason=empty_masks_list")
            return np.zeros((512, 512), dtype=np.uint8)
        
        if len(masks) == 1:
            logger.info(f"MERGE_MASK_SINGLE: mask_count=1, returned_shape={masks[0].shape}, reason=single_mask")
            return (masks[0] * 255).astype(np.uint8)
        
        h, w = masks[0].shape
        logger.info(f"MERGE_MASK_MULTI: mask_count={len(masks)}, returned_shape=({h}, {w}), reason=merged_multiple")
        combined = np.zeros((h, w), dtype=np.float32)
        
        for mask, weight in zip(masks, weights[:len(masks)]):
            combined += mask.astype(np.float32) * weight
        
        weight_sum = sum(weights[:len(masks)])
        if weight_sum > 0:
            combined = (combined / weight_sum * 255).astype(np.uint8)
        else:
            combined = (combined / len(masks) * 255).astype(np.uint8)
        return combined

    def _preserve_text_regions(self, mask: np.ndarray, original: Image.Image) -> np.ndarray:
        """Expand mask to preserve detected text regions."""
        gray = np.array(original.convert('L'))
        
        from scipy.ndimage import sobel
        edges = sobel(gray)
        
        text_like = edges > np.percentile(edges, 75)
        
        dilated = ndimage.binary_dilation(text_like, iterations=3)
        
        result = np.maximum(mask, dilated.astype(np.uint8) * 255)
        
        return result

    def _enhance_thin_structures(self, mask: np.ndarray, original: Image.Image) -> np.ndarray:
        """Enhance thin structures like stems, wires, handles."""
        binary = mask > 128
        
        skeleton = ndimage.skeletonize(binary)
        
        dilated = ndimage.binary_dilation(skeleton, iterations=2)
        
        result = np.maximum(mask, dilated.astype(np.uint8) * 255)
        
        return result

    def get_metrics(self) -> GPUMetrics | None:
        return getattr(self, '_metrics', None)

    def get_diagnostics(self) -> MaskDiagnostics | None:
        return getattr(self, '_last_diagnostics', None)
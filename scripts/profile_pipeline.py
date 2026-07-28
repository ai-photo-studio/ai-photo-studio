#!/usr/bin/env python3
"""
Pipeline Profiler - Phase 1
Profiles every stage of the background removal pipeline.
"""
import os
import sys
import io
import time
import json
import csv
import traceback
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional
from PIL import Image, ImageDraw
import numpy as np
import torch
import torch.nn.functional as F

try:
    from sam2.build_sam import build_sam2
except ImportError:
    pass

try:
    from scipy import ndimage
    from scipy.ndimage import sobel, distance_transform_edt, gaussian_filter
    from scipy.spatial import KDTree
except ImportError:
    pass

try:
    import torchvision.transforms as T
except ImportError:
    pass

OUTPUT_DIR = Path(__file__).parent.parent / "validation_output" / "pipeline_analysis"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

@dataclass
class StageTiming:
    name: str
    duration_ms: float
    details: dict

@dataclass
class ProfileResult:
    image_name: str
    total_duration_ms: float
    stages: list
    input_size: tuple
    output_size: tuple
    memory_before_mb: float
    memory_after_mb: float

def get_memory_mb():
    import psutil
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

def profile_image_decode(image_bytes: bytes) -> StageTiming:
    start = time.time()
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    img.load()
    duration = (time.time() - start) * 1000
    return StageTiming(
        name="image_decode",
        duration_ms=duration,
        details={"format": img.format, "size": img.size, "mode": img.mode}
    )

def profile_resize(img: Image.Image, max_dim: int = 2000) -> StageTiming:
    start = time.time()
    if max(img.size) > max_dim:
        scale = max_dim / max(img.size)
        new_size = (int(img.width * scale), int(img.height * scale))
        resized = img.resize(new_size, Image.Resampling.LANCZOS)
    else:
        resized = img
    duration = (time.time() - start) * 1000
    return StageTiming(
        name="resize",
        duration_ms=duration,
        details={"original_size": img.size, "new_size": resized.size}
    )

def profile_sam2_encoder_decoder(img: Image.Image, model, device) -> tuple[StageTiming, StageTiming, any]:
    timings = []
    
    start = time.time()
    input_tensor = torch.from_numpy(np.array(img)).float().permute(2, 0, 1).unsqueeze(0).to(device) / 255.0
    input_tensor = input_tensor.cuda() if device.type == "cuda" else input_tensor
    encoder_time = (time.time() - start) * 1000
    
    start = time.time()
    if hasattr(model, '_prepare_backbone_features'):
        backbone_out = model.forward_image(input_tensor)
        _, vision_feats, _, _ = model._prepare_backbone_features(backbone_out)
        if model.directly_add_no_mem_embed:
            vision_feats[-1] = vision_feats[-1] + model.no_mem_embed
        feats = [
            feat.permute(1, 2, 0).view(1, -1, *feat_size)
            for feat, feat_size in zip(vision_feats[::-1], [(256, 256), (128, 128), (64, 64)][::-1])
        ][::-1]
        image_embed = feats[-1]
        high_res_feats = feats[:-1]
    else:
        image_embed = None
        high_res_feats = None
    decoder_time = (time.time() - start) * 1000
    
    return (
        StageTiming("sam2_encoder", encoder_time, {"device": str(device)}),
        StageTiming("sam2_decoder", decoder_time, {}),
        (image_embed, high_res_feats, input_tensor)
    )

def profile_prompt_generation(img: Image.Image, input_tensor, target_size: tuple) -> StageTiming:
    start = time.time()
    
    h, w = img.size
    
    from PIL import Image as PILImage
    input_img = torch.from_numpy(np.array(img)).float().permute(2, 0, 1).unsqueeze(0) / 255.0
    mean = [0.485, 0.456, 0.406]
    std = [0.229, 0.224, 0.225]
    input_img = torch.nn.functional.normalize(input_img, mean=mean, std=std)
    
    gray = np.array(PILImage.fromarray((input_img[0].permute(1, 2, 0).numpy() * 255).astype(np.uint8)).convert('L'))
    
    from scipy.ndimage import sobel, gaussian_filter
    grad_x = sobel(gray, axis=1)
    grad_y = sobel(gray, axis=0)
    mag = np.hypot(grad_x, grad_y)
    
    threshold = np.mean(mag) * 1.5
    edge_binary = (mag > threshold).astype(np.uint8)
    edge_filled = ndimage.binary_fill_holes(ndimage.binary_dilation(edge_binary, iterations=3)).astype(np.uint8)
    labeled, num = ndimage.label(edge_filled)
    
    areas = [int(np.sum(labeled == i)) for i in range(1, num + 1)]
    total = h * w
    significant = []
    for i, area in enumerate(areas):
        if area > total * 0.02:
            coords = np.where(labeled == (i + 1))
            cy = int(np.mean(coords[0]))
            cx = int(np.mean(coords[1]))
            significant.append((cx, cy))
    
    if len(significant) > 15:
        scored = sorted(zip(significant, areas), key=lambda x: -x[1])
        significant = [p for p, _ in scored[:15]]
    
    duration = (time.time() - start) * 1000
    return StageTiming(
        name="prompt_generation",
        duration_ms=duration,
        details={"num_points": len(significant), "method": "sobel_edge"}
    )

def profile_mask_refinement(mask: np.ndarray) -> StageTiming:
    start = time.time()
    
    binary = mask > 0.5
    labeled, num_components = ndimage.label(binary)
    component_areas = [np.sum(labeled == i) for i in range(1, num_components + 1)]
    
    if component_areas:
        largest_idx = np.argmax(component_areas)
        largest_mask = (labeled == (largest_idx + 1)).astype(np.uint8) * 255
    else:
        largest_mask = (mask > 0.5).astype(np.uint8) * 255
    
    dilated = ndimage.binary_dilation(largest_mask > 0, iterations=1)
    filled = ndimage.binary_fill_holes(dilated)
    
    if mask.shape[0] > 512 or mask.shape[1] > 512:
        refined = gaussian_filter(mask.astype(float), sigma=1)
    else:
        refined = mask
    
    duration = (time.time() - start) * 1000
    return StageTiming(
        name="mask_refinement",
        duration_ms=duration,
        details={"components": num_components, "largest_area": max(component_areas) if component_areas else 0}
    )

def profile_png_creation(img: Image.Image) -> StageTiming:
    start = time.time()
    
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    output_bytes = buf.getvalue()
    
    duration = (time.time() - start) * 1000
    return StageTiming(
        name="png_creation",
        duration_ms=duration,
        details={"output_size_kb": len(output_bytes) / 1024}
    )

def run_full_profile(image_path: Path, model=None, device=None) -> ProfileResult:
    memory_before = get_memory_mb()
    
    timings = []
    start_total = time.time()
    
    with open(image_path, 'rb') as f:
        image_bytes = f.read()
    
    input_size = Image.open(io.BytesIO(image_bytes)).size
    
    decode_stage = profile_image_decode(image_bytes)
    timings.append(decode_stage)
    
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    
    resize_stage = profile_resize(img, max_dim=2000)
    timings.append(resize_stage)
    
    if model and device:
        enc_stage, dec_stage, model_data = profile_sam2_encoder_decoder(img, model, device)
        timings.extend([enc_stage, dec_stage])
        
        input_tensor = model_data[2]
        target_size = (img.height, img.width)
        prompt_stage = profile_prompt_generation(img, input_tensor, target_size)
        timings.append(prompt_stage)
        
        prompt_point = torch.tensor([[[target_size[1] // 2, target_size[0] // 2]]], 
                                    device=device, dtype=torch.float)
        prompt_label = torch.tensor([[1]], device=device)
        image_embed = model_data[0]
        high_res_feats = model_data[1]
        
        sparse_embeddings, dense_embeddings = model.sam_prompt_encoder(
            points=(prompt_point, prompt_label), boxes=None, masks=None
        )
        image_pe = model.sam_prompt_encoder.get_dense_pe()
        
        low_res_masks, iou_preds, _, _ = model.sam_mask_decoder(
            image_embeddings=image_embed,
            image_pe=image_pe,
            sparse_prompt_embeddings=sparse_embeddings,
            dense_prompt_embeddings=dense_embeddings,
            multimask_output=False,
            repeat_image=False,
            high_res_features=high_res_feats,
        )
        
        masks = F.interpolate(low_res_masks, target_size, mode="bilinear", align_corners=False)
        masks = masks > 0.0
        mask_np = masks[0, 0].cpu().numpy()
        
        ref_stage = profile_mask_refinement(mask_np)
        timings.append(ref_stage)
        
        alpha = (mask_np * 255).astype(np.uint8)
        result_img = np.zeros((img.height, img.width, 4), dtype=np.uint8)
        result_img[:, :, :3] = np.array(img.convert("RGB"))
        result_img[:, :, 3] = alpha
        result_pil = Image.fromarray(result_img)
    else:
        result_pil = img
    
    png_stage = profile_png_creation(result_pil)
    timings.append(png_stage)
    
    total_duration = (time.time() - start_total) * 1000
    memory_after = get_memory_mb()
    
    return ProfileResult(
        image_name=image_path.name,
        total_duration_ms=total_duration,
        stages=timings,
        input_size=input_size,
        output_size=result_pil.size if hasattr(result_pil, 'size') else input_size,
        memory_before_mb=memory_before,
        memory_after_mb=memory_after,
    )

def main():
    test_dir = Path(__file__).parent.parent / "test images"
    if not test_dir.exists():
        print(f"Test directory not found: {test_dir}")
        return
    
    image_files = []
    for ext in ['*.jpg', '*.jpeg', '*.png', '*.webp']:
        image_files.extend(test_dir.glob(ext))
    image_files = sorted(image_files)[:10]
    
    if not image_files:
        print("No test images found")
        return
    
    print(f"Profiling {len(image_files)} images...")
    
    results = []
    for img_path in image_files:
        try:
            result = run_full_profile(img_path)
            results.append(asdict(result))
            print(f"  {img_path.name}: {result.total_duration_ms:.1f}ms")
        except Exception as e:
            print(f"  {img_path.name}: ERROR - {e}")
            traceback.print_exc()
    
    csv_path = OUTPUT_DIR / "profile.csv"
    json_path = OUTPUT_DIR / "profile.json"
    
    with open(csv_path, 'w', newline='') as f:
        if results:
            writer = csv.DictWriter(f, fieldnames=['image_name', 'total_duration_ms', 'input_size', 'output_size', 'memory_before_mb', 'memory_after_mb'])
            writer.writeheader()
            for r in results:
                writer.writerow({k: v for k, v in r.items() if k != 'stages'})
    
    with open(json_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\nResults saved to {OUTPUT_DIR}")
    
    if results:
        total_times = [r['total_duration_ms'] for r in results]
        avg_time = sum(total_times) / len(total_times)
        print(f"Average total time: {avg_time:.1f}ms")

if __name__ == "__main__":
    main()
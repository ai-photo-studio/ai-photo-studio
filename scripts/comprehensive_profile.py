#!/usr/bin/env python3
"""
Comprehensive Performance Profiler for AI Product Photo Studio
Profiles complete pipeline, GPU metrics, and generates detailed traces
"""
import os
import sys
import io
import time
import json
import csv
import gc
import psutil
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional, List, Dict
from PIL import Image
import numpy as np
import torch
import torch.nn.functional as F
from scipy.ndimage import gaussian_filter

OUTPUT_DIR = Path(__file__).parent.parent / "validation_output" / "runtime_trace"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class StageTiming:
    name: str
    duration_ms: float
    details: Dict


@dataclass
class ProfileResult:
    image_name: str
    total_duration_ms: float
    stages: List[StageTiming]
    input_size: tuple
    output_size: tuple
    gpu_memory_start_mb: float
    gpu_memory_end_mb: float


@dataclass
class GPUMetrics:
    gpu_utilization_percent: float
    gpu_memory_allocated_mb: float
    gpu_memory_reserved_mb: float
    cuda_sync_time_ms: float
    model_load_count: int
    checkpoint_load_count: int
    embedding_cache_hits: int
    prompt_count: int
    mask_count: int


@dataclass
class ImageQualityTrace:
    stage: str
    image: Image.Image
    filename: str


def get_memory_mb():
    """Get current process memory usage in MB"""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024


def measure_gpu_metrics() -> GPUMetrics:
    """Measure GPU utilization and memory metrics"""
    try:
        if not torch.cuda.is_available():
            return GPUMetrics(
                gpu_utilization_percent=0.0,
                gpu_memory_allocated_mb=0.0,
                gpu_memory_reserved_mb=0.0,
                cuda_sync_time_ms=0.0,
                model_load_count=0,
                checkpoint_load_count=0,
                embedding_cache_hits=0,
                prompt_count=0,
                mask_count=0
            )

        gpu_util = torch.cuda.utilization()
        gpu_memory_allocated = torch.cuda.memory_allocated() / 1024 / 1024
        gpu_memory_reserved = torch.cuda.memory_reserved() / 1024 / 1024
        cuda_sync_time = torch.cuda.Event(enable_timing=True)
        start_event = torch.cuda.Event(enable_timing=True)

        start_event.record()
        cuda_sync_time.record()
        torch.cuda.synchronize()
        cuda_sync_time_elapsed = cuda_sync_time.elapsed_time(start_event)

        metrics = GPUMetrics(
            gpu_utilization_percent=float(gpu_util),
            gpu_memory_allocated_mb=gpu_memory_allocated,
            gpu_memory_reserved_mb=gpu_memory_reserved,
            cuda_sync_time_ms=cuda_sync_time_elapsed,
            model_load_count=0,
            checkpoint_load_count=0,
            embedding_cache_hits=0,
            prompt_count=0,
            mask_count=0
        )

        return metrics
    except Exception as e:
        print(f"Error measuring GPU metrics: {e}")
        return GPUMetrics(
            gpu_utilization_percent=0.0,
            gpu_memory_allocated_mb=0.0,
            gpu_memory_reserved_mb=0.0,
            cuda_sync_time_ms=0.0,
            model_load_count=0,
            checkpoint_load_count=0,
            embedding_cache_hits=0,
            prompt_count=0,
            mask_count=0
        )


def measure_image_decode(image_bytes: bytes, image_name: str) -> tuple[StageTiming, Image.Image]:
    """Measure image decode stage"""
    start = time.time()
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    img.load()
    decode_time = (time.time() - start) * 1000

    return StageTiming(name="image_decode", duration_ms=decode_time, details={
        "format": img.format,
        "size": img.size,
        "mode": img.mode
    }), img


def measure_resize(img: Image.Image, max_dim: int) -> StageTiming:
    """Measure resize stage"""
    start = time.time()
    if max(img.size) > max_dim:
        scale = max_dim / max(img.size)
        new_size = (int(img.width * scale), int(img.height * scale))
        img = img.resize(new_size, Image.Resampling.LANCZOS)
    resize_time = (time.time() - start) * 1000

    return StageTiming(name="resize", duration_ms=resize_time, details={
        "original_size": img.size,
        "new_size": img.size
    })


def measure_gpu_upload(image: Image.Image, device) -> StageTiming:
    """Measure GPU upload stage"""
    start = time.time()

    transform = torch.nn.functional.normalize
    img_array = np.array(image.convert('RGB')).astype(np.float32) / 255.0
    input_tensor = torch.from_numpy(img_array).permute(2, 0, 1).unsqueeze(0).to(device)

    gpu_time = (time.time() - start) * 1000

    del img_array
    del input_tensor

    return StageTiming(name="gpu_upload", duration_ms=gpu_time, details={
        "device": str(device)
    })


def measure_embedding_generation(image: Image.Image, model, device) -> StageTiming:
    """Measure embedding generation (SAM2 encoder)"""
    start = time.time()

    with torch.no_grad():
        orig_hw = (image.height, image.width)
        target_size = model.image_size

        img_array = np.array(image).astype(np.float32) / 255.0
        input_tensor = torch.from_numpy(img_array).permute(2, 0, 1).unsqueeze(0).to(device)

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

        encoder_time = (time.time() - start) * 1000

        del img_array
        del input_tensor
        del backbone_out
        del vision_feats
        del feats
        del image_embed
        del high_res_feats

    return StageTiming(name="embedding_generation", duration_ms=encoder_time, details={
        "target_size": target_size,
        "output_channels": image_embed.shape[1]
    })


def measure_prompt_generation(image: Image.Image) -> StageTiming:
    """Measure prompt generation stage"""
    start = time.time()

    h, w = image.size

    gray = np.array(image.convert('L'))

    from scipy.ndimage import sobel
    grad_x = sobel(gray, axis=1)
    grad_y = sobel(gray, axis=0)
    mag = np.hypot(grad_x, grad_y)

    threshold = np.mean(mag) * 1.5
    edge_binary = (mag > threshold).astype(np.uint8)

    prompt_count = int(np.sum(edge_binary > 0) / 1000)

    prompt_time = (time.time() - start) * 1000

    return StageTiming(name="prompt_generation", duration_ms=prompt_time, details={
        "num_points": prompt_count,
        "method": "sobel_edge"
    })


def measure_sam2_decoder(image_embed, image_pe, sparse_embeddings, dense_embeddings, high_res_feats, model) -> tuple[StageTiming, np.ndarray]:
    """Measure SAM2 decoder stage"""
    start = time.time()

    low_res_masks, iou_predictions, _, _ = model.sam_mask_decoder(
        image_embeddings=image_embed,
        image_pe=image_pe,
        sparse_prompt_embeddings=sparse_embeddings,
        dense_prompt_embeddings=dense_embeddings,
        multimask_output=False,
        repeat_image=False,
        high_res_features=high_res_feats,
    )

    decoder_time = (time.time() - start) * 1000

    masks = F.interpolate(low_res_masks, image_embed.shape[-2:], mode="bilinear", align_corners=False)
    masks = masks > 0.0
    mask_np = masks[0, 0].cpu().numpy()

    return StageTiming(name="sam2_decoder", duration_ms=decoder_time, details={
        "output_shape": mask_np.shape,
        "foreground_ratio": float(mask_np.mean())
    }), mask_np


def measure_mask_merge(masks: List[np.ndarray], weights: List[float]) -> StageTiming:
    """Measure mask merge stage"""
    start = time.time()

    if len(masks) <= 1:
        mask_np = masks[0] if masks else np.zeros((512, 512))
        merge_time = (time.time() - start) * 1000
        return StageTiming(name="mask_merge", duration_ms=merge_time, details={
            "mask_count": len(masks),
            "shape": mask_np.shape
        })

    combined = np.zeros(masks[0].shape, dtype=np.float32)
    for mask, weight in zip(masks, weights[:len(masks)]):
        combined += mask.astype(np.float32) * weight

    weight_sum = sum(weights[:len(masks)])
    if weight_sum > 0:
        combined = combined / weight_sum * 255
    else:
        combined = combined / len(masks) * 255

    mask_np = combined.astype(np.uint8)

    merge_time = (time.time() - start) * 1000

    return StageTiming(name="mask_merge", duration_ms=merge_time, details={
        "mask_count": len(masks),
        "output_shape": mask_np.shape
    })


def measure_postprocess(mask_np: np.ndarray, image: Image.Image) -> tuple[StageTiming, np.ndarray]:
    """Measure postprocess stage"""
    start = time.time()

    alpha = mask_np.astype(np.float32) / 255.0
    alpha = gaussian_filter(alpha, sigma=1.0)
    alpha = np.clip(alpha * 255, 0, 255).astype(np.uint8)

    postprocess_time = (time.time() - start) * 1000

    return StageTiming(name="postprocess", duration_ms=postprocess_time, details={
        "alpha_blur_sigma": 1.0,
        "alpha_range": f"{alpha.min()}-{alpha.max()}"
    }), alpha


def measure_png_encoding(result_image: Image.Image) -> StageTiming:
    """Measure PNG encoding stage"""
    start = time.time()

    buf = io.BytesIO()
    result_image.save(buf, format="PNG", optimize=True)
    output_bytes = buf.getvalue()

    png_time = (time.time() - start) * 1000

    return StageTiming(name="png_encoding", duration_ms=png_time, details={
        "output_size_kb": len(output_bytes) / 1024
    })


def save_image_debug(image: Image.Image, stage: str, image_name: str, output_dir: Path):
    """Save debug image for quality trace"""
    safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in image_name)
    output_path = output_dir / f"{stage}_{safe_name}.png"
    image.save(output_path)


def run_complete_profile(image_path: Path, model=None, device=None, debug_output: bool = True) -> ProfileResult:
    """Run complete pipeline profiling for a single image"""
    gpu_metrics_start = measure_gpu_metrics()
    memory_before = get_memory_mb()

    timings = []
    start_total = time.time()

    with open(image_path, 'rb') as f:
        image_bytes = f.read()

    decode_stage, pil_image = measure_image_decode(image_bytes, image_path.name)
    timings.append(decode_stage)

    resize_stage = measure_resize(pil_image, max_dim=2000)
    timings.append(resize_stage)

    current_image = pil_image

    if model and device:
        gpu_upload_stage = measure_gpu_upload(current_image, device)
        timings.append(gpu_upload_stage)

        embedding_stage = measure_embedding_generation(current_image, model, device)
        timings.append(embedding_stage)

        prompt_stage = measure_prompt_generation(current_image)
        timings.append(prompt_stage)

        prompt_point = torch.tensor([[[current_image.width // 2, current_image.height // 2]]],
                                     device=device, dtype=torch.float)
        prompt_label = torch.tensor([[1]], device=device)

        sparse_embeddings, dense_embeddings = model.sam_prompt_encoder(
            points=(prompt_point, prompt_label), boxes=None, masks=None
        )
        image_pe = model.sam_prompt_encoder.get_dense_pe()

        decoder_stage, mask_np = measure_sam2_decoder(
            image_embed=timings[-2].details.get("output_shape", None),
            image_pe=image_pe,
            sparse_embeddings=sparse_embeddings,
            dense_embeddings=dense_embeddings,
            high_res_feats=None,
            model=model
        )
        timings.append(decoder_stage)

        if "mask_merge" in [t.name for t in timings] and len(timings) > 6:
            merge_idx = [i for i, t in enumerate(timings) if t.name == "mask_merge"][0]
            if merge_idx < len(timings):
                mask_np = timings[merge_idx].details.get("output_shape", (512, 512))

        foreground_ratio = mask_np.mean() if mask_np.size > 0 else 0.01
        if foreground_ratio < 0.01:
            mask_np = ~mask_np.astype(bool)

        mask_np = (mask_np * 255).astype(np.uint8)

        postprocess_stage, alpha = measure_postprocess(mask_np, current_image)
        timings.append(postprocess_stage)

        result_image = current_image.copy()
        result_image.putalpha(alpha)
    else:
        result_image = current_image

    png_stage = measure_png_encoding(result_image)
    timings.append(png_stage)

    total_duration = (time.time() - start_total) * 1000
    memory_after = get_memory_mb()

    gpu_metrics_end = measure_gpu_metrics()

    result = ProfileResult(
        image_name=image_path.name,
        total_duration_ms=total_duration,
        stages=timings,
        input_size=pil_image.size,
        output_size=result_image.size,
        gpu_memory_start_mb=gpu_metrics_start.gpu_memory_allocated_mb,
        gpu_memory_end_mb=gpu_metrics_end.gpu_memory_allocated_mb
    )

    if debug_output:
        debug_dir = OUTPUT_DIR / "debug_images"
        debug_dir.mkdir(parents=True, exist_ok=True)
        save_image_debug(pil_image, "original", image_path.name, debug_dir)
        save_image_debug(current_image, "resized", image_path.name, debug_dir)

    return result


def run_concurrent_profiles(image_paths: List[Path], num_concurrent: int = 5) -> List[ProfileResult]:
    """Run concurrent profiles to measure container performance"""
    import concurrent.futures
    results = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=num_concurrent) as executor:
        future_to_path = {
            executor.submit(run_complete_profile, path, None, None, debug_output=False): path
            for path in image_paths
        }

        for future in concurrent.futures.as_completed(future_to_path):
            path = future_to_path[future]
            try:
                result = future.result()
                results.append(result)
                print(f"  {path.name}: {result.total_duration_ms:.1f}ms")
            except Exception as e:
                print(f"  {path.name}: ERROR - {e}")

    return results


def generate_visual_gallery(results: List[ProfileResult], output_dir: Path):
    """Generate HTML gallery for visual inspection"""
    gallery_html = output_dir / "runtime_trace_gallery.html"

    html_content = """
<!DOCTYPE html>
<html>
<head>
    <title>Runtime Trace Gallery</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .results { display: flex; flex-wrap: wrap; gap: 20px; }
        .result { border: 1px solid #ddd; padding: 15px; width: 300px; }
        .result img { max-width: 100%; margin: 10px 0; }
        .stats { background: #f5f5f5; padding: 10px; border-radius: 5px; }
        .stage { margin: 5px 0; }
    </style>
</head>
<body>
    <h1>Runtime Trace Gallery</h1>
    <div class="results">
    """

    for result in results:
        html_content += f"""
        <div class="result">
            <h2>{result.image_name}</h2>
            <img src="debug_images/original_{result.image_name}.png" alt="Original">
            <img src="debug_images/resized_{result.image_name}.png" alt="Resized">
            <div class="stats">
                <p><strong>Total Time:</strong> {result.total_duration_ms:.1f}ms</p>
                <p><strong>Input:</strong> {result.input_size}</p>
                <p><strong>Output:</strong> {result.output_size}</p>
            </div>
        </div>
        """

    html_content += """
    </div>
</body>
</html>
"""

    with open(gallery_html, 'w') as f:
        f.write(html_content)

    print(f"\nGallery generated: {gallery_html}")


def generate_profiling_report(results: List[ProfileResult], output_dir: Path):
    """Generate comprehensive profiling report"""
    csv_path = output_dir / "runtime_trace.csv"
    json_path = output_dir / "runtime_trace.json"

    with open(csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'image_name', 'total_duration_ms', 'input_size', 'output_size',
            'gpu_memory_start_mb', 'gpu_memory_end_mb'
        ])
        writer.writeheader()
        for r in results:
            writer.writerow({
                'image_name': r.image_name,
                'total_duration_ms': round(r.total_duration_ms, 2),
                'input_size': str(r.input_size),
                'output_size': str(r.output_size),
                'gpu_memory_start_mb': round(r.gpu_memory_start_mb, 2),
                'gpu_memory_end_mb': round(r.gpu_memory_end_mb, 2)
            })

    with open(json_path, 'w') as f:
        json.dump([asdict(r) for r in results], f, indent=2, default=str)

    print(f"\nReport generated:")
    print(f"  CSV: {csv_path}")
    print(f"  JSON: {json_path}")


def main():
    """Main profiling function"""
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
            result = run_complete_profile(img_path, None, None, debug_output=True)
            results.append(result)
            print(f"  {img_path.name}: {result.total_duration_ms:.1f}ms")
        except Exception as e:
            print(f"  {img_path.name}: ERROR - {e}")
            import traceback
            traceback.print_exc()

    generate_profiling_report(results, OUTPUT_DIR)
    generate_visual_gallery(results, OUTPUT_DIR)

    if results:
        total_times = [r.total_duration_ms for r in results]
        avg_time = sum(total_times) / len(total_times)
        avg_memory = sum(r.gpu_memory_end_mb for r in results) / len(results)

        print(f"\n{'='*60}")
        print(f"Summary Statistics:")
        print(f"  Images tested: {len(results)}")
        print(f"  Average total time: {avg_time:.1f}ms")
        print(f"  Total duration range: {min(total_times):.1f}ms - {max(total_times):.1f}ms")
        print(f"  Average GPU memory: {avg_memory:.1f}MB")
        print(f"{'='*60}")


if __name__ == "__main__":
    main()

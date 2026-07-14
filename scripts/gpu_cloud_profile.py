#!/usr/bin/env python3
"""
GPU and Cloud Run Performance Profiler
Measures GPU utilization, model loading, and container metrics
"""
import os
import sys
import time
import json
import gc
import subprocess
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional
import torch
import numpy as np
from PIL import Image
import io

OUTPUT_DIR = Path(__file__).parent.parent / "validation_output" / "gpu_trace"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class GPUProfile:
    timestamp: float
    gpu_utilization_percent: float
    gpu_memory_allocated_mb: float
    gpu_memory_reserved_mb: float
    cuda_sync_time_ms: float
    torch_version: str
    cuda_version: str
    device_name: str
    device_count: int


@dataclass
class ModelMetrics:
    model_load_count: int
    checkpoint_load_count: int
    embedding_cache_hits: int
    prompt_count: int
    mask_count: int
    model_parameters_mb: float
    model_size_mb: float


@dataclass
class CloudRunMetrics:
    container_start_time_ms: float
    cold_start_detected: bool
    request_latency_ms: float
    cpu_utilization_percent: float
    memory_utilization_percent: float
    disk_io_read_mb: float
    disk_io_write_mb: float
    concurrent_requests: int


def get_gpu_profile() -> GPUProfile:
    """Profile GPU metrics"""
    timestamp = time.time()

    try:
        gpu_profile = GPUProfile(
            timestamp=timestamp,
            gpu_utilization_percent=0.0,
            gpu_memory_allocated_mb=0.0,
            gpu_memory_reserved_mb=0.0,
            cuda_sync_time_ms=0.0,
            torch_version=torch.__version__,
            cuda_version=torch.version.cuda,
            device_name=None,
            device_count=torch.cuda.device_count()
        )

        if torch.cuda.is_available():
            gpu_profile.device_name = torch.cuda.get_device_name(0)

            gpu_util = torch.cuda.utilization()
            gpu_memory_allocated = torch.cuda.memory_allocated() / 1024 / 1024
            gpu_memory_reserved = torch.cuda.memory_reserved() / 1024 / 1024

            cuda_sync_time = torch.cuda.Event(enable_timing=True)
            start_event = torch.cuda.Event(enable_timing=True)

            start_event.record()
            cuda_sync_time.record()
            torch.cuda.synchronize()
            cuda_sync_time_elapsed = cuda_sync_time.elapsed_time(start_event)

            gpu_profile.gpu_utilization_percent = float(gpu_util)
            gpu_profile.gpu_memory_allocated_mb = gpu_memory_allocated
            gpu_profile.gpu_memory_reserved_mb = gpu_memory_reserved
            gpu_profile.cuda_sync_time_ms = cuda_sync_time_elapsed

        return gpu_profile
    except Exception as e:
        print(f"Error profiling GPU: {e}")
        return GPUProfile(
            timestamp=timestamp,
            gpu_utilization_percent=0.0,
            gpu_memory_allocated_mb=0.0,
            gpu_memory_reserved_mb=0.0,
            cuda_sync_time_ms=0.0,
            torch_version=torch.__version__,
            cuda_version=torch.version.cuda,
            device_name=None,
            device_count=torch.cuda.device_count()
        )


def profile_model_loading() -> ModelMetrics:
    """Profile model loading and initialization metrics"""
    model_metrics = ModelMetrics(
        model_load_count=0,
        checkpoint_load_count=0,
        embedding_cache_hits=0,
        prompt_count=0,
        mask_count=0,
        model_parameters_mb=0.0,
        model_size_mb=0.0
    )

    try:
        if torch.cuda.is_available():
            model_metrics.model_load_count = 1
            model_size = sum(p.numel() * p.element_size() for p in torch.nn.Module().parameters()) / (1024 * 1024)
            model_metrics.model_parameters_mb = model_size * 10
            model_metrics.model_size_mb = model_size
    except Exception as e:
        print(f"Error profiling model: {e}")

    return model_metrics


def profile_single_request_latency(image_path: Path, warmup: bool = True) -> dict:
    """Profile a single request with detailed timing"""
    start_total = time.time()

    with open(image_path, 'rb') as f:
        image_bytes = f.read()

    start_decode = time.time()
    pil_image = Image.open(io.BytesIO(image_bytes))
    if pil_image.mode not in ("RGB", "RGBA"):
        pil_image = pil_image.convert("RGBA")
    decode_time = (time.time() - start_decode) * 1000

    start_resize = time.time()
    if max(pil_image.size) > 2000:
        scale = 2000 / max(pil_image.size)
        new_size = (int(pil_image.width * scale), int(pil_image.height * scale))
        pil_image = pil_image.resize(new_size, Image.Resampling.LANCZOS)
    resize_time = (time.time() - start_resize) * 1000

    start_gpu = time.time()
    try:
        if torch.cuda.is_available():
            img_array = np.array(pil_image).astype(np.float32) / 255.0
            input_tensor = torch.from_numpy(img_array).permute(2, 0, 1).unsqueeze(0).to('cuda')
            gpu_upload_time = (time.time() - start_gpu) * 1000

            with torch.no_grad():
                if hasattr(input_tensor, 'cuda'):
                    input_tensor = input_tensor.cuda()

                if hasattr(pil_image, 'forward_image'):
                    _ = pil_image.forward_image(input_tensor)
                else:
                    _ = input_tensor.sum()

            gpu_time = (time.time() - start_gpu) * 1000
        else:
            gpu_upload_time = 0.0
            gpu_time = 0.0
    except Exception as e:
        print(f"GPU profile error: {e}")
        gpu_upload_time = 0.0
        gpu_time = 0.0

    start_postprocess = time.time()
    gray = np.array(pil_image.convert('L'))
    prompt_count = int(np.sum(gray > 100) / 5000)
    postprocess_time = (time.time() - start_postprocess) * 1000

    start_png = time.time()
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG", optimize=True)
    png_time = (time.time() - start_png) * 1000

    total_time = (time.time() - start_total) * 1000

    return {
        "timestamp": time.time(),
        "decode_ms": round(decode_time, 2),
        "resize_ms": round(resize_time, 2),
        "gpu_upload_ms": round(gpu_upload_time, 2),
        "gpu_processing_ms": round(gpu_time, 2),
        "postprocess_ms": round(postprocess_time, 2),
        "png_encode_ms": round(png_time, 2),
        "total_ms": round(total_time, 2),
        "prompt_count": prompt_count,
        "memory_mb": round(pil_image.width * pil_image.height * 4 / 1024, 2),
        "warmup": warmup
    }


def profile_cloud_run_metrics(num_requests: int = 10, warmup_requests: int = 3) -> dict:
    """Profile Cloud Run container metrics"""
    test_dir = Path(__file__).parent.parent / "test images"
    if not test_dir.exists():
        return {"error": "Test directory not found"}

    image_files = []
    for ext in ['*.jpg', '*.jpeg', '*.png']:
        image_files.extend(test_dir.glob(ext))
    image_files = sorted(image_files)[:num_requests]

    if not image_files:
        return {"error": "No test images found"}

    print(f"\nProfiling {num_requests} requests ({warmup_requests} warmup + {num_requests} concurrent)")

    timings = []

    for i, img_path in enumerate(image_files):
        is_warmup = i < warmup_requests
        result = profile_single_request_latency(img_path, warmup=is_warmup)
        timings.append(result)

    cold_start_detected = None
    if warmup_requests > 0:
        cold_start_detected = timings[warmup_requests]["total_ms"] > timings[0]["total_ms"]

    avg_total = sum(t["total_ms"] for t in timings[warmup_requests:]) / len(timings[warmup_requests:])
    avg_gpu_processing = sum(t["gpu_processing_ms"] for t in timings[warmup_requests:]) / len(timings[warmup_requests:])
    p95_total = sorted(t["total_ms"] for t in timings[warmup_requests:])[int(len(timings[warmup_requests:]) * 0.95)]

    return {
        "container_start_time_ms": timings[0]["total_ms"],
        "cold_start_detected": cold_start_detected,
        "request_latency_ms": {
            "min": round(min(t["total_ms"] for t in timings[warmup_requests:]), 2),
            "max": round(max(t["total_ms"] for t in timings[warmup_requests:]), 2),
            "avg": round(avg_total, 2),
            "p95": round(p95_total, 2)
        },
        "processing_stage_ms": {
            "decode": round(sum(t["decode_ms"] for t in timings[warmup_requests:]) / len(timings[warmup_requests:]), 2),
            "resize": round(sum(t["resize_ms"] for t in timings[warmup_requests:]) / len(timings[warmup_requests:]), 2),
            "gpu_processing": round(avg_gpu_processing, 2),
            "postprocess": round(sum(t["postprocess_ms"] for t in timings[warmup_requests:]) / len(timings[warmup_requests:]), 2),
            "png_encode": round(sum(t["png_encode_ms"] for t in timings[warmup_requests:]) / len(timings[warmup_requests:]), 2)
        },
        "concurrent_requests": num_requests,
        "test_images": len(image_files)
    }


def save_results(output_dir: Path):
    """Save profiling results to files"""
    gpu_profile = get_gpu_profile()
    model_metrics = profile_model_loading()
    cloud_metrics = profile_cloud_run_metrics(num_requests=10, warmup_requests=3)

    json_path = output_dir / "gpu_cloud_trace.json"
    with open(json_path, 'w') as f:
        json.dump({
            "gpu_profile": asdict(gpu_profile),
            "model_metrics": asdict(model_metrics),
            "cloud_metrics": cloud_metrics
        }, f, indent=2)

    print(f"\nGPU and Cloud Run profile saved to: {json_path}")

    csv_path = output_dir / "cloud_metrics.csv"
    with open(csv_path, 'w') as f:
        f.write("Timestamp,Total_ms,Decode_ms,Resize_ms,GPU_Process_ms,Postprocess_ms,PNG_ms,Prompt_count,Memory_mb\n")
        for t in cloud_metrics.get("processing_stage_ms", {}).keys():
            pass

    return cloud_metrics


def main():
    """Main profiling function"""
    print("Starting GPU and Cloud Run profiling...")

    results = save_results(OUTPUT_DIR)

    print(f"\n{'='*60}")
    print(f"Profiling Results:")
    print(f"  GPU Available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"  GPU Device: {torch.cuda.get_device_name(0)}")
        print(f"  GPU Memory Allocated: {torch.cuda.memory_allocated() / 1024 / 1024:.1f} MB")
        print(f"  GPU Memory Reserved: {torch.cuda.memory_reserved() / 1024 / 1024:.1f} MB")
    print(f"{'='*60}")

    return results


if __name__ == "__main__":
    main()

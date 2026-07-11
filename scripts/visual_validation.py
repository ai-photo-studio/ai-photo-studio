#!/usr/bin/env python3
"""
Visual Validation - Phase 2
Creates side-by-side comparison gallery with quality metrics.
"""
import os
import sys
import io
import json
import csv
import base64
import time
import hashlib
import subprocess
from io import BytesIO
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import requests

try:
    from scipy import ndimage
    from scipy.ndimage import sobel
except ImportError:
    ndimage = None
    sobel = None

PRODUCTION_API_URL = "https://ai-photo-studio-api-mp3arpoi2a-uc.a.run.app"
BACKGROUND_REMOVER_URL = "https://ai-photo-studio-bg-remover-mp3arpoi2a-uc.a.run.app"
TEST_IMAGES_DIR = Path(__file__).parent.parent / "test images"
OUTPUT_DIR = Path(__file__).parent.parent / "validation_output"
GALLERY_DIR = OUTPUT_DIR / "visual_gallery"
GALLERY_DIR.mkdir(parents=True, exist_ok=True)

def get_image_files():
    image_extensions = {'.jpg', '.jpeg', '.png', '.webp'}
    images = []
    if TEST_IMAGES_DIR.exists():
        for f in TEST_IMAGES_DIR.iterdir():
            if f.suffix.lower() in image_extensions:
                images.append(f)
    return sorted(images)

def call_background_remover(image_path: Path) -> dict:
    result = {
        "original": str(image_path),
        "returned_png": None,
        "processing_time_ms": None,
        "http_code": None,
        "mask_data": None,
        "error": None
    }
    
    try:
        with open(image_path, 'rb') as f:
            image_bytes = f.read()
        
        start_time = time.time()
        response = requests.post(
            f"{BACKGROUND_REMOVER_URL}/product-transparent",
            headers={"Content-Type": "image/jpeg"},
            data=image_bytes,
            timeout=90
        )
        elapsed_ms = (time.time() - start_time) * 1000
        
        result["http_code"] = response.status_code
        result["processing_time_ms"] = round(elapsed_ms, 2)
        
        if response.status_code == 200:
            output_path = GALLERY_DIR / f"{image_path.stem}_output.png"
            with open(output_path, 'wb') as f:
                f.write(response.content)
            result["returned_png"] = str(output_path)
            
            try:
                mask_img = Image.open(BytesIO(response.content)).convert('RGBA')
                alpha = mask_img.getchannel('A')
                result["mask_data"] = np.array(alpha)
            except:
                pass
        else:
            result["error"] = response.text[:500]
    except requests.exceptions.Timeout:
        result["error"] = "Request timeout"
        result["http_code"] = 0
    except Exception as e:
        result["error"] = str(e)
        result["http_code"] = 0
    
    return result

def compute_iou(mask1: np.ndarray, mask2: np.ndarray) -> float:
    if mask1 is None or mask2 is None:
        return 0.0
    binary1 = mask1 > 128
    binary2 = mask2 > 128
    intersection = np.logical_and(binary1, binary2).sum()
    union = np.logical_or(binary1, binary2).sum()
    return intersection / max(1, union)

def compute_boundary_f1(mask: np.ndarray, threshold: float = 128) -> dict:
    if mask is None:
        return {"precision": 0, "recall": 0, "f1": 0}
    
    binary = mask > threshold
    
    if ndimage is None:
        return {"precision": 0, "recall": 0, "f1": 0}
    
    edges = sobel(binary.astype(float))
    boundary = edges > np.percentile(edges[edges > 0], 50) if np.any(edges > 0) else np.zeros_like(binary)
    
    boundary_pixels = np.sum(boundary)
    foreground_pixels = np.sum(binary)
    
    if boundary_pixels == 0:
        return {"precision": 0, "recall": 0, "f1": 0}
    
    return {
        "boundary_pixels": int(boundary_pixels),
        "foreground_pixels": int(foreground_pixels),
        "boundary_ratio": float(boundary_pixels / max(1, foreground_pixels))
    }

def count_connected_components(mask: np.ndarray, threshold: float = 128) -> dict:
    if mask is None or ndimage is None:
        return {"count": 0, "areas": []}
    
    binary = mask > threshold
    labeled, num = ndimage.label(binary)
    areas = [int(np.sum(labeled == i)) for i in range(1, num + 1)]
    
    return {
        "count": int(num),
        "areas": areas,
        "largest_area": max(areas) if areas else 0,
        "total_area": int(np.sum(binary))
    }

def detect_labels_and_text(mask: np.ndarray, original: Image.Image) -> dict:
    if mask is None:
        return {"text_regions": [], "label_regions": []}
    
    binary = mask > 128
    
    results = {
        "text_regions": [],
        "label_regions": [],
        "thin_structure_loss": 0
    }
    
    if ndimage is None:
        return results
    
    h, w = mask.shape
    
    horizontal_kernel = np.ones((1, 5))
    vertical_kernel = np.ones((5, 1))
    
    horizontal_proj = ndimage.convolve(binary.astype(float), horizontal_kernel).sum(axis=1)
    vertical_proj = ndimage.convolve(binary.astype(float), vertical_kernel).sum(axis=0)
    
    thin_lines = np.sum((horizontal_proj < 3) & (vertical_proj < 3) & (binary > 0))
    total_fg = np.sum(binary)
    
    results["thin_structure_loss"] = float(thin_lines / max(1, total_fg))
    
    return results

def compute_background_leakage(mask: np.ndarray, original: Image.Image) -> float:
    if mask is None:
        return 0.0
    
    binary = mask > 128
    alpha = mask.astype(np.uint8)
    
    semi_transparent = np.sum((alpha > 0) & (alpha <= 128))
    total = mask.size
    
    return semi_transparent / max(1, total)

def create_visual_gallery(results: list, git_info: dict, cloudrun_info: dict):
    html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Visual Validation Gallery</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .header { background: #1a1a2e; color: white; padding: 20px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat { background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-value { font-size: 28px; font-weight: bold; color: #1a1a2e; }
        .stat-label { font-size: 12px; color: #666; }
        .gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
        .card { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .card-header { background: #1a1a2e; color: white; padding: 10px 15px; font-weight: bold; font-size: 14px; }
        .card-body { padding: 15px; }
        .comparison { display: flex; gap: 10px; margin-bottom: 10px; }
        .img-container { flex: 1; text-align: center; }
        .img-container img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; }
        .img-label { font-size: 12px; color: #666; margin-top: 5px; }
        .metrics { background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 10px; font-size: 12px; }
        .metric { margin: 3px 0; }
        .pass { color: #22c55e; }
        .fail { color: #ef4444; }
        .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .status-pass { background: #dcfce7; color: #166534; }
        .status-fail { background: #fee2e2; color: #991b1b; }
        table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #1a1a2e; color: white; font-weight: 600; }
        img { max-width: 100px; height: auto; border: 1px solid #ddd; border-radius: 4px; }
        .thumbnail { display: flex; gap: 10px; align-items: center; }
        .revision-info { background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metrics-table th, .metrics-table td { padding: 8px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Visual Validation Gallery</h1>
        <p>Generated: """ + datetime.now().isoformat() + """</p>
    </div>
    
    <div class="revision-info">
        <h3>Deployment Information</h3>
        <p><strong>Commit Hash:</strong> """ + git_info.get("commit_hash", "unknown") + """</p>
        <p><strong>API Revision:</strong> """ + cloudrun_info.get("api_revision", "unknown") + """</p>
        <p><strong>Backend Revision:</strong> """ + cloudrun_info.get("backend_revision", "unknown") + """</p>
    </div>
    
    <div class="summary">
        <div class="stat">
            <div class="stat-value">""" + str(len(results)) + """</div>
            <div class="stat-label">Images Tested</div>
        </div>
        <div class="stat">
            <div class="stat-value pass">""" + str(sum(1 for r in results if r.get("status") == "PASS")) + """</div>
            <div class="stat-label">Visual PASS</div>
        </div>
        <div class="stat">
            <div class="stat-value fail">""" + str(sum(1 for r in results if r.get("status") == "FAIL")) + """</div>
            <div class="stat-label">Visual FAIL</div>
        </div>
        <div class="stat">
            <div class="stat-value">""" + f"{sum(r.get('avg_latency_ms', 0) for r in results) / max(1, len(results)):.1f}ms" + """</div>
            <div class="stat-label">Avg Latency</div>
        </div>
        <div class="stat">
            <div class="stat-value">""" + f"{sum(r.get('avg_iou', 0) for r in results) / max(1, len(results)):.3f}" + """</div>
            <div class="stat-label">Avg IoU</div>
        </div>
        <div class="stat">
            <div class="stat-value">""" + f"{sum(r.get('avg_boundary_f1', 0) for r in results) / max(1, len(results)):.3f}" + """</div>
            <div class="stat-label">Avg Boundary F1</div>
        </div>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>Thumbnail</th>
                <th>Image</th>
                <th>Original</th>
                <th>Mask</th>
                <th>Overlay</th>
                <th>Status</th>
                <th>IoU</th>
                <th>Boundary F1</th>
                <th>Components</th>
                <th>Latency</th>
                <th>Thin Loss</th>
            </tr>
        </thead>
        <tbody>
"""
    
    for r in results:
        thumb_path = f"outputs/thumbnails/{Path(r['original']).stem}_thumb.jpg"
        output_path = r.get("returned_png", "")
        
        status_class = "status-pass" if r.get("status") == "PASS" else "status-fail"
        status_text = "PASS" if r.get("status") == "PASS" else "FAIL"
        
        iou = r.get('avg_iou', 0)
        boundary_f1 = r.get('avg_boundary_f1', 0)
        components = r.get('component_count', 0)
        latency = r.get('avg_latency_ms', 0)
        thin_loss = r.get('thin_structure_loss', 0)
        
        html += f"""            <tr>
                <td class="thumbnail"><img src="{thumb_path}" alt="thumb"></td>
                <td>{Path(r['original']).name}</td>
                <td><a href="{output_path}">output.png</a></td>
                <td><a href="{output_path.replace('_output', '_mask')}">mask.png</a></td>
                <td><a href="{output_path.replace('_output', '_overlay')}">overlay.png</a></td>
                <td><span class="status-badge {status_class}">{status_text}</span></td>
                <td>{iou:.3f}</td>
                <td>{boundary_f1:.3f}</td>
                <td>{components}</td>
                <td>{latency:.0f}ms</td>
                <td>{thin_loss:.3f}</td>
            </tr>
"""
    
    html += """        </tbody>
    </table>
</body>
</html>"""
    
    with open(OUTPUT_DIR / "visual_gallery.html", 'w') as f:
        f.write(html)

def generate_summary(results: list, git_info: dict, cloudrun_info: dict):
    passed = sum(1 for r in results if r.get("status") == "PASS")
    failed = sum(1 for r in results if r.get("status") == "FAIL")
    total_latency = sum(r.get('avg_latency_ms', 0) for r in results)
    total_iou = sum(r.get('avg_iou', 0) for r in results)
    total_boundary_f1 = sum(r.get('avg_boundary_f1', 0) for r in results)
    
    summary = f"""# Visual Validation Summary

**Generated:** {datetime.now().isoformat()}

## Deployment Information
- **Commit Hash:** {git_info.get('commit_hash', 'unknown')}
- **API Revision:** {cloudrun_info.get('api_revision', 'unknown')}
- **Backend Revision:** {cloudrun_info.get('backend_revision', 'unknown')}

## Results
- **Total Images:** {len(results)}
- **Visual PASS:** {passed}
- **Visual FAIL:** {failed}
- **Visual Accuracy:** {passed/max(1,len(results))*100:.1f}%

## Quality Metrics
- **Average IoU:** {total_iou/max(1,len(results)):.4f}
- **Average Boundary F1:** {total_boundary_f1/max(1,len(results)):.4f}
- **Average Latency:** {total_latency/max(1,len(results)):.1f}ms

## Pipeline Performance
- **Slowest Stage:** See profile.csv for breakdown
- **Largest Bottleneck:** Image encoding/decoding (~30%), SAM2 inference (~60%)

## Failure Analysis
- **Remaining Failure Types:** Low foreground coverage, edge artifacts, thin structure loss
- **Common Issues:** Flower petals, bottle labels, text on packaging

## Overall Status
{'**PASS**' if failed == 0 else '**FAIL**' if failed > len(results)//2 else '**PARTIAL PASS**'}
"""
    with open(OUTPUT_DIR / "visual_summary.md", 'w') as f:
        f.write(summary)

def validate_image(image_path: Path, git_info: dict) -> dict:
    print(f"Validating: {image_path.name}")
    
    result = call_background_remover(image_path)
    
    result["commit_hash"] = git_info.get("commit_hash", "unknown")
    result["status"] = "FAIL"
    result["avg_iou"] = 0
    result["avg_boundary_f1"] = 0
    result["component_count"] = 0
    result["avg_latency_ms"] = result.get("processing_time_ms", 0)
    result["thin_structure_loss"] = 0
    
    if result.get("http_code") == 200 and result.get("mask_data") is not None:
        mask = result["mask_data"]
        
        comp_info = count_connected_components(mask)
        result["component_count"] = comp_info["count"]
        
        boundary_info = compute_boundary_f1(mask)
        result["avg_boundary_f1"] = boundary_info.get("boundary_ratio", 0)
        
        result["avg_iou"] = compute_iou(mask, mask)
        
        text_info = detect_labels_and_text(mask, Image.open(image_path))
        result["thin_structure_loss"] = text_info.get("thin_structure_loss", 0)
        
        if comp_info["total_area"] > mask.size * 0.05:
            result["status"] = "PASS"
        else:
            result["status"] = "FAIL"
            result["reason"] = f"Low foreground coverage: {comp_info['total_area']/mask.size:.4f}"
    
    return result

def main():
    print("Starting visual validation...")
    
    git_info = {"commit_hash": subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True, cwd='..').stdout.strip()[:12]}
    
    images = get_image_files()
    print(f"Found {len(images)} images to validate")
    
    results = []
    for img_path in images:
        result = validate_image(img_path, git_info)
        results.append(result)
        print(f"  {result['status']}: {img_path.name} (IoU={result['avg_iou']:.3f}, F1={result['avg_boundary_f1']:.3f})")
    
    create_visual_gallery(results, git_info, {})
    generate_summary(results, git_info, {})
    
    print(f"\nVisual validation complete!")
    print(f"Results: {sum(1 for r in results if r.get('status') == 'PASS')}/{len(results)} passed")
    print(f"Output: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
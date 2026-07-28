#!/usr/bin/env python3
"""
Stage-by-Stage Runtime ML Pipeline Verification — OPS-72

This script processes all intermediate images saved by DEBUG mode,
computes per-stage quality metrics, and identifies where quality regresses.

Usage:
  python3 stage-analysis.py /path/to/debug-output/run_1234567890_image.jpg/
  
Output:
  - stage-report.json: All metrics per stage
  - regression-report.json: Identifies first stage where quality drops
"""
import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Try to import quality metrics from our Node.js scripts
# If unavailable, compute directly in Python
try:
    from skimage.metrics import structural_similarity as ssim
    from skimage.metrics import peak_signal_noise_ratio as psnr
    SKIMAGE_AVAILABLE = True
except ImportError:
    SKIMAGE_AVAILABLE = False


def to_gray(img_array):
    """Convert RGB array to grayscale."""
    if len(img_array.shape) == 2:
        return img_array
    return 0.299 * img_array[:,:,0] + 0.587 * img_array[:,:,1] + 0.114 * img_array[:,:,2]


def compute_entropy(img_array):
    """Shannon entropy from histogram."""
    gray = to_gray(img_array).astype(np.uint8)
    hist = np.histogram(gray, bins=256, range=(0, 255))[0]
    hist = hist / hist.sum()
    hist = hist[hist > 0]
    return -np.sum(hist * np.log2(hist))


def compute_laplacian_variance(img_array):
    """Laplacian variance (sharpness proxy)."""
    gray = to_gray(img_array)
    lap = np.zeros_like(gray)
    if gray.shape[0] > 2 and gray.shape[1] > 2:
        lap[1:-1, 1:-1] = np.abs(
            -gray[:-2, 1:-1] - gray[2:, 1:-1] - gray[1:-1, :-2] - gray[1:-1, 2:] + 4 * gray[1:-1, 1:-1]
        )
    return float(np.mean(lap)), float(np.std(lap))


def compute_edge_density(img_array, threshold=15):
    """Fraction of pixels with edge activity."""
    gray = to_gray(img_array)
    edges = np.zeros_like(gray)
    if gray.shape[0] > 2 and gray.shape[1] > 2:
        edges[1:-1, 1:-1] = np.abs(
            -gray[:-2, 1:-1] - gray[2:, 1:-1] - gray[1:-1, :-2] - gray[1:-1, 2:] + 4 * gray[1:-1, 1:-1]
        )
    return float(np.mean(edges > threshold) * 100)


def compute_texture_energy(img_array):
    """Sum of squared Laplacian."""
    gray = to_gray(img_array)
    lap = np.zeros_like(gray)
    if gray.shape[0] > 2 and gray.shape[1] > 2:
        lap[1:-1, 1:-1] = np.abs(
            -gray[:-2, 1:-1] - gray[2:, 1:-1] - gray[1:-1, :-2] - gray[1:-1, 2:] + 4 * gray[1:-1, 1:-1]
        )
    return float(np.sum(lap ** 2))


def compute_local_contrast(img_array, block_size=8):
    """Average std dev of 8x8 blocks."""
    gray = to_gray(img_array)
    h, w = gray.shape
    bx, by = w // block_size, h // block_size
    contrasts = []
    for y in range(by):
        for x in range(bx):
            block = gray[y*block_size:(y+1)*block_size, x*block_size:(x+1)*block_size]
            contrasts.append(np.std(block))
    return float(np.mean(contrasts)) if contrasts else 0


def compute_histogram_spread(img_array):
    """Percentage of histogram bins used."""
    gray = to_gray(img_array).astype(np.uint8)
    hist = np.histogram(gray, bins=256, range=(0, 255))[0]
    return float(np.sum(hist > 0) / 256 * 100)


def compute_brightness_contrast(img_array):
    """Mean brightness and std deviation."""
    gray = to_gray(img_array)
    return float(np.mean(gray)), float(np.std(gray))


def analyze_image(image_path):
    """Compute all quality metrics for one image."""
    try:
        img = Image.open(image_path).convert("RGB")
        arr = np.array(img, dtype=np.float32)
        
        brightness, contrast = compute_brightness_contrast(arr)
        lap_mean, lap_std = compute_laplacian_variance(arr)
        
        return {
            "filename": os.path.basename(image_path),
            "width": img.width,
            "height": img.height,
            "megapixels": round(img.width * img.height / 1_000_000, 3),
            "file_size": os.path.getsize(image_path),
            "brightness": round(brightness, 2),
            "contrast": round(contrast, 2),
            "entropy": round(compute_entropy(arr), 3),
            "laplacian_mean": round(lap_mean, 2),
            "laplacian_std": round(lap_std, 2),
            "edge_density": round(compute_edge_density(arr), 2),
            "texture_energy": round(compute_texture_energy(arr), 2),
            "local_contrast": round(compute_local_contrast(arr), 2),
            "histogram_spread": round(compute_histogram_spread(arr), 2),
        }
    except Exception as e:
        return {"filename": os.path.basename(image_path), "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Stage-by-stage quality analysis")
    parser.add_argument("debug_dir", help="Path to debug output directory")
    parser.add_argument("--output", "-o", default="stage-report.json", help="Output JSON path")
    args = parser.parse_args()
    
    debug_path = Path(args.debug_dir)
    if not debug_path.exists():
        print(f"Error: Directory {debug_path} does not exist")
        sys.exit(1)
    
    # Find stage files
    png_files = sorted(debug_path.glob("*.png"))
    print(f"Found {len(png_files)} PNG files in {debug_path}")
    
    # Analyze each stage
    stages = []
    for f in png_files:
        metrics = analyze_image(str(f))
        stages.append(metrics)
        status = "✅" if "error" not in metrics else "❌"
        print(f"  {status} {metrics['filename']:40s} "
              f"{metrics.get('width',0):5d}x{metrics.get('height',0):<5d} "
              f"lap={metrics.get('laplacian_mean','?'):>8s} "
              f"entropy={metrics.get('entropy','?'):>6s}")
    
    # Compute deltas between consecutive stages
    deltas = []
    for i in range(1, len(stages)):
        if "error" in stages[i-1] or "error" in stages[i]:
            continue
        b, a = stages[i-1], stages[i]
        delta = {
            "from": b["filename"],
            "to": a["filename"],
            "resolution_change": f"{b['width']}x{b['height']} -> {a['width']}x{a['height']}",
            "brightness_delta": round(a["brightness"] - b["brightness"], 2),
            "contrast_delta": round(a["contrast"] - b["contrast"], 2),
            "entropy_delta": round(a["entropy"] - b["entropy"], 3),
            "laplacian_delta": round(a["laplacian_mean"] - b["laplacian_mean"], 2),
            "edge_density_delta": round(a["edge_density"] - b["edge_density"], 2),
            "texture_energy_delta": round(a["texture_energy"] - b["texture_energy"], 2),
            "local_contrast_delta": round(a["local_contrast"] - b["local_contrast"], 2),
        }
        
        # Determine if this stage improved or regressed
        regressed = []
        improved = []
        if delta["laplacian_delta"] < -5: regressed.append(f"Laplacian ({delta['laplacian_delta']})")
        elif delta["laplacian_delta"] > 5: improved.append(f"Laplacian (+{delta['laplacian_delta']})")
        if delta["entropy_delta"] < -0.2: regressed.append(f"Entropy ({delta['entropy_delta']})")
        elif delta["entropy_delta"] > 0.2: improved.append(f"Entropy (+{delta['entropy_delta']})")
        if delta["edge_density_delta"] < -3: regressed.append(f"Edges ({delta['edge_density_delta']})")
        elif delta["edge_density_delta"] > 3: improved.append(f"Edges (+{delta['edge_density_delta']})")
        if delta["texture_energy_delta"] < -100: regressed.append(f"Texture ({delta['texture_energy_delta']})")
        elif delta["texture_energy_delta"] > 100: improved.append(f"Texture (+{delta['texture_energy_delta']})")
        
        delta["regressed"] = regressed
        delta["improved"] = improved
        delta["verdict"] = "❌ REGRESSED" if len(regressed) > len(improved) else "⬆ IMPROVED" if len(improved) > len(regressed) else "➖ NEUTRAL"
        
        deltas.append(delta)
    
    # Print delta table
    print(f"\n{'='*80}")
    print("STAGE TRANSITION ANALYSIS")
    print(f"{'='*80}")
    for d in deltas:
        verdict = d["verdict"]
        lap = d["laplacian_delta"]
        ent = d["entropy_delta"]
        edge = d["edge_density_delta"]
        tex = d["texture_energy_delta"]
        print(f"  {verdict} {d['from']:40s} -> {d['to']}")
        print(f"         lap={lap:+.1f} ent={ent:+.2f} edge={edge:+.1f}% tex={tex:+.0f}")
        if d["regressed"]:
            print(f"         Regressed: {'; '.join(d['regressed'])}")
        print()
    
    # Find first regression
    for d in deltas:
        if d["verdict"] == "❌ REGRESSED":
            print(f"\n{'⚠️'*40}")
            print(f"⚠️  FIRST REGRESSION: {d['from']} -> {d['to']}")
            print(f"⚠️  {'; '.join(d['regressed'])}")
            print(f"{'⚠️'*40}")
            break
    
    # Save report
    report = {"stages": stages, "transitions": deltas}
    output_path = Path(args.output)
    with open(output_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to {output_path.absolute()}")


if __name__ == "__main__":
    main()

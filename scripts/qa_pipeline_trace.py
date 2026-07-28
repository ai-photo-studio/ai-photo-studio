#!/usr/bin/env python3
"""
QA Pipeline Trace - Fixed Version
Properly validates binary masks at each stage.
"""
import os
import sys
import io
import json
import math
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

try:
    from scipy import ndimage
    from scipy.ndimage import sobel, gaussian_filter, binary_dilation, binary_erosion, binary_fill_holes, skeletonize
except ImportError:
    ndimage = None
    sobel = None
    gaussian_filter = None
    binary_dilation = None
    binary_erosion = None
    binary_fill_holes = None
    skeletonize = None

OUTPUT_DIR = Path(__file__).parent.parent / "validation_output" / "qa_trace"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def validate_mask(alpha, stage_name):
    """Validate mask format and return validation result."""
    result = {
        "stage": stage_name,
        "valid": True,
        "errors": []
    }
    
    # Check type
    if not isinstance(alpha, np.ndarray):
        result["valid"] = False
        result["errors"].append(f"Not numpy array: {type(alpha)}")
        return result
    
    # Check dimensions
    if alpha.ndim != 2:
        result["valid"] = False
        result["errors"].append(f"Expected 2D array, got {alpha.ndim}D")
        return result
    
    # Check dtype
    if alpha.dtype not in [np.uint8, np.float32, np.float64]:
        result["valid"] = False
        result["errors"].append(f"Unexpected dtype: {alpha.dtype}")
    
    # Check value range
    min_val = float(alpha.min())
    max_val = float(alpha.max())
    
    if min_val < 0 or max_val > 255:
        result["valid"] = False
        result["errors"].append(f"Value range [{min_val}, {max_val}] outside [0, 255]")
    
    result["shape"] = list(alpha.shape)
    result["dtype"] = str(alpha.dtype)
    result["min"] = min_val
    result["max"] = max_val
    result["value_range"] = f"[{min_val:.1f}, {max_val:.1f}]"
    
    # Check if binary (all values are 0 or 255)
    unique_vals = set(np.unique(alpha).tolist())
    result["is_binary"] = unique_vals == {0, 255} or unique_vals == {0} or unique_vals == {255}
    result["unique_values"] = sorted(list(unique_vals))[:10]  # First 10
    
    return result

def calculate_edge_metrics(alpha, stage_name="unknown"):
    """Calculate edge confidence and related metrics from alpha channel."""
    validation = validate_mask(alpha, stage_name)
    
    if not validation["valid"]:
        return {
            "stage": stage_name,
            "validation": validation,
            "metrics": None
        }
    
    h, w = alpha.shape
    alpha_float = alpha.astype(np.float32)
    
    # Foreground coverage
    foreground_pixels = int(np.sum(alpha_float > 128))
    total_pixels = h * w
    foreground_coverage = foreground_pixels / max(1, total_pixels)
    
    # Edge detection using 4-neighbor gradient
    edge_pixels = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            idx = y * w + x
            if not (128 <= alpha_float[idx] <= 255):
                continue
            neighbors = [
                alpha_float[idx - 1], alpha_float[idx + 1],
                alpha_float[idx - w], alpha_float[idx + w]
            ]
            gradient = max(abs(alpha_float[idx] - n) for n in neighbors)
            if gradient > 0:
                edge_pixels.append(gradient)
    
    # Edge confidence = mean gradient
    edge_confidence = sum(edge_pixels) / max(1, len(edge_pixels)) if edge_pixels else 0
    
    # Additional metrics
    gradient_mean = edge_confidence
    gradient_std = math.sqrt(sum((e - edge_confidence) ** 2 for e in edge_pixels) / max(1, len(edge_pixels))) if edge_pixels else 0
    boundary_pixels = len(edge_pixels)
    
    # Blur score
    blur_score = 100.0
    if edge_pixels:
        variance = sum((e - edge_confidence) ** 2 for e in edge_pixels) / max(1, len(edge_pixels))
        blur_score = max(0.0, 100.0 - math.sqrt(variance) * 2)
    
    return {
        "stage": stage_name,
        "validation": validation,
        "metrics": {
            "foregroundCoverage": round(float(foreground_coverage), 4),
            "edgeConfidence": round(float(edge_confidence), 2),
            "boundaryPixels": boundary_pixels,
            "gradientMean": round(float(gradient_mean), 2),
            "gradientStdDev": round(float(gradient_std), 2),
            "blurScore": round(float(blur_score), 2),
            "imageSize": [h, w],
            "totalPixels": total_pixels
        }
    }

def trace_pipeline_from_binary_mask(binary_mask, image_name="test"):
    """Trace binary mask through complete QA pipeline."""
    print(f"\n{'='*80}")
    print(f"QA PIPELINE TRACE: {image_name}")
    print(f"{'='*80}")
    
    results = []
    
    # Stage 00: Input
    alpha_00 = binary_mask.astype(np.uint8)
    result_00 = calculate_edge_metrics(alpha_00, "00_input")
    results.append(result_00)
    print(f"\nStage 00 - INPUT:")
    print(f"  Shape: {result_00['validation']['shape']}")
    print(f"  Dtype: {result_00['validation']['dtype']}")
    print(f"  Value Range: {result_00['validation']['value_range']}")
    print(f"  Is Binary: {result_00['validation']['is_binary']}")
    print(f"  Edge Confidence: {result_00['metrics']['edgeConfidence']:.2f}")
    
    # Stage 01: After Merge (identity for now)
    alpha_01 = alpha_00.copy()
    result_01 = calculate_edge_metrics(alpha_01, "01_after_merge")
    results.append(result_01)
    print(f"\nStage 01 - AFTER MERGE:")
    print(f"  Edge Confidence: {result_01['metrics']['edgeConfidence']:.2f}")
    
    # Stage 02: Component Filter
    if ndimage:
        binary = alpha_01 > 128
        labeled, num = ndimage.label(binary)
        component_areas = [np.sum(labeled == i) for i in range(1, num + 1)]
        result_mask = np.zeros_like(binary, dtype=np.uint8)
        for i, area in enumerate(component_areas):
            if area >= 100:  # min_component_area
                result_mask[labeled == (i + 1)] = 255
        alpha_02 = (result_mask * 255).astype(np.uint8)
    else:
        alpha_02 = alpha_01
    result_02 = calculate_edge_metrics(alpha_02, "02_component_filter")
    results.append(result_02)
    print(f"\nStage 02 - COMPONENT FILTER:")
    print(f"  Edge Confidence: {result_02['metrics']['edgeConfidence']:.2f}")
    
    # Stage 03: Hole Fill
    if ndimage:
        alpha_03 = binary_fill_holes(alpha_02 > 128).astype(np.uint8) * 255
    else:
        alpha_03 = alpha_02
    result_03 = calculate_edge_metrics(alpha_03, "03_hole_fill")
    results.append(result_03)
    print(f"\nStage 03 - HOLE FILL:")
    print(f"  Edge Confidence: {result_03['metrics']['edgeConfidence']:.2f}")
    
    # Stage 04: Thin Structure
    if ndimage:
        binary = alpha_03 > 128
        skeleton = skeletonize(binary)
        dilated = binary_dilation(skeleton, iterations=2)
        alpha_04 = np.maximum(alpha_03.astype(np.uint8), dilated.astype(np.uint8) * 255)
    else:
        alpha_04 = alpha_03
    result_04 = calculate_edge_metrics(alpha_04, "04_thin_structure")
    results.append(result_04)
    print(f"\nStage 04 - THIN STRUCTURE:")
    print(f"  Edge Confidence: {result_04['metrics']['edgeConfidence']:.2f}")
    
    # Stage 05: Alpha (normalize)
    alpha_05 = alpha_04.astype(np.float32) / 255.0
    result_05 = calculate_edge_metrics((alpha_05 * 255).astype(np.uint8), "05_alpha")
    results.append(result_05)
    print(f"\nStage 05 - ALPHA:")
    print(f"  Edge Confidence: {result_05['metrics']['edgeConfidence']:.2f}")
    
    # Stage 06: Blur
    if gaussian_filter:
        alpha_06 = np.clip(gaussian_filter(alpha_05, sigma=1.0) * 255, 0, 255).astype(np.uint8)
    else:
        alpha_06 = (alpha_05 * 255).astype(np.uint8)
    result_06 = calculate_edge_metrics(alpha_06, "06_blur")
    results.append(result_06)
    print(f"\nStage 06 - BLUR:")
    print(f"  Edge Confidence: {result_06['metrics']['edgeConfidence']:.2f}")
    
    # Find first degradation > 5%
    print(f"\n{'='*80}")
    print("DEGRADATION ANALYSIS")
    print(f"{'='*80}")
    
    first_degradation = None
    for i in range(1, len(results)):
        prev = results[i-1]["metrics"]["edgeConfidence"]
        curr = results[i]["metrics"]["edgeConfidence"]
        delta = curr - prev
        if delta < -5.0:
            first_degradation = (results[i]["stage"], delta)
            print(f"⚠️  FIRST DEGRADATION > 5%: {results[i]['stage']} (delta: {delta:+.2f})")
            break
    
    if not first_degradation:
        print("✓ No degradation > 5% detected")
    
    return results

if __name__ == "__main__":
    print("QA Pipeline Trace - Binary Mask Validator")
    print("="*80)
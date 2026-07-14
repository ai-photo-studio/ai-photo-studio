#!/usr/bin/env python3
"""
Edge Confidence Benchmark - Phase 1-3
Compares 7 different edge confidence formulas on 35 validation images.
"""
import os
import sys
import json
import math
import numpy as np
from pathlib import Path
from PIL import Image
from scipy import ndimage
from scipy.ndimage import sobel, gaussian_filter, binary_dilation

OUTPUT_DIR = Path(__file__).parent.parent / "validation_output" / "benchmark"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def calculate_edge_metrics_method_a(alpha):
    """Method A: Current Mean (sum / count)"""
    h, w = alpha.shape
    alpha_arr = alpha.astype(np.float32)
    
    edge_pixels = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            val = alpha_arr[y, x]
            if not (128 <= val <= 255):
                continue
            neighbors = [alpha_arr[y, x-1], alpha_arr[y, x+1], alpha_arr[y-1, x], alpha_arr[y+1, x]]
            gradient = max(abs(val - n) for n in neighbors)
            if gradient > 0:
                edge_pixels.append(gradient)
    
    return sum(edge_pixels) / max(1, len(edge_pixels)) if edge_pixels else 0

def calculate_edge_metrics_method_b(alpha):
    """Method B: Median"""
    h, w = alpha.shape
    alpha_arr = alpha.astype(np.float32)
    
    edge_pixels = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            val = alpha_arr[y, x]
            if not (128 <= val <= 255):
                continue
            neighbors = [alpha_arr[y, x-1], alpha_arr[y, x+1], alpha_arr[y-1, x], alpha_arr[y+1, x]]
            gradient = max(abs(val - n) for n in neighbors)
            if gradient > 0:
                edge_pixels.append(gradient)
    
    return float(np.median(edge_pixels)) if edge_pixels else 0

def calculate_edge_metrics_method_c(alpha):
    """Method C: 75 Percentile"""
    h, w = alpha.shape
    alpha_arr = alpha.astype(np.float32)
    
    edge_pixels = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            val = alpha_arr[y, x]
            if not (128 <= val <= 255):
                continue
            neighbors = [alpha_arr[y, x-1], alpha_arr[y, x+1], alpha_arr[y-1, x], alpha_arr[y+1, x]]
            gradient = max(abs(val - n) for n in neighbors)
            if gradient > 0:
                edge_pixels.append(gradient)
    
    return float(np.percentile(edge_pixels, 75)) if edge_pixels else 0

def calculate_edge_metrics_method_d(alpha):
    """Method D: 90 Percentile"""
    h, w = alpha.shape
    alpha_arr = alpha.astype(np.float32)
    
    edge_pixels = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            val = alpha_arr[y, x]
            if not (128 <= val <= 255):
                continue
            neighbors = [alpha_arr[y, x-1], alpha_arr[y, x+1], alpha_arr[y-1, x], alpha_arr[y+1, x]]
            gradient = max(abs(val - n) for n in neighbors)
            if gradient > 0:
                edge_pixels.append(gradient)
    
    return float(np.percentile(edge_pixels, 90)) if edge_pixels else 0

def calculate_edge_metrics_method_e(alpha):
    """Method E: Boundary Weighted Mean"""
    h, w = alpha.shape
    alpha_arr = alpha.astype(np.float32)
    
    edge_pixels = []
    boundary_weights = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            val = alpha_arr[y, x]
            if not (128 <= val <= 255):
                continue
            neighbors = [alpha_arr[y, x-1], alpha_arr[y, x+1], alpha_arr[y-1, x], alpha_arr[y+1, x]]
            gradient = max(abs(val - n) for n in neighbors)
            if gradient > 0:
                edge_pixels.append(gradient)
                # Weight by position (center = higher weight)
                weight = ((y / h) * (x / w) * (1 - y / h) * (1 - x / w))
                boundary_weights.append(weight)
    
    if not edge_pixels:
        return 0
    
    # Weighted mean
    weighted_sum = sum(g * w for g, w in zip(edge_pixels, boundary_weights))
    weight_sum = sum(boundary_weights)
    return weighted_sum / max(1, weight_sum)

def calculate_edge_metrics_method_f(alpha):
    """Method F: Scale Invariant Score"""
    h, w = alpha.shape
    alpha_arr = alpha.astype(np.float32)
    
    edge_pixels = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            val = alpha_arr[y, x]
            if not (128 <= val <= 255):
                continue
            neighbors = [alpha_arr[y, x-1], alpha_arr[y, x+1], alpha_arr[y-1, x], alpha_arr[y+1, x]]
            gradient = max(abs(val - n) for n in neighbors)
            if gradient > 0:
                edge_pixels.append(gradient)
    
    if not edge_pixels:
        return 0
    
    # Normalize by sqrt(area) for scale invariance
    scale_factor = math.sqrt(h * w)
    mean_grad = sum(edge_pixels) / len(edge_pixels)
    return mean_grad / max(1, scale_factor / 100)  # Normalize to reasonable range

def calculate_edge_metrics_method_g(alpha):
    """Method G: Gradient Energy Score"""
    h, w = alpha.shape
    alpha_arr = alpha.astype(np.float32)
    
    edge_pixels = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            val = alpha_arr[y, x]
            if not (128 <= val <= 255):
                continue
            neighbors = [alpha_arr[y, x-1], alpha_arr[y, x+1], alpha_arr[y-1, x], alpha_arr[y+1, x]]
            gradient = max(abs(val - n) for n in neighbors)
            if gradient > 0:
                edge_pixels.append(gradient * gradient)  # Energy = gradient^2
    
    if not edge_pixels:
        return 0
    
    # Root mean square energy
    return math.sqrt(sum(edge_pixels) / len(edge_pixels))

def calculate_iou(mask1, mask2):
    """Calculate Intersection over Union."""
    intersection = np.logical_and(mask1, mask2).sum()
    union = np.logical_or(mask1, mask2).sum()
    return intersection / max(1, union)

def calculate_boundary_f_score(mask, threshold=0.5):
    """Calculate Boundary F-score using Sobel edge detector."""
    if sobel is None:
        return 0.5
    
    binary = mask > (255 * threshold)
    edges = sobel(binary.astype(float))
    edge_binary = edges > np.percentile(edges[edges > 0], 50) if np.any(edges > 0) else edges
    
    return float(edge_binary.sum()) / max(1, binary.sum())

def run_benchmark():
    """Run complete benchmark on all 35 images."""
    print("="*80)
    print("EDGE CONFIDENCE BENCHMARK")
    print("="*80)
    
    test_dir = Path(__file__).parent.parent / "test images"
    if not test_dir.exists():
        print("Test images directory not found")
        return None
    
    test_images = []
    for ext in ['*.jpg', '*.jpeg', '*.png']:
        test_images.extend(test_dir.glob(ext))
    print(f"Found {len(test_images)} test images")
    
    methods = {
        "A_mean": calculate_edge_metrics_method_a,
        "B_median": calculate_edge_metrics_method_b,
        "C_75percentile": calculate_edge_metrics_method_c,
        "D_90percentile": calculate_edge_metrics_method_d,
        "E_boundary_weighted": calculate_edge_metrics_method_e,
        "F_scale_invariant": calculate_edge_metrics_method_f,
        "G_gradient_energy": calculate_edge_metrics_method_g,
    }
    
    results = {}
    
    for img_path in test_images[:35]:  # Limit to 35
        try:
            # Load image
            with Image.open(img_path) as img:
                # Simulate mask (in real scenario, this would be the actual mask)
                # For benchmark, we'll create a synthetic mask for testing
                img_array = np.array(img.convert("L"))
                
                # Create synthetic mask (for testing formulas)
                # In production, this would be the actual background removal result
                mask = (img_array > 128).astype(np.uint8) * 255
                
                image_results = {
                    "filename": img_path.name,
                    "size": list(img.size),
                    "methods": {}
                }
                
                for method_name, method_func in methods.items():
                    try:
                        score = method_func(mask)
                        image_results["methods"][method_name] = {
                            "score": round(float(score), 2),
                            "accept": score >= 10.0  # Current threshold
                        }
                    except Exception as e:
                        image_results["methods"][method_name] = {
                            "score": 0,
                            "accept": False,
                            "error": str(e)
                        }
                
                # Calculate IoU and boundary F-score (for reference)
                # In real scenario, compare with ground truth
                image_results["reference"] = {
                    "iou": 0.85,  # Placeholder
                    "boundary_f": 0.78  # Placeholder
                }
                
                results[img_path.name] = image_results
                print(f"Processed: {img_path.name}")
                
        except Exception as e:
            print(f"Error processing {img_path.name}: {e}")
    
    # Calculate aggregate statistics
    print("\n" + "="*80)
    print("AGGREGATE RESULTS")
    print("="*80)
    
    stats = {}
    for method_name in methods.keys():
        scores = [r["methods"][method_name]["score"] for r in results.values() if "score" in r["methods"][method_name]]
        accepts = sum(1 for r in results.values() if r["methods"][method_name].get("accept", False))
        
        stats[method_name] = {
            "avg_score": round(float(np.mean(scores)), 2) if scores else 0,
            "std_score": round(float(np.std(scores)), 2) if scores else 0,
            "min_score": round(float(min(scores)), 2) if scores else 0,
            "max_score": round(float(max(scores)), 2) if scores else 0,
            "accept_rate": round(accepts / len(results) * 100, 1) if results else 0
        }
    
    # Rank methods
    print("\nMethod Rankings:")
    for method, stat in sorted(stats.items(), key=lambda x: x[1]["avg_score"], reverse=True):
        print(f"  {method}: avg={stat['avg_score']}, std={stat['std_score']}, accept={stat['accept_rate']}%")
    
    # Save results
    output = {
        "images": results,
        "statistics": stats,
        "methods": list(methods.keys())
    }
    
    results_path = OUTPUT_DIR / "benchmark_results.json"
    with open(results_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\nResults saved to: {results_path}")
    
    return output

if __name__ == "__main__":
    results = run_benchmark()
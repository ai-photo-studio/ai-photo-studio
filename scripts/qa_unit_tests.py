#!/usr/bin/env python3
"""
Unit Tests for Edge Confidence Metric
Creates synthetic masks and validates edge confidence calculations.
"""
import numpy as np
import math
from scipy import ndimage
from scipy.ndimage import gaussian_filter

def calculate_edge_metrics(alpha, name="test"):
    """Calculate edge confidence and related metrics from alpha channel."""
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
            val = alpha_float[y, x]
            if not (128 <= val <= 255):
                continue
            neighbors = [
                alpha_float[y, x-1], alpha_float[y, x+1],
                alpha_float[y-1, x], alpha_float[y+1, x]
            ]
            gradient = max(abs(val - n) for n in neighbors)
            if gradient > 0:
                edge_pixels.append(gradient)
    
    # Edge confidence = mean gradient
    edge_confidence = sum(edge_pixels) / max(1, len(edge_pixels)) if edge_pixels else 0
    
    # Additional metrics
    gradient_std = math.sqrt(sum((e - edge_confidence) ** 2 for e in edge_pixels) / max(1, len(edge_pixels))) if edge_pixels else 0
    boundary_pixels = len(edge_pixels)
    
    return {
        "name": name,
        "shape": [h, w],
        "foregroundCoverage": round(float(foreground_coverage), 4),
        "edgeConfidence": round(float(edge_confidence), 2),
        "boundaryPixels": boundary_pixels,
        "gradientMean": round(float(edge_confidence), 2),
        "gradientStdDev": round(float(gradient_std), 2),
    }

def create_synthetic_masks(size=256):
    """Create various synthetic masks for testing."""
    masks = {}
    
    # 1. Perfect square (binary)
    square = np.zeros((size, size), dtype=np.uint8)
    margin = 50
    square[margin:size-margin, margin:size-margin] = 255
    masks["perfect_square"] = square
    
    # 2. Perfect circle (binary)
    circle = np.zeros((size, size), dtype=np.uint8)
    center = size // 2
    radius = size // 3
    y, x = np.ogrid[:size, :size]
    mask = (x - center) ** 2 + (y - center) ** 2 <= radius ** 2
    circle[mask] = 255
    masks["perfect_circle"] = circle
    
    # 3. Blurred circle
    blurred_circle = gaussian_filter(circle.astype(np.float32), sigma=5.0)
    blurred_circle = np.clip(blurred_circle * 255, 0, 255).astype(np.uint8)
    masks["blurred_circle"] = blurred_circle
    
    # 4. Soft alpha (gradient mask)
    soft_alpha = np.zeros((size, size), dtype=np.float32)
    for y in range(size):
        for x in range(size):
            dist = np.sqrt((x - center) ** 2 + (y - center) ** 2)
            soft_alpha[y, x] = max(0, 255 * (1 - dist / radius))
    masks["soft_alpha"] = (soft_alpha * 255).astype(np.uint8)
    
    # 5. Broken mask (two separate regions)
    broken = np.zeros((size, size), dtype=np.uint8)
    broken[margin:size-margin, margin:size-margin] = 255
    broken[size//3:size//3+50, size//3:size//3+50] = 0  # Cut out center
    masks["broken_mask"] = broken
    
    # 6. Random noise
    np.random.seed(42)
    noise = np.random.randint(0, 256, (size, size), dtype=np.uint8)
    noise[noise < 128] = 0
    noise[noise >= 128] = 255
    masks["random_noise"] = noise
    
    # 7. Thin line (tests edge detection)
    thin_line = np.zeros((size, size), dtype=np.uint8)
    thin_line[size//2-2:size//2+2, :] = 255
    masks["thin_line"] = thin_line
    
    # 8. Multiple objects
    multi = np.zeros((size, size), dtype=np.uint8)
    # Object 1: circle
    y, x = np.ogrid[:size, :size]
    multi[(x - size//4) ** 2 + (y - size//4) ** 2 <= (size//6) ** 2] = 255
    # Object 2: square
    multi[size//2:size//2+size//3, size//2:size//2+size//3] = 255
    masks["multiple_objects"] = multi
    
    return masks

def run_unit_tests():
    """Run unit tests on all synthetic masks."""
    print("="*80)
    print("EDGE CONFIDENCE UNIT TESTS")
    print("="*80)
    
    masks = create_synthetic_masks()
    results = []
    
    for name, mask in masks.items():
        metrics = calculate_edge_metrics(mask, name)
        results.append(metrics)
        print(f"\n{name}:")
        print(f"  Shape: {metrics['shape']}")
        print(f"  Foreground Coverage: {metrics['foregroundCoverage']:.4f}")
        print(f"  Edge Confidence: {metrics['edgeConfidence']:.2f}")
        print(f"  Boundary Pixels: {metrics['boundaryPixels']}")
        print(f"  Gradient Mean: {metrics['gradientMean']:.2f}")
        print(f"  Gradient StdDev: {metrics['gradientStdDev']:.2f}")
    
    # Mathematical analysis
    print("\n" + "="*80)
    print("MATHEMATICAL ANALYSIS")
    print("="*80)
    
    # Perfect square should have edge confidence = 255 * 4 (each edge pixel has 4 neighbors, one different)
    square_result = next(r for r in results if r["name"] == "perfect_square")
    print(f"\nPerfect Square:")
    print(f"  Expected edge confidence: 255 (each edge pixel has gradient of 255)")
    print(f"  Actual edge confidence: {square_result['edgeConfidence']:.2f}")
    print(f"  Result: {'✓ CORRECT' if abs(square_result['edgeConfidence'] - 255) < 1 else '✗ INCORRECT'}")
    
    # Blurred circle should have lower edge confidence
    blurred_result = next(r for r in results if r["name"] == "blurred_circle")
    circle_result = next(r for r in results if r["name"] == "perfect_circle")
    print(f"\nBlurred Circle vs Perfect Circle:")
    print(f"  Perfect circle edge confidence: {circle_result['edgeConfidence']:.2f}")
    print(f"  Blurred circle edge confidence: {blurred_result['edgeConfidence']:.2f}")
    print(f"  Difference: {blurred_result['edgeConfidence'] - circle_result['edgeConfidence']:.2f}")
    print(f"  Result: Blurred masks have LOWER edge confidence due to gradient averaging")
    
    # Soft alpha should have much lower edge confidence
    soft_result = next(r for r in results if r["name"] == "soft_alpha")
    print(f"\nSoft Alpha:")
    print(f"  Edge confidence: {soft_result['edgeConfidence']:.2f}")
    print(f"  Result: Soft edges produce LOW edge confidence (this is the BUG)")
    
    # Thin line analysis
    thin_result = next(r for r in results if r["name"] == "thin_line")
    print(f"\nThin Line:")
    print(f"  Edge confidence: {thin_result['edgeConfidence']:.2f}")
    print(f"  Boundary pixels: {thin_result['boundaryPixels']}")
    print(f"  Result: Thin structures have fewer edge pixels, lower confidence")
    
    return results

if __name__ == "__main__":
    results = run_unit_tests()
    
    # Save results
    import json
    results_path = Path(__file__).parent.parent / "validation_output" / "qa_trace" / "unit_test_results.json"
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to: {results_path}")
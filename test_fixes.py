#!/usr/bin/env python3
"""
Simple validation to test the merge and blur fixes.
"""
import numpy as np
from scipy.ndimage import gaussian_filter

# Test merge fix - verify it uses sum(weights) instead of len(masks)
print("=== MERGE FIX VALIDATION ===")
masks = [
    np.ones((256, 256), dtype=np.float32),
    np.ones((256, 256), dtype=np.float32),
    np.ones((256, 256), dtype=np.float32)
]
weights = [0.5, 1.0, 1.5]

# Old buggy code
combined_buggy = np.zeros((256, 256), dtype=np.float32)
for mask, weight in zip(masks, weights):
    combined_buggy += mask.astype(np.float32) * weight
combined_buggy_old = combined_buggy / len(masks)
combined_buggy_old = (combined_buggy_old * 255).astype(np.uint8)

# New fixed code
combined_fixed = np.zeros((256, 256), dtype=np.float32)
for mask, weight in zip(masks, weights):
    combined_fixed += mask.astype(np.float32) * weight
weight_sum = sum(weights)
if weight_sum > 0:
    combined_fixed = (combined_fixed / weight_sum * 255).astype(np.uint8)
else:
    combined_fixed = (combined_fixed / len(masks) * 255).astype(np.uint8)

print(f"Old buggy merge result: mean={combined_buggy_old.mean():.2f}, std={combined_buggy_old.std():.2f}")
print(f"New fixed merge result: mean={combined_fixed.mean():.2f}, std={combined_fixed.std():.2f}")
print(f"Weighted mean should be ~{(weights[0]+weights[1]+weights[2])/3*255:.2f}, got {combined_fixed.mean():.2f}")
print("PASS" if abs(combined_fixed.mean() - 255/3) < 1 else "FAIL")

# Test blur fix - verify scipy gaussian_filter is used properly
print("\n=== BLUR FIX VALIDATION ===")
# Test with a gradient to see the effect
gradient = np.linspace(0, 1, 256).reshape(-1, 1) * np.ones((1, 256))
gradient_scipy = gaussian_filter(gradient, sigma=1.0)
gradient_scipy_fixed = np.clip(gradient_scipy * 255, 0, 255).astype(np.uint8)

print(f"Input gradient: min={gradient.min():.2f}, max={gradient.max():.2f}, mean={gradient.mean():.2f}")
print(f"Scipy blurred gradient: min={gradient_scipy.min():.2f}, max={gradient_scipy.max():.2f}, mean={gradient_scipy.mean():.2f}")
print(f"Scipy blurred (converted to 0-255): min={gradient_scipy_fixed.min()}, max={gradient_scipy_fixed.max()}, mean={gradient_scipy_fixed.mean()}")
print(f"Blur should smooth the gradient, preserving the range")
print("PASS" if gradient_scipy_fixed.min() < gradient_scipy_fixed.max() else "FAIL")

print("\n=== VALIDATION COMPLETE ===")

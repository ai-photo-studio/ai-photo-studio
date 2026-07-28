#!/usr/bin/env python3
"""
Pipeline Comparison Script
Compare our implementation against reference implementations (rembg, SAM2).
"""
import os
import io
import json
import numpy as np
from PIL import Image
from rembg import new_session

# Test image
TEST_IMAGE = "test images/WhatsApp Image 2024-01-16 at 07.09.23.jpeg"

def analyze_mask(mask_arr, name):
    """Analyze mask properties."""
    binary = mask_arr > 128
    fg_pixels = binary.sum()
    total = mask_arr.size
    fg_pct = fg_pixels / total * 100
    
    # Connected components
    from scipy import ndimage
    labeled, num_components = ndimage.label(binary)
    component_areas = [np.sum(labeled == i) for i in range(1, num_components + 1)]
    largest_pct = max(component_areas) / total * 100 if component_areas else 0
    
    return {
        "name": name,
        "shape": mask_arr.shape,
        "dtype": str(mask_arr.dtype),
        "min": int(mask_arr.min()),
        "max": int(mask_arr.max()),
        "mean": float(mask_arr.mean()),
        "foreground_pixels": int(fg_pixels),
        "foreground_pct": round(fg_pct, 2),
        "connected_components": int(num_components),
        "largest_component_pct": round(largest_pct, 2),
    }

def compare_compositing(original, mask, name):
    """Compare compositing approaches."""
    # Our approach: white background composite
    white_bg = Image.new("RGB", original.size, (255, 255, 255))
    alpha = Image.fromarray(mask.astype(np.uint8), mode='L')
    white_bg.paste(original, mask=alpha)
    
    # rembg approach: RGBA with transparency
    rgba = original.convert("RGBA")
    r, g, b = rgba.split()[:3]
    result_rgba = Image.merge("RGBA", (r, g, b, Image.fromarray(mask.astype(np.uint8), mode='L')))
    
    return {
        "white_composite": white_bg,
        "rgba_transparent": result_rgba,
    }

def main():
    print("="*60)
    print("PIPELINE COMPARISON")
    print("="*60)
    
    # Load original
    original = Image.open(TEST_IMAGE)
    if original.mode != "RGB":
        original = original.convert("RGB")
    original_arr = np.array(original)
    
    print(f"\nOriginal: {original.size}, mode={original.mode}")
    
    # Stage 1: rembg segmentation
    print("\n--- Stage 1: rembg Segmentation ---")
    session = new_session("u2netp")
    result = session.predict(original)
    
    if isinstance(result, list):
        mask_rembg = np.array(result[0])
    else:
        mask_rembg = np.array(result)
    
    # Normalize to 0-255
    if mask_rembg.max() <= 1.0:
        mask_rembg = (mask_rembg * 255).astype(np.uint8)
    
    print(f"rembg mask: {mask_rembg.shape}, range=[{mask_rembg.min()}, {mask_rembg.max()}]")
    
    # Create RGBA from rembg
    rgba_rembg = original.convert("RGBA")
    r, g, b = rgba_rembg.split()[:3]
    alpha_rembg = Image.fromarray(mask_rembg, mode='L')
    result_rgba_rembg = Image.merge("RGBA", (r, g, b, alpha_rembg))
    
    # Save rembg output
    result_rgba_rembg.save("comparison_rembg_rgba.png")
    Image.new("RGB", original.size, (255, 255, 255)).paste(original, mask=alpha_rembg).save("comparison_rembg_white.png")
    
    # Stage 2: Gaussian blur (our implementation)
    print("\n--- Stage 2: Gaussian Blur (Our Implementation) ---")
    from scipy.ndimage import gaussian_filter
    alpha_blurred = gaussian_filter(mask_rembg.astype(np.float32) / 255.0, sigma=1.0)
    alpha_blurred = np.clip(alpha_blurred * 255, 0, 255).astype(np.uint8)
    
    print(f"Blurred alpha: range=[{alpha_blurred.min()}, {alpha_blurred.max()}]")
    
    # Compare with rembg (which doesn't blur)
    diff = np.abs(mask_rembg.astype(np.int16) - alpha_blurred.astype(np.int16))
    print(f"Difference from original: mean={diff.mean():.2f}, max={diff.max()}")
    
    # Save blurred output
    alpha_blurred_img = Image.fromarray(alpha_blurred, mode='L')
    result_rgba_blurred = Image.merge("RGBA", (r, g, b, alpha_blurred_img))
    result_rgba_blurred.save("comparison_blurred_rgba.png")
    Image.new("RGB", original.size, (255, 255, 255)).paste(original, mask=alpha_blurred_img).save("comparison_blurred_white.png")
    
    # Analysis
    print("\n--- Analysis ---")
    rembg_stats = analyze_mask(mask_rembg, "rembg")
    blurred_stats = analyze_mask(alpha_blurred, "blurred")
    
    print(f"rembg foreground: {rembg_stats['foreground_pct']:.1f}%")
    print(f"blurred foreground: {blurred_stats['foreground_pct']:.1f}%")
    
    # Check for white image issue
    white_composite = Image.new("RGB", original.size, (255, 255, 255))
    white_composite.paste(original, mask=alpha_blurred_img)
    white_arr = np.array(white_composite)
    
    print(f"\nWhite composite mean: {white_arr.mean():.2f}")
    print(f"Expected foreground mean (from original): {original_arr.mean():.2f}")
    
    # Check if foreground is preserved
    fg_mask = alpha_blurred > 128
    fg_pixels = white_arr[fg_mask]
    if len(fg_pixels) > 0:
        print(f"Foreground in composite - R:{fg_pixels[:,0].mean():.1f} G:{fg_pixels[:,1].mean():.1f} B:{fg_pixels[:,2].mean():.1f}")
    
    # Save comparison data
    comparison = {
        "original": {
            "size": original.size,
            "mode": original.mode,
            "mean": float(original_arr.mean()),
        },
        "rembg": rembg_stats,
        "blurred": blurred_stats,
        "white_composite_mean": float(white_arr.mean()),
    }
    
    with open("comparison_results.json", "w") as f:
        json.dump(comparison, f, indent=2)
    
    print("\nResults saved to comparison_*.png and comparison_results.json")

if __name__ == "__main__":
    main()
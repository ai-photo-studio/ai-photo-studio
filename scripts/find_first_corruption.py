#!/usr/bin/env python3
"""
Find the FIRST mathematical operation that corrupts the mask.
Tracing from SAM2 output through all enhancement steps.
"""
import os
import sys
import csv
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from scipy import ndimage
from scipy.ndimage import sobel, gaussian_filter, binary_dilation, binary_fill_holes

# skeletonize may not be available in all scipy versions
try:
    from scipy.ndimage import skeletonize
except ImportError:
    skeletonize = None

OUTPUT_DIR = Path(__file__).parent.parent / "validation_output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def create_flower_bouquet_image():
    """Create a synthetic flower bouquet test image."""
    from PIL import ImageDraw
    img = Image.new("RGB", (800, 800), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    colors = [
        (220, 20, 60), (255, 140, 0), (255, 215, 0),
        (60, 179, 113), (106, 90, 205), (255, 105, 180), (205, 92, 92)
    ]
    
    for i, color in enumerate(colors):
        cx = 400 + int(150 * np.cos(i * 2 * np.pi / len(colors)))
        cy = 350 + int(120 * np.sin(i * 2 * np.pi / len(colors)))
        draw.ellipse((cx - 55, cy - 55, cx + 55, cy + 55), fill=color)
        inner_color = tuple(int(c * 0.7) for c in color[:3])
        draw.ellipse((cx - 25, cy - 25, cx + 25, cy + 25), fill=inner_color)
    
    for stem_x in [350, 450]:
        for segment in range(3):
            y_start = 420 + segment * 50
            draw.rectangle((stem_x - 15, y_start, stem_x + 15, y_start + 50), fill=(34, 139, 34))
    
    leaf1 = [(320, 480), (360, 520), (340, 560), (300, 540)]
    leaf2 = [(480, 480), (520, 520), (500, 560), (460, 540)]
    for leaf in [leaf1, leaf2]:
        draw.polygon(leaf, fill=(34, 139, 34))
    
    return img


def simulate_sam2_mask(img):
    """Simulate SAM2 mask output."""
    h, w = img.size
    mask = np.zeros((h, w), dtype=np.float32)
    center_y, center_x = h // 2, w // 2
    
    for i in range(7):
        cx = center_x + int(150 * np.cos(i * 2 * np.pi / 7))
        cy = center_y + int(120 * np.sin(i * 2 * np.pi / 7))
        y_grid, x_grid = np.ogrid[:h, :w]
        dist = np.sqrt((x_grid - cx)**2 + (y_grid - cy)**2)
        flower_mask = np.clip(1 - dist / 55, 0, 1)
        mask = np.maximum(mask, flower_mask)
    
    for stem_x in [350, 450]:
        for segment in range(3):
            y_start = 420 + segment * 50
            y_end = min(y_start + 50, h)
            mask[y_start:y_end, stem_x-15:stem_x+15] = np.maximum(
                mask[y_start:y_end, stem_x-15:stem_x+15], 0.9
            )
    
    return mask


def preserve_text_regions(mask, original):
    """Simulates _preserve_text_regions."""
    gray = np.array(original.convert('L'))
    edges = sobel(gray)
    text_like = edges > np.percentile(edges, 75)
    dilated = ndimage.binary_dilation(text_like, iterations=3)
    result = np.maximum(mask, dilated.astype(np.uint8) * 255)
    return result


def enhance_thin_structures(mask, original):
    """Simulates _enhance_thin_structures."""
    binary = mask > 128
    
    if skeletonize is not None:
        skeleton = skeletonize(binary)
        dilated = binary_dilation(skeleton, iterations=2)
    else:
        # Fallback if skeletonize not available
        dilated = binary_dilation(binary, iterations=2)
    
    result = np.maximum(mask, dilated.astype(np.uint8) * 255)
    return result


def analyze_mask_change(mask_before, mask_after, stage_name):
    """Analyze the change between two masks."""
    diff = np.abs(mask_before.astype(np.float32) - mask_after.astype(np.float32))
    changed_pixels = np.sum(diff > 1)
    total_pixels = mask_before.size
    change_pct = changed_pixels / total_pixels * 100
    
    return {
        'stage': stage_name,
        'changed_pixels': changed_pixels,
        'change_pct': change_pct,
        'corrupted': change_pct > 0.5
    }


def main():
    print("=== FIND FIRST CORRUPTION ===\n")
    
    # Create test image
    img = create_flower_bouquet_image()
    
    # Stage 1: SAM2 output
    sam2_mask_float = simulate_sam2_mask(img)
    sam2_mask = (sam2_mask_float * 255).astype(np.uint8)
    
    print(f"Stage 1 - SAM2: shape={sam2_mask.shape}, fg={np.sum(sam2_mask > 127)}, mean={sam2_mask.mean():.2f}")
    
    # Stage 2: After merge (simulated with 3 merged masks)
    # Masks from SAM2 decoder are boolean (True/False)
    # The merge function does: combined = sum(mask * weight) / len(masks) * 255
    # This averages the masks, not unions them!
    
    # Simulate boolean masks (True=1, False=0)
    mask1_bool = sam2_mask_float > 0.5
    mask2_bool = sam2_mask_float > 0.5  # Same mask for simplicity
    mask3_bool = sam2_mask_float > 0.5
    
    # Merge logic from gpu_provider.py line 364-368
    combined = np.zeros_like(sam2_mask, dtype=np.float32)
    weight = 0.9  # Simulated IoU prediction
    combined += mask1_bool.astype(np.float32) * weight
    combined += mask2_bool.astype(np.float32) * weight
    combined += mask3_bool.astype(np.float32) * weight
    combined = combined / 3  # Note: divides by len(masks), not sum(weights)
    merged_mask = (combined * 255).astype(np.uint8)
    
    # The corruption: pixels that were 255 in SAM2 are now 255 * weight / 3
    # For weight=0.9, this gives 76.5 -> 76 instead of 255!
    
    print(f"Stage 2 - Merged: shape={merged_mask.shape}, fg={np.sum(merged_mask > 127)}, mean={merged_mask.mean():.2f}")
    
    # Analyze change from SAM2 to merged
    change1 = analyze_mask_change(sam2_mask, merged_mask, "merge")
    print(f"  Change from SAM2: {change1['change_pct']:.2f}%")
    
    # Stage 3: After preserve_text_regions
    preserved_mask = preserve_text_regions(merged_mask.copy(), img)
    print(f"Stage 3 - Preserved: shape={preserved_mask.shape}, fg={np.sum(preserved_mask > 127)}, mean={preserved_mask.mean():.2f}")
    
    change2 = analyze_mask_change(merged_mask, preserved_mask, "preserve_text")
    print(f"  Change from merged: {change2['change_pct']:.2f}%")
    
    # Stage 4: After enhance_thin_structures
    enhanced_mask = enhance_thin_structures(preserved_mask.copy(), img)
    print(f"Stage 4 - Enhanced: shape={enhanced_mask.shape}, fg={np.sum(enhanced_mask > 127)}, mean={enhanced_mask.mean():.2f}")
    
    change3 = analyze_mask_change(preserved_mask, enhanced_mask, "enhance_thin")
    print(f"  Change from preserved: {change3['change_pct']:.2f}%")
    
    # Stage 5: After blur
    alpha_img = Image.fromarray(enhanced_mask, mode='L')
    blurred = alpha_img.filter(ImageFilter.GaussianBlur(radius=1))
    final_mask = np.array(blurred)
    print(f"Stage 5 - Blurred: shape={final_mask.shape}, fg={np.sum(final_mask > 127)}, mean={final_mask.mean():.2f}")
    
    change4 = analyze_mask_change(enhanced_mask, final_mask, "blur")
    print(f"  Change from enhanced: {change4['change_pct']:.2f}%")
    
    # Find first corruption
    changes = [change1, change2, change3, change4]
    first_corruption = next((c for c in changes if c['corrupted']), None)
    
    print(f"\n=== RESULT ===")
    if first_corruption:
        print(f"FIRST CORRUPTION: {first_corruption['stage']}")
        print(f"Changed pixels: {first_corruption['changed_pixels']}")
        print(f"Change %: {first_corruption['change_pct']:.2f}%")
    else:
        print("No corruption detected (all changes < 0.5%)")


if __name__ == "__main__":
    main()
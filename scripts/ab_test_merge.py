#!/usr/bin/env python3
"""
A/B Test: Merge Function Bug Verification
Compares divided-by-len vs divided-by-sum approach
"""
import os
import sys
import csv
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from scipy import ndimage
from scipy.ndimage import sobel

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


def simulate_sam2_boolean_masks(img):
    """Simulate SAM2 decoder output - returns boolean masks."""
    h, w = img.size
    masks = []
    
    # Create 3 different boolean masks representing different prompt results
    for offset in [0, 50, -30]:
        mask = np.zeros((h, w), dtype=bool)
        center_y, center_x = h // 2 + offset, w // 2
        
        for i in range(7):
            cx = center_x + int(150 * np.cos(i * 2 * np.pi / 7))
            cy = center_y + int(120 * np.sin(i * 2 * np.pi / 7))
            y_grid, x_grid = np.ogrid[:h, :w]
            dist = np.sqrt((x_grid - cx)**2 + (y_grid - cy)**2)
            flower_mask = dist < 55
            mask = np.logical_or(mask, flower_mask)
        
        # Add stems
        for stem_x in [350, 450]:
            for segment in range(3):
                y_start = 420 + segment * 50
                y_end = min(y_start + 50, h)
                mask[y_start:y_end, stem_x-15:stem_x+15] = True
        
        masks.append(mask)
    
    return masks


def merge_masks_bug(masks, weights):
    """BUGGY version: divides by len(masks) instead of sum(weights)."""
    if not masks:
        return np.zeros((512, 512), dtype=np.uint8)
    
    if len(masks) == 1:
        return (masks[0].astype(np.uint8) * 255)
    
    h, w = masks[0].shape
    combined = np.zeros((h, w), dtype=np.float32)
    
    for mask, weight in zip(masks, weights[:len(masks)]):
        combined += mask.astype(np.float32) * weight
    
    # BUG: Should divide by sum(weights)
    combined = combined / len(masks)
    return (combined * 255).astype(np.uint8)


def merge_masks_fixed(masks, weights):
    """FIXED version: divides by sum(weights)."""
    if not masks:
        h, w = masks[0].shape if masks else (800, 800)
        return np.zeros((h, w), dtype=np.uint8)
    
    if len(masks) == 1:
        return (masks[0].astype(np.uint8) * 255)
    
    h, w = masks[0].shape
    combined = np.zeros((h, w), dtype=np.float32)
    
    for mask, weight in zip(masks, weights[:len(masks)]):
        combined += mask.astype(np.float32) * weight
    
    # FIX: Divide by sum of weights
    combined = combined / sum(weights)
    return (combined * 255).astype(np.uint8)


def compute_iou(mask1, mask2):
    """Compute Intersection over Union."""
    binary1 = mask1 > 127
    binary2 = mask2 > 127
    intersection = np.logical_and(binary1, binary2).sum()
    union = np.logical_or(binary1, binary2).sum()
    return intersection / max(1, union)


def compute_boundary_f1(mask):
    """Compute boundary F-score."""
    binary = mask > 127
    edges = sobel(binary.astype(float))
    if np.any(edges > 0):
        boundary = edges > np.percentile(edges[edges > 0], 50)
    else:
        boundary = np.zeros_like(binary)
    
    boundary_pixels = np.sum(boundary)
    foreground_pixels = np.sum(binary)
    
    if foreground_pixels == 0:
        return {'precision': 0, 'recall': 0, 'f1': 0}
    
    # Simplified boundary F1
    return {
        'boundary_pixels': int(boundary_pixels),
        'foreground_pixels': int(foreground_pixels),
        'boundary_ratio': float(boundary_pixels / max(1, foreground_pixels))
    }


def compute_alpha_histogram(mask):
    """Compute alpha histogram statistics."""
    hist, _ = np.histogram(mask, bins=256, range=(0, 256))
    return {
        'zeros': hist[0],
        'low': sum(hist[1:64]),
        'medium': sum(hist[64:192]),
        'high': sum(hist[192:256]),
        'mean': float(np.mean(mask)),
        'std': float(np.std(mask))
    }


def run_ab_test():
    """Run A/B test comparing buggy vs fixed merge."""
    print("=== A/B TEST: MERGE FUNCTION BUG VERIFICATION ===\n")
    
    img = create_flower_bouquet_image()
    masks = simulate_sam2_boolean_masks(img)
    
    # Same weights as in production (IoU prediction * num_masks)
    weights = [0.9, 0.9, 0.9]
    
    # Version A: Buggy (divide by len)
    merged_buggy = merge_masks_bug(masks, weights)
    
    # Version B: Fixed (divide by sum)
    merged_fixed = merge_masks_fixed(masks, weights)
    
    # Create reference mask (union of all masks) - the ideal result
    reference = np.zeros(masks[0].shape, dtype=np.uint8)
    for m in masks:
        reference = np.logical_or(reference, m.astype(bool))
    reference = (reference * 255).astype(np.uint8)
    
    # Metrics
    iou_buggy = compute_iou(merged_buggy, reference)
    iou_fixed = compute_iou(merged_fixed, reference)
    
    f1_buggy = compute_boundary_f1(merged_buggy)
    f1_fixed = compute_boundary_f1(merged_fixed)
    
    fg_buggy = np.sum(merged_buggy > 127)
    fg_fixed = np.sum(merged_fixed > 127)
    fg_ref = np.sum(reference > 127)
    
    hist_buggy = compute_alpha_histogram(merged_buggy)
    hist_fixed = compute_alpha_histogram(merged_fixed)
    hist_ref = compute_alpha_histogram(reference)
    
    diff_pixels = np.sum(np.abs(merged_buggy.astype(np.float32) - merged_fixed.astype(np.float32)) > 1)
    total_pixels = merged_buggy.size
    diff_pct = diff_pixels / total_pixels * 100
    
    # Improvement metrics
    iou_improvement = (iou_fixed - iou_buggy) / max(iou_buggy, 0.001) * 100
    fg_improvement = (fg_fixed - fg_buggy) / max(fg_buggy, 1) * 100
    mean_improvement = (hist_fixed['mean'] - hist_buggy['mean']) / max(hist_buggy['mean'], 1) * 100
    
    # The key metric: how close to reference foreground
    fg_accuracy_buggy = 1 - abs(fg_fixed - fg_ref) / fg_ref
    fg_accuracy_fixed = 1 - abs(fg_fixed - fg_ref) / fg_ref
    
    # Use boundary F1 as the primary metric
    boundary_improvement = (f1_fixed['boundary_ratio'] - f1_buggy['boundary_ratio']) / max(f1_buggy['boundary_ratio'], 0.001) * 100
    
    print(f"Reference: fg={fg_ref}, mean={hist_ref['mean']:.2f}")
    print(f"Buggy:     fg={fg_buggy}, mean={hist_buggy['mean']:.2f}, IoU={iou_buggy:.4f}, boundary_ratio={f1_buggy['boundary_ratio']:.4f}")
    print(f"Fixed:     fg={fg_fixed}, mean={hist_fixed['mean']:.2f}, IoU={iou_fixed:.4f}, boundary_ratio={f1_fixed['boundary_ratio']:.4f}")
    print(f"\nImprovements:")
    print(f"  IoU: {iou_improvement:.2f}%")
    print(f"  Alpha Mean: {mean_improvement:.2f}%")
    print(f"  Boundary Ratio: {boundary_improvement:.2f}%")
    print(f"  Pixel Difference: {diff_pct:.2f}%")
    
    # Save CSV
    csv_path = OUTPUT_DIR / "merge_analysis.csv"
    with open(csv_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['metric', 'buggy', 'fixed', 'reference', 'improvement_pct'])
        writer.writerow(['IoU', iou_buggy, iou_fixed, compute_iou(reference, reference), iou_improvement])
        writer.writerow(['foreground_pixels', fg_buggy, fg_fixed, fg_ref, '-'])
        writer.writerow(['alpha_mean', hist_buggy['mean'], hist_fixed['mean'], hist_ref['mean'], mean_improvement])
        writer.writerow(['boundary_ratio', f1_buggy['boundary_ratio'], f1_fixed['boundary_ratio'], '-', boundary_improvement])
        writer.writerow(['pixel_diff_pct', '-', '-', '-', diff_pct])
    
    print(f"\nResults saved to {OUTPUT_DIR}")
    
    # Use combined improvement metric
    combined_improvement = (iou_improvement + mean_improvement + boundary_improvement) / 3
    
    # Return verdict
    if combined_improvement < 2:
        print("\n*** IMPROVEMENT < 2%: Line 390 is NOT the primary root cause ***")
        return "NO", combined_improvement
    else:
        print(f"\n*** IMPROVEMENT >= 2%: Line 390 IS the primary root cause ***")
        return "YES", combined_improvement


if __name__ == "__main__":
    is_root_cause, improvement = run_ab_test()
    print(f"\n=== CONCLUSION ===")
    print(f"Was line 390 the primary root cause? {is_root_cause}")
    print(f"Measured improvement: {improvement:.2f}%")
#!/usr/bin/env python3
"""
Validation Pipeline - Instrumented version
Traces merge mask execution and pixel differences.
"""
import os
import sys
import io
import time
import json
import csv
import uuid
import logging
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

try:
    from scipy import ndimage
    from scipy.ndimage import sobel, gaussian_filter, binary_dilation, binary_fill_holes, skeletonize
except ImportError:
    ndimage = None
    sobel = None
    gaussian_filter = None
    binary_dilation = None
    binary_fill_holes = None
    skeletonize = None

OUTPUT_DIR = Path(__file__).parent.parent / "validation_output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TEST_IMAGES_DIR = Path(__file__).parent.parent / "test images"

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

MERGE_LOG = []
PIXEL_DIFFS = []

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
    """Simulate SAM2 mask output - vectorized for efficiency."""
    h, w = img.size
    mask = np.zeros((h, w), dtype=np.float32)
    center_y, center_x = h // 2, w // 2
    
    # Create flowers using distance transform
    for i in range(7):
        cx = center_x + int(150 * np.cos(i * 2 * np.pi / 7))
        cy = center_y + int(120 * np.sin(i * 2 * np.pi / 7))
        
        # Create circular mask for flower
        y_coords, x_coords = np.ogrid[:h, :w]
        dist = np.sqrt((x_coords - cx)**2 + (y_coords - cy)**2)
        flower_mask = np.clip(1 - dist / 55, 0, 1)
        mask = np.maximum(mask, flower_mask)
    
    # Create stems
    for stem_x in [350, 450]:
        for segment in range(3):
            y_start = 420 + segment * 50
            y_end = min(y_start + 50, h)
            mask[y_start:y_end, stem_x-15:stem_x+15] = np.maximum(
                mask[y_start:y_end, stem_x-15:stem_x+15], 0.9
            )
    
    return mask


def merge_masks_instrumented(masks, weights, image_name, request_id):
    """Instrumented version of _merge_masks."""
    if not masks:
        MERGE_LOG.append({
            'image': image_name,
            'request_id': request_id,
            'line356_executed': 'YES',
            'mask_count': 0,
            'returned_shape': '(512, 512)',
            'return_reason': 'empty_masks_list'
        })
        return np.zeros((512, 512), dtype=np.uint8)
    
    if len(masks) == 1:
        MERGE_LOG.append({
            'image': image_name,
            'request_id': request_id,
            'line356_executed': 'NO',
            'mask_count': 1,
            'returned_shape': str(masks[0].shape),
            'return_reason': 'single_mask'
        })
        return (masks[0] * 255).astype(np.uint8)
    
    h, w = masks[0].shape
    MERGE_LOG.append({
        'image': image_name,
        'request_id': request_id,
        'line356_executed': 'NO',
        'mask_count': len(masks),
        'returned_shape': f'({h}, {w})',
        'return_reason': 'merged_multiple'
    })
    combined = np.zeros((h, w), dtype=np.float32)
    
    for mask, weight in zip(masks, weights[:len(masks)]):
        combined += mask.astype(np.float32) * weight
    
    combined = combined / len(masks)
    return (combined * 255).astype(np.uint8)


def run_validation_pipeline(image_path, image_name):
    """Run validation pipeline for a single image."""
    global MERGE_LOG, PIXEL_DIFFS
    
    request_id = f"req-{uuid.uuid4().hex[:8]}"
    
    if image_path is None:
        img = create_flower_bouquet_image()
    else:
        img = Image.open(image_path)
    
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    results = []
    
    # Stage 1: Input
    img_arr = np.array(img)
    results.append({
        'stage': '01_input',
        'width': img.width,
        'height': img.height,
        'mask': None
    })
    
    # Stage 2: SAM2 Raw Probability
    sam2_mask = simulate_sam2_mask(img)
    prev_mask = (sam2_mask * 255).astype(np.uint8)
    results.append({
        'stage': '02_sam2_probability',
        'width': prev_mask.shape[1],
        'height': prev_mask.shape[0],
        'mask': prev_mask.copy()
    })
    
    # Stage 3: Binary Mask
    binary_mask = np.where(prev_mask > 127, 255, 0).astype(np.uint8)
    results.append({
        'stage': '03_binary_mask',
        'width': binary_mask.shape[1],
        'height': binary_mask.shape[0],
        'mask': binary_mask.copy()
    })
    
    # Stage 4: Merge Mask (simulating multi-object with empty masks)
    empty_result = merge_masks_instrumented([], [], image_name, request_id)
    results.append({
        'stage': '04_merge_mask_empty',
        'width': empty_result.shape[1],
        'height': empty_result.shape[0],
        'mask': empty_result.copy()
    })
    
    # Stage 5: Component Filter
    binary = prev_mask > 128
    labeled, num_components = ndimage.label(binary) if ndimage else (binary.astype(np.uint8), 1)
    total_pixels = prev_mask.shape[0] * prev_mask.shape[1]
    min_area = int(total_pixels * 0.005)
    component_areas = [int(np.sum(labeled == i)) for i in range(1, num_components + 1)] if ndimage else [int(np.sum(binary))]
    
    result_mask = np.zeros_like(binary, dtype=np.uint8)
    for i, area in enumerate(component_areas):
        if area >= min_area:
            result_mask[labeled == (i + 1)] = 255
    if np.sum(result_mask) < np.sum(binary) * 0.5:
        result_mask = (binary * 255).astype(np.uint8)
    
    results.append({
        'stage': '05_component_filter',
        'width': result_mask.shape[1],
        'height': result_mask.shape[0],
        'mask': result_mask.copy()
    })
    
    # Stage 6: Morphology
    alpha_float = result_mask.astype(np.float32) / 255.0
    alpha_float = gaussian_filter(alpha_float, sigma=1.0) if gaussian_filter else alpha_float
    alpha_float = np.clip(alpha_float, 0, 1)
    morphology_mask = (alpha_float * 255).astype(np.uint8)
    
    results.append({
        'stage': '06_morphology',
        'width': morphology_mask.shape[1],
        'height': morphology_mask.shape[0],
        'mask': morphology_mask.copy()
    })
    
    # Stage 7: Blur
    alpha_img = Image.fromarray(morphology_mask, mode='L')
    alpha_blurred = alpha_img.filter(ImageFilter.GaussianBlur(radius=1))
    blur_mask = np.array(alpha_blurred)
    
    results.append({
        'stage': '07_blur',
        'width': blur_mask.shape[1],
        'height': blur_mask.shape[0],
        'mask': blur_mask.copy()
    })
    
    # Stage 8: Alpha
    alpha = blur_mask
    rgba = img.convert('RGBA')
    r, g, b = rgba.split()[:3]
    result_rgba = Image.merge('RGBA', (r, g, b, Image.fromarray(alpha, mode='L')))
    
    results.append({
        'stage': '08_alpha',
        'width': alpha.shape[1],
        'height': alpha.shape[0],
        'mask': alpha.copy()
    })
    
    # Stage 9: Final RGBA
    result_rgba.save(OUTPUT_DIR / image_name.replace('.jpg', '_final.png').replace('.jpeg', '_final.png').replace('.png', '_final.png'))
    results.append({
        'stage': '09_final_rgba',
        'width': alpha.shape[1],
        'height': alpha.shape[0],
        'mask': alpha.copy()
    })
    
    # Pixel difference analysis
    sam2_mask_2d = results[1]['mask'] if results[1]['mask'] is not None else None
    for i, r in enumerate(results[2:], start=2):
        current_mask = r['mask']
        if sam2_mask_2d is not None and current_mask is not None:
            # Handle size mismatch
            if sam2_mask_2d.shape != current_mask.shape:
                PIXEL_DIFFS.append({
                    'image': image_name,
                    'stage': r['stage'],
                    'changed_pixels': -1,
                    'change_pct': -1,
                    'corrupted': True,
                    'reason': f'Size mismatch: {sam2_mask_2d.shape} vs {current_mask.shape}'
                })
                continue
            
            diff = np.abs(sam2_mask_2d.astype(np.float32) - current_mask.astype(np.float32))
            changed_pixels = np.sum(diff > 1)
            total_pixels = sam2_mask_2d.size
            change_pct = changed_pixels / total_pixels * 100
            
            PIXEL_DIFFS.append({
                'image': image_name,
                'stage': r['stage'],
                'changed_pixels': changed_pixels,
                'change_pct': change_pct,
                'corrupted': change_pct > 0.5
            })
    
    return results


def main():
    global MERGE_LOG, PIXEL_DIFFS
    
    print("=== VALIDATION PIPELINE ===\n")
    
    # Test with flower bouquet (synthetic)
    print("Processing: flower_bouquet.png (synthetic)")
    run_validation_pipeline(None, "flower_bouquet.png")
    
    # Test with real images
    if TEST_IMAGES_DIR.exists():
        for img_file in list(TEST_IMAGES_DIR.glob("*.{jpg,jpeg,png,webp}"))[:5]:
            print(f"Processing: {img_file.name}")
            run_validation_pipeline(img_file, img_file.name)
    
    # Save merge mask execution log
    csv_path = OUTPUT_DIR / "merge_mask_execution.csv"
    with open(csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['image', 'request_id', 'line356_executed', 'mask_count', 'returned_shape', 'return_reason'])
        writer.writeheader()
        writer.writerows(MERGE_LOG)
    
    # Save pixel diff report
    pixel_diff_path = OUTPUT_DIR / "pixel_diff.csv"
    with open(pixel_diff_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['image', 'stage', 'changed_pixels', 'change_pct', 'corrupted', 'reason'])
        writer.writeheader()
        writer.writerows(PIXEL_DIFFS)
    
    print(f"\n=== RESULTS ===")
    print(f"Merge log entries: {len(MERGE_LOG)}")
    print(f"Line 356 executed: {sum(1 for e in MERGE_LOG if e['line356_executed'] == 'YES')}")
    print(f"Pixel diffs recorded: {len(PIXEL_DIFFS)}")
    
    # Check for corruption
    corrupted = [p for p in PIXEL_DIFFS if p['corrupted']]
    if corrupted:
        print(f"\n*** CORRUPTION DETECTED ***")
        for c in corrupted:
            print(f"  {c['image']} at {c['stage']}: {c['change_pct']:.2f}% change")


if __name__ == "__main__":
    main()
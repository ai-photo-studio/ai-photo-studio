#!/usr/bin/env python3
"""
Mask Trace - Phase 1
Traces mask through all pipeline stages for flower bouquet image.
Identifies the EXACT first line of code where mask corruption occurs.
"""
import os
import sys
import io
import time
import json
import csv
from pathlib import Path
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

try:
    import torch
    import torch.nn.functional as F
except ImportError:
    torch = None
    F = None

OUTPUT_DIR = Path(__file__).parent.parent / "validation_output" / "mask_trace"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def create_flower_bouquet_image():
    """Create a synthetic flower bouquet test image."""
    from PIL import ImageDraw
    img = Image.new("RGB", (800, 800), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    colors = [
        (220, 20, 60),    # Crimson
        (255, 140, 0),    # Dark orange
        (255, 215, 0),    # Gold
        (60, 179, 113),   # Medium sea green
        (106, 90, 205),   # Slate blue
        (255, 105, 180),  # Deep pink
        (205, 92, 92),    # Medium crimson
    ]
    
    for i, color in enumerate(colors):
        cx = 400 + int(150 * np.cos(i * 2 * np.pi / len(colors)))
        cy = 350 + int(120 * np.sin(i * 2 * np.pi / len(colors)))
        draw.ellipse((cx - 55, cy - 55, cx + 55, cy + 55), fill=color)
        
        inner_color = tuple(int(c * 0.7) for c in color[:3])
        draw.ellipse((cx - 25, cy - 25, cx + 25, cy + 25), fill=inner_color)
    
    stem1_x = 350
    stem2_x = 450
    for stem_x in [stem1_x, stem2_x]:
        for segment in range(3):
            y_start = 420 + segment * 50
            draw.rectangle((stem_x - 15, y_start, stem_x + 15, y_start + 50), fill=(34, 139, 34))
    
    leaf1 = [(320, 480), (360, 520), (340, 560), (300, 540)]
    leaf2 = [(480, 480), (520, 520), (500, 560), (460, 540)]
    
    for leaf in [leaf1, leaf2]:
        draw.polygon(leaf, fill=(34, 139, 34))
    
    return img


def calculate_mask_metrics(mask_array, threshold=128):
    """Calculate pixel metrics for a mask."""
    binary = mask_array > threshold
    
    if ndimage:
        labeled, num_components = ndimage.label(binary)
        component_areas = [int(np.sum(labeled == i)) for i in range(1, num_components + 1)]
    else:
        labeled = binary.astype(np.uint8)
        num_components = 1
        component_areas = [int(np.sum(binary))]
    
    total_pixels = mask_array.shape[0] * mask_array.shape[1]
    fg_pixels = int(np.sum(binary))
    bg_pixels = total_pixels - fg_pixels
    
    largest_component = max(component_areas) if component_areas else 0
    
    return {
        "width": mask_array.shape[1],
        "height": mask_array.shape[0],
        "foreground_pixels": fg_pixels,
        "background_pixels": bg_pixels,
        "connected_components": num_components,
        "largest_component": largest_component,
        "mask_polarity": "foreground" if fg_pixels > bg_pixels else "background",
        "mask_min": float(np.min(mask_array)),
        "mask_max": float(np.max(mask_array)),
        "mask_mean": float(np.mean(mask_array)),
        "mask_std": float(np.std(mask_array)),
        "fg_pct": fg_pixels / max(1, total_pixels),
        "component_areas": component_areas
    }


def save_mask_image(mask_array, filename, output_dir):
    """Save a mask array as a PNG image."""
    if mask_array.dtype != np.uint8:
        mask_array = np.clip(mask_array, 0, 255).astype(np.uint8)
    img = Image.fromarray(mask_array, mode='L')
    img.save(output_dir / filename)
    return mask_array


def save_overlay(original, mask_array, filename, output_dir):
    """Save an overlay image showing mask on original."""
    if mask_array.max() > 1:
        mask_array = mask_array / 255.0
    overlay = original.copy()
    if overlay.mode != 'RGBA':
        overlay = overlay.convert('RGBA')
    
    mask_uint8 = (mask_array * 255).astype(np.uint8) if mask_array.max() <= 1 else mask_array.astype(np.uint8)
    mask_img = Image.fromarray(mask_uint8, mode='L')
    overlay.putalpha(mask_img)
    
    rgba_overlay = Image.new('RGBA', original.size, (255, 255, 255, 0))
    rgba_overlay.paste(overlay, (0, 0), mask_img)
    
    draw = ImageDraw.Draw(rgba_overlay)
    draw.rectangle([0, 0, original.width-1, original.height-1], outline=(255, 0, 0, 255), width=2)
    
    rgba_overlay.save(output_dir / filename)
    return rgba_overlay


def simulate_sam2_mask(img):
    """Simulate SAM2 mask output - creates a mask representing a flower bouquet."""
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
        
        inner_y, inner_x = cy, cx
        inner_dist = np.sqrt((x_grid - inner_x)**2 + (y_grid - inner_y)**2)
        inner_flower = np.clip(1 - inner_dist / 25, 0, 1)
        mask = np.maximum(mask, inner_flower * 0.7)
    
    for stem_x in [350, 450]:
        for segment in range(3):
            y_start = 420 + segment * 50
            y_grid, x_grid = np.ogrid[:h, :w]
            stem_mask = ((x_grid >= stem_x - 15) & (x_grid <= stem_x + 15) & 
                         (y_grid >= y_start) & (y_grid <= y_start + 50))
            mask[stem_mask] = np.maximum(mask[stem_mask], 0.9)
    
    return mask


def merge_masks_bug(masks, weights):
    """This is the BUGGY version from gpu_provider.py line 353-368."""
    if not masks:
        return np.zeros((512, 512), dtype=np.uint8)  # BUG: Hardcoded 512x512!
    
    if len(masks) == 1:
        return (masks[0] * 255).astype(np.uint8)
    
    h, w = masks[0].shape
    combined = np.zeros((h, w), dtype=np.float32)
    
    for mask, weight in zip(masks, weights[:len(masks)]):
        combined += mask.astype(np.float32) * weight
    
    combined = combined / len(masks)  # BUG: Should divide by sum(weights)
    return (combined * 255).astype(np.uint8)


def preserve_text_regions_bug(mask, original):
    """This is the _preserve_text_regions function from gpu_provider.py lines 370-383."""
    gray = np.array(original.convert('L'))
    
    edges = sobel(gray)
    text_like = edges > np.percentile(edges, 75)
    
    dilated = ndimage.binary_dilation(text_like, iterations=3)
    
    result = np.maximum(mask, dilated.astype(np.uint8) * 255)
    
    return result


def enhance_thin_structures_bug(mask, original):
    """This is the _enhance_thin_structures function from gpu_provider.py lines 385-395."""
    binary = mask > 128
    
    skeleton = ndimage.skeletonize(binary)
    
    dilated = ndimage.binary_dilation(skeleton, iterations=2)
    
    result = np.maximum(mask, dilated.astype(np.uint8) * 255)
    
    return result


def trace_mask_pipeline(image_path=None):
    """Trace mask through all pipeline stages."""
    
    if image_path is None:
        flower_img = create_flower_bouquet_image()
        input_path = OUTPUT_DIR / "01_input.png"
        flower_img.save(input_path)
        print(f"Created flower bouquet image: {input_path}")
    else:
        flower_img = Image.open(image_path)
        input_path = Path(image_path)
    
    if flower_img.mode != 'RGB':
        flower_img = flower_img.convert('RGB')
    
    results = []
    prev_mask = None
    orig_hw = (flower_img.height, flower_img.width)
    
    print("\n=== STAGE 1: INPUT IMAGE ===")
    img = flower_img
    img.save(OUTPUT_DIR / "01_input.png")
    results.append({"stage": "01_input", "metrics": {"width": img.width, "height": img.height}, "mask": None})
    
    print("\n=== STAGE 2: PREPROCESSED IMAGE ===")
    start = time.time()
    if max(img.size) > 2000:
        scale = 2000 / max(img.size)
        new_size = (int(img.width * scale), int(img.height * scale))
        img = img.resize(new_size, Image.Resampling.LANCZOS)
    img.save(OUTPUT_DIR / "02_preprocessed.png")
    results.append({"stage": "02_preprocessed", "metrics": {"width": img.width, "height": img.height}, "time_ms": (time.time()-start)*1000})
    
    print("\n=== STAGE 3: SAM2 RAW PROBABILITY ===")
    start = time.time()
    
    sam2_mask = simulate_sam2_mask(img)
    save_mask_image(sam2_mask, OUTPUT_DIR / "03_sam2_raw_probability.png", OUTPUT_DIR)
    
    sam2_time = (time.time() - start) * 1000
    prev_mask = (sam2_mask * 255).astype(np.uint8)
    
    metrics = calculate_mask_metrics(prev_mask)
    results.append({
        "stage": "03_sam2_raw_probability",
        "metrics": metrics,
        "mask": prev_mask.copy(),
        "time_ms": sam2_time
    })
    print(f"  Metrics: fg={metrics['foreground_pixels']}, components={metrics['connected_components']}")
    
    print("\n=== STAGE 4: BINARY MASK ===")
    start = time.time()
    binary_mask = np.where(prev_mask > 127, 255, 0).astype(np.uint8)
    
    save_mask_image(binary_mask, OUTPUT_DIR / "04_binary_mask.png", OUTPUT_DIR)
    prev_mask = binary_mask.copy()
    metrics = calculate_mask_metrics(prev_mask)
    results.append({
        "stage": "04_binary_mask",
        "metrics": metrics,
        "mask": prev_mask.copy(),
        "time_ms": (time.time()-start)*1000
    })
    print(f"  Metrics: fg={metrics['foreground_pixels']}, components={metrics['connected_components']}")
    
    print("\n=== STAGE 5: AFTER RESIZE ===")
    start = time.time()
    if img.size != (prev_mask.shape[1], prev_mask.shape[0]):
        prev_mask = np.array(Image.fromarray(prev_mask).resize(img.size, Image.Resampling.NEAREST))
    
    save_mask_image(prev_mask, OUTPUT_DIR / "05_after_resize.png", OUTPUT_DIR)
    metrics = calculate_mask_metrics(prev_mask)
    results.append({
        "stage": "05_after_resize",
        "metrics": metrics,
        "mask": prev_mask.copy(),
        "time_ms": (time.time()-start)*1000
    })
    
    print("\n=== STAGE 6: AFTER COMPONENT FILTER ===")
    start = time.time()
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
    
    prev_mask = result_mask
    save_mask_image(prev_mask, OUTPUT_DIR / "06_after_component_filter.png", OUTPUT_DIR)
    metrics = calculate_mask_metrics(prev_mask)
    results.append({
        "stage": "06_after_component_filter",
        "metrics": metrics,
        "mask": prev_mask.copy(),
        "time_ms": (time.time()-start)*1000
    })
    
    print("\n=== STAGE 7: AFTER HOLE FILL ===")
    start = time.time()
    binary = prev_mask > 128
    filled = binary_fill_holes(binary) if binary_fill_holes else binary
    dilated = binary_dilation(filled, iterations=1) if binary_dilation else filled
    
    prev_mask = (dilated * 255).astype(np.uint8)
    save_mask_image(prev_mask, OUTPUT_DIR / "07_after_hole_fill.png", OUTPUT_DIR)
    metrics = calculate_mask_metrics(prev_mask)
    results.append({
        "stage": "07_after_hole_fill",
        "metrics": metrics,
        "mask": prev_mask.copy(),
        "time_ms": (time.time()-start)*1000
    })
    
    print("\n=== STAGE 8: AFTER MORPHOLOGY ===")
    start = time.time()
    if gaussian_filter is not None:
        alpha_float = prev_mask.astype(np.float32) / 255.0
        alpha_float = gaussian_filter(alpha_float, sigma=1.0)
        alpha_float = np.clip(alpha_float, 0, 1)
        prev_mask = (alpha_float * 255).astype(np.uint8)
    else:
        dilated = binary_dilation(prev_mask > 128, iterations=1) if binary_dilation else (prev_mask > 128)
        prev_mask = (dilated * 255).astype(np.uint8)
    
    save_mask_image(prev_mask, OUTPUT_DIR / "08_after_morphology.png", OUTPUT_DIR)
    metrics = calculate_mask_metrics(prev_mask)
    results.append({
        "stage": "08_after_morphology",
        "metrics": metrics,
        "mask": prev_mask.copy(),
        "time_ms": (time.time()-start)*1000
    })
    
    print("\n=== STAGE 9: AFTER BLUR ===")
    start = time.time()
    alpha_img = Image.fromarray(prev_mask, mode='L')
    alpha_blurred = alpha_img.filter(ImageFilter.GaussianBlur(radius=1))
    prev_mask = np.array(alpha_blurred)
    
    save_mask_image(prev_mask, OUTPUT_DIR / "09_after_blur.png", OUTPUT_DIR)
    metrics = calculate_mask_metrics(prev_mask)
    results.append({
        "stage": "09_after_blur",
        "metrics": metrics,
        "mask": prev_mask.copy(),
        "time_ms": (time.time()-start)*1000
    })
    
    print("\n=== STAGE 10: ALPHA CHANNEL ===")
    start = time.time()
    alpha = prev_mask
    rgba = img.convert('RGBA')
    r, g, b = rgba.split()[:3]
    result_rgba = Image.merge('RGBA', (r, g, b, Image.fromarray(alpha, mode='L')))
    
    save_mask_image(alpha, OUTPUT_DIR / "10_alpha_channel.png", OUTPUT_DIR)
    prev_mask = alpha.copy()
    metrics = calculate_mask_metrics(prev_mask)
    results.append({
        "stage": "10_alpha_channel",
        "metrics": metrics,
        "mask": prev_mask.copy(),
        "time_ms": (time.time()-start)*1000
    })
    
    print("\n=== STAGE 11: FINAL RGBA ===")
    start = time.time()
    result_rgba.save(OUTPUT_DIR / "11_final_rgba.png")
    metrics = calculate_mask_metrics(prev_mask)
    results.append({
        "stage": "11_final_rgba",
        "metrics": metrics,
        "mask": prev_mask.copy(),
        "time_ms": (time.time()-start)*1000
    })
    
    print("\n=== STAGE 12: OVERLAY ===")
    start = time.time()
    save_overlay(img, prev_mask, OUTPUT_DIR / "12_overlay.png", OUTPUT_DIR)
    metrics = calculate_mask_metrics(prev_mask)
    results.append({
        "stage": "12_overlay",
        "metrics": metrics,
        "mask": prev_mask.copy(),
        "time_ms": (time.time()-start)*1000
    })
    
    return results


def analyze_corruption(results):
    """Analyze where mask corruption occurs."""
    print("\n=== CORRUPTION ANALYSIS ===")
    
    sam2_mask = results[2]['mask'] if results[2]['mask'] is not None else None
    sam2_metrics = results[2]['metrics']
    
    print(f"\nSAM2 Output (Stage 3):")
    print(f"  Size: {sam2_metrics['width']}x{sam2_metrics['height']}")
    print(f"  Foreground pixels: {sam2_metrics['foreground_pixels']}")
    print(f"  Connected components: {sam2_metrics['connected_components']}")
    
    for i, r in enumerate(results[3:], start=3):
        stage_name = r['stage']
        current_mask = r.get('mask')
        current_metrics = r.get('metrics', {})
        
        if sam2_mask is not None and current_mask is not None:
            diff = np.abs(sam2_mask.astype(np.float32) - current_mask.astype(np.float32))
            max_diff = np.max(diff)
            mean_diff = np.mean(diff)
            total_diff_pixels = np.sum(diff > 1)
            
            fg_sam2 = np.sum(sam2_mask > 127)
            fg_current = np.sum(current_mask > 127)
            fg_change_pct = abs(fg_current - fg_sam2) / max(1, fg_sam2) * 100
            
            size_match = sam2_mask.shape == current_mask.shape
            
            print(f"\n{stage_name}:")
            print(f"  Size: {current_metrics.get('width', '?')}x{current_metrics.get('height', '?')} (match: {size_match})")
            print(f"  Foreground change: {fg_change_pct:.2f}%")
            print(f"  Max pixel diff: {max_diff}")
            print(f"  Mean pixel diff: {mean_diff:.4f}")
            
            if not size_match:
                print(f"  *** CORRUPTION DETECTED: Size mismatch! ***")
                return stage_name, "size_mismatch", 100.0
            
            if fg_change_pct > 1:
                print(f"  *** CORRUPTION DETECTED: {fg_change_pct:.2f}% change ***")
                return stage_name, "pixel_change", fg_change_pct
    
    return None, "none", 0


def main():
    print("=== MASK TRACE PIPELINE ===")
    print(f"Output directory: {OUTPUT_DIR}")
    
    results = trace_mask_pipeline()
    
    print("\n=== SAVING RESULTS ===")
    
    csv_path = OUTPUT_DIR / "mask_trace.csv"
    with open(csv_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            'stage', 'width', 'height', 'foreground_pixels', 'background_pixels',
            'connected_components', 'largest_component', 'mask_polarity',
            'fg_pct', 'time_ms'
        ])
        for r in results:
            m = r.get('metrics', {})
            writer.writerow([
                r['stage'],
                m.get('width', ''),
                m.get('height', ''),
                m.get('foreground_pixels', ''),
                m.get('background_pixels', ''),
                m.get('connected_components', ''),
                m.get('largest_component', ''),
                m.get('mask_polarity', ''),
                m.get('fg_pct', ''),
                r.get('time_ms', '')
            ])
    
    json_path = OUTPUT_DIR / "mask_trace.json"
    with open(json_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    corruption_stage, corruption_type, corruption_value = analyze_corruption(results)
    
    print(f"\n=== OUTPUT FILES ===")
    for f in sorted(OUTPUT_DIR.glob("*")):
        print(f"  {f.name}")
    
    print(f"\n=== SUMMARY ===")
    for r in results:
        m = r.get('metrics', {})
        if 'fg_pct' in m:
            print(f"  {r['stage']}: fg={m.get('foreground_pixels', 0)} ({m.get('fg_pct', 0)*100:.2f}%)")
    
    if corruption_stage:
        print(f"\n=== CORRUPTION FOUND ===")
        print(f"  Stage: {corruption_stage}")
        print(f"  Type: {corruption_type}")
        print(f"  Value: {corruption_value}")


if __name__ == "__main__":
    main()
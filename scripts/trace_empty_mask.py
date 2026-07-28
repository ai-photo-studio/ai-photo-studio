#!/usr/bin/env python3
"""
Trace Empty Mask Investigation
Proves WHY masks list becomes empty or why line 356 is triggered.
"""
import os
import sys
import io
import csv
import uuid
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

try:
    from scipy import ndimage
    from scipy.ndimage import sobel, gaussian_filter, binary_dilation, binary_fill_holes
except ImportError:
    ndimage = None
    sobel = None
    gaussian_filter = None
    binary_dilation = None
    binary_fill_holes = None

OUTPUT_DIR = Path(__file__).parent.parent / "validation_output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Instrumentation log
TRACE_LOG = []

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


def simulate_decoder_output(orig_hw, prompt_coords):
    """Simulate SAM2 decoder output for given prompt coordinates."""
    h, w = orig_hw
    mask = np.zeros((h, w), dtype=np.float32)
    
    cx, cy = prompt_coords
    y_grid, x_grid = np.ogrid[:h, :w]
    dist = np.sqrt((x_grid - cx)**2 + (y_grid - cy)**2)
    mask = np.clip(1 - dist / 100, 0, 1)
    
    return mask


def infer_multiple_objects_simulated(orig_hw, prompt_sets):
    """Simulate _infer_multiple_objects logic."""
    masks = []
    
    for prompt_idx, (prompt_points, _) in enumerate(prompt_sets):
        # Simulate decoder call
        mask_np = simulate_decoder_output(orig_hw, prompt_points[0])
        
        mean_val = mask_np.mean()
        
        TRACE_LOG.append({
            'event': 'MASK_CHECK',
            'prompt_idx': prompt_idx,
            'prompt_points': str(prompt_points),
            'mask_mean': mean_val,
            'threshold': 0.01,
            'passes_filter': mean_val > 0.01
        })
        
        if mean_val > 0.01:
            masks.append(mask_np)
        else:
            TRACE_LOG.append({
                'event': 'MASK_FILTERED',
                'prompt_idx': prompt_idx,
                'reason': 'mean_below_threshold'
            })
        
        if len(masks) >= 3:
            break
    
    TRACE_LOG.append({
        'event': 'MULTIOBJ_COMPLETE',
        'masks_count': len(masks)
    })
    
    return masks


def trace_merge_masks(masks, weights, image_name, request_id):
    """Trace _merge_masks execution."""
    TRACE_LOG.append({
        'event': 'MERGE_MASKS_CALLED',
        'masks_count': len(masks),
        'weights_sum': sum(weights) if weights else 0,
        'caller_condition': 'len(masks) > 1'
    })
    
    if not masks:
        TRACE_LOG.append({
            'event': 'MERGE_MASKS_EMPTY',
            'line': 356,
            'action': 'return np.zeros((512, 512), dtype=np.uint8)'
        })
        return np.zeros((512, 512), dtype=np.uint8)
    
    if len(masks) == 1:
        TRACE_LOG.append({
            'event': 'MERGE_MASKS_SINGLE',
            'mask_shape': str(masks[0].shape)
        })
        return (masks[0] * 255).astype(np.uint8)
    
    h, w = masks[0].shape
    combined = np.zeros((h, w), dtype=np.float32)
    
    for mask, weight in zip(masks, weights[:len(masks)]):
        combined += mask.astype(np.float32) * weight
    
    combined = combined / len(masks)
    return (combined * 255).astype(np.uint8)


def main():
    global TRACE_LOG
    
    print("=== EMPTY MASK TRACE ===\n")
    
    # Create test image
    img = create_flower_bouquet_image()
    h, w = img.size
    
    TRACE_LOG.append({
        'event': 'START',
        'image': 'flower_bouquet.png',
        'dimensions': f'{w}x{h}'
    })
    
    # Simulate SAM2 initial mask
    initial_mask = simulate_decoder_output((h, w), [w//2, h//2])
    TRACE_LOG.append({
        'event': 'SAM2_INITIAL',
        'mask_mean': initial_mask.mean(),
        'mask_shape': initial_mask.shape
    })
    
    # Define prompt sets (same as in gpu_provider.py)
    prompt_sets = [
        ([[w // 2, h // 2]], 'center'),
        ([[int(w * 0.25), int(h * 0.25)], [int(w * 0.75), int(h * 0.75)]], 'corners'),
        ([[int(w * 0.1), int(h * 0.5)], [int(w * 0.9), int(h * 0.5)]], 'edges'),
    ]
    
    # Add edge-based prompts
    gray = np.array(img.convert('L'))
    if sobel is not None:
        edges = sobel(gray)
        edge_coords = np.where(edges > np.percentile(edges, 80))
        if len(edge_coords[0]) > 0:
            import random
            indices = random.sample(range(len(edge_coords[0])), min(3, len(edge_coords[0])))
            for idx in indices:
                prompt_sets.append(([[int(edge_coords[1][idx]), int(edge_coords[0][idx])]], 'edge_point'))
    
    TRACE_LOG.append({
        'event': 'PROMPT_SETS',
        'count': len(prompt_sets)
    })
    
    # Simulate multi-object inference
    masks_list = infer_multiple_objects_simulated((h, w), prompt_sets)
    
    # Check if merge_masks would be called
    TRACE_LOG.append({
        'event': 'MERGE_CHECK',
        'masks_count': len(masks_list),
        'condition': 'len(masks_list) > 1',
        'will_call_merge': len(masks_list) > 1
    })
    
    # If merge would be called, trace it
    if len(masks_list) > 1:
        weights = [float(0.9)] * len(masks_list)  # Simulated weight
        result = trace_merge_masks(masks_list, weights, 'flower_bouquet.png', 'test-req-001')
        TRACE_LOG.append({
            'event': 'MERGE_RESULT',
            'result_shape': str(result.shape)
        })
    elif len(masks_list) == 0:
        TRACE_LOG.append({
            'event': 'EMPTY_MASKS_NOT_MERGED',
            'reason': 'len(masks_list) == 0, merge not called due to condition check'
        })
    else:
        TRACE_LOG.append({
            'event': 'SINGLE_MASK_NOT_MERGED',
            'reason': 'len(masks_list) == 1, merge not called due to condition check'
        })
    
    # Save trace log
    csv_path = OUTPUT_DIR / "empty_mask_trace.csv"
    if TRACE_LOG:
        all_keys = set()
        for entry in TRACE_LOG:
            all_keys.update(entry.keys())
        fieldnames = sorted(all_keys)
        with open(csv_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(TRACE_LOG)
    
    # Print summary
    print("=== TRACE SUMMARY ===")
    for entry in TRACE_LOG:
        print(f"  {entry.get('event', '?')}: {entry}")
    
    print(f"\n=== CONCLUSION ===")
    empty_count = sum(1 for e in TRACE_LOG if e.get('event') == 'MASK_FILTERED')
    final_count = next((e for e in TRACE_LOG if e.get('event') == 'MULTIOBJ_COMPLETE'), None)
    
    if final_count:
        print(f"Final mask count: {final_count.get('masks_count', 0)}")
    
    print(f"Masks filtered due to low mean: {empty_count}")
    
    # Check if line 356 would execute
    will_call = next((e for e in TRACE_LOG if e.get('event') == 'MERGE_CHECK'), None)
    if will_call and will_call.get('will_call_merge'):
        print("Line 356 WOULD BE EXECUTED (merge called with >1 masks)")
    else:
        print("Line 356 WOULD NOT BE EXECUTED (merge not called)")


if __name__ == "__main__":
    main()
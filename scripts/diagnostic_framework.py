#!/usr/bin/env python3
"""
Production Diagnostic Framework
Phase 1-5: Golden Dataset, Instrumentation, IQS Extension, Visual Acceptance, Regression
"""
import os
import io
import json
import hashlib
import time
import numpy as np
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.ndimage import sobel

try:
    from rembg import new_session
    REMBG_AVAILABLE = True
except ImportError:
    REMBG_AVAILABLE = False

GOLDEN_DATASET_DIR = Path("golden_dataset")
DIAGNOSTICS_DIR = Path("diagnostics")
GOLDEN_DATASET_DIR.mkdir(parents=True, exist_ok=True)
DIAGNOSTICS_DIR.mkdir(parents=True, exist_ok=True)

CATEGORIES = {
    'white_products': GOLDEN_DATASET_DIR / 'white_products',
    'dark_products': GOLDEN_DATASET_DIR / 'dark_products',
    'transparent_items': GOLDEN_DATASET_DIR / 'transparent_items',
    'reflective_items': GOLDEN_DATASET_DIR / 'reflective_items',
    'clothing': GOLDEN_DATASET_DIR / 'clothing',
    'shoes': GOLDEN_DATASET_DIR / 'shoes',
    'electronics': GOLDEN_DATASET_DIR / 'electronics',
    'furniture': GOLDEN_DATASET_DIR / 'furniture',
    'food': GOLDEN_DATASET_DIR / 'food',
    'warehouse': GOLDEN_DATASET_DIR / 'warehouse',
    'human': GOLDEN_DATASET_DIR / 'human',
}

def calculate_iqs_components(rgba_img: Image.Image) -> dict:
    """Calculate IQS components for an RGBA image."""
    if rgba_img.mode != 'RGBA':
        rgba_img = rgba_img.convert('RGBA')
    
    arr = np.array(rgba_img)
    alpha = arr[:, :, 3].astype(np.float32) / 255.0
    rgb = arr[:, :, :3].astype(np.float32)
    
    total_pixels = alpha.size
    foreground_pixels = np.sum(alpha > 0.5)
    
    fg_coverage = foreground_pixels / max(1, total_pixels)
    
    if foreground_pixels > 0:
        edges = sobel(alpha)
        edge_pixels = np.sum(edges > np.percentile(edges[edges > 0], 50) if np.any(edges > 0) else [0])
        boundary_f1 = edge_pixels / max(1, foreground_pixels)
    else:
        boundary_f1 = 0
    
    labeled, num_components = ndimage.label(alpha > 0.5)
    component_areas = [np.sum(labeled == i) for i in range(1, num_components + 1)]
    largest_component_pct = max(component_areas) / max(1, foreground_pixels) if component_areas else 0
    
    alpha_flat = alpha.flatten()
    hist, _ = np.histogram(alpha_flat, bins=256, range=(0, 1))
    p = hist / total_pixels
    entropy = -np.sum(p[p > 0] * np.log2(p[p > 0]))
    alpha_entropy = entropy / np.log2(256)
    
    semi_transparent = np.sum((alpha > 0) & (alpha <= 0.5))
    bg_leakage = semi_transparent / max(1, total_pixels)
    
    sharp_pixels = np.sum((alpha > 0.8) | (alpha < 0.2))
    mask_confidence = sharp_pixels / max(1, total_pixels)
    
    std_alpha = np.std(alpha[alpha > 0.5]) if foreground_pixels > 0 else 0
    mask_smoothness = 1.0 - min(std_alpha / 50, 1.0)
    
    rgba_violations = np.sum((alpha <= 0.01) & (np.any(rgb != 255, axis=2)))
    rgba_integrity = 1.0 - min(rgba_violations / max(1, total_pixels), 0.5)
    
    iqs = (
        min(fg_coverage * 100, 100.0) * 0.20 +
        min(boundary_f1 * 100, 100.0) * 0.15 +
        min(alpha_entropy * 100, 100.0) * 0.10 +
        (1.0 - bg_leakage) * 100 * 0.15 +
        min(mask_confidence * 100, 100.0) * 0.10 +
        min(mask_smoothness * 100, 100.0) * 0.10 +
        min(rgba_integrity * 100, 100.0) * 0.10 +
        (1.0 - (1.0 - largest_component_pct)) * 100 * 0.10
    )
    
    return {
        'foreground_coverage': float(fg_coverage),
        'edge_continuity': float(1.0 - min(edge_pixels / max(1, total_pixels * 0.01), 1.0)) if foreground_pixels > 0 else 0.0,
        'connected_components': int(num_components),
        'largest_component_pct': float(largest_component_pct),
        'alpha_entropy': float(alpha_entropy),
        'bg_leakage': float(bg_leakage),
        'mask_confidence': float(mask_confidence),
        'mask_smoothness': float(mask_smoothness),
        'boundary_f1': float(boundary_f1),
        'rgba_integrity': float(rgba_integrity),
        'iqs': float(iqs),
    }

def build_golden_dataset_from_test_images():
    """Build golden dataset from existing test images."""
    test_images_dir = Path("test images")
    if not test_images_dir.exists():
        print("  WARNING: test images directory not found")
        return 0
    
    image_files = []
    for ext in ['*.jpg', '*.jpeg', '*.png']:
        image_files.extend(test_images_dir.glob(ext))
    
    image_files = [f for f in image_files if 'WhatsApp Image' in f.name or 'Untitled' in f.name or f.name.endswith('.jpeg')]
    
    category_assignments = {
        'white_products': ['Untitled design (6).png', 'Untitled design (7).png', 'Untitled design (8).png'],
        'dark_products': ['0edaa9fa4d67ab7482a9f10c49d8fcbe.jpeg'],
        'clothing': [],
        'shoes': ['31020120240408870.png'],
        'electronics': ['41050120240408842.png'],
        'food': [],
        'warehouse': [],
        'human': [],
    }
    
    for cat, files in category_assignments.items():
        cat_dir = CATEGORIES[cat]
        for fname in files:
            f = test_images_dir / fname
            if f.exists():
                dest = cat_dir / f.name
                if not dest.exists():
                    import shutil
                    shutil.copy(f, dest)
    
    for img_file in image_files:
        cat_dir = CATEGORIES['white_products']
        dest = cat_dir / img_file.name
        if not dest.exists():
            import shutil
            shutil.copy(img_file, dest)
    
    total = 0
    for cat_dir in CATEGORIES.values():
        total += len(list(cat_dir.glob('*.png'))) + len(list(cat_dir.glob('*.jpg'))) + len(list(cat_dir.glob('*.jpeg')))
    
    return total

def process_image_with_rembg(image_path: Path, output_dir: Path) -> dict:
    """Process image using rembg and save all diagnostic stages."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    original = Image.open(image_path)
    if original.mode != 'RGB':
        original = original.convert('RGB')
    
    original.save(output_dir / 'original.png')
    
    diagnostics = {
        'image_name': image_path.name,
        'timestamp': datetime.now().isoformat(),
        'stages': {},
        'provider': 'rembg-u2netp',
        'model': 'u2netp'
    }
    
    try:
        if not REMBG_AVAILABLE:
            raise ImportError("rembg not available")
        
        session = new_session("u2netp")
        result = session.predict(original)
        
        if isinstance(result, list) and len(result) > 0:
            mask = np.array(result[0])
        else:
            mask = np.array(result)
        
        if mask.max() <= 1.0:
            mask = (mask * 255).astype(np.uint8)
        else:
            mask = mask.astype(np.uint8)
        
        alpha_img = Image.fromarray(mask, mode='L')
        alpha_img.save(output_dir / 'alpha.png')
        
        rgba = original.convert('RGBA')
        r, g, b = rgba.split()[:3]
        cutout = Image.merge('RGBA', (r, g, b, alpha_img))
        cutout.save(output_dir / 'returned_png.png')
        
        rgba_arr = np.array(cutout)
        alpha = rgba_arr[:, :, 3]
        
        fg_mask = alpha > 128
        foreground = np.zeros_like(rgba_arr)
        foreground[:, :, :3] = rgba_arr[:, :, :3]
        foreground[:, :, 3] = alpha
        Image.fromarray(foreground).save(output_dir / 'foreground.png')
        
        white_bg = Image.new('RGB', original.size, (255, 255, 255))
        white_bg.paste(original, mask=alpha_img)
        white_bg.save(output_dir / 'browser_png.png')
        
        overlay = Image.new('RGBA', original.size, (255, 0, 0, 0))
        overlay_arr = np.array(overlay)
        overlay_arr[:, :, 0] = np.where(fg_mask, 255, overlay_arr[:, :, 0])
        Image.fromarray(overlay_arr).save(output_dir / 'overlay_mask.png')
        
        iqs = calculate_iqs_components(cutout)
        
        with open(output_dir / 'returned_png.png', 'rb') as f:
            sha256_hash = hashlib.sha256(f.read()).hexdigest()
        
        diagnostics['stages'] = {
            'original': str(output_dir / 'original.png'),
            'preprocessed_input': str(output_dir / 'original.png'),
            'raw_logits': None,
            'raw_mask': str(output_dir / 'alpha.png'),
            'candidate_masks': str(output_dir / 'alpha.png'),
            'chosen_mask': str(output_dir / 'alpha.png'),
            'refined_mask': str(output_dir / 'alpha.png'),
            'alpha': str(output_dir / 'alpha.png'),
            'foreground': str(output_dir / 'foreground.png'),
            'rgba': str(output_dir / 'returned_png.png'),
            'returned_png': str(output_dir / 'returned_png.png'),
            'browser_png': str(output_dir / 'browser_png.png'),
            'overlay_mask': str(output_dir / 'overlay_mask.png'),
        }
        diagnostics['iqs'] = iqs
        diagnostics['sha256'] = sha256_hash
        diagnostics['status'] = 'PASS' if iqs['iqs'] >= 95.0 else 'FAIL'
        
    except Exception as e:
        diagnostics['status'] = 'ERROR'
        diagnostics['error'] = str(e)
        import traceback
        diagnostics['traceback'] = traceback.format_exc()
    
    with open(output_dir / 'diagnostics.json', 'w') as f:
        json.dump(diagnostics, f, indent=2)
    
    return diagnostics

def generate_contact_sheet(golden_dir: Path, output_path: Path):
    """Generate contact sheet showing visual acceptance."""
    categories = ['white_products', 'dark_products', 'clothing', 'shoes', 
                  'electronics', 'furniture', 'food', 'warehouse']
    
    thumb_size = (200, 200)
    cols = 5
    rows = 6
    
    sheet = Image.new('RGB', (cols * thumb_size[0], rows * thumb_size[1]), (240, 240, 240))
    
    idx = 0
    for cat in categories:
        cat_dir = golden_dir / cat
        if not cat_dir.exists():
            continue
        
        for img_file in sorted(cat_dir.glob('*'))[:3]:
            if img_file.is_file() and img_file.suffix.lower() in ['.png', '.jpg', '.jpeg']:
                if idx >= cols * rows:
                    break
                row = idx // cols
                col = idx % cols
                try:
                    img = Image.open(img_file).resize(thumb_size)
                    sheet.paste(img, (col * thumb_size[0], row * thumb_size[1]))
                except:
                    pass
                idx += 1
    
    sheet.save(output_path)

def main():
    print("=" * 70)
    print("PRODUCTION DIAGNOSTIC FRAMEWORK")
    print("=" * 70)
    
    print("\nPhase 1: Building Golden Dataset from test images...")
    count = build_golden_dataset_from_test_images()
    print(f"  Total images in golden dataset: {count}")
    
    print("\nPhase 2: Processing images and saving diagnostics...")
    run_dir = DIAGNOSTICS_DIR / f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    run_dir.mkdir(parents=True, exist_ok=True)
    
    results = []
    for category, cat_dir in CATEGORIES.items():
        if not cat_dir.exists():
            continue
        for img_file in sorted(cat_dir.glob('*')):
            if not img_file.is_file():
                continue
            if img_file.suffix.lower() not in ['.png', '.jpg', '.jpeg']:
                continue
            out_dir = run_dir / f"{category}_{img_file.stem}"
            result = process_image_with_rembg(img_file, out_dir)
            results.append(result)
            status = result.get('status', 'UNKNOWN')
            iqs = result.get('iqs', {}).get('iqs', 0)
            print(f"  {img_file.name}: {status} (IQS: {iqs:.1f})")
    
    print("\nPhase 3: Generating Visual Acceptance Contact Sheet...")
    generate_contact_sheet(GOLDEN_DATASET_DIR, run_dir / 'contact_sheet.png')
    
    passed = sum(1 for r in results if r.get('status') == 'PASS')
    failed = sum(1 for r in results if r.get('status') == 'FAIL')
    errors = sum(1 for r in results if r.get('status') == 'ERROR')
    
    iqs_values = [r['iqs']['iqs'] for r in results if 'iqs' in r]
    avg_iqs = np.mean(iqs_values) if iqs_values else 0
    min_iqs = min(iqs_values) if iqs_values else 0
    
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Golden dataset size: {len(results)}")
    print(f"Images passed: {passed}")
    print(f"Images failed: {failed}")
    print(f"Images errored: {errors}")
    print(f"Average IQS: {avg_iqs:.1f}")
    print(f"Lowest IQS: {min_iqs:.1f}")
    
    with open(run_dir / 'summary.json', 'w') as f:
        json.dump({
            'total_images': len(results),
            'passed': passed,
            'failed': failed,
            'errors': errors,
            'average_iqs': float(avg_iqs),
            'lowest_iqs': float(min_iqs),
        }, f, indent=2)
    
    print(f"\nDiagnostics saved to: {run_dir}")
    return results

if __name__ == "__main__":
    main()
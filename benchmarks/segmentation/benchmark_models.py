"""
Phase 4.13 - AI Segmentation Benchmark and Model Upgrade
Benchmark harness for background removal models.
"""

import os
import sys
import time
import json
import traceback
import gc
import psutil
import numpy as np
import pandas as pd
from pathlib import Path
from PIL import Image, ImageDraw
from io import BytesIO
from scipy import ndimage

# Ensure rembg uses our cached models
os.environ['RMBG_HOME'] = os.path.expanduser('~/.u2net')

# Benchmark configuration
CATEGORIES = [
    'electronics', 'flowers', 'furniture', 'books', 'clothing',
    'shoes', 'transparent', 'reflective', 'multiple', 'warehouse', 'people'
]
MODELS = ['u2net', 'u2netp', 'u2net_human_seg', 'birefnet-general', 'bria-rmbg']
NUM_IMAGES_PER_CATEGORY = 3
OUTPUT_DIR = Path(__file__).parent.parent.parent / 'benchmarks' / 'segmentation' / 'results'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
for cat in CATEGORIES:
    (OUTPUT_DIR / 'dataset' / cat).mkdir(parents=True, exist_ok=True)

def get_memory_mb():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

def create_test_image(category: str, index: int) -> Image.Image:
    """Create synthetic test images for each category."""
    img = Image.new('RGB', (512, 512), (240, 240, 235))
    draw = ImageDraw.Draw(img)
    
    if category == 'electronics':
        draw.rectangle([120, 120, 392, 392], fill=(30, 30, 40))
        draw.rectangle([140, 140, 372, 372], fill=(60, 60, 80))
        draw.ellipse([200, 200, 312, 312], fill=(100, 180, 255))
    elif category == 'flowers':
        draw.ellipse([180, 180, 332, 332], fill=(255, 100, 150))
        draw.rectangle([245, 280, 267, 420], fill=(34, 139, 34))
        draw.ellipse([160, 160, 352, 352], fill=(255, 200, 200))
    elif category == 'furniture':
        draw.rectangle([80, 200, 432, 420], fill=(139, 90, 43))
        draw.rectangle([80, 180, 432, 210], fill=(100, 60, 30))
        draw.rectangle([280, 280, 380, 420], fill=(80, 50, 20))
    elif category == 'books':
        draw.rectangle([100, 150, 412, 360], fill=(180, 40, 40))
        draw.rectangle([110, 140, 402, 170], fill=(220, 200, 180))
        draw.rectangle([130, 175, 382, 260], fill=(255, 255, 255))
    elif category == 'clothing':
        draw.ellipse([156, 56, 356, 456], fill=(70, 130, 180))
        draw.rectangle([196, 200, 316, 400], fill=(255, 255, 255))
    elif category == 'shoes':
        draw.ellipse([100, 300, 412, 420], fill=(20, 20, 20))
        draw.ellipse([180, 250, 332, 330], fill=(30, 30, 30))
        draw.rectangle([220, 320, 292, 400], fill=(255, 255, 255))
    elif category == 'transparent':
        draw.rectangle([100, 100, 412, 412], fill=(200, 220, 240, 128))
        draw.ellipse([180, 180, 332, 332], fill=(255, 255, 255, 100))
        draw.rectangle([150, 150, 362, 362], outline=(255, 255, 255, 180), width=3)
    elif category == 'reflective':
        draw.rectangle([100, 100, 412, 412], fill=(180, 180, 180))
        draw.ellipse([180, 180, 332, 332], fill=(220, 220, 220))
        draw.polygon([(256, 150), (300, 250), (256, 350), (212, 250)], fill=(255, 255, 200))
    elif category == 'multiple':
        draw.rectangle([50, 150, 180, 350], fill=(255, 100, 100))
        draw.rectangle([200, 100, 350, 300], fill=(100, 255, 100))
        draw.rectangle([280, 250, 462, 420], fill=(100, 100, 255))
    elif category == 'warehouse':
        draw.rectangle([0, 200, 512, 512], fill=(180, 160, 140))
        draw.rectangle([50, 100, 150, 200], fill=(120, 100, 80))
        draw.rectangle([300, 80, 450, 200], fill=(140, 120, 100))
        draw.rectangle([0, 180, 512, 210], fill=(100, 80, 60))
    elif category == 'people':
        draw.ellipse([186, 56, 326, 196], fill=(255, 220, 190))
        draw.rectangle([156, 196, 356, 456], fill=(50, 100, 200))
        draw.rectangle([136, 456, 196, 512], fill=(40, 40, 40))
        draw.rectangle([316, 456, 376, 512], fill=(40, 40, 40))
    
    # Add subtle noise
    arr = np.array(img)
    noise = np.random.normal(0, 5, arr.shape).astype(np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)

def benchmark_rembg_model(model_name: str, image: Image.Image):
    """Benchmark a rembg model."""
    from rembg import new_session
    
    mem_before = get_memory_mb()
    start_time = time.time()
    
    try:
        session = new_session(model_name)
        output = session.predict(image)
        duration = time.time() - start_time
        mem_after = get_memory_mb()
        mem_delta = mem_after - mem_before
        
        if isinstance(output, list) and len(output) > 0:
            output = output[0]
        
        if output.mode == "L":
            rgba = image.convert("RGBA")
            r, g, b = rgba.split()[:3]
            output = Image.merge("RGBA", (r, g, b, output))
        elif output.mode != "RGBA":
            output = output.convert("RGBA")
        
        output_arr = np.array(output)
        alpha = output_arr[:, :, 3] if output_arr.shape[2] == 4 else None
        
        edge_quality = 0.0
        if alpha is not None:
            edges = ndimage.sobel(alpha)
            edge_quality = float(np.mean(edges))
        
        fg_coverage = float(np.mean(alpha > 128)) if alpha is not None else 0.0
        output_size = len(output.tobytes())
        
        return {
            'success': True,
            'duration_s': round(duration, 3),
            'mem_delta_mb': round(mem_delta, 1),
            'edge_quality': round(edge_quality, 3),
            'fg_coverage': round(fg_coverage, 3),
            'output_size_kb': round(output_size / 1024, 1),
            'error': None
        }
    except Exception as e:
        return {
            'success': False,
            'duration_s': round(time.time() - start_time, 3),
            'mem_delta_mb': 0,
            'edge_quality': 0,
            'fg_coverage': 0,
            'output_size_kb': 0,
            'error': str(e)[:200]
        }

def run_benchmarks():
    """Run all benchmarks."""
    results = []
    images = {}
    
    print("Generating benchmark dataset...")
    for category in CATEGORIES:
        images[category] = []
        for i in range(NUM_IMAGES_PER_CATEGORY):
            img = create_test_image(category, i)
            images[category].append(img)
            img.save(OUTPUT_DIR / 'dataset' / category / f'{i:03d}.png')
    
    print(f"\nBenchmarking {len(MODELS)} models on {len(CATEGORIES)} categories...")
    
    for model in MODELS:
        print(f"\n--- Model: {model} ---")
        for category in CATEGORIES:
            for i, img in enumerate(images[category]):
                print(f"  {category} [{i+1}/{NUM_IMAGES_PER_CATEGORY}]", end="", flush=True)
                result = benchmark_rembg_model(model, img)
                result['model'] = model
                result['category'] = category
                result['image_index'] = i
                results.append(result)
                print(f" {result['duration_s']}s {'OK' if result['success'] else 'FAIL'}")
                
                if i == 0 and result['success']:
                    try:
                        from rembg import new_session
                        session = new_session(model)
                        output = session.predict(img)
                        if isinstance(output, list) and len(output) > 0:
                            output = output[0]
                        if output.mode == "L":
                            rgba = img.convert("RGBA")
                            r, g, b = rgba.split()[:3]
                            output = Image.merge("RGBA", (r, g, b, output))
                        elif output.mode != "RGBA":
                            output = output.convert("RGBA")
                        output.save(OUTPUT_DIR / f'{model}__{category}.png')
                    except Exception as e:
                        print(f"    (save failed: {e})")
                
                gc.collect()
    
    # Save results
    df = pd.DataFrame(results)
    csv_path = OUTPUT_DIR / 'benchmark_results.csv'
    df.to_csv(csv_path, index=False)
    print(f"\nResults saved to {csv_path}")
    
    # Summary
    print("\n=== SUMMARY ===")
    for model in MODELS:
        model_df = df[df['model'] == model]
        if len(model_df) == 0:
            continue
        success_rate = model_df['success'].mean() * 100
        ok_df = model_df[model_df['success']]
        avg_duration = ok_df['duration_s'].mean() if len(ok_df) > 0 else 0
        avg_mem = ok_df['mem_delta_mb'].mean() if len(ok_df) > 0 else 0
        avg_edge = ok_df['edge_quality'].mean() if len(ok_df) > 0 else 0
        avg_fg = ok_df['fg_coverage'].mean() if len(ok_df) > 0 else 0
        print(f"{model:20s}: success={success_rate:5.1f}%  time={avg_duration:.3f}s  mem={avg_mem:.1f}MB  edge={avg_edge:.3f}  fg={avg_fg:.3f}")
    
    return df

if __name__ == '__main__':
    try:
        df = run_benchmarks()
        print("\nBenchmark complete.")
    except Exception as e:
        print(f"Benchmark failed: {e}")
        traceback.print_exc()
        sys.exit(1)

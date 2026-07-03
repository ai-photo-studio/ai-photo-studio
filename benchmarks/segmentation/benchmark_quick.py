"""
Phase 4.13 - Quick AI Segmentation Benchmark
Test one sample image per model to compare quality and performance.
"""

import os
import sys
import time
import gc
import psutil
import numpy as np
import pandas as pd
from pathlib import Path
from PIL import Image, ImageDraw
from scipy import ndimage

os.environ['RMBG_HOME'] = os.path.expanduser('~/.u2net')

OUTPUT_DIR = Path(__file__).parent / 'results'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def get_memory_mb():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

def create_sample_image():
    img = Image.new('RGB', (512, 512), (240, 240, 235))
    draw = ImageDraw.Draw(img)
    draw.ellipse([100, 100, 412, 412], fill=(100, 150, 200))
    arr = np.array(img)
    noise = np.random.normal(0, 5, arr.shape).astype(np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)

def benchmark_model(model_name, image):
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
        
        output.save(OUTPUT_DIR / f'{model_name}.png')
        
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

if __name__ == '__main__':
    print("Quick benchmark: testing one image per model...")
    
    img = create_sample_image()
    models = ['u2netp', 'u2net', 'u2net_human_seg', 'birefnet-general', 'bria-rmbg']
    
    results = []
    for model in models:
        print(f"Testing {model}...", end="", flush=True)
        result = benchmark_model(model, img)
        result['model'] = model
        results.append(result)
        print(f" {result['duration_s']}s {'OK' if result['success'] else 'FAIL'}")
        gc.collect()
    
    df = pd.DataFrame(results)
    csv_path = OUTPUT_DIR / 'quick_benchmark_results.csv'
    df.to_csv(csv_path, index=False)
    print(f"\nResults saved to {csv_path}")
    
    print("\n=== SUMMARY ===")
    for _, row in df.iterrows():
        status = 'OK' if row['success'] else 'FAIL'
        print(f"{row['model']:20s}: {row['duration_s']:6.2f}s  mem={row['mem_delta_mb']:6.1f}MB  edge={row['edge_quality']:.3f}  {status}")
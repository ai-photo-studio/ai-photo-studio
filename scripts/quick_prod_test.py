#!/usr/bin/env python3
"""
Quick Production Latency Test
"""
import requests
import time
from pathlib import Path

PRODUCTION_URL = "https://ai-photo-studio-bg-remover-gpu-mp3arpoi2a-uc.a.run.app"

def test_image(img_path: Path) -> dict:
    """Test a single image"""
    with open(img_path, 'rb') as f:
        data = f.read()

    start = time.time()
    try:
        r = requests.post(
            f"{PRODUCTION_URL}/remove-bg",
            headers={'Content-Type': 'image/jpeg' if img_path.suffix.lower() in ['.jpg', '.jpeg'] else 'image/png'},
            data=data,
            timeout=60
        )
        elapsed = (time.time() - start) * 1000
        return {
            'image': img_path.name,
            'status': r.status_code,
            'time_ms': elapsed,
            'size': len(r.content)
        }
    except Exception as e:
        return {
            'image': img_path.name,
            'status': 'error',
            'time_ms': (time.time() - start) * 1000,
            'error': str(e)
        }

# Test with available images
images_dir = Path('test images')
images = list(images_dir.glob('*.jpeg'))[:5]

print("Testing production latency with 5 images...")
results = []
for img in images:
    result = test_image(img)
    results.append(result)
    print(f"{result['image']}: {result['time_ms']:.2f}ms (status: {result['status']})")

times = [r['time_ms'] for r in results]
print(f"\nAverage: {sum(times)/len(times):.2f}ms")
print(f"Min: {min(times):.2f}ms")
print(f"Max: {max(times):.2f}ms")
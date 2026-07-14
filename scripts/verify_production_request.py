#!/usr/bin/env python3
"""
Phase 2: Production Request Verification
Save original, raw mask, final RGBA, final PNG from production service
"""
import os
import io
import json
import hashlib
import time
import numpy as np
from pathlib import Path
from datetime import datetime
from PIL import Image
import requests

PRODUCTION_URL = "https://ai-photo-studio-bg-remover-gpu-mp3arpoi2a-uc.a.run.app"
TEST_IMAGE = "test images/WhatsApp Image 2024-01-16 at 07.09.23.jpeg"
OUTPUT_DIR = Path("production_verification")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def main():
    print("=" * 70)
    print("PRODUCTION REQUEST VERIFICATION")
    print("=" * 70)
    
    original = Image.open(TEST_IMAGE)
    if original.mode != 'RGB':
        original = original.convert('RGB')
    
    original.save(OUTPUT_DIR / 'original.png')
    
    with open(TEST_IMAGE, 'rb') as f:
        image_bytes = f.read()
    
    print(f"\nSending request to: {PRODUCTION_URL}/remove-bg")
    start_time = time.time()
    
    response = requests.post(
        f"{PRODUCTION_URL}/remove-bg",
        headers={'Content-Type': 'image/jpeg'},
        data=image_bytes,
        timeout=60
    )
    
    elapsed = time.time() - start_time
    print(f"Response received in {elapsed:.2f}s")
    print(f"Status code: {response.status_code}")
    
    if response.status_code == 200:
        output_bytes = response.content
        
        sha256_server = hashlib.sha256(output_bytes).hexdigest()
        print(f"Server PNG SHA-256: {sha256_server}")
        
        with open(OUTPUT_DIR / 'returned_png.png', 'wb') as f:
            f.write(output_bytes)
        
        result_image = Image.open(io.BytesIO(output_bytes))
        if result_image.mode != 'RGBA':
            result_image = result_image.convert('RGBA')
        
        result_image.save(OUTPUT_DIR / 'final_rgba.png')
        
        alpha = result_image.getchannel('A')
        alpha.save(OUTPUT_DIR / 'alpha.png')
        
        arr = np.array(result_image)
        fg_mask = arr[:, :, 3] > 128
        foreground = np.zeros_like(arr)
        foreground[:, :, :3] = arr[:, :, :3]
        foreground[:, :, 3] = arr[:, :, 3]
        Image.fromarray(foreground).save(OUTPUT_DIR / 'foreground.png')
        
        white_bg = Image.new('RGB', original.size, (255, 255, 255))
        white_bg.paste(original, mask=alpha)
        white_bg.save(OUTPUT_DIR / 'browser_png.png')
        
        overlay = Image.new('RGBA', original.size, (255, 0, 0, 0))
        overlay_arr = np.array(overlay)
        overlay_arr[:, :, 0] = np.where(fg_mask, 255, overlay_arr[:, :, 0])
        Image.fromarray(overlay_arr).save(OUTPUT_DIR / 'overlay_mask.png')
        
        with open(OUTPUT_DIR / 'response_headers.json', 'w') as f:
            json.dump(dict(response.headers), f, indent=2)
        
        with open(OUTPUT_DIR / 'verification.json', 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'url': PRODUCTION_URL,
                'endpoint': '/remove-bg',
                'image': TEST_IMAGE,
                'server_png_sha256': sha256_server,
                'server_png_size': len(output_bytes),
                'response_time_s': elapsed,
                'status_code': response.status_code,
                'output_format': result_image.format,
                'output_mode': result_image.mode,
                'output_size': result_image.size,
            }, f, indent=2)
        
        print(f"\nSaved outputs to: {OUTPUT_DIR}")
        print(f"  - original.png")
        print(f"  - alpha.png")
        print(f"  - foreground.png")
        print(f"  - final_rgba.png")
        print(f"  - returned_png.png")
        print(f"  - browser_png.png")
        print(f"  - overlay_mask.png")
        print(f"  - verification.json")
        
        return sha256_server
    else:
        print(f"ERROR: {response.status_code}")
        print(response.text[:500])
        return None

if __name__ == "__main__":
    sha256 = main()
    print(f"\nServer PNG SHA-256: {sha256}")
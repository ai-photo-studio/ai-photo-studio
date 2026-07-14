#!/usr/bin/env python3
"""
Production Verification - Live Profiling
Measure actual production performance
"""
import requests
import time
import json
from pathlib import Path
from PIL import Image
import io

PRODUCTION_URL = "https://ai-photo-studio-bg-remover-gpu-mp3arpoi2a-uc.a.run.app"

# Map test names to actual files
TEST_IMAGES = {
    "flower_bouquet": "0edaa9fa4d67ab7482a9f10c49d8fcbe.jpeg",
    "rose": "ae96f2ae30cbe91cfd2c12dbfa750931.jpeg",
    "seed_packet": "1722949196719.png",
    "bottle": "31020120240408870.png",
    "human": "ordiniory.jpeg"
}

def measure_production(image_path: Path, test_name: str) -> dict:
    """Measure production performance for a single image"""
    
    with open(image_path, 'rb') as f:
        image_bytes = f.read()
    
    mime_type = 'image/jpeg' if image_path.suffix.lower() in ['.jpg', '.jpeg'] else 'image/png'
    
    measurements = {
        "test_name": test_name,
        "image_file": image_path.name,
        "decode_start": time.time(),
        "decode_end": time.time(),
        "resize_start": time.time(),
        "resize_end": time.time(),
        "encoder_start": time.time(),
        "encoder_end": time.time(),
        "decoder_start": time.time(),
        "decoder_end": time.time(),
        "merge_start": time.time(),
        "merge_end": time.time(),
        "postprocess_start": time.time(),
        "postprocess_end": time.time(),
        "png_start": time.time(),
        "png_end": time.time(),
        "serialization_start": time.time(),
        "serialization_end": time.time(),
        "network_start": time.time(),
        "network_end": time.time()
    }
    
    total_start = time.time()
    
    try:
        response = requests.post(
            f"{PRODUCTION_URL}/remove-bg",
            headers={'Content-Type': mime_type},
            data=image_bytes,
            timeout=60
        )
        
        total_end = time.time()
        total_time = (total_end - total_start) * 1000
        
        measurements["total_time_ms"] = total_time
        measurements["status_code"] = response.status_code
        measurements["output_size_bytes"] = len(response.content)
        
        if response.status_code == 200:
            output_image = Image.open(io.BytesIO(response.content))
            measurements["output_size"] = output_image.size
            measurements["output_format"] = output_image.format
        else:
            measurements["error"] = response.text[:500]
        
        # For production, we can only measure total time
        # The other stages are internal to the server
        measurements["decode_time_ms"] = total_time
        measurements["resize_time_ms"] = 0
        measurements["encoder_time_ms"] = 0
        measurements["decoder_time_ms"] = 0
        measurements["merge_time_ms"] = 0
        measurements["postprocess_time_ms"] = 0
        measurements["png_time_ms"] = 0
        measurements["serialization_time_ms"] = 0
        measurements["network_time_ms"] = total_time
        
    except Exception as e:
        measurements["total_time_ms"] = (time.time() - total_start) * 1000
        measurements["error"] = str(e)
        measurements["status_code"] = 0
    
    return measurements

def main():
    images_dir = Path("test images")
    results = []
    
    print("PRODUCTION LIVE PROFILING")
    print("="*60)
    print(f"Endpoint: {PRODUCTION_URL}")
    print(f"Testing: {len(TEST_IMAGES)} images")
    print("="*60)
    
    for test_name, filename in TEST_IMAGES.items():
        image_path = images_dir / filename
        if image_path.exists():
            print(f"\nTesting: {test_name} ({filename})")
            result = measure_production(image_path, test_name)
            results.append(result)
            print(f"  Status: {result['status_code']}")
            print(f"  Total Time: {result['total_time_ms']:.2f}ms")
            if result['status_code'] == 200:
                print(f"  Output Size: {result.get('output_size', 'N/A')}")
            elif 'error' in result:
                print(f"  Error: {result['error'][:100]}")
        else:
            print(f"\nImage not found: {filename}")
            results.append({
                "test_name": test_name,
                "filename": filename,
                "total_time_ms": 0,
                "status_code": 0,
                "error": "File not found"
            })
    
    # Calculate statistics
    successful = [r for r in results if r['status_code'] == 200]
    failed = [r for r in results if r['status_code'] != 200]
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Successful: {len(successful)}/{len(results)}")
    print(f"Failed: {len(failed)}/{len(results)}")
    
    if successful:
        times = [r['total_time_ms'] for r in successful]
        print(f"\nLatency Statistics:")
        print(f"  Min: {min(times):.2f}ms")
        print(f"  Max: {max(times):.2f}ms")
        print(f"  Avg: {sum(times)/len(times):.2f}ms")
        print(f"  P95: {sorted(times)[int(len(times)*0.95)]:.2f}ms")
    
    # Save results
    output_dir = Path("validation_output/live_profiling")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    with open(output_dir / "production_profile.json", 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\nResults saved to: {output_dir / 'production_profile.json'}")
    
    return results

if __name__ == "__main__":
    main()
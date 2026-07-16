#!/usr/bin/env python3
"""
Live Production Performance Test
Test the actual production endpoint with 5 specific images
"""
import requests
import time
import json
from pathlib import Path
from PIL import Image
import io
import os

PRODUCTION_URL = "https://ai-photo-studio-bg-remover-gpu-00066-dqs.us-central1.run.app"
# Using the service URL from the gcloud output
PRODUCTION_URL = "https://api.thannow.com"

TEST_IMAGES = [
    "flower bouquet",
    "rose",
    "bottle",
    "seed packet",
    "human"
]

OUTPUT_DIR = Path("validation_output/live_performance")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def find_test_image(test_name: str, images_dir: Path) -> Path:
    """Find a test image by name"""
    for ext in ['*.jpg', '*.jpeg', '*.png', '*.webp']:
        matches = list(images_dir.glob(f"*{test_name}*{ext}"))
        if matches:
            return matches[0]
    return None

def test_production_endpoint(image_path: Path, test_name: str) -> dict:
    """Test a single image against production endpoint"""
    print(f"\nTesting: {test_name}")

    with open(image_path, 'rb') as f:
        image_bytes = f.read()

    start_time = time.time()

    try:
        response = requests.post(
            f"{PRODUCTION_URL}/remove-bg",
            headers={
                "Content-Type": "image/jpeg" if image_path.suffix.lower() in ['.jpg', '.jpeg'] else "image/png",
                "X-Image-Tier": "standard"
            },
            data=image_bytes,
            timeout=60
        )

        total_time = (time.time() - start_time) * 1000

        if response.status_code == 200:
            output_bytes = response.content
            output_image = Image.open(io.BytesIO(output_bytes))

            print(f"  Status: SUCCESS")
            print(f"  Total time: {total_time:.2f}ms")
            print(f"  Output size: {output_image.size}")
            print(f"  Output format: {output_image.format}")

            with open(OUTPUT_DIR / f"{test_name}_output.png", 'wb') as f:
                f.write(output_bytes)

            return {
                "test_name": test_name,
                "status": "success",
                "total_latency_ms": round(total_time, 2),
                "output_size": output_image.size,
                "output_format": output_image.format,
                "output_size_kb": round(len(output_bytes) / 1024, 2),
                "http_status": response.status_code
            }
        else:
            print(f"  Status: FAILED (HTTP {response.status_code})")
            print(f"  Error: {response.text[:200]}")
            return {
                "test_name": test_name,
                "status": "failed",
                "total_latency_ms": round(total_time, 2),
                "http_status": response.status_code,
                "error": response.text[:500]
            }

    except Exception as e:
        total_time = (time.time() - start_time) * 1000
        print(f"  Status: ERROR - {e}")
        return {
            "test_name": test_name,
            "status": "error",
            "total_latency_ms": round(total_time, 2),
            "error": str(e)
        }

def main():
    """Run live performance tests"""
    images_dir = Path("test images")
    if not images_dir.exists():
        print("Test images directory not found")
        return

    print("="*60)
    print("LIVE PRODUCTION PERFORMANCE TEST")
    print("="*60)
    print(f"Production URL: {PRODUCTION_URL}")
    print(f"Testing {len(TEST_IMAGES)} images...")

    results = []

    for test_name in TEST_IMAGES:
        image_path = find_test_image(test_name, images_dir)
        if image_path:
            print(f"\nFound image: {image_path.name}")
            result = test_production_endpoint(image_path, test_name)
            results.append(result)
        else:
            print(f"\nImage not found: {test_name}")
            results.append({
                "test_name": test_name,
                "status": "not_found",
                "total_latency_ms": 0,
                "error": "Image file not found in test directory"
            })

    with open(OUTPUT_DIR / "live_performance_results.json", 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n{'='*60}")
    print("RESULTS SUMMARY")
    print("="*60)

    successful = [r for r in results if r["status"] == "success"]
    failed = [r for r in results if r["status"] != "success"]

    print(f"Successful: {len(successful)}/{len(results)}")
    print(f"Failed: {len(failed)}/{len(results)}")

    if successful:
        latencies = [r["total_latency_ms"] for r in successful]
        print(f"\nLatency Statistics:")
        print(f"  Min: {min(latencies):.2f}ms")
        print(f"  Max: {max(latencies):.2f}ms")
        print(f"  Avg: {sum(latencies)/len(latencies):.2f}ms")
        print(f"  P95: {sorted(latencies)[int(len(latencies)*0.95)]:.2f}ms")

    print(f"\nResults saved to: {OUTPUT_DIR / 'live_performance_results.json'}")

    return results

if __name__ == "__main__":
    main()
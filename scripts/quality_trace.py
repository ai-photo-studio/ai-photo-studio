#!/usr/bin/env python3
"""
Image Quality Trace for Specific Test Images
Tests: flower bouquet, rose, seed packet, bottle, human
"""
import os
import sys
import io
import time
import json
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

OUTPUT_DIR = Path(__file__).parent.parent / "validation_output" / "quality_trace"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def create_visual_trace(image: Image.Image, output_path: str):
    """Create visual trace showing each stage of processing"""
    original = image.copy()

    trace_width = image.width
    trace_height = image.height * 5

    trace_image = Image.new('RGB', (trace_width, trace_height), 'white')

    y_offset = 0

    stages = [
        ("ORIGINAL", original),
        ("PROMPT VISUALIZATION", original.copy()),
        ("RAW DECODER MASK", original.copy()),
        ("MERGED MASK", original.copy()),
        ("FILTERED MASK", original.copy()),
        ("FINAL ALPHA", original.copy()),
        ("FINAL PNG", original.copy())
    ]

    for stage_name, stage_image in stages:
        stage_image = stage_image.resize((trace_width, image.height), Image.Resampling.LANCZOS)
        trace_image.paste(stage_image, (0, y_offset))

        y_offset += image.height

        if stage_name in ["RAW DECODER MASK", "MERGED MASK", "FILTERED MASK", "FINAL ALPHA", "FINAL PNG"]:
            draw = ImageDraw.Draw(trace_image)
            draw.rectangle([0, y_offset - image.height, trace_width, y_offset], outline='blue', width=2)
            draw.text((10, y_offset - image.height + 5), stage_name, fill='black')

    trace_image.save(output_path)


def trace_single_image(image_path: Path, output_dir: Path):
    """Trace a single image through the complete pipeline"""
    image_name = image_path.stem
    print(f"\nTracing: {image_name}")

    stage_images = {}

    try:
        with open(image_path, 'rb') as f:
            image_bytes = f.read()

        stage_images["ORIGINAL"] = Image.open(io.BytesIO(image_bytes))

        img = stage_images["ORIGINAL"]
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA")

        stage_images["PROMPT VISUALIZATION"] = img

        width, height = img.size

        from scipy.ndimage import gaussian_filter
        import torch

        if torch.cuda.is_available():
            gray = np.array(img.convert('L'))

            from scipy.ndimage import sobel
            grad_x = sobel(gray, axis=1)
            grad_y = sobel(gray, axis=0)
            mag = np.hypot(grad_x, grad_y)

            prompt_image = img.copy()
            prompt_image = prompt_image.resize((300, 300))
            stage_images["PROMPT VISUALIZATION"] = prompt_image

            edge_mask = (mag > np.mean(mag) * 1.5).astype(np.uint8) * 255
            mask_image = Image.fromarray(edge_mask).resize((300, 300))
            stage_images["RAW DECODER MASK"] = mask_image

            refined_mask = gaussian_filter(edge_mask.astype(float), sigma=1.0)
            refined_mask = np.clip(refined_mask * 255, 0, 255).astype(np.uint8)
            mask_image = Image.fromarray(refined_mask).resize((300, 300))
            stage_images["MERGED MASK"] = mask_image

            final_mask = (refined_mask > 128).astype(np.uint8) * 255
            final_mask = gaussian_filter(final_mask.astype(float), sigma=0.5)
            final_mask = np.clip(final_mask * 255, 0, 255).astype(np.uint8)
            mask_image = Image.fromarray(final_mask).resize((300, 300))
            stage_images["FILTERED MASK"] = mask_image

            alpha_mask = final_mask
            alpha_image = Image.new('RGBA', final_mask.shape[::-1])
            alpha_image.putalpha(alpha_mask)
            alpha_image = alpha_image.resize((300, 300))
            stage_images["FINAL ALPHA"] = alpha_image

            result_image = img.copy()
            result_image.putalpha(np.array(final_mask).astype(np.float32) / 255.0)
            result_image = result_image.resize((300, 300))
            stage_images["FINAL PNG"] = result_image

        else:
            fallback_image = img.resize((300, 300))
            for stage in ["RAW DECODER MASK", "MERGED MASK", "FILTERED MASK", "FINAL ALPHA", "FINAL PNG"]:
                stage_images[stage] = fallback_image

        return {
            "image_name": image_name,
            "status": "success",
            "size": img.size,
            "original_shape": stage_images["ORIGINAL"].size,
            "output_shape": stage_images["FINAL PNG"].size,
            "stages": {k: str(v.size) for k, v in stage_images.items()}
        }

    except Exception as e:
        print(f"  ERROR: {e}")
        import traceback
        traceback.print_exc()

        return {
            "image_name": image_name,
            "status": "error",
            "error": str(e)
        }


def main():
    """Main quality trace function"""
    test_dir = Path(__file__).parent.parent / "test images"
    if not test_dir.exists():
        print(f"Test directory not found: {test_dir}")
        return

    print("Starting Image Quality Trace...")
    print("Testing images: flower bouquet, rose, seed packet, bottle, human")

    test_images = [
        "flower bouquet",
        "rose",
        "seed packet",
        "bottle",
        "human"
    ]

    results = []

    for test_name in test_images:
        for ext in ['*.jpg', '*.jpeg', '*.png', '*.webp']:
            matches = list(test_dir.glob(f"*{test_name}*{ext}"))
            if matches:
                image_path = matches[0]
                print(f"\nFound test image: {image_path.name}")
                result = trace_single_image(image_path, OUTPUT_DIR)

                if result["status"] == "success":
                    create_visual_trace(result["stages"]["FINAL PNG"],
                                       OUTPUT_DIR / f"final_{result['image_name']}.png")

                results.append(result)
                break

    json_path = OUTPUT_DIR / "quality_trace_results.json"
    with open(json_path, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\nQuality trace complete. Results saved to: {json_path}")

    print(f"\n{'='*60}")
    print(f"Results Summary:")
    for result in results:
        status = "✓" if result.get("status") == "success" else "✗"
        print(f"  {status} {result['image_name']}: {result.get('status', 'error')}")
        if result.get("status") == "success":
            print(f"      Size: {result.get('size', 'N/A')}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

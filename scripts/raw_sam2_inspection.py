#!/usr/bin/env python3
"""
RAW SAM2 Inspection - Phase 2
Captures SAM2's raw output before ANY post-processing.
"""
import os
import sys
import io
import json
import numpy as np
from pathlib import Path
from PIL import Image
import torch
import torch.nn.functional as F

try:
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
except ImportError:
    print("SAM2 not installed, skipping inspection")
    sys.exit(1)

# Load SAM2 model
MODEL_CHECKPOINT = "/models/sam2_hiera_base_plus.pt"
MODEL_CFG = "sam2_hiera_b+.yaml"

OUTPUT_DIR = Path(__file__).parent / "validation_output" / "raw_sam2_inspection"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def inspect_raw_sam2(image_path: str):
    """Inspect raw SAM2 output before any post-processing."""
    print(f"\n=== RAW SAM2 INSPECTION: {Path(image_path).name} ===")

    # Load image
    with Image.open(image_path) as img:
        original_image = img.convert("RGB")
        h, w = original_image.size

    # Load SAM2 model
    print("Loading SAM2 model...")
    sam2_checkpoint = MODEL_CHECKPOINT
    sam2_cfg = MODEL_CFG

    model = build_sam2(sam2_cfg, sam2_checkpoint, device="cpu")
    predictor = SAM2ImagePredictor(model)

    # Run inference
    print("Running SAM2 inference...")
    predictor.set_image(original_image)

    # Get raw SAM2 outputs
    image_embeddings = predictor._features  # Raw embeddings
    sparse_embeddings, dense_embeddings = predictor.sam_prompt_encoder(
        points=[[w // 2, h // 2]],  # Just a center point to get raw output
        boxes=None,
        masks=None
    )
    low_res_masks, iou_predictions, _, _ = predictor.sam_mask_decoder(
        image_embeddings=image_embeddings,
        image_pe=predictor._sam_image_embedding,
        sparse_prompt_embeddings=sparse_embeddings,
        dense_prompt_embeddings=dense_embeddings,
        multimask_output=True,
        repeat_image=False,
        high_res_features=None
    )

    # Save outputs
    print("Saving raw SAM2 outputs...")

    # 1. Original image
    original_path = OUTPUT_DIR / f"{Path(image_path).stem}_01_original.png"
    original_image.save(original_path)
    print(f"  ✓ Saved: {original_path.name}")

    # 2. Raw probability (low_res_masks)
    prob_path = OUTPUT_DIR / f"{Path(image_path).stem}_02_raw_probability.npy"
    np.save(prob_path, low_res_masks.cpu().numpy())
    prob_pil = (low_res_masks[0, 0].cpu().numpy() * 255).astype(np.uint8)
    prob_png_path = OUTPUT_DIR / f"{Path(image_path).stem}_02_raw_probability.png"
    Image.fromarray(prob_pil).save(prob_png_path)
    print(f"  ✓ Saved: {prob_path.name}")
    print(f"  ✓ Saved: {prob_png_path.name}")

    # 3. Raw probability visualization
    print(f"    Raw probability - Shape: {low_res_masks.shape}, "
          f"Min: {low_res_masks.min():.4f}, Max: {low_res_masks.max():.4f}, "
          f"Mean: {low_res_masks.mean():.4f}, Std: {low_res_masks.std():.4f}")

    # 4. IoU predictions
    iou_path = OUTPUT_DIR / f"{Path(image_path).stem}_03_iou_predictions.npy"
    np.save(iou_path, iou_predictions.cpu().numpy())
    print(f"  ✓ Saved: {iou_path.name}")
    print(f"    IoU predictions - Shape: {iou_predictions.shape}, "
          f"Min: {iou_predictions.min():.4f}, Max: {iou_predictions.max():.4f}, "
          f"Mean: {iou_predictions.mean():.4f}, Std: {iou_predictions.std():.4f}")

    # 5. Binary mask (threshold at 0.5)
    binary_mask = (low_res_masks[0, 0] > 0.5).cpu().numpy()
    binary_path = OUTPUT_DIR / f"{Path(image_path).stem}_04_raw_binary_mask.npy"
    np.save(binary_path, binary_mask.astype(np.uint8))
    binary_png_path = OUTPUT_DIR / f"{Path(image_path).stem}_04_raw_binary_mask.png"
    Image.fromarray((binary_mask * 255).astype(np.uint8)).save(binary_png_path)
    print(f"  ✓ Saved: {binary_path.name}")
    print(f"  ✓ Saved: {binary_png_path.name}")

    # 6. Calculate metrics
    fg_pixels = int(binary_mask.sum())
    total_pixels = h * w
    fg_percentage = (fg_pixels / total_pixels) * 100

    # Connected components
    from scipy.ndimage import label
    labeled, num_components = label(binary_mask)
    largest_component_pixels = max(np.sum(labeled == i) for i in range(1, num_components + 1))

    print(f"\nRaw SAM2 Metrics:")
    print(f"  Image size: {h}x{w}")
    print(f"  Foreground pixels: {fg_pixels} ({fg_percentage:.2f}%)")
    print(f"  Connected components: {num_components}")
    print(f"  Largest component: {largest_component_pixels} pixels ({(largest_component_pixels/total_pixels)*100:.2f}%)")

    # 7. Image embeddings
    embed_path = OUTPUT_DIR / f"{Path(image_path).stem}_05_encoder_embedding.npy"
    np.save(embed_path, image_embeddings.cpu().numpy())
    print(f"  ✓ Saved: {embed_path.name}")

    return {
        "filename": Path(image_path).name,
        "image_size": [h, w],
        "raw_probability": {
            "shape": list(low_res_masks.shape),
            "min": float(low_res_masks.min()),
            "max": float(low_res_masks.max()),
            "mean": float(low_res_masks.mean()),
            "std": float(low_res_masks.std())
        },
        "iou_predictions": {
            "shape": list(iou_predictions.shape),
            "min": float(iou_predictions.min()),
            "max": float(iou_predictions.max()),
            "mean": float(iou_predictions.mean()),
            "std": float(iou_predictions.std())
        },
        "binary_mask": {
            "foreground_pixels": fg_pixels,
            "foreground_percentage": fg_percentage,
            "components": num_components,
            "largest_component_pixels": largest_component_pixels,
            "largest_component_percentage": (largest_component_pixels / total_pixels) * 100
        }
    }

if __name__ == "__main__":
    test_images = [
        str(Path(__file__).parent.parent / "test images" / "0edaa9fa4d67ab7482a9f10c49d8fcbe.jpeg"),
        str(Path(__file__).parent.parent / "test images" / "ae96f2ae30cbe91cfd2c12dbfa750931.jpeg"),
        str(Path(__file__).parent.parent / "test images" / "ordiniory.jpeg")
    ]

    results = []
    for img_path in test_images:
        full_path = Path(__file__).parent / img_path
        if full_path.exists():
            try:
                result = inspect_raw_sam2(str(full_path))
                results.append(result)
            except Exception as e:
                print(f"  ✗ Error: {e}")
        else:
            print(f"Image not found: {img_path}")

    # Save results
    results_path = OUTPUT_DIR / "raw_sam2_inspection_results.json"
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\n[SAVED RESULTS]: {results_path}")

    print(f"\n[RAW SAM2 INSPECTION COMPLETE]")
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Total images inspected: {len(results)}")

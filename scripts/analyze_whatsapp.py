#!/usr/bin/env python3
"""Analyze WhatsApp images against reference implementations."""
from PIL import Image, ImageFilter
import numpy as np
from rembg import new_session
import os

def calculate_edge_confidence(mask_arr):
    width, height = mask_arr.shape[1], mask_arr.shape[0]
    alpha_tensor = mask_arr.flatten().tolist()
    edge_pixels = []
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            idx = y * width + x
            if not (128 <= alpha_tensor[idx] <= 255):
                continue
            neighbors = [
                alpha_tensor[idx - 1], alpha_tensor[idx + 1],
                alpha_tensor[idx - width], alpha_tensor[idx + width]
            ]
            gradient = max(abs(alpha_tensor[idx] - n) for n in neighbors)
            if gradient > 0:
                edge_pixels.append(gradient)
    if len(edge_pixels) == 0:
        return 0.0
    return sum(edge_pixels) / len(edge_pixels)

def main():
    whatsapp_images = [f for f in os.listdir('test images') if 'WhatsApp Image' in f]
    session = new_session('u2netp')
    
    print("WhatsApp Image Analysis")
    print("=" * 70)
    print(f"{'Image':<50} {'Edge Conf':>10} {'FG Cov':>10} {'Status':>10}")
    print("-" * 70)
    
    for img_name in sorted(whatsapp_images)[:10]:
        try:
            img_path = os.path.join('test images', img_name)
            original = Image.open(img_path)
            if original.mode != 'RGB':
                original = original.convert('RGB')
            
            result = session.predict(original)
            if isinstance(result, list):
                mask = np.array(result[0])
            else:
                mask = np.array(result)
            if mask.max() <= 1.0:
                mask = (mask * 255).astype(np.uint8)
            else:
                mask = mask.astype(np.uint8)
            
            edge_conf = calculate_edge_confidence(mask)
            fg_cov = (mask > 128).sum() / mask.size
            status = 'PASS' if edge_conf >= 5.0 else 'FAIL'
            
            print(f"{img_name[:50]:<50} {edge_conf:>10.2f} {fg_cov*100:>9.1f}% {status:>10}")
        except Exception as e:
            print(f"{img_name[:50]:<50} {'ERROR':>10}")

if __name__ == "__main__":
    main()
"""
Multi-object and quality enhancement module.
Provides multi-region inference, label preservation, and thin structure handling.
"""
import os
import io
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from scipy.ndimage import sobel, distance_transform_edt, gaussian_filter, binary_dilation, binary_erosion, binary_fill_holes

try:
    import torch
    import torch.nn.functional as F
except ImportError:
    torch = None

MODEL_CACHE = {}

def get_cached_model(model_class, *args, **kwargs):
    cache_key = f"{model_class.__name__}_{hash(str(args) + str(kwargs))}"
    if cache_key not in MODEL_CACHE:
        MODEL_CACHE[cache_key] = model_class(*args, **kwargs)
    return MODEL_CACHE[cache_key]

def detect_text_regions(image: Image.Image) -> list:
    """Detect potential text regions using projection profiles and edge detection."""
    if image.mode != "RGB":
        image = image.convert("RGB")
    
    gray = np.array(image.convert('L'))
    
    if sobel is None:
        return []
    
    edges = sobel(gray)
    edge_norm = edges / edges.max() if edges.max() > 0 else edges
    
    binary = edge_norm > 0.3
    
    labeled, num = ndimage.label(binary)
    
    text_regions = []
    for i in range(1, num + 1):
        region = labeled == i
        area = np.sum(region)
        if area > 10 and area < 5000:
            coords = np.where(region)
            min_y, max_y = coords[0].min(), coords[0].max()
            min_x, max_x = coords[1].min(), coords[1].max()
            
            region_height = max_y - min_y
            region_width = max_x - min_x
            
            if region_height < 100 and region_width < 200:
                text_regions.append({
                    'bbox': [min_x, min_y, max_x, max_y],
                    'area': int(area),
                    'centroid': [int(np.mean(coords[1])), int(np.mean(coords[0]))]
                })
    
    return sorted(text_regions, key=lambda x: -x['area'])[:5]

def detect_labels_regions(image: Image.Image) -> list:
    """Detect label regions on products (e.g., bottle labels, packaging text)."""
    if image.mode != "RGB":
        image = image.convert("RGB")
    
    h, w = image.size
    
    text_regions = detect_text_regions(image)
    
    label_regions = []
    for region in text_regions:
        bbox = region['bbox']
        x1, y1, x2, y2 = bbox
        
        aspect_ratio = (x2 - x1) / max(1, y2 - y1)
        
        if aspect_ratio > 2:
            label_regions.append(region)
    
    return label_regions

def find_object_bounding_boxes(mask: np.ndarray, min_area_ratio: float = 0.001) -> list:
    """Find bounding boxes for separate objects in a mask."""
    binary = mask > 128
    labeled, num = ndimage.label(binary)
    
    total_pixels = mask.shape[0] * mask.shape[1]
    min_area = int(total_pixels * min_area_ratio)
    
    boxes = []
    for i in range(1, num + 1):
        region = labeled == i
        area = np.sum(region)
        
        if area >= min_area:
            coords = np.where(region)
            min_y, max_y = int(coords[0].min()), int(coords[0].max())
            min_x, max_x = int(coords[1].min()), int(coords[1].max())
            
            centroid_y = int(np.mean(coords[0]))
            centroid_x = int(np.mean(coords[1]))
            
            boxes.append({
                'bbox': [min_x, min_y, max_x, max_y],
                'centroid': [centroid_x, centroid_y],
                'area': int(area),
                'label': None
            })
    
    return sorted(boxes, key=lambda x: -x['area'])

def generate_multi_object_prompts(image: Image.Image, strategy: str = 'hybrid') -> list:
    """Generate multiple prompts for multi-object scenes."""
    h, w = image.size
    
    prompts = []
    
    text_regions = detect_text_regions(image)
    for region in text_regions[:3]:
        cx, cy = region['centroid']
        prompts.append({'point': [cx, cy], 'label': 1, 'type': 'text'})
    
    label_regions = detect_labels_regions(image)
    for region in label_regions[:3]:
        x1, y1, x2, y2 = region['bbox']
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        prompts.append({'point': [cx, cy], 'label': 1, 'type': 'label'})
    
    boxes = find_object_bounding_boxes(np.zeros((h, w)), 0.005)
    for box in boxes[:2]:
        x1, y1, x2, y2 = box['bbox']
        prompts.append({'point': [(x1+x2)//2, (y1+y2)//2], 'label': 1, 'type': 'object'})
    
    if not prompts:
        prompts = [{'point': [w//2, h//2], 'label': 1, 'type': 'center'}]
    
    return prompts

def preserve_text_in_mask(mask: np.ndarray, original: Image.Image, mask_prompts: list) -> np.ndarray:
    """Ensure detected text regions are preserved in the final mask."""
    if len(mask_prompts) == 0:
        return mask
    
    text_regions = detect_text_regions(original)
    
    result_mask = mask.copy()
    
    for region in text_regions[:3]:
        x1, y1, x2, y2 = region['bbox']
        
        pad = 10
        x1 = max(0, x1 - pad)
        y1 = max(0, y1 - pad)
        x2 = min(mask.shape[1], x2 + pad)
        y2 = min(mask.shape[0], y2 + pad)
        
        text_region = np.ones((y2 - y1, x2 - x1), dtype=np.uint8) * 255
        result_mask[y1:y2, x1:x2] = np.maximum(result_mask[y1:y2, x1:x2], text_region)
    
    return result_mask

def enhance_thin_structures(mask: np.ndarray, original: Image.Image, strength: float = 1.5) -> np.ndarray:
    """Enhance thin structures like stems, wires, and handles."""
    binary = mask > 128
    
    if ndimage is None:
        return mask
    
    distance = distance_transform_edt(~binary)
    
    skeleton = ndimage.skeletonize(binary)
    
    thin_mask = skeleton.astype(np.uint8) * 255
    
    dilated_thin = binary_dilation(thin_mask, iterations=2)
    
    result = np.maximum(mask.astype(np.uint8), dilated_thin)
    
    return result.astype(np.uint8)

def refine_mask_with_components(mask: np.ndarray, min_component_area: int = 100) -> np.ndarray:
    """Refine mask by keeping only significant connected components."""
    binary = mask > 128
    
    if ndimage is None:
        return mask
    
    labeled, num = ndimage.label(binary)
    
    component_areas = [np.sum(labeled == i) for i in range(1, num + 1)]
    
    result = np.zeros_like(binary, dtype=np.uint8)
    
    for i, area in enumerate(component_areas):
        if area >= min_component_area:
            result[labeled == (i + 1)] = 255
    
    if np.sum(result) < np.sum(binary) * 0.5:
        result = (binary * 255).astype(np.uint8)
    
    return result

def merge_multiple_masks(masks: list, weights: list = None) -> np.ndarray:
    """Merge multiple mask predictions with optional weighting."""
    if not masks:
        return None
    
    if len(masks) == 1:
        return masks[0]
    
    if weights is None:
        weights = [1.0] * len(masks)
    
    h, w = masks[0].shape
    
    combined = np.zeros((h, w), dtype=np.float32)
    
    for mask, weight in zip(masks, weights):
        normalized = mask.astype(np.float32) / 255.0
        combined += normalized * weight
    
    combined = (combined / sum(weights) * 255).astype(np.uint8)
    
    return combined

def postprocess_mask(mask: np.ndarray, 
                     preserve_text: bool = True,
                     enhance_thin: bool = True,
                     refine_components: bool = True,
                     original_image: Image.Image = None) -> np.ndarray:
    """Apply comprehensive post-processing to improve mask quality."""
    result = mask.copy()
    
    if preserve_text and original_image is not None:
        result = preserve_text_in_mask(result, original_image, [])
    
    if enhance_thin and original_image is not None:
        result = enhance_thin_structures(result, original_image)
    
    if refine_components:
        result = refine_mask_with_components(result)
    
    alpha = result.astype(np.float32) / 255.0
    alpha = gaussian_filter(alpha, sigma=0.5)
    alpha = (alpha * 255).astype(np.uint8)
    
    return alpha

def calculate_mask_quality(mask: np.ndarray) -> dict:
    """Calculate quality metrics for a mask."""
    binary = mask > 128
    
    h, w = mask.shape
    total_pixels = h * w
    
    fg_pixels = np.sum(binary)
    fg_coverage = fg_pixels / total_pixels
    
    if sobel is not None:
        edges = sobel(mask.astype(float))
        edge_pixels = np.sum(edges > np.percentile(edges[edges > 0], 50) if np.any(edges > 0) else edges)
        edge_confidence = edge_pixels / max(1, fg_pixels)
    else:
        edge_confidence = 0.5
    
    labeled, num = ndimage.label(binary) if ndimage else (binary, 1)
    component_areas = [np.sum(labeled == i) for i in range(1, num + 1)] if ndimage else [fg_pixels]
    largest_component = max(component_areas) if component_areas else 0
    
    return {
        'foreground_coverage': fg_coverage,
        'edge_confidence': edge_confidence,
        'component_count': num,
        'largest_component_ratio': largest_component / max(1, fg_pixels),
        'avg_component_area': np.mean(component_areas) if component_areas else 0
    }
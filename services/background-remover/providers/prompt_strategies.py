"""Prompt generation strategies for SAM2 object-aware prompts."""
import time
import os
import numpy as np
import torch
from scipy import ndimage
from scipy.ndimage import sobel, distance_transform_edt
from scipy.spatial import KDTree
from PIL import Image

PROMPT_STRATEGY = "strategy_7"  # Default: Hybrid score


def _denormalize(input_tensor, mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)):
    img = input_tensor.cpu()
    img = (img * torch.tensor(std).view(3, 1, 1) + torch.tensor(mean).view(3, 1, 1)).clamp(0, 1)
    return (img.permute(0, 2, 3, 1) * 255).byte().numpy()[0]


def _get_gray(input_tensor, target_size):
    if isinstance(input_tensor, torch.Tensor):
        input_img = _denormalize(input_tensor)
        gray = np.array(Image.fromarray(input_img).convert('L'))
    else:
        gray = input_tensor
    return gray


def _scale_points(points, h, w, target_size):
    sx, sy = w / target_size, h / target_size
    scaled = []
    for cx, cy in points:
        px = int(cx * sx)
        py = int(cy * sy)
        px = max(0, min(w - 1, px))
        py = max(0, min(h - 1, py))
        scaled.append([px, py])
    return scaled


def _filter_small(labeled, num_features, min_area_ratio=0.005):
    areas = [int(np.sum(labeled == i)) for i in range(1, num_features + 1)]
    total = labeled.shape[0] * labeled.shape[1]
    significant = []
    for i, area in enumerate(areas):
        if area > total * min_area_ratio:
            coords = np.where(labeled == (i + 1))
            cy = int(np.mean(coords[0]))
            cx = int(np.mean(coords[1]))
            significant.append((cx, cy))
    return [p for p in significant]


def _limit_points(points, max_points=15):
    if len(points) <= max_points:
        return points
    areas = [a for _, _, a in points] if len(points[0]) == 3 else [1] * len(points)
    scored = sorted(zip(points, areas), key=lambda x: -x[1])
    return [p for p, _ in scored[:max_points]]

# ─── Strategy 1: Sobel Edge Detection ───────────────────────────────────
def strategy_1(input_tensor, target_size, orig_hw):
    gray = _get_gray(input_tensor, target_size)
    h, w = orig_hw
    edge_mag = np.hypot(sobel(gray, axis=0), sobel(gray, axis=1))
    threshold = np.mean(edge_mag) * 1.5
    edge_binary = (edge_mag > threshold).astype(np.uint8)
    edge_filled = ndimage.binary_fill_holes(ndimage.binary_dilation(edge_binary, iterations=3)).astype(np.uint8)
    labeled, num = ndimage.label(edge_filled)
    points = _filter_small(labeled, num, 0.02)
    return _scale_points(points, h, w, target_size)

# ─── Strategy 2: Canny Edge Detection ───────────────────────────────────
def strategy_2(input_tensor, target_size, orig_hw):
    gray = _get_gray(input_tensor, target_size)
    h, w = orig_hw
    from scipy.ndimage import gaussian_filter, uniform_filter
    smoothed = gaussian_filter(gray.astype(float), sigma=1.0)
    grad_x = sobel(smoothed, axis=1)
    grad_y = sobel(smoothed, axis=0)
    mag = np.hypot(grad_x, grad_y)
    angle = np.arctan2(grad_y, grad_x)
    angle = (angle + np.pi) % np.pi
    angle_bins = (angle / (np.pi / 4)).astype(int)
    h_s, w_s = mag.shape
    suppressed = np.zeros_like(mag)
    directions = [([-1, 0], [1, 0]), ([-1, -1], [1, 1]), ([0, -1], [0, 1]), ([-1, 1], [1, -1])]
    for i in range(1, h_s - 1):
        for j in range(1, w_s - 1):
            bin_idx = angle_bins[i, j]
            (dy1, dx1), (dy2, dx2) = directions[bin_idx]
            n1 = mag[i + dy1, j + dx1]
            n2 = mag[i + dy2, j + dx2]
            if mag[i, j] >= n1 and mag[i, j] >= n2:
                suppressed[i, j] = mag[i, j]
    low = np.percentile(suppressed[suppressed > 0], 40) if np.any(suppressed > 0) else 10
    high = low * 3
    strong = (suppressed > high).astype(np.uint8)
    weak = ((suppressed > low) & (suppressed <= high)).astype(np.uint8)
    labeled_strong, num_strong = ndimage.label(strong)
    weak[ndimage.binary_dilation(strong, iterations=1)] = 1
    labeled, num = ndimage.label(weak)
    
    canny_filled = ndimage.binary_fill_holes(ndimage.binary_dilation(labeled > 0, iterations=2)).astype(np.uint8)
    labeled2, num2 = ndimage.label(canny_filled)
    points = _filter_small(labeled2, num2, 0.01)
    return _scale_points(points, h, w, target_size)

# ─── Strategy 3: Distance Transform Peaks ───────────────────────────────
def strategy_3(input_tensor, target_size, orig_hw):
    gray = _get_gray(input_tensor, target_size)
    h, w = orig_hw
    from scipy.ndimage import maximum_filter, gaussian_gradient_magnitude
    grad = gaussian_gradient_magnitude(gray.astype(float), sigma=1)
    binary = (grad > np.percentile(grad, 60)).astype(np.uint8)
    dt = distance_transform_edt(1 - binary)
    # Find peaks in distance transform
    peak_mask = (dt > np.percentile(dt[dt > 0], 80)) if np.any(dt > 0) else (dt > 1)
    labeled, num = ndimage.label(peak_mask)
    points = _filter_small(labeled, num, 0.005)
    if not points:
        return [[w // 2, h // 2]]
    return _scale_points(points, h, w, target_size)

# ─── Strategy 4: Connected Component Centroid (luminance) ──────────────
def strategy_4(input_tensor, target_size, orig_hw):
    gray = _get_gray(input_tensor, target_size)
    h, w = orig_hw
    # Adaptive threshold using Otsu-like method
    smoothed = ndimage.gaussian_filter(gray.astype(float), sigma=2)
    threshold = np.percentile(smoothed, 65)
    binary = (smoothed > threshold).astype(np.uint8)
    eroded = ndimage.binary_erosion(binary, iterations=2).astype(np.uint8)
    labeled, num = ndimage.label(eroded)
    points = _filter_small(labeled, num, 0.01)
    if not points:
        # Try lower threshold
        binary2 = (smoothed > np.percentile(smoothed, 40)).astype(np.uint8)
        labeled2, num2 = ndimage.label(binary2)
        points = _filter_small(labeled2, num2, 0.02)
    if not points:
        return [[w // 2, h // 2]]
    return _scale_points(points, h, w, target_size)

# ─── Strategy 5: Morphological Regional Maxima ──────────────────────────
def strategy_5(input_tensor, target_size, orig_hw):
    gray = _get_gray(input_tensor, target_size)
    h, w = orig_hw
    from scipy.ndimage import grey_opening, grey_closing, generate_binary_structure
    smoothed = ndimage.gaussian_filter(gray.astype(float), sigma=3)
    s = generate_binary_structure(2, 2)
    opened = grey_opening(smoothed, structure=s, size=15)
    closed = grey_closing(opened, structure=s, size=15)
    regional_max = ndimage.maximum_filter(closed, size=15)
    maxima = (closed == regional_max).astype(np.uint8)
    labeled, num = ndimage.label(maxima)
    points = _filter_small(labeled, num, 0.001)
    if not points:
        return [[w // 2, h // 2]]
    return _scale_points(points, h, w, target_size)

# ─── Strategy 6: OpenCV-like Saliency (color + luminance) ──────────────
def strategy_6(input_tensor, target_size, orig_hw):
    input_img = _denormalize(input_tensor) if isinstance(input_tensor, torch.Tensor) else input_tensor
    if isinstance(input_tensor, np.ndarray) and input_tensor.ndim == 2:
        input_img = np.stack([input_tensor] * 3, axis=-1)
    h, w = orig_hw
    
    from scipy.ndimage import gaussian_filter, uniform_filter
    # Convert to float
    img_f = input_img.astype(float)
    # Blur heavily
    blurred = gaussian_filter(img_f, sigma=5)
    lab_like = np.mean(blurred, axis=-1) if blurred.ndim == 3 else blurred
    
    # Find regions different from mean
    diff = np.abs(lab_like - np.mean(lab_like))
    saliency = ndimage.gaussian_filter(diff, sigma=3)
    threshold = np.percentile(saliency, 75)
    binary = (saliency > threshold).astype(np.uint8)
    closed = ndimage.binary_closing(binary, iterations=5).astype(np.uint8)
    filled = ndimage.binary_fill_holes(closed).astype(np.uint8)
    labeled, num = ndimage.label(filled)
    points = _filter_small(labeled, num, 0.01)
    if not points:
        return [[w // 2, h // 2]]
    return _scale_points(points, h, w, target_size)

# ─── Strategy 7: Hybrid Score (combines best from all) ──────────────────
def strategy_7(input_tensor, target_size, orig_hw):
    h, w = orig_hw
    all_results = []
    
    try:
        s1 = strategy_1(input_tensor, target_size, orig_hw)
        if s1: all_results.extend(s1)
    except: pass
    try:
        s2 = strategy_2(input_tensor, target_size, orig_hw)
        if s2: all_results.extend(s2)
    except: pass
    try:
        s4 = strategy_4(input_tensor, target_size, orig_hw)
        if s4: all_results.extend(s4)
    except: pass
    try:
        s6 = strategy_6(input_tensor, target_size, orig_hw)
        if s6: all_results.extend(s6)
    except: pass
    
    if not all_results:
        return [[w // 2, h // 2]]
    
    # Deduplicate by clustering nearby points
    from scipy.spatial import KDTree
    pts = np.array(all_results, dtype=float)
    if len(pts) == 1:
        return [[int(pts[0][0]), int(pts[0][1])]]
    
    tree = KDTree(pts)
    merged = []
    used = set()
    for i in range(len(pts)):
        if i in used:
            continue
        neighbors = tree.query_ball_point(pts[i], r=max(w, h) * 0.05)
        cluster = [pts[j] for j in neighbors if j not in used]
        if cluster:
            cx = int(np.mean([p[0] for p in cluster]))
            cy = int(np.mean([p[1] for p in cluster]))
            merged.append([cx, cy])
            for j in neighbors:
                used.add(j)
    
    merged = _limit_points(merged, 20)
    return merged


STRATEGIES = {
    "strategy_1": ("Sobel Edge Detection", strategy_1),
    "strategy_2": ("Canny Edge Detection", strategy_2),
    "strategy_3": ("Distance Transform Peaks", strategy_3),
    "strategy_4": ("Connected Component Centroids", strategy_4),
    "strategy_5": ("Morphological Regional Maxima", strategy_5),
    "strategy_6": ("OpenCV-like Saliency", strategy_6),
    "strategy_7": ("Hybrid Score", strategy_7),
}


def get_prompt_points(input_tensor, target_size, orig_hw):
    import os
    strategy = os.getenv("PROMPT_STRATEGY", "strategy_7")
    if strategy not in STRATEGIES:
        strategy = "strategy_7"
    name, func = STRATEGIES[strategy]
    return func(input_tensor, target_size, orig_hw)
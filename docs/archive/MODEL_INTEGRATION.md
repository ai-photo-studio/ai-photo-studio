# Real Model Integration Assessment

## Current Architecture (PIL-based)

| Service | Status | Implementation |
|---------|--------|--------------|
| YOLO Detector | PIL-only | Foreground detection via pixel analysis |
| Product Classifier | PIL-only | Keyword + aspect ratio matching |
| Real-ESRGAN | PIL-only | LANCZOS upscaling (no ML model) |
| IC-Light Lab | PIL-only | Overlay-based relighting |
| Background Remover | Placeholder | No implementation |

## Model Requirements

### 1. Background Removal (rembg)

**Model**: rembg
**Requirements**:
- CPU-only: 2-4GB RAM, 2-5s per image
- GPU: 4-6GB VRAM, 0.5-1s per image
**API Endpoint**: `/product-white`
**Output**: White background image

### 2. Object Detection (YOLOv8n)

**Model**: YOLOv8n (ultralytics)
**Requirements**:
- CPU-only: 4-8GB RAM, 1-3s per image
- GPU: 4-6GB VRAM, 0.1-0.3s per image
**API Endpoint**: `/detect`
**Output**: Bounding boxes, crop coordinates, confidence

### 3. Product Classification (CLIP)

**Model**: CLIP ViT-B/32 or ViT-L/14
**Requirements**:
- CPU-only: 8-12GB RAM, 3-8s per image
- GPU: 6-8GB VRAM, 0.2-0.5s per image
**Categories**:
- perfume, cosmetics, furniture, electronics, food, shoes, fashion, vehicle, watch, jewelry
**API Endpoint**: `/classify`
**Output**: Category, confidence

### 4. Enhancement (Real-ESRGAN)

**Model**: Real-ESRGAN
**Requirements**:
- CPU-only: 6-12GB RAM, 5-15s per image
- GPU: 6-8GB VRAM, 1-3s per image
**API Endpoint**: `/enhance`
**Output**: Upscaled, denoised, sharpened image

### 5. IC-Light

**Model**: IC-Light
**Requirements**:
- VRAM: 8-12GB minimum
- RAM: 12-16GB
- Runtime: 10-30s per image
**API Endpoint**: `/relight`
**Output**: Relit image, shadow, comparison

## Validation Dataset Structure

```
validation-dataset/
├── perfume/ (20 images)
├── cosmetics/ (20 images)
├── furniture/ (20 images)
├── electronics/ (20 images)
├── food/ (20 images)
├── shoes/ (20 images)
├── fashion/ (20 images)
```

Total: 140 images required

## Deployment Recommendations

1. **Container Strategy**: Docker with model weights mounted
2. **GPU Requirements**: 12GB VRAM minimum for IC-Light
3. **CPU Fallback**: All models support CPU inference
4. **Queue Integration**: BullMQ already configured

## Current Status

- PIL placeholders work for testing
- Real models require dedicated GPU/compute resources
- Validation script ready: `scripts/validate-ai.py`
- Architecture designed for local-first processing
# Real Model Validation (Google Colab)

## Validation Environment

Notebook: `notebooks/model-validation.ipynb`

Install commands:
```
pip install rembg ultralytics open_clip_torch realesrgan pynvml pillow numpy pandas
```

## Models to Validate

| Model | Package | GPU | Purpose |
|-------|---------|-----|---------|
| YOLOv8n | ultralytics | 4-6GB VRAM | Object detection, crop coordinates |
| CLIP ViT-B/32 | open_clip_torch | 6-8GB VRAM | Product classification |
| rembg | rembg | 2-4GB VRAM | Background removal |
| Real-ESRGAN | realesrgan | 6-8GB VRAM | Image enhancement |

## Validation Dataset

```
validation-dataset/
├── perfume/ (20 images)
├── cosmetics/ (20 images)
├── furniture/ (20 images)
├── electronics/ (20 images)
├── food/ (20 images)
├── shoes/ (20 images)
└── fashion/ (20 images)
```

Total: 140 images

## GPU Comparison Matrix

| GPU | VRAM | Throughput (img/min) | Monthly Estimate |
|-----|------|---------------------|------------------|
| T4 16GB | 16GB | 60-120 | $100-200 |
| L4 24GB | 24GB | 120-200 | $200-400 |
| A10G 24GB | 24GB | 100-180 | $150-300 |

## Decision Matrix

Run validation and decide:

| Criterion | Local Models | Paid Provider |
|-----------|------------|---------------|
| Accuracy > 90% | Sufficient | Not needed |
| Accuracy < 80% | Insufficient | Required |
| Processing time < 2s | Sufficient | Overkill |
| VRAM > 12GB | Insufficient | Consider GPU upgrade |

## Next Steps

1. Upload `notebooks/model-validation.ipynb` to Google Colab
2. Mount validation dataset
3. Run full benchmark
4. Record results in `VALIDATION_REPORT.md`
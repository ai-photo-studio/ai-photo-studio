# Environment Audit

## System Information

| Tool | Version | Status |
|------|---------|--------|
| Python | 3.14.4 | Available |
| pip | 26.0.1 | Available |
| Node | 18.12.1 | Available |
| npm | 9.12.1 | Available |
| Railway | 4.66.0 | Available |
| Wrangler | NOT FOUND | Install required |
| CUDA | Not detected | CPU mode only |
| GPU | Not available | CPU inference only |

## Python Packages Status

| Package | Status | Install Command |
|---------|--------|-----------------|
| rembg | Not installed | pip install rembg |
| ultralytics | Not installed | pip install ultralytics |
| open_clip_torch | Not installed | pip install open_clip_torch |
| realesrgan | Not installed | pip install realesrgan |
| pillow | Available | pip install pillow |
| numpy | Available | pip install numpy |
| pandas | Available | pip install pandas |

## Installation Script

Run: `.\scripts\install-local-ai.ps1`

Or manually:
```bash
pip install rembg
pip install ultralytics
pip install open_clip_torch
pip install realesrgan
pip install wrangler -g
```

## GPU Requirements

| Model | VRAM Required | CPU Mode |
|-------|---------------|----------|
| rembg | 2-4GB | Yes |
| YOLOv8n | 4-6GB | Yes (slow) |
| CLIP | 6-8GB | Yes (slow) |
| Real-ESRGAN | 6-8GB | Yes (slow) |

## Validation Workflow

1. Install packages
2. Run `python scripts/validate-ai.py`
3. Compare PIL vs ML results
4. Generate decision report
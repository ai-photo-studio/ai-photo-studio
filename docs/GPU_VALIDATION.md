# GPU Validation

## GPU Recommendation

- T4 is recommended for free testing
- L4 is preferred for longer-term production-style validation
- A10G is optional when available and is a strong production candidate

## Required VRAM

| Model | Package | Required VRAM |
|-------|---------|---------------|
| Background removal | `rembg` | 2 to 4 GB |
| Object detection | `ultralytics` | 4 to 6 GB |
| Product classification | `open_clip_torch` | 6 to 8 GB |
| Image enhancement | `realesrgan` | 6 to 8 GB |

## Validation checklist

1. Open Colab.
2. Enable GPU runtime.
3. Run `!nvidia-smi`.
4. Run `bash colab_setup.sh setup`.
5. Run `bash colab_setup.sh validate`.
6. Confirm `scripts/validation-output.json` exists.

## Manual fallback

If the CLI flow fails, run:

```python
!nvidia-smi
import torch
print(torch.cuda.is_available())
print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU")
import rembg
import ultralytics
import open_clip
import realesrgan
print("imports ok")
!bash scripts/colab-preflight.sh
!python scripts/validate-ai.py
```

## Root cause summary

The most common Colab failure is a dependency resolution problem in the `rembg -> pymatting -> scipy/numba/numpy` chain. The pinned validation stack avoids that mismatch.

## Troubleshooting

Use [`docs/COLAB_TROUBLESHOOTING.md`](./COLAB_TROUBLESHOOTING.md) for recovery commands and Python 3.12 notes.

# GPU Validation

## Which GPU to use

- T4 is recommended for free testing
- L4 is preferred for longer-term production-style validation
- A10G is optional when available and is a strong production candidate

## Required VRAM per model

| Model | Package | Required VRAM |
|-------|---------|---------------|
| Background removal | `rembg` | 2 to 4 GB |
| Object detection | `ultralytics` | 4 to 6 GB |
| Product classification | `open_clip_torch` | 6 to 8 GB |
| Image enhancement | `realesrgan` | 6 to 8 GB |

## Quick check

1. Open Colab.
2. Enable GPU runtime.
3. Run `!nvidia-smi`.
4. Run `!bash colab_setup.sh`.

## Manual fallback

If the script fails, run the checks by hand:

```python
!nvidia-smi
```

```python
import torch
print(torch.cuda.is_available())
print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU")
```

```python
import rembg
import ultralytics
import open_clip
import realesrgan
print("imports ok")
```

```python
!python scripts/validate-ai.py
```

## What success looks like

- GPU is visible to PyTorch
- `rembg` imports cleanly
- `ultralytics` imports cleanly
- `open_clip` imports cleanly
- `realesrgan` imports cleanly
- `scripts/validate-ai.py` completes
- `scripts/validation-output.json` is written

## Root cause summary

The import failure on Colab is usually a dependency-resolution problem in the `rembg -> pymatting -> scipy/numba/numpy` chain. The pinned stack in `requirements-colab.txt` avoids the bad wheel mix.

## Recommended probability

- T4: 82%
- L4: 94%
- A10G: 93%

## Fallback

If Python 3.12 becomes unstable again, use an isolated Python 3.11 validation environment instead of changing production code.

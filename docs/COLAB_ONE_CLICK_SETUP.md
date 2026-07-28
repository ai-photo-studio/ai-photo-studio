# Colab One-Click Setup

## Quick Start

1. **Open the notebook**: [COLAB_ONE_CLICK_VALIDATION.ipynb](notebooks/COLAB_ONE_CLICK_VALIDATION.ipynb)
2. **Runtime → Change runtime type → GPU**
3. **Runtime → Run all**

That's it. No manual steps required.

## What the Notebook Does

| Cell | Action |
|------|--------|
| 1 | Verifies GPU and CUDA availability |
| 2 | Clones repository and checks out main |
| 3 | Installs all dependencies |
| 4 | Verifies all imports (rembg, ultralytics, open_clip, realesrgan) |
| 5 | Runs preflight check script |
| 6 | Executes validation script |
| 7 | Displays validation results |
| 8 | Generates benchmark report |

## Requirements Files

- `requirements-colab.txt`: Colab-optimized packages
- `requirements-validation.txt`: Validation dependencies

## Expected Output

```
=== Environment Check ===
Python: 3.10.x
CUDA available: True
GPU: NVIDIA T4
VRAM: 15.78 GB
...
rembg: OK
ultralytics: OK
open_clip: OK
realesrgan: OK
...
Validation Results: {...}
```

## Files Generated

- `scripts/validation-output.json`: Raw validation data
- `docs/COLAB_BENCHMARK_RESULTS.md`: Human-readable benchmark report
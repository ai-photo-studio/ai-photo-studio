# Colab Setup Guide

This is the shortest path to a reproducible Colab validation run.

## Before you start

1. Open Google Colab.
2. Change the runtime to GPU.
3. Run `nvidia-smi` to confirm Colab gave you a GPU.

If `nvidia-smi` fails, stop there and switch the runtime again before continuing.

## Main path

1. Clone the repository into Colab.
2. Change into the repo folder.
3. Run `bash colab_setup.sh`.
4. Wait for the script to finish.
5. Download `scripts/validation-output.json`.

Example commands:

```python
!nvidia-smi
!git clone <your-repo-url> /content/ai-photo-studio-whatsapp
%cd /content/ai-photo-studio-whatsapp
!bash colab_setup.sh
```

## What the script does

`colab_setup.sh` handles the full CLI path:

1. Upgrades `pip`, `setuptools`, and `wheel`
2. Installs the pinned requirements
3. Verifies GPU access with PyTorch
4. Verifies `rembg`, `ultralytics`, `open_clip`, and `realesrgan`
5. Starts the local validation services
6. Runs `scripts/validate-ai.py`
7. Writes `scripts/validation-output.json`

## Manual fallback

If the script fails, run the checks by hand in this order:

```python
!nvidia-smi
```

```python
!python -m pip install --upgrade pip setuptools wheel
!python -m pip install --upgrade -r requirements-validation.txt
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

If the script still does not finish, open a second shell in Colab and start the validation services one by one with `uvicorn`.

## Files to know

- `requirements-colab.txt`
- `requirements-validation.txt`
- `colab_setup.sh`
- `colab_setup.ipynb`
- `scripts/validate-ai.py`

## Why the pinning matters

`rembg` brings in `pymatting`, which depends on compiled numerical wheels. If Colab chooses the wrong mix of `numpy`, `scipy`, and `numba`, the import fails before any image work starts. The pinned requirements keep that stack stable on Python 3.12.

## Output

- `scripts/validation-output.json`

## Download step

After the run finishes, download `scripts/validation-output.json` from the Colab file browser or with:

```python
from google.colab import files
files.download("scripts/validation-output.json")
```

## Fallback strategy

If Python 3.12 becomes unstable again, use a separate Python 3.11 validation environment. Keep the repo code unchanged and keep the pinned requirements as the source of truth.

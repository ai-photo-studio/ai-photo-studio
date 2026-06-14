# Colab Setup Guide

This is the CLI-first runbook for validating the local AI stack in Google Colab.

## Quick start

1. Open Google Colab.
2. Enable the GPU runtime.
3. Run `!nvidia-smi`.
4. Clone the repository.
5. Run `bash colab_setup.sh setup`.
6. Run `bash colab_setup.sh validate`.
7. Download `scripts/validation-output.json`.
8. When finished, run `bash colab_setup.sh cleanup`.

Example:

```python
!nvidia-smi
!git clone <your-repo-url> /content/ai-photo-studio-whatsapp
%cd /content/ai-photo-studio-whatsapp
!bash colab_setup.sh setup
!bash colab_setup.sh validate
!bash colab_setup.sh cleanup
```

## What each command does

- `setup`: upgrades pip, installs pinned requirements, and runs preflight checks
- `validate`: installs requirements, runs preflight, starts services, and writes `scripts/validation-output.json`
- `cleanup`: stops validation services and removes temporary logs

## Manual fallback

If a command fails, run the checks by hand:

```python
!nvidia-smi
!python -m pip install --upgrade pip setuptools wheel
!python -m pip install --upgrade -r requirements-validation.txt
!bash scripts/colab-preflight.sh
!python scripts/validate-ai.py
```

If the service startup still fails, the troubleshooting guide has the recovery commands.

## Why the pinning matters

`rembg` depends on `pymatting`, and that chain can break when Colab resolves incompatible `numpy`, `scipy`, and `numba` wheels. The pinned requirements avoid that mismatch on Python 3.12.

## Output artifact

- `scripts/validation-output.json`

## Related files

- `requirements-colab.txt`
- `requirements-validation.txt`
- `colab_setup.sh`
- `scripts/colab-preflight.sh`
- `docs/COLAB_TROUBLESHOOTING.md`

# AI Code Audit Report

## Scope

Google Colab validation runbook finalization for the local AI stack.

## Current Status

- Production code remains unchanged
- Photoroom, fal.ai, and Replicate remain disabled
- WhatsApp remains the final roadmap phase
- Validation is now documented as a CLI-first flow with manual fallback only when needed

## Deliverables

- `requirements-colab.txt`
- `requirements-validation.txt`
- `colab_setup.sh`
- `colab_setup.ipynb`
- `docs/COLAB_SETUP_GUIDE.md`
- `docs/GPU_VALIDATION.md`
- `scripts/validate-ai.py`

## Colab Validation Flow

1. Open Google Colab
2. Switch runtime to GPU
3. Run `nvidia-smi`
4. Clone the repository
5. Run `bash colab_setup.sh`
6. Use manual fallback commands if the script fails
7. Download `scripts/validation-output.json`

## Root Cause

The Colab failure we are avoiding is a dependency chain problem around `rembg`.

- `rembg` depends on `pymatting`
- `pymatting` pulls in compiled numerical packages
- Colab Python 3.12 can resolve an incompatible mix of `numpy`, `scipy`, and `numba`

The result is typically an import-time failure before any image processing runs. In practical terms, the crash is not about background removal logic; it is about a compiled wheel mismatch in the scientific stack.

## Pinned Stack

The pinned validation stack is designed to keep the Colab runtime stable:

- `numpy==1.26.4`
- `scipy==1.13.1`
- `numba==0.60.0`
- `pymatting==1.1.13`
- `pillow==10.4.0`
- `onnxruntime==1.18.1`
- `rembg==2.0.61`
- `ultralytics==8.2.103`
- `open_clip_torch==2.30.0`
- `realesrgan==0.3.0`

## Validation Checks

The CLI runbook now verifies:

- GPU visibility
- `rembg` import
- `ultralytics` import
- `open_clip` import
- `realesrgan` import
- local validation services
- `scripts/validate-ai.py`
- `scripts/validation-output.json`

## GPU Guidance

| GPU | Recommendation | Notes |
|-----|----------------|-------|
| T4 | Best for free testing | Good starter option, but with the least memory headroom |
| L4 | Preferred for longer-term production | Best balance of speed, headroom, and reliability |
| A10G | Optional production choice | Strong alternative when available in Colab or other hosted GPU setups |

## Required VRAM by Model

| Model | Package | Required VRAM |
|-------|---------|---------------|
| Background removal | `rembg` | 2 to 4 GB |
| Object detection | `ultralytics` | 4 to 6 GB |
| Product classification | `open_clip_torch` | 6 to 8 GB |
| Image enhancement | `realesrgan` | 6 to 8 GB |

## Python 3.12 Compatibility

Python 3.12 is compatible with the pinned stack above when Colab resolves the wheels correctly. If Colab drifts again, the fallback strategy is:

- isolated Python 3.11 environment
- no production code changes
- keep the pinned requirements files as source of truth

## Operations Notes

- Local validation services are only for the validation workflow
- Production deployment and WhatsApp remain out of scope here
- No paid provider activation was added

## Completion

- Colab validation setup: complete
- CLI-first validation runbook: complete
- Manual fallback documentation: complete
- Production code changes: none
- Project roadmap impact: documentation and validation only

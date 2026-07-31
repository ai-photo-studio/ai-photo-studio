# torch 2.6 Minimal Upgrade Compatibility Evidence

## Objective

Prove or reject a minimal security upgrade to torch 2.6.0 + torchvision 0.21.0 for the unpublished GFPGAN GPU worker candidate, using only official PyTorch and official upstream sources.

## Official Wheel Availability

- torch 2.6.0 is published on the PyTorch `cu126` index (not `cu121`).
- Confirmed present for Python 3.10 on `https://download.pytorch.org/whl/cu126/torch`:
  - `torch-2.6.0+cu126-cp310-cp310-manylinux_2_28_x86_64.whl`
- Matched `torchvision 0.21.0+cu126` present for Python 3.10.

## Empirical Compatibility Run

- Workflow: `verify-torch26-compat.yml`
- Run: `30624931147`, status FAILED (evidence captured).
- Installed: torch `2.6.0+cu126`, torchvision `0.21.0+cu126`, gfpgan `1.3.8`, facexlib `0.3.0`, basicsr `1.4.2`, Python 3.10.
- Observed:
  - `torch 2.6.0+cu126 cuda_available False` (CPU runner)
  - `torchvision 0.21.0+cu126`
  - `ModuleNotFoundError: No module named 'torchvision.transforms.functional_tensor'`

## Root Cause (exact incompatibility)

- `torchvision.transforms.functional_tensor` module is REMOVED in torchvision 0.21.
- BasicSR `1.4.2` (its latest official release, tag `v1.4.2`) does in `basicsr/data/degradations.py`:
  `from torchvision.transforms.functional_tensor import rgb_to_grayscale`
- This import fails under torchvision 0.21, breaking `basicsr` and therefore `gfpgan.GFPGANer` (which imports `basicsr.utils`).
- BasicSR `master` already uses `from torchvision.transforms.functional import rgb_to_grayscale`, but this fix is UNRELEASED (no official release; latest release is still v1.4.2).

## GFPGANer `torch.load` safety

- `gfpgan/utils.py` `GFPGANer.__init__` calls `loadnet = torch.load(model_path)` without `weights_only`.
- Safe loading on torch 2.6 requires `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1` (or `weights_only=True`).
- Even with that enforced, the `functional_tensor` import break blocks reaching model construction.

## Decision

- Rejected. The minimal torch 2.6.0 / torchvision 0.21.0 upgrade is NOT compatible with the official gfpgan 1.3.8 / facexlib 0.3.0 / basicsr 1.4.2 stack.
- Not using: unreleased BasicSR master commit (requires licence/provenance review), silent site-packages patching (prohibited), or non-official `basicsr-fixed` (prohibited).
- The candidate remains on torch `2.1.2+cu121`; CVE-2025-32434 remains documented, not suppressed.

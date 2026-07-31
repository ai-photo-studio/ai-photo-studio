# BasicSR v1.4.2 Minimal Patch Evidence

Evidence-only evaluation of applying an explicit, tracked, one-line patch to official BasicSR v1.4.2 (instead of adopting the 18-commit gap or a silent site-package patch). No candidate dependency modified; nothing published.

## Official v1.4.2 Provenance

- Repository: `https://github.com/XPixelGroup/BasicSR`
- Tag `v1.4.2` resolves to commit `651835a1b9d38dbbdaf45750f56906be2364f01a` (non-annotated / direct commit).
- Official source archive SHA-256 (run 30627778687): `f23fe3558fff4cc038186ffd417d69d8bc1fd0eea2a9c755c401e9dfecc18152`
- Licence: Apache-2.0.

## Patch

- File: `docs/restoration/patches/basicsr-v142-functional-tensor-fix.patch`
- Change: exactly one line in `basicsr/data/degradations.py`:
  - `- from torchvision.transforms.functional_tensor import rgb_to_grayscale`
  - `+ from torchvision.transforms.functional import rgb_to_grayscale`
- Attribution: this is the exact change from official upstream commit `8d56e3a045f9fb3e1d8872f92ee4a4f07f886b0a` (PR #650).
- Patch SHA-256: `834cf12b1e625ce59ec2af4152421d2c6c113b8f0a54ba4544f8937b014289ac`
- `extraChanges`: false (only the one line).

## Reproducibility

- Source archive hash: `f23fe3558fff4cc038186ffd417d69d8bc1fd0eea2a9c755c401e9dfecc18152`
- Patch hash: `834cf12b1e625ce59ec2af4152421d2c6c113b8f0a54ba4544f8937b014289ac`
- Wheel build: **blocked** — `python -m build --wheel` on a CUDA-less runner exits 1 (legacy `setup.py` build frontend). The patched source installs via `pip install` and compatibility is proven; a discrete wheel artifact hash could not be produced on this runner. No wheel/source artifact retained or uploaded.

## Compatibility (patched v1.4.2, run 30627778687)

- Python `3.10`, torch `2.6.0+cu126`, torchvision `0.21.0+cu126`.
- BasicSR (patched v1.4.2), GFPGAN `1.3.8`, facexlib `0.3.0` import.
- GFPGANer architecture construction succeeds -> `functional_tensor` error absent.
- `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`; no `weights_only=false` fallback; `gpu_inference_executed: false`.
- Note: GFPGANer construction still triggers runtime network downloads of the two facexlib auxiliary weights.

## Decision

- `candidateModified`: false
- `adoptionApproved`: false (evidence only; adoption requires a separate task)
- `publicationAllowed`: false
- `runtimeDownloadAllowed`: false
- `weightBundlingAllowed`: false
- `productionRoutingAllowed`: false

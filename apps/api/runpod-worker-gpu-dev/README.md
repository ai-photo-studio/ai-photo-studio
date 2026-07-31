# GFPGAN GPU Worker Candidate (UNPUBLISHED)

A separate, **unpublished** GPU restoration worker candidate using GFPGAN v1.4 with an externally-mounted, checksum-verified weight.

This is a build-and-contract candidate only. It is NOT published, is NOT routed to production, and has NOT executed GPU inference or been quality-approved. The existing CPU worker (`apps/api/runpod-worker-dev/`) is unchanged and remains the only packaged worker.

## Weight Contract (external weights, never bundled)

Three externally mounted, checksum-verified weights:

| Weight | Load path | Size | SHA-256 |
|---|---|---|---|
| GFPGANv1.4.pth | `/models/GFPGANv1.4.pth` | 348632874 | e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad |
| detection_Resnet50_Final.pth (symlink -> /models/facexlib/...) | 109497761 | 6d1de9c2944f2ccddca5f5e010ea5ae64a39845a86311af6fdf30841b0a5a16d |
| parsing_parsenet.pth (symlink -> /models/facexlib/...) | 85331193 | 3d558d8d0e42c20224f13cf5a29c79eba2d59913419f945545d8cf7b72920de2 |

- `redistributionApproved: false`, `bundledWeightAllowed: false`, `runtimeDownloadAllowed: false`.
- The worker validates all three weights (size + SHA-256) before model loading.
- The worker creates local facexlib symlinks at `gfpgan/weights/<name>` -> `/models/facexlib/<name>` to short-circuit any potential download.
- The worker NEVER downloads weights at runtime; safe loading is enforced via `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`.

## Modes

- `health` – reports Python/torch versions, all three weight paths present, and safe-load env (no CUDA required).
- `gpu_probe` – reports CUDA availability and device (no model load).
- `restore` – real GFPGAN v1.4 inference; fails closed unless CUDA is available AND all three weights match size and SHA-256 AND safe loading is enforced.

## Input / Output

- Input JSON via `--stdin` or `--input-file <path>`.
- Exactly one structured JSON result on stdout.
- Errors only on stderr.
- Exit codes: `0` ok, `1` internal/timeout, `2` input, `4` weight validation, `5` CUDA unavailable, `6` model error.
- Max image input: `8_000_000` bytes.
- Timeout: `120` s.

## Pinned dependency versions

- Python `3.10`
- PyTorch `2.6.0+cu126`, torchvision `0.21.0+cu126`
- numpy `1.26.4`, opencv-python-headless `4.9.0.80`, Pillow `10.2.0`, scipy `1.11.4`
- gfpgan `1.3.8`, facexlib `0.3.0`
- basicSR: official v1.4.2 source (`f23fe355...`) with the tracked one-line `functional_tensor->functional` patch (`834cf12b...`) applied at build.

## Build-test only

- Dockerfile bakes the patched BasicSR from the pinned official source and validates source + patch hashes.
- Base image pinned by immutable digest; non-root runtime user; build tools removed; caches purged.
- The CI builds the image, runs contract tests, performs an offline three-weight construction test under `--network none`, verifies non-root user and weight absence, generates an SBOM, and requires zero CRITICAL vulnerabilities with CVE-2025-32434 absent. It does NOT run GPU inference.
- GPU inference is not executed and is not quality-approved.

## Running tests on a Python host

With dependencies installed (`pip install -r requirements.txt` plus patched basicsr), run: `python3.10 test_worker.py`

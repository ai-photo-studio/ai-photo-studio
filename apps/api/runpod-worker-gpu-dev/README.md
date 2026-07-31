# GFPGAN GPU Worker Candidate (UNPUBLISHED)

A separate, **unpublished** GPU restoration worker candidate using GFPGAN v1.4 with an externally-mounted, checksum-verified weight.

This is a build-and-contract candidate only. It is NOT published, is NOT routed to production, and has NOT executed GPU inference or been quality-approved. The existing CPU worker (`apps/api/runpod-worker-dev/`) is unchanged and remains the only packaged worker.

## Weight Contract (externally mounted, never bundled)

- Required weight path: `/models/GFPGANv1.4.pth`
- Expected size: `348632874` bytes
- Expected SHA-256: `e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad`
- Provenance source: independently calculated from the official `TencentARC/GFPGAN` v1.3.0 release (workflow run 30618746285).
- `redistributionApproved: false`, `bundledWeightAllowed: false`, `runtimeDownloadAllowed: false`.
- The worker rejects a missing, wrong-size, or wrong-checksum weight before model loading.
- The worker NEVER downloads weights at runtime.

## Modes

- `health` – reports Python and torch versions and weight presence (no CUDA required).
- `gpu_probe` – reports CUDA availability and device (no model load).
- `restore` – real GFPGAN v1.4 inference; fails closed unless CUDA is available AND the mounted weight matches size and SHA-256.

## Input / Output

- Input JSON via `--stdin` or `--input-file <path>`.
- Exactly one structured JSON result on stdout.
- Errors only on stderr.
- Exit codes: `0` ok, `1` internal/timeout, `2` input, `4` weight validation, `5` CUDA unavailable, `6` model error.
- Max image input: `8_000_000` bytes.
- Timeout: `120` s.

## Pinned dependency versions

- PyTorch `2.1.2`, torchvision `0.16.2`
- numpy `1.26.4`, opencv-python-headless `4.9.0.80`, Pillow `10.2.0`
- gfpgan `1.3.8`, facexlib `0.3.0`, basicsr `1.4.2`

## Build-test only

- Dockerfile builds a hardened image but the CI runner has no GPU.
- Base image is pinned by immutable digest; runs as a non-root user; build tools removed; pip/apt caches purged.
- The CI builds the image, runs contract tests, verifies non-root user and weight absence, generates an SBOM, and scans for vulnerabilities (findings printed). It does NOT run GPU inference.
- GPU inference is not executed and is not quality-approved.

## Running tests on a Python host

With dependencies installed (`pip install -r requirements.txt`), run: `python3.10 test_worker.py`

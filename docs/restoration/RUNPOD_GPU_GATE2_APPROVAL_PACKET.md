# RunPod GPU Gate 2 Approval Packet

Readiness-only. This packet describes the hardened, unpublished GFPGAN GPU worker candidate and the fail-closed conditions required before any publication. It is NOT an approval, and no image has been published.

## Baseline Image (before hardening)

- Image ID (prior successful CI): `sha256:bf6af925ca2d4e3ef9c877a5fcde84907f30ad917e17f0e5591ef907081a8846`
- Image size baseline: `5522182156` bytes
- PyTorch: `2.1.2+cu121`
- Weight: external only; not bundled.

## Hardening Changes (evidence-based)

- Base image pinned by immutable digest: `ubuntu:22.04@sha256:0d779ea97881505f5ef0039336ee85edba27519bdba968c284c86ee066a973c8` (linux/amd64).
- Non-root runtime user `workeruser` (uid 1001).
- Removed `git` and other unnecessary build-time tooling from the runtime image.
- Purged pip/apt caches during build.
- Added OCI labels: source, revision, created, version.
- `TMPDIR=/tmp`; `/tmp` and `/models` owned by the worker user for read-only-safe output.
- Preserved pinned Python/PyTorch/GFPGAN versions and the external-checksum-validated weight contract.
- GPU inference is NOT executed and is NOT quality-approved.

## Image Size After Hardening

- Hardened build-only CI run: `30622042430` (success).
- Image ID after hardening: `sha256:1bd7e795ea0b6531773171063285bb4631f3cec8ecf078cfc22fc48fcf28ebd2`
- Image size after hardening: `5454210979` bytes (baseline `5522182156` bytes).
- Runtime user: `workeruser` (non-root); weight in image: absent; no network-download code.
- SBOM: 223 packages.
- Vulnerability scan: `Total: 35 (MEDIUM: 15, HIGH: 19, CRITICAL: 1)`.
- Exact critical blocker: `CVE-2025-32434` in `torch 2.1.2+cu121` (fixed in torch >= 2.6.0). Not silently ignored; recorded as an exact dependency blocker for full hardening. Changing the pinned torch version requires validating the gfpgan/basicsr dependency tree.

## Torch 2.6 Minimal Upgrade Investigation (rejected by exact incompatibility)

- Goal: minimal security upgrade to torch 2.6.0 + torchvision 0.21.0 to clear CVE-2025-32434.
- Official wheel availability: torch 2.6.0 is published on the PyTorch `cu126` index (not `cu121`); `torch 2.6.0+cu126` and `torchvision 0.21.0+cu126` confirmed present for Python 3.10 (evidence run 30624931147).
- Empirical compat check (run 30624931147): torch `2.6.0+cu126` and torchvision `0.21.0+cu126` import, but `ModuleNotFoundError: No module named 'torchvision.transforms.functional_tensor'` — that module is removed in torchvision 0.21.
- BasicSR `1.4.2` (its LATEST official release, v1.4.2) imports `from torchvision.transforms.functional_tensor import rgb_to_grayscale` in `basicsr/data/degradations.py`, so it is NOT compatible with torchvision 0.21.
- Official upstream fix exists ONLY on the unreleased `XPixelGroup/BasicSR` master branch. There is no released BasicSR version compatible with torchvision 0.21.
- GFPGANer (worker `load_model`) also calls `torch.load(model_path)` without `weights_only`; safe loading on torch 2.6 requires `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1` (would be enforced) but the import break blocks even reaching that point.
- Decision: the minimal torch 2.6 upgrade is NOT adoptable with the official gfpgan 1.3.8 / facexlib 0.3.0 / basicsr 1.4.2 stack. Rejected rather than using an unreleased BasicSR commit (requires licence/provenance review), patching site-packages silently (prohibited), or a non-official `basicsr-fixed` (prohibited).
- Candidate remains on torch `2.1.2+cu121` with CVE-2025-32434 documented (not suppressed). GPU execution remains unverified.
- `gpu_inference_executed: false`. Build success does not equal GPU inference or quality approval.

## Security Evidence (CI, runpod-gpu-gate2-readiness)

- Build with `push: false`; no registry login; no packages write; no image/weight artifact upload.
- Non-root runtime user verified.
- Bundled weight absence verified.
- No network-download code verified.
- SBOM generated and vulnerability scan run; findings printed in logs.
- `gpu_inference_executed: false`.

## Gate 2 Publication Conditions (FAIL-CLOSED)

- `approved: false`
- `publicationAllowed: false`
- `imageRepository: ""`
- `immutableTag: ""`
- `expectedDigest: ""` (must be populated only after a real publication)
- `sourceCommit`: current candidate source SHA (verified)
- `floatingTagAllowed: false`
- `weightBundled: false`
- `runtimeDownloadAllowed: false`
- `externalWeightPath: /models/GFPGANv1.4.pth`
- `expectedWeightSize: 348632874`
- `expectedWeightSha256: e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad`
- `gate3ExecutionAllowed: false`
- `productionRoutingAllowed: false`

## Required Before Gate 2 Publication

- A NEW explicit user approval for publication.
- A verified immutable digest from an actual published image (floating tags prohibited).
- No weight bundled, no runtime download.
- Weight checksum unchanged.
- A separate Gate 3 approval before any RunPod canary.
- Gate 4 remains prohibited.
- Replicate remains production.

## Abort / Cleanup

If any publication condition is violated, do not publish, keep the candidate unpublished, and record the failure evidence.

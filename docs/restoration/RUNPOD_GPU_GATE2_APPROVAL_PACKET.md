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

## BasicSR Fix-Commit Evaluation (result)

- Official fix commit `8d56e3a0` (PR #650, Apache-2.0) resolves the `functional_tensor` import; GFPGANer constructs under torch 2.6.0+cu126 / torchvision 0.21.0+cu126 (evidence run 30625934026).
- Source archive SHA-256 `88a422325c7a08a9f3b6109e747bef5fbdf85d884d6033eacaf11f6c374aade9`.
- Adoption NOT recommended: the commit is 18 commits / 41 files ahead of v1.4.2 (unrelated changes), and GFPGANer runtime-downloads facexlib weights.
- Candidate dependencies remain unchanged (torch 2.1.2+cu121 / torchvision 0.16.2). CVE-2025-32434 remains documented until a separate adoption task succeeds.

## Minimal One-Line Patch Evaluation (result)

- Explicit tracked patch (not a silent site-package patch): `docs/restoration/patches/basicsr-v142-functional-tensor-fix.patch`.
- Applied to official v1.4.2 (commit `651835a1`); exactly one line in `basicsr/data/degradations.py`; patch SHA-256 `834cf12b1e625ce59ec2af4152421d2c6c113b8f0a54ba4544f8937b014289ac`.
- Source archive SHA-256 `f23fe3558fff4cc038186ffd417d69d8bc1fd0eea2a9c755c401e9dfecc18152`; run 30627778687.
- Compat: patched v1.4.2 imports + GFPGANer constructs under torch 2.6.0+cu126 / torchvision 0.21.0+cu126 (`functional_tensor` error absent).
- Wheel build: BLOCKED on a CUDA-less runner (`python -m build --wheel` exit 1; legacy setup.py); patched source installs via pip.
- Auxiliary weights inventoried: `detection_Resnet50_Final.pth` and `parsing_parsenet.pth` (sizes and independent SHA-256 recorded; no publisher digest; redistribution unverified).

## Fully Offline External-Mount Proof (result)

- Evidence workflow `verify-gfpgan-offline-weights.yml`, run `30632558271`: SUCCESS (`offline construct exit: 0`).
- Three weights mounted read-only (`/models/...`) with symlinks to their expected local paths; `docker run --network none`; no HTTP/DNS; no runtime download.
- Main GFPGAN weight loaded via direct `model_path`; aux weights loaded via `load_file_from_url` local short-circuit.
- `GFPGANer constructed; main GFPGAN weight loaded`; all three weights loaded with `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`; no `weights_only=False` fallback; `gpu_inference_executed: false`.
- Tiny CPU contract inference passed (aligned 512x512, faces: 1).
- Independent hashes are technical integrity pins, not publisher-signed and not redistribution permission; external/BYO mounting is the only candidate packaging mode.
- `offlineConstructionVerified: true`; candidate unchanged; adoption not approved; publication, runtime download and weight bundling remain prohibited.
- Candidate dependencies remain unchanged. Adoption not approved; publication not allowed; runtime download and weight bundling prohibited.

## Adoption (torch 2.6) Outcome

- The proven secure stack was adopted into the unpublished candidate (`apps/api/runpod-worker-gpu-dev/`).
- Old stack: torch 2.1.2+cu121 / torchvision 0.16.2 / PyPI basicsr 1.4.2 (unpatched).
- New stack: Python 3.10, torch 2.6.0+cu126 / torchvision 0.21.0+cu126, gfpgan 1.3.8, facexlib 0.3.0, scipy 1.11.4, and official BasicSR v1.4.2 source (SHA-256 f23fe3558fff4cc038186ffd417d69d8bc1fd0eea2a9c755c401e9dfecc18152) with the tracked one-line patch (SHA-256 834cf12b1e625ce59ec2af4152421d2c6c113b8f0a54ba4544f8937b014289ac) applied explicitly at build.
- Worker now validates all three external weights (main + detection + parsing) by size and SHA-256, creates facexlib symlinks, and enforces `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`.
- Candidate adopted but still unpublished. Build/CPU inference is not GPU-quality approval.
- SBOM and vulnerability scan require CVE-2025-32434 absent and zero CRITICAL; the adopted image should satisfy this (torch 2.6.0 fixes CVE-2025-32434).
- Separate explicit Gate 2 publication approval remains mandatory. Gate 3 and Gate 4 remain prohibited.

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

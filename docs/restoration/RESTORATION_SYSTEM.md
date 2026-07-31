# Restoration System

## Production Standard

`originals/` upload -> Sharp normalization -> Flux Restore -> GFPGAN v1.4 scale 1 -> Sharp Master/Preview/2HD/4HD -> R2. Standard is unchanged by Premium foundations.

## Storage Mapping

- Original: `RestorationItem.originalStorageKey` (`originals/`).
- Flux/GFPGAN: in-memory provider outputs; prediction metadata only, no standalone R2 intermediate key.
- Master/final: `finalStorageKey` and `metadata.restorationOutputs.master.key` (`finals/`).
- Preview: `previewStorageKey` (`previews/`).
- 2HD/4HD: `metadata.restorationOutputs.variants` (`finals/`).

## Comparison, Entitlement, Payment

Before is the signed original key; After is signed final key. Missing original shows an error. Downloads require guest/user ownership plus explicit purchased tier. Payment alone does not unlock a legacy tier. No provider processing or processed preview before confirmed payment.

## Disabled/Proposed

Damage masks are Sharp-decoded grayscale PNGs and disabled by `RESTORATION_DAMAGE_MASK_ENABLED=false`. Face gate is disabled by `RESTORATION_FACE_GATE_ENABLED=false`. Premium Reconstruction is a separate disabled contract; it requires validated mask, preservation instruction, payment, and quality acceptance. `UnifiedLocalRestorationProvider` is unsafe/quarantined.

Premium routing is Standard at 0-39, Standard or Premium at 40-79, and Premium-only at 80-100. Severe face loss or excessive mask coverage is Premium-only. Calibration evidence remains incomplete.

Calibration intake: run `npm run restoration:fixture-intake -- --id <id> --category <category> --original <path>` with optional `--mask`, `--flux`, `--gfpgan`, and `--final`. Intake validates local image decoding/checksums but does not infer categories or identity metrics.

Run `npm run test:restoration:review-queue` to generate a local operator contact sheet and evidence queue. Only trace-backed groups are registered; filename-only candidates remain ungrouped.

RunPod is disabled by default and benchmark-only. The isolated worker supports health and local dry-run metadata; it is not connected to Standard, Premium, or production routing.

Gate 1 remains build-only validation and does not publish images. Gate 2 is explicitly approved once per run for one development-only immutable GHCR image, via manual workflow dispatch on the default branch, using the validated full SHA and registry digest evidence. Gate 3 RunPod canaries and Gate 4 production activation remain prohibited unless separately approved.

Legacy coupled RunPod tests are superseded by current-main-native tests. Gate 3 cannot start from documentation alone; explicit user approval, verified rate, fixed budget, endpoint/template, and one-job limit are mandatory. Manifest defaults remain fail-closed. No secret may be committed. The RunPod template must pin the immutable digest. Gate 4 remains separately prohibited. Replicate remains production. Successful health/dry_run alone is not restoration-quality approval.

GFPGANv1.4 weight provenance is verified via GitHub Actions (run 30618746285): size 348632874 bytes, SHA-256 e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad, checksum source independently-calculated. Apache-2.0 applies to source code only; it does not prove weight redistribution rights. No model binary may be committed; no weight may be bundled without explicit redistribution evidence; external weights must match the pinned checksum before startup; runtime network weight download remains prohibited. A separate unpublished GFPGAN GPU candidate exists at `apps/api/runpod-worker-gpu-dev/` (build-test only) that mounts the weight externally and validates size and SHA-256 before model load; it is not published and GPU execution is unverified. Its build-only CI passed baseline (run 30620758562, image ID sha256:bf6af925ca2d4e3ef9c877a5fcde84907f30ad917e17f0e5591ef907081a8846, baseline size 5522182156 bytes, PyTorch 2.1.2+cu121). The candidate was hardened for Gate 2 readiness: base image pinned by immutable digest, non-root runtime user, build tools removed, caches purged, OCI labels added, SBOM and vulnerability scan performed (findings only; no upload). Hardened CI run 30622042430: size 5454210979 bytes (baseline 5522182156), SBOM 223 packages, vuln scan 35 (MEDIUM 15, HIGH 19, CRITICAL 1) with exact critical blocker CVE-2025-32434 in torch 2.1.2 (fixed in torch >= 2.6.0); not silently ignored. A minimal security upgrade to torch 2.6.0 + torchvision 0.21.0 was investigated and REJECTED (evidence run 30624931147): torchvision 0.21 removed `functional_tensor`, and BasicSR 1.4.2 (latest release) imports it, so the official gfpgan/basicsr stack is incompatible without an unreleased BasicSR pin or a prohibited patch. The official BasicSR fix commit `8d56e3a0` (PR #650) was then evaluated as a reproducible candidate (workflow run 30625934026): it resolves the `functional_tensor` import and GFPGANer constructs under torch 2.6.0+cu126 / torchvision 0.21.0+cu126, but adoption is NOT recommended because that commit is 18 commits / 41 files ahead of v1.4.2 (unrelated substantive changes; the wheel is not minimal) and GFPGANer construction triggers runtime network downloads of facexlib weights. Source archive SHA-256 `88a422325c7a08a9f3b6109e747bef5fbdf85d884d6033eacaf11f6c374aade9`; licence Apache-2.0. The candidate remains on torch 2.1.2+cu121 with CVE-2025-32434 documented. Weight remains external and checksum-pinned. No image has been published; floating tags and checksum drift are prohibited. Build success is not GPU inference or quality approval. The CPU worker remains unchanged. Separate explicit Gate 2 publication approval is mandatory; after publication, separate Gate 3 approval is mandatory. Gate 3 and Gate 4 remain prohibited.

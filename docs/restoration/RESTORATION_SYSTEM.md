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

GFPGANv1.4 weight provenance is verified via GitHub Actions (run 30618746285): size 348632874 bytes, SHA-256 e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad, checksum source independently-calculated. Apache-2.0 applies to source code only; it does not prove weight redistribution rights. No model binary may be committed; no weight may be bundled without explicit redistribution evidence; external weights must match the pinned checksum before startup; runtime network weight download remains prohibited. A separate unpublished GFPGAN GPU candidate exists at `apps/api/runpod-worker-gpu-dev/` (build-test only) that mounts the weight externally and validates size and SHA-256 before model load; it is not published and GPU execution is unverified. The CPU worker remains unchanged. A new Gate 2 approval is required before publishing any GPU image. Gate 3 and Gate 4 remain prohibited. Build success is not GPU inference or quality approval.

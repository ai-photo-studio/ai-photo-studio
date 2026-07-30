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

The isolated worker validation workflow is build-only, uses the narrow validation-branch push trigger, and does not publish, deploy, contact RunPod, or access secrets.

Release protocol: Gate 1 is build-only validation (CI `30565193616` passed). Gate 2 is separately approved development-only GHCR publication using `GITHUB_TOKEN`, `packages: write`, a full-SHA immutable tag, and recorded digest. Gate 3 is separately approved, budgeted remote development canary. Gate 4 is separately approved production activation. Gates 2-4 are prohibited by default; Replicate remains active production.

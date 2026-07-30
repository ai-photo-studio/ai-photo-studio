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

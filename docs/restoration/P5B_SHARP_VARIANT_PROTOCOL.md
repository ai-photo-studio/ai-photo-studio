# R9.2-P5B Sharp Variant Protocol

## Finalized behavior

P5B reads only a `RestorationMaster` whose status is `VALIDATED` and whose
storage key, SHA-256, dimensions, and content type are present. The canonical
flow remains verified payment -> one Replicate master -> Sharp derivatives.

Server-owned variant specifications are exactly `original`, `2hd`, and `4hd`.
`original` reuses the validated master bytes. `2hd` and `4hd` are Sharp JPEG
derivatives with server-owned maximum widths of 2048 and 4096 pixels,
respectively, using `withoutEnlargement`; this packet does not claim literal
2x/4x scaling.

The cache identity is the existing Prisma unique key
`(restorationMasterId, variantSpecId, sourceMasterSha256)`. Storage identity
also includes the validated output SHA-256. Existing available variants are
returned without re-download or regeneration. Concurrent duplicates converge
on one valid `ImageVariant` through the existing database uniqueness guard.

## Validation ordering

1. Validate master status and required immutable metadata.
2. Reuse a valid cached variant when present.
3. Download the master and decode/transform with Sharp only.
4. Validate output decode, dimensions, format, non-empty byte count, and
   SHA-256.
5. Upload storage bytes.
6. Persist `ImageVariant` as `AVAILABLE` only after upload succeeds.

No client Sharp options, Replicate call, MPGS call, RunPod/Local execution,
payment write, print fulfilment, or new migration is part of P5B.

## Verification

Focused unit and disposable PostgreSQL tests cover invalid masters, corrupt
outputs, all three specifications, cache reuse, concurrent duplicate requests,
storage-before-database ordering, storage failure, and zero external calls.

The Protected Scope Protocol remains in force: source, workflows, packets,
validators, migrations, tests, and development documentation remain tracked;
secrets, production services, payment activation, provider activation, and
deployment configuration remain unchanged.

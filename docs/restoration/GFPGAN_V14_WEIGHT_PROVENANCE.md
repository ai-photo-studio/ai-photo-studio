# GFPGANv1.4 Weight Provenance

## Objective

Record official GFPGANv1.4 release-asset provenance and SHA-256 using GitHub Actions, and document a fail-closed packaging decision. The GPU worker has not been created and no model weight is committed, retained, cached, or bundled.

## Official Asset Metadata

- Model: `GFPGANv1.4.pth`
- Repository: `https://github.com/TencentARC/GFPGAN`
- Release tag: `v1.3.0`
- Release ID: `59459848`
- Asset ID: `76823602`
- Asset name: `GFPGANv1.4.pth`
- Uploader: `xinntao`
- Size: `348632874` bytes
- Created: `2022-09-04T09:34:07Z`
- Updated: `2022-09-04T09:36:19Z`
- Browser download URL: `https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth`
- API digest field: empty / `null` (no publisher-supplied digest)

## Checksum Evidence

- Method: GitHub Actions workflow `gfpgan-weight-provenance.yml`
- Workflow run ID: `30618746285`
- Run status: `success`
- Run SHA: `bafbbe519ef93e9612748b397cf0efaf73c2146a`
- Verification date: `2026-07-31`
- Calculated SHA-256: `e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad`
- Checksum source: `independently-calculated`
- Checksum verified: `true`
- Size verified: `true` (downloaded `348632874` bytes equals API metadata)
- Binary response verified: `true` (non-HTML/JSON content)
- Cleanup: downloaded file removed in an always-running cleanup step
- No model weight was committed, retained, cached, or bundled.

Note: Because the GitHub release asset API does not provide a SHA-256 digest, the checksum was independently calculated from the official asset and is NOT publisher-signed.

## Software Licence

- Source-code licence: Apache License Version 2.0
- Copyright notice: THL A29 Limited, a Tencent company. Applicable to GFPGAN source code.

## Weight Licensing And Redistribution

- Source-code licence and model-weight rights are separate legal questions.
- Downloading and using the official weights is not the same as having permission to redistribute those weights.
- No explicit official redistribution permission for the `GFPGANv1.4.pth` weights inside a bundled container was verified.
- `redistributionApproved`: `false`
- `bundledWeightAllowed`: `false`

## Packaging Decision

- `recommendedPackagingMode`: `externally-mounted-weight`
- Weight files must be mounted/externally supplied and MUST match the pinned checksum (`e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad`) before startup.
- Runtime network weight download is prohibited (`runtimeDownloadAllowed: false`).
- No weight-bundled Docker image may be created.
- The GPU candidate may not be created until provenance validation passes.

## Gate Status

- Gate 2: consumed; a new Gate 2 approval is required before publishing any GPU image.
- Gate 3: prohibited; requires separate execution approval before any GPU canary.
- Gate 4: prohibited.
- Replicate remains active production.

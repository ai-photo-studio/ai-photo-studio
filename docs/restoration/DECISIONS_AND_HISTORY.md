# Decisions And History

- `8375dac11a9b1605de72dbd35b3b0cfb572a2e7a`: split result and print flow.
- `598ef52ffc38375b55d1324f85b41efa9021c233`: validated download bytes and refreshed homepage.
- `4ea54a189bf74be92be0891868077c124f547623`: original/final comparison mapping and explicit paid tiers.
- `3078c9cdbf2dcabf9d6f5e82c6aa57214d8f76ff`: isolated structural mask foundation and quarantined legacy local provider.
- `f33d0948d25f090e364a3dbc0dd6b6db79defc3b`: disabled face-restoration scoring foundation.

Rejected: Unified local restoration because one endpoint may rerun inpainting, face, color, and upscale transforms. Unresolved: offline detector/embedding calibration and verified legacy tier backfill.

Premium routing was revised to 0-39 Standard, 40-79 Standard or Premium, and 80-100 Premium-only; this is a disabled policy foundation pending archived calibration evidence.

Face embeddings and landmarks remain unavailable: no local face-analysis dependency is installed. They must remain unavailable rather than synthetic until an approved benchmark-only adapter is supplied.

OPS-113 is currently the only trace-backed review candidate. Other archived stage-like directories remain ungrouped pending operator evidence.

RunPod A4000 Serverless is approved for controlled development/benchmarking only, with active workers 0 and maximum Flex workers 1. No remote call occurred.

Gate 1 stays build-only and non-publishing. Gate 2 received a one-run explicit approval for exactly one immutable development GHCR image published from the validated full SHA and verified by digest. Gate 3 and Gate 4 remain prohibited unless separately approved. Replicate remains active production.

Legacy coupled RunPod tests are superseded by current-main-native tests. Gate 3 cannot start from documentation alone; explicit user approval, verified rate, fixed budget, endpoint/template, and one-job limit are mandatory. Manifest defaults remain fail-closed. No secret may be committed. The RunPod template must pin the immutable digest. Gate 4 remains separately prohibited. Replicate remains production. Successful health/dry_run alone is not restoration-quality approval.

GFPGANv1.4 weight provenance verified via GitHub Actions run 30618746285: size 348632874 bytes, SHA-256 e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad, checksum source independently-calculated (API digest absent). Apache-2.0 covers source code only and does not prove weight redistribution rights. No weight is bundled; recommended packaging is externally-mounted-weight with pinned checksum validation. Runtime network weight download is prohibited. A separate unpublished GFPGAN GPU candidate (`apps/api/runpod-worker-gpu-dev/`) was created for build and contract tests only; it uses an externally mounted weight and fails closed on size/checksum mismatch and on missing CUDA. The candidate is not published and GPU execution is unverified. New Gate 2 approval required before any GPU image publication. Never bundle weights without explicit redistribution approval; never bypass checksum validation; never replace the verified checksum without new provenance evidence. Gate 3 and Gate 4 remain prohibited.

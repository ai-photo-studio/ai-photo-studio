# RunPod Serverless Handler Wrapper Candidate — restore-unpack-fix (UNPUBLISHED)

A thin, separate, unpublished RunPod Serverless handler wrapper around the
**corrected** GFPGAN GPU CLI worker candidate
(`apps/api/runpod-worker-gpu-dev-restore-unpack-fix/`). It is NOT published,
NOT routed to production, and does NOT execute GPU inference in this task.

## Purpose

This candidate exists because the currently published Serverless handler and
volume-mapped handler both derive from the OLD, buggy CLI worker digest
(`sha256:049a304b...`), which contains the confirmed `GFPGANer.enhance()`
3-value-unpack defect (see
`apps/api/runpod-worker-gpu-dev-restore-unpack-fix/README.md`). Publishing
only the corrected CLI candidate would not fix the canary, because the
Serverless and volume-mapped images do not automatically pick up a change to
an unrelated, unpublished image — they must each be rebuilt from the
corrected base and independently reviewed and published. This candidate is
the middle link in that corrected three-image chain.

`handler.py` and `test_handler.py` are **unchanged, verbatim copies** of the
already-reviewed `apps/api/runpod-worker-gpu-serverless-dev/` contract. No
worker logic is duplicated or inlined into the handler; it still invokes
`/srv/worker/worker.py` (now the corrected version) via the same bounded
subprocess mechanism.

## Base Image (immutable, LOCAL build reference)

- Base: the corrected CLI candidate, built locally in the same CI job/chain
  and tagged `gfpgan-cli-restore-fix:local` — **not** a registry pull, since
  the corrected CLI candidate is unpublished. See
  `.github/workflows/build-restore-unpack-fix-chain.yml`.
- Source SHA: the corrected CLI candidate's exact commit (`apps/api/runpod-worker-gpu-dev-restore-unpack-fix/`, PR #87 merge `0651d44`).
- The base image contains no model weights; weights are externally mounted only.

## Handler Modes — unchanged

- `health` – delegated to the CLI worker health mode (no CUDA/weights required).
- `gpu_probe` – delegated; reports CUDA availability.
- `restore` – delegated; a valid restore requires all three external weights and CUDA; fails closed otherwise. **Now uses the corrected worker.py**, so a successful restore no longer crashes on the return-value unpack.

## Input Contract — unchanged

- Inline/base64 `imageBase64` only for `restore`. Arbitrary URLs are rejected.
- Bounded 120-second subprocess execution timeout.

## Safety — unchanged

- `runpod.serverless.start({"handler": handler})` entrypoint.
- Fixed executable/argument list; no `shell=True`; no user-controlled command/path.
- Temporary input files created and removed in `finally`.
- Structured JSON stdout validated; non-JSON output rejected.
- Errors returned without secrets, stack traces, or local paths.
- `providerPostCount: 0`, `productionRoutingAllowed: false` preserved.
- Exactly one logical job per handler invocation; no retry loop; no second job.
- No database, provider factory, production secrets, endpoint/resource-management code, or HTTP image download.

## Dependency — unchanged

- `runpod==1.11.0` (RunPod Python SDK).

## Build-only

- Build-only CI (`.github/workflows/build-restore-unpack-fix-chain.yml`) builds this wrapper on top of the locally-built corrected CLI image (`push: false`), runs handler unit tests with mocks (no real GPU job), runs container tests under `--network none`, generates an SBOM, and requires zero CRITICAL vulnerabilities with CVE-2025-32434 absent.
- The image is NOT published, and GPU inference is not executed.

# RunPod Serverless Handler Wrapper Candidate (UNPUBLISHED)

A thin, separate, unpublished RunPod Serverless handler wrapper around the immutable GFPGAN GPU CLI worker image. It is NOT published, NOT routed to production, and does NOT execute GPU inference in this task.

## Purpose

The published CLI image (`ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-dev@sha256:049a304b...`) is a standalone CLI worker, not a RunPod Serverless handler image. This wrapper is a thin layer that starts via `runpod.serverless.start(...)` and invokes the CLI worker (`/srv/worker/worker.py`) through a bounded subprocess. It does NOT reimplement or rewrite GFPGAN inference.

## Base Image (immutable)

- Base: `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-dev@sha256:049a304b44bec75562a74eac3f5be312feacd6133da80a0dc86d0a136a86a63a`
- Source SHA: `f65088b5f6bb2f5a91b8b877b32f032766c8b5f1`
- The base image contains no model weights; weights are externally mounted only.

## Handler Modes

- `health` – delegated to the CLI worker health mode (no CUDA/weights required).
- `gpu_probe` – delegated; reports CUDA availability.
- `restore` – delegated; a valid restore requires all three external weights and CUDA; fails closed otherwise.

## Input Contract

- Inline/base64 `imageBase64` only for `restore`. Arbitrary URLs are rejected.
- `/run` payload limit 10 MB; `/runsync` 20 MB (RunPod). The CLI worker enforces an 8 MB input limit.
- Bounded 120-second subprocess execution timeout.

## Safety

- `runpod.serverless.start({"handler": handler})` entrypoint.
- Fixed executable/argument list; no `shell=True`; no user-controlled command/path.
- Temporary input files created and removed in `finally`.
- Structured JSON stdout validated; non-JSON output rejected.
- Errors returned without secrets, stack traces, or local paths.
- `providerPostCount: 0`, `productionRoutingAllowed: false` preserved.
- Exactly one logical job per handler invocation; no retry loop; no second job.
- No database, provider factory, production secrets, endpoint/resource-management code, or HTTP image download.

## Dependency

- `runpod==1.11.0` (RunPod Python SDK).

## Build-only

- Build-only CI builds the wrapper (`push: false`), runs handler unit tests with mocks (no real GPU job), runs container tests under `--network none`, generates an SBOM, requires zero CRITICAL vulnerabilities and CVE-2025-32434 absent.
- The image is NOT published, and GPU inference is not executed.

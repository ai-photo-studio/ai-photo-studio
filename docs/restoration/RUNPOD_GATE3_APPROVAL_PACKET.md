# RunPod Gate 3 Approval Packet

Readiness-only. This packet prepares the fail-closed one-job GPU canary for the published GPU worker image. It is NOT approval to call RunPod. No RunPod resource has been created and the image has not been executed.

## Published Image (immutable, Gate 2)

- Image: `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-dev:f65088b5f6bb2f5a91b8b877b32f032766c8b5f1`
- Registry digest: `sha256:049a304b44bec75562a74eac3f5be312feacd6133da80a0dc86d0a136a86a63a`
- Source SHA: `f65088b5f6bb2f5a91b8b877b32f032766c8b5f1`
- Candidate subtree: `ea8a583e5d7279c0b67eec66a1906b7523c4ce99`
- linux/amd64; runtime user `workeruser` (non-root); entrypoint `python3.10 /srv/worker/worker.py`.
- Verified: zero CRITICAL vulnerabilities; CVE-2025-32434 absent; OCI revision matches source SHA; no bundled weights.
- Gate 2 is consumed/closed. Image publication is not GPU or quality approval.

## Intended Canary

- Purpose: development health / gpu_probe / one tiny CPU or GPU restoration inference canary, strictly one job.
- Endpoint/template: not created. Production routing: prohibited.
- Active workers `0`; maximum Flex workers after approval `1`.
- Concurrency `1`; retries `0`; timeout `120` seconds.
- Maximum jobs before approval `0`; after approval `1`.
- API key: secret reference only; no RunPod API/dashboard action in this task.

## Official RunPod Findings (source: runpod.io/pricing 2026-07-27, docs.runpod.io)

- Serverless is handler-based: a worker image must package a handler started via `runpod.serverless.start({...})` (or an HTTP server for load-balancing endpoints). The published GPU candidate image is a standalone CLI worker (reads `--stdin`/`--input-file` JSON); it is NOT a RunPod Serverless handler image.
- **Exact blocker**: the published image cannot be attached to a RunPod Serverless endpoint as-is. Executing it as a canary would require a handler-based wrapper image (a new candidate + new Gate 2 publication), which is outside this Gate 3 approval.
- Serverless billing is per-second (per-hour rates listed). Official serverless rates: 16GB A4000/A4500/RTX4000/RTX2000 `$0.58/hr`; 24GB L4/A5000/3090 `$0.69/hr`; 48GB A40/A6000 `$1.22/hr`; 48GB L40/L40S/6000Ada/MIG `$1.75/hr`; 80GB A100 `$2.72/hr`.
- Container disk `$0.10/GB/mo`; Network Storage Standard <1TB `$0.07/GB/mo`.
- CUDA 12.6 / torch 2.6 image runs on current RunPod drivers and GPUs (A100-era through H100/B300). Per-node driver version is unverified until the canary `gpu_probe`.
- Minimum practical GPU VRAM: GFPGAN v1.4 + RetinaFace + ParseNet fit in 16 GB VRAM (A4000-class); main weight 348MB, detection ~109MB, parsing ~85MB.
- Container-disk requirement: must exceed the uncompressed image (~6.62 GB); optionally 20 GB.
- External weights can be mounted via RunPod Network Volume; the volume is read-write at the mount path, so read-only is enforced in-application (worker never writes to /models).
- Registry auth: RunPod supports public images without credentials; a private GHCR package requires a RunPod registry credential/config (unverified until endpoint creation; the published GHCR package privacy is unknown).
- Timeout, workers, concurrency, retries are endpoint-config controls (verified configurable).

## Proposed GPU / Rate / Budget (unapproved, separate from executable values)

- Proposed GPU: A4000-class 16 GB (e.g. A4000/A4500/RTX 4000), $0.58/hr serverless.
- Rate (per second): `0.58 / 3600 = 0.000161111 USD/s`.
- Billing unit: per-second.
- Worst-case one-job cost: `ratePerSecond × timeoutSeconds × maxJobs = 0.000161111 × 120 × 1 = $0.019333`.
- Recommended fixed budget: `$0.05` (worst-case `$0.019` plus an explicit buffer for cold-start/boot time).
- Maximum authorized cost: `$0.05`. Abort threshold: accumulated cost >= `$0.05`.
- These are PROPOSED; the executable manifest keeps `verifiedRateUsdPerSecond: null` and `budgetUsd: null` until approval and run.

## One-Job Canary Design

Strict one-shot sequence (after approval, via a RunPod handler wrapper image — currently blocked):

1. `health` — container boot, python/torch, safe-load env.
2. `gpu_probe` — require CUDA available; record device name/count.
3. One tiny restoration inference — record timing, GPU metadata, output checksum.
4. Capture evidence: timing, GPU metadata, output checksum, exit codes, cost.
5. Terminate worker and endpoint resources; delete temporary resources.

No automatic second job, no retry.

## Weight Mount Contract

- Three externally mounted, read-only-by-application weights:
  - `/models/GFPGANv1.4.pth` — size `348632874`, SHA-256 `e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad`
  - `/models/facexlib/detection_Resnet50_Final.pth` — size `109497761`, SHA-256 `6d1de9c2944f2ccddca5f5e010ea5ae64a39845a86311af6fdf30841b0a5a16d`
  - `/models/facexlib/parsing_parsenet.pth` — size `85331193`, SHA-256 `3d558d8d0e42c20224f13cf5a29c79eba2d59913419f945545d8cf7b72920de2`
- Exact size/SHA-256 verified before model load. Never bundled; never runtime-downloaded.
- External-network-volume path semantics unverified until endpoint creation.

## Evidence To Capture

- health / gpu_probe outputs; one-job inference timing; GPU metadata; output checksum; providerPostCount (must be 0); productionRoutingAllowed (must be false); exit codes; cost; abort/cleanup.

## Abort / Cleanup

If any evidence fails (CUDA unavailable, nonzero provider count, startup failure, cost overrun, unexpected routing), abort immediately, keep production routing disabled, delete temporary RunPod resources, record failure evidence, do not retry, and do not proceed to Gate 4.

## Gate Status

- Gate 3 is NOT production or quality approval. Gate 4 remains prohibited. Replicate remains production.

## Current Blocker

- The published CLI image is not a RunPod Serverless handler image. A Gate 3 canary needs a handler-based wrapper (a new candidate + a new Gate 2 publication).

## Handler Wrapper Candidate (separate, unpublished)

- A separate unpublished RunPod Serverless handler-wrapper candidate exists at `apps/api/runpod-worker-gpu-serverless-dev/`.
- It is a thin wrapper: `runpod.serverless.start({"handler": handler})` invokes the immutable CLI worker (`/srv/worker/worker.py`) by its immutable digest `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-dev@sha256:049a304b...` via a bounded subprocess.
- It does NOT reimplement GFPGAN; contains no model weights; no runtime download; no RunPod resource created; build-test only.
- Handler wrapper build success is NOT GPU execution or quality approval.
- A new explicit Gate 2 approval is required before wrapper publication; after publication, a separate Gate 3 approval remains mandatory.
- Any wrapper source/dependency change invalidates its future Gate 2 evidence.

## Abort / Cleanup

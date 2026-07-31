# RunPod Gate 3 Approval Packet (Handler Image)

Readiness-only for the one-job RunPod Serverless canary using the published handler image. This is NOT approval to call RunPod. No RunPod resource has been created and no image has been executed.

## Published Image (immutable)

- Image: `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-dev:21e292103979f0450dffafe09844fac3b435031b`
- Registry digest: `sha256:1a74aefec1a7f77ebdbf7fd19ba2b9a816600f1e3d43ac7ce10b3b87367a3895`
- Source SHA: `21e292103979f0450dffafe09844fac3b435031b`
- Wrapper subtree: `b9402fa975e59ddc245985712b426ae63019761b`
- Immutable CLI base: `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-dev@sha256:049a304b44bec75562a74eac3f5be312feacd6133da80a0dc86d0a136a86a63a`
- linux/amd64; runtime user `workeruser` (non-root); entrypoint cleared; CMD `python3.10 -u /srv/handler/handler.py`; SDK `runpod==1.11.0`.
- Verified: zero CRITICAL; CVE-2025-32434 absent; OCI revision matches source SHA; no bundled weights.
- Post-publication verification run `30649914325` PASS (health/gpu_probe/fail-closed-restore by digest under `--network none`).
- Handler wrapper Gate 2 is consumed/closed. Image publication is not GPU or quality approval.

## Intended Canary

- Image by immutable digest; one endpoint/template; one active Flex worker; concurrency 1; maxJobs 1; maxRetries 0; timeout 120s; productionRoutingAllowed false; providerPostCount 0; no production traffic.
- Sequence: health -> gpu_probe (require CUDA) -> one small tracked canary input -> one restore job -> capture job ID, timing, GPU metadata, output checksum, actual cost -> terminate worker, endpoint, temporary resources.
- No retry or second job.

## Official RunPod Findings (runpod.io/pricing 2026-07-27; docs.runpod.io)

- The published handler image satisfies the RunPod Serverless handler contract (`runpod.serverless.start`).
- Serverless per-second billing. Official rates: 16GB A4000/A4500/RTX4000/RTX2000 `$0.58/hr`; 24GB L4/A5000/3090 `$0.69/hr`; 48GB A40/A6000 `$1.22/hr`; 48GB L40/L40S/6000Ada/MIG `$1.75/hr`; 80GB A100 `$2.72/hr`.
- Container disk `$0.10/GB/mo`; Network Storage Standard <1TB `$0.07/GB/mo`.
- CUDA 12.6 / torch 2.6 image runs on current RunPod drivers (A100-era through H100/B300); per-node driver unverified until `gpu_probe`.
- Minimum practical VRAM: 16 GB (A4000-class) fits GFPGAN v1.4 + RetinaFace + ParseNet.
- Container disk for the ~6.75 GB wrapper image: recommend 20 GB.
- External weights mountable via Network Volume (read-write at mount; read-only enforced in-application).
- Flex workers, concurrency, retries, timeout: endpoint-config controls (verified configurable).

## Registry Access (GHCR) — UNVERIFIED BLOCKER

- GHCR package visibility/auth could NOT be confirmed: the GitHub API returned 403 (token lacks `read:packages` scope).
- If the package is public, no registry credential is required; if private, a RunPod registry credential/credential-config is required.
- Registry-access decision must be resolved (public or credentialed) before endpoint creation. Currently unverified.

## GPU / Volume Region Compatibility — UNVERIFIED BLOCKER

- Whether the selected GPU type and the Network Volume can coexist in the same region could NOT be verified without a RunPod account.
- Must be resolved before endpoint creation. Currently unverified.

## Proposed GPU / Rate / Budget (unapproved)

- GPU: A4000-class 16 GB, `$0.58/hr` serverless.
- Rate: `0.58/3600 = 0.000161111 USD/s` (per-second).
- Worst-case one-job cost: `0.000161111 × 120 × 1 = $0.019333`.
- Recommended fixed budget: `$0.05` (worst-case + explicit buffer for cold-start/boot).
- Maximum authorized cost / abort threshold: `$0.05`. Cold-start allowance included in the buffer.
- Executable manifest keeps `verifiedRateUsdPerSecond: null`, `budgetUsd: null` while approval is false.

## Weight Mount Contract

- `/models/GFPGANv1.4.pth` — size `348632874`, SHA-256 `e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad`
- `/models/facexlib/detection_Resnet50_Final.pth` — size `109497761`, SHA-256 `6d1de9c2944f2ccddca5f5e010ea5ae64a39845a86311af6fdf30841b0a5a16d`
- `/models/facexlib/parsing_parsenet.pth` — size `85331193`, SHA-256 `3d558d8d0e42c20224f13cf5a29c79eba2d59913419f945545d8cf7b72920de2`
- Weights enter the Network Volume externally (never bundled); checksum-verified before handler inference; no runtime download; cleanup after the canary; access restricted to the canary resources.
- Weights are NOT uploaded in this task.

## Canary Fixture

- A small safe tracked fixture is required for the one restore job. No personal/customer images may be used.
- If no suitable tracked fixture exists, this is a fixture blocker to be recorded before approval. (No fixture is introduced in this readiness task.)

## Gate Status

- Gate 3 is NOT production or quality approval. Gate 4 remains prohibited. Replicate remains production.

## Current Blockers

- GHCR registry-visibility/auth decision unresolved (token lacks read:packages; 403).
- GPU/volume region coexistence unresolved (requires a RunPod account).
- A small safe tracked canary fixture may be needed (n/a in this readiness task).

## Abort / Cleanup

If any evidence fails (CUDA unavailable, nonzero provider count, startup failure, budget/cost overrun, unexpected routing), abort immediately, keep production routing disabled, delete temporary RunPod resources, record the failure, do not retry, and do not proceed to Gate 4.

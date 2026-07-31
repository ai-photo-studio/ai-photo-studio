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

## Registry Access (GHCR) — RESOLVED (public)

- Anonymous pull of the handler image by digest SUCCEEDED (workflow run `30652207024`), without any registry login or packages token.
- `registryAccessDecision: public` — no registry credential is required for RunPod to pull the image.

## GPU / Volume Region Compatibility — REMAINING BLOCKER (precise cause identified)

- Read-only RunPod queries were executed via GitHub Actions `workflow_dispatch` (`.github/workflows/runpod-region-readonly.yml`, PR #63, run `30658355014`, `main`, 2026-07-31T19:14:53Z), using `secrets.RUNPOD_API_KEY`. Authentication succeeded (`keyPresent=true`); the key was never printed, echoed, or persisted.
- `GET https://rest.runpod.io/v1/networkvolumes` → HTTP 200, **zero Network Volumes exist on the account**.
- `POST https://api.runpod.io/graphql` (`query gpuTypes`, no mutation) → HTTP 200. 16GB-class candidates confirmed available account-wide: RTX A4000 ($0.17/hr, stock Low), RTX A4500 ($0.19/hr, stock Low), RTX 4000 Ada ($0.18–0.20/hr, stock Low), RTX 2000 Ada ($0.50/hr, stock Low). A40 (48GB, $0.35/hr, stock High) recorded only as an unapproved larger alternative, not substituted.
- Checklist: `RUNPOD_REGION_COMPATIBILITY_CHECKLIST.md`; evidence: `runpod-region-evidence.json`.
- `regionCompatibilityResolved: false` — **not** because of a missing credential or failed query, but because there is no existing Network Volume to co-locate with any GPU in any datacenter. Per authorization, no volume was created and Gate 3 remains blocked on this point until a volume is created under separate, non-read-only authorization and this evidence is revalidated.

## Mount-Path Compatibility — BLOCKED (published image), correction candidate available (unpublished)

- Read-only, build-test-only audit (`.github/workflows/mount-path-audit.yml`, run `30659523185`, `main`) pulled the published handler image by exact digest and tested it under `--network none` with synthetic (non-real) placeholder files mounted at `/runpod-volume`, the RunPod Serverless Network Volume convention.
- Result: `weightPresent`, `auxDetectionPresent`, `auxParsingPresent` all reported `false` — the published handler does **not** see weights mounted at `/runpod-volume`. A control test mounting the same fixtures directly at `/models` reported all three `true`, proving the presence-check logic itself is correct; the only defect is the missing path mapping. No `/runpod-volume` reference exists anywhere in the worker or handler source.
- **The currently published handler image (digest above) is incompatible with the RunPod Serverless Network Volume mount path and cannot load weights from `/runpod-volume` as-is.**
- A separate, unpublished correction candidate was created, built, and tested: `apps/api/runpod-worker-gpu-serverless-volume-dev/`. It derives directly from the same published handler digest and adds exactly one build-time change — a fixed symlink `/models -> /runpod-volume/models` — with no handler logic, CMD, entrypoint, or dependency changes and no init script.
- Candidate build-only CI (PR #66, run `30660299770`) passed all mount-contract tests: valid mapping (weights visible through `/models` when `/runpod-volume` is mounted), missing-volume fail-closed (`EXIT_WEIGHT`, exit code 4), invalid-weight fail-closed (rejected before model construction, `gpu_inference_executed=false`), non-root runtime preserved, symlink immutable and not runtime-writable. Zero CRITICAL vulnerabilities; CVE-2025-32434 absent. Candidate image ID `sha256:d66479f1e8e009b7379ac32a30d6c06789f6d687b6cb0a1cdff0be7c935ddc1d`, size `6751978537` bytes (~6.29 GiB), SBOM 324 components.
- **This candidate is unpublished and has not undergone Gate 2 readiness review.** Building and testing it is not publication, GPU approval, or a Gate 2 pass. Any change to its source, base digest, or dependencies invalidates this evidence.

## Proposed GPU / Rate / Budget (unapproved)

- GPU: A4000-class 16 GB, official proposed Serverless Flex rate `$0.58/hr`.
- Rate: `0.58 / 3600 = $0.000161111/s` (per-second).
- Worst-case one-job cost at the 120-second ceiling: `0.000161111 × 120 × 1 = $0.019333`.
- Maximum proposed compute budget: `$0.05` (worst-case + explicit buffer for cold-start/boot).
- **Correction:** the account-wide GPU price evidence gathered by the region read-only audit (`runpod-region-readonly.yml`, run `30658355014` — RTX A4000 $0.17/hr, RTX A4500 $0.19/hr, etc.) reflects general `gpuTypes`/`lowestPrice` query results and is **not authoritative for RunPod Serverless Flex billing**. It is retained only as informational GPU-pool-availability context (see `RUNPOD_REGION_COMPATIBILITY_CHECKLIST.md`). The official proposed Serverless Flex 16GB rate above ($0.58/hr) is the figure this budget calculation uses.
- Executable manifest keeps `verifiedRateUsdPerSecond: null`, `budgetUsd: null` while approval is false.

## Proposed Worker Policy (unapproved)

- Worker type: **Flex** (scale-to-zero; not Active/always-on).
- `workersMin: 0`, `workersMax: 1`, `activeWorkers: 0` (idle until a job arrives).
- `concurrency: 1`, `maxJobs: 1`, `maxRetries: 0`, `timeoutSeconds: 120`.
- `productionRoutingAllowed: false`.
- These fields describe the proposed, unapproved configuration only; all executable Gate 3 approval fields remain fail-closed (see `runpod-gate3-readiness.json`).

## Weight Mount Contract

- `/models/GFPGANv1.4.pth` — size `348632874`, SHA-256 `e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad`
- `/models/facexlib/detection_Resnet50_Final.pth` — size `109497761`, SHA-256 `6d1de9c2944f2ccddca5f5e010ea5ae64a39845a86311af6fdf30841b0a5a16d`
- `/models/facexlib/parsing_parsenet.pth` — size `85331193`, SHA-256 `3d558d8d0e42c20224f13cf5a29c79eba2d59913419f945545d8cf7b72920de2`
- Weights enter the Network Volume externally (never bundled); checksum-verified before handler inference; no runtime download; cleanup after the canary; access restricted to the canary resources.
- Weights are NOT uploaded in this task.

## Canary Fixture — RESOLVED (synthetic, verified offline)

- Deterministic synthetic, non-personal fixture generator: `docs/restoration/fixtures/gen_canary_face_fixture.py` (stdlib-only, reproducible).
- Generated PNG: SHA-256 `f4368b08487cfc366f049becbcbc63c7e2345808902021639e051b9c3e08cc1f`, size `787077` bytes (under payload limit); validator `canary-fixture.validator.mjs`.
- Offline proof (run `30653164933`): `GFPGANer constructed`, input pixel SHA-256 `b2e6c6a2...`, restored output SHA-256 `99def1c3...`, faces=1, `gpu_inference_executed=false`. This is aligned-face processing (not a real detected face), which is honest contract evidence.

## Gate Status

- Gate 3 is NOT production or quality approval. Gate 4 remains prohibited. Replicate remains production.

## Current Blockers

- GPU/volume region coexistence unresolved (`regionCompatibilityResolved: false`) — the account has zero Network Volumes, so no datacenter/GPU pairing can be proven. Creating a volume requires separate, non-read-only authorization.
- Mount-path: the **currently published** handler image is proven incompatible with `/runpod-volume`. An unpublished correction candidate exists and passed build-only CI, but publishing it requires a fresh Gate 2 readiness review and explicit publication approval — neither has occurred.
- Registry (public) and canary fixture (proven offline) are resolved.
- After a Network Volume exists, GPU/datacenter co-location is proven, and a mount-path-compatible handler is published with fresh Gate 2 approval, Gate 3 still requires a separate, explicit written approval statement before any canary execution.

## Abort / Cleanup

If any evidence fails (CUDA unavailable, nonzero provider count, startup failure, budget/cost overrun, unexpected routing), abort immediately, keep production routing disabled, delete temporary RunPod resources, record the failure, do not retry, and do not proceed to Gate 4.

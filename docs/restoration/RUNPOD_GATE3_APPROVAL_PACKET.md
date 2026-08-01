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

### First authorized volume-creation dispatch — FAILED at preflight, no resource created (run `30674708510`)

- Under explicit one-time dispatch authorization, `.github/workflows/runpod-create-gate3-volume.yml` was dispatched exactly once (`main`, 2026-08-01T00:07:14Z, run `30674708510`). Execution stopped at the "Preflight - Query datacenters and GPU types" step; all subsequent steps (existing-volume check, cost guard, **Create Network Volume POST**, post-creation verification) show `status: skipped`. **No `POST /v1/networkvolumes` call was made; no Network Volume, endpoint, template, worker, or job of any kind was created; compute cost is $0.00.**
- Root cause: the preflight step queried an obsolete/incorrect RunPod GraphQL contract — a root-level `datacenters` field (does not exist: `Cannot query field "datacenters" on type "Query"`) and a `gpuCount` argument passed directly into `gpuTypes(input: GpuTypeFilter)` (invalid: `Field "gpuCount" is not defined by type "GpuTypeFilter"`; `gpuCount` belongs under the nested `lowestPrice(input: GpuLowestPriceInput)`). This is a workflow-implementation defect, not an authorization or credential issue.
- The obsolete GraphQL contract has been removed. Datacenter and GPU discovery now uses the current official `runpodctl` CLI (`runpodctl datacenter list`, `runpodctl gpu list --include-unavailable`), installed from a pinned GitHub release binary (not a piped install script). The Network Volume creation request body was also corrected to match the official `POST /v1/networkvolumes` schema (`https://rest.runpod.io/v1/openapi.json`, `NetworkVolumeCreateInput`: `name`, `size`, `dataCenterId` only — the previously hardcoded `"tier": "standard"` field and the unverified `"dataCenterId": "us-east-1"` literal are both removed; the datacenter ID is now resolved dynamically from preflight discovery).
- This correction is workflow-repair only. **A second dispatch requires new, separate, explicit authorization** and is out of scope for this change.
- Any future change to the RunPod REST or GraphQL API schema requires revalidation against the live `openapi.json` (or equivalent authoritative source) before reuse.

### Second authorized volume-creation dispatch — FAILED at preflight, no resource created (run `30675847067`); root cause classified PARSER_DEFECT

- Under a second, separate, explicit one-time dispatch authorization, the corrected workflow was dispatched exactly once (`main`, 2026-08-01T00:34:03Z, run `30675847067`). `runpodctl` installed successfully (v2.8.0-22dc71f). Execution stopped at "Preflight - Query datacenters and GPU types" with the message `Storage-capable datacenters found: 0` / `Compatible 16GB-class GPU types found: 5`. All subsequent steps (existing-volume check, cost guard, **Create Network Volume POST**, post-creation verification) show `status: skipped`. **No `POST /v1/networkvolumes` call was made; no RunPod resource, endpoint, template, worker, or job of any kind was created; compute cost is $0.00.** This authorization is now consumed; **no third dispatch is authorized.**
- **Classification: `PARSER_DEFECT`, proven by direct source inspection of `runpodctl` v2.8.0** (`internal/api`'s `DataCenter` struct and its `ListDataCenters()` GraphQL query: `id`, `name`, `location`, `gpuAvailability[{gpuTypeId, displayName, stockStatus}]`; `cmd/gpu/list.go`'s `gpuTypeOutput` struct: `gpuId`, `displayName`, `memoryInGb`, `secureCloud`, `communityCloud`, `securePricePerHr`, `communityPricePerHr`, `stockStatus`, `available`, `dataCenterAvailability[{dataCenterId, stockStatus}]`). **Neither struct that `runpodctl datacenter list` or `runpodctl gpu list` actually returns contains a `storageSupport`, `storage_support`, or `supportNetworkVolume` field.** The preflight step's filter for these field names was therefore checking data that structurally cannot exist in the parsed output — it did not receive `false`, it received *absent*, and the workflow's `select(.field == true)` logic silently treated that absence as a negative result. This is not evidence of a real RunPod account restriction; it is proof the workflow queried for data that was never being returned. **This finding does not, by itself, prove or disprove whether the account has an eligible Network-Volume-capable datacenter.**
- Correction (workflow-repair only, no dispatch performed): the storage-capability filter referencing nonexistent fields was removed. GPU/datacenter compatibility is now cross-referenced solely from the documented `dataCenterAvailability[].dataCenterId` field on compatible GPU entries (the same field `runpodctl gpu list` itself populates from `ListDataCenters()`'s `gpuAvailability` data). Storage/Network-Volume capability per datacenter **remains unverifiable through any documented `runpodctl` or REST field currently available to this workflow** (confirmed: `GET /v1/openapi.json` has no `/datacenters` or capability-listing endpoint). Per fail-closed policy, the corrected preflight does not invent capability from GPU availability alone and does not guess a target datacenter — it now fails with an honest message stating capability is unverifiable, rather than a fabricated "0 storage-capable datacenters" result.
- Deterministic fixtures matching the confirmed live schema (`docs/restoration/fixtures/runpodctl-gpu-list-sample.json`, `runpodctl-datacenter-list-sample.json`) and a parser validator (`docs/restoration/runpod-volume-preflight-parser.validator.mjs`) prove the corrected GPU/datacenter cross-reference logic works correctly, and prove no storage-capability field exists in either fixture schema.
- **Whether an eligible datacenter exists for this account remains classified `UNPROVEN`** pending authoritative confirmation. A concise RunPod support request has been prepared (not sent) asking: (1) which datacenters currently permit Network Volume creation for this account; (2) whether Network Volumes require account-level enablement; (3) whether a compatible 16GB Serverless GPU exists in the same datacenter; (4) which API/read-only field should be used for capability discovery going forward.
- Storage architecture fallback comparison (prepared, not implemented) is recorded in `docs/restoration/RUNPOD_NETWORK_VOLUME_ALTERNATIVES.md`. Current preference remains external Network Volume weights unless evidence proves it unavailable for this account.

### Third authorized dispatch — SUCCESS, one Network Volume created (run `30677597137`); region compatibility RESOLVED

- Manual RunPod console evidence (Create Network Volume UI, GPU filter "NVIDIA RTX 4000 Ada Generation", 2026-08-01) resolved the `UNPROVEN` classification above: selectable datacenters were EU-RO-1 (Low availability, Global Networking, S3), EUR-IS-1 (Low availability, S3), and US-CA-2 (N/A). **EU-RO-1** was selected. Fixed volume size 10GB, storage rate $0.07/GB/month, maximum $0.70/month.
- The workflow was updated (PR #74, commit `2872e37`, merge `28b8e7d`) to use this fixed, console-proven configuration (`TARGET_DATACENTER_ID=EU-RO-1`, `TARGET_GPU_DISPLAY_NAME=RTX 4000 Ada`, `VOLUME_SIZE_GB=10`, `MAX_MONTHLY_STORAGE_COST_USD=0.70`), replacing the prior dynamic-discovery preflight. The preflight still re-verifies the fixed pairing against live `runpodctl gpu list` data via the documented `dataCenterAvailability` field, and stops before any mutation if live evidence contradicts the supplied console evidence.
- Under a third, separate, explicit one-time dispatch authorization scoped to this exact configuration, the corrected workflow was dispatched exactly once (`main`, 2026-08-01T01:17:52Z, run `30677597137`). **All steps succeeded**, including "Create Network Volume (POST exactly once)" and "Post-creation verification (GET volumes)".
- **Live re-verification result:** `Live dataCenterAvailability entries matching fixed target: 1` — `PASSED: live evidence confirms RTX 4000 Ada availability in EU-RO-1`.
- **Volume created:** name `photo-restoration-gate3-models`, size **10 GB**, datacenter **EU-RO-1**, redacted ID `d6a4504x...`. Post-creation `GET /v1/networkvolumes` confirmed exactly 1 matching volume, size 10 GB (expected 10 GB, match), datacenter prefix `EU-R***` (expected prefix `EU-R`, match).
- **Costs:** storage $0.70/month maximum (10GB × $0.07/GB/month), computed cost matched the cap exactly. **Compute cost: $0.00.** No endpoint, template, worker, or job was created. No weights were uploaded.
- This third-dispatch authorization is now **consumed**; **no fourth dispatch is authorized.** Any future volume resize or deletion requires new, separate authorization.
- `regionCompatibilityResolved` is now **`true`** in `runpod-region-evidence.json` and `runpod-gate3-readiness.json` — datacenter/GPU co-location proven via live data, and a real Network Volume now exists in that same datacenter. **This does not by itself resolve Gate 3.** Weights are not uploaded, and no separate Gate 3 approval statement has been given; Gate 3 remains BLOCKED on those two independent grounds.

## Mount-Path Compatibility — RESOLVED (correction candidate published, Gate 2 consumed)

- Read-only, build-test-only audit (`.github/workflows/mount-path-audit.yml`, run `30659523185`, `main`) pulled the originally published handler image (digest `sha256:1a74aefec1a7f77ebdbf7fd19ba2b9a816600f1e3d43ac7ce10b3b87367a3895`) by exact digest and tested it under `--network none` with synthetic (non-real) placeholder files mounted at `/runpod-volume`, the RunPod Serverless Network Volume convention.
- Result: `weightPresent`, `auxDetectionPresent`, `auxParsingPresent` all reported `false` — that original handler did **not** see weights mounted at `/runpod-volume`. A control test mounting the same fixtures directly at `/models` reported all three `true`, proving the presence-check logic itself is correct; the only defect was the missing path mapping. No `/runpod-volume` reference existed anywhere in the worker or handler source at that digest.
- A correction candidate was created, built, and tested: `apps/api/runpod-worker-gpu-serverless-volume-dev/`. It derives directly from the same digest and adds exactly one build-time change — a fixed symlink `/models -> /runpod-volume/models` — with no handler logic, CMD, entrypoint, or dependency changes and no init script.
- Candidate build-only CI (PR #66, run `30660299770`) passed all mount-contract tests: valid mapping (weights visible through `/models` when `/runpod-volume` is mounted), missing-volume fail-closed (`EXIT_WEIGHT`, exit code 4), invalid-weight fail-closed (rejected before model construction, `gpu_inference_executed=false`), non-root runtime preserved, symlink immutable and not runtime-writable. Zero CRITICAL vulnerabilities; CVE-2025-32434 absent. Candidate image ID `sha256:d66479f1e8e009b7379ac32a30d6c06789f6d687b6cb0a1cdff0be7c935ddc1d`, size `6751978537` bytes (~6.29 GiB), SBOM 324 components.
- **This candidate is now PUBLISHED, and its Gate 2 approval is CONSUMED** (explicit user authorization 2026-07-31T22:51:08Z; publication runs `30671211535` + fix + `30672004615`, all post-publication tests PASS). **Published image:** `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-volume-dev@sha256:29ca5aa0aae46ab03719c52ae25fa98a61830adbbc8b317bd244ffb7ff837d9b` (immutable tag `158bbbcb82b02db0ca0a2e66bc88a2ccfdb6e374`). See `RUNPOD_VOLUME_HANDLER_GATE2_APPROVAL_PACKET.md` and `runpod-volume-handler-gate2-readiness.json` for the full closure record. `publicationAllowed` is now `false` and not reusable. **Mount-path incompatibility is resolved by this published image; no further correction work is needed.** Any future change to this candidate's source, base digest, or dependencies would invalidate this evidence and require a new, separate, explicit Gate 2 approval — no such change has occurred, so Gate 2 is not reopened.

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
- Weights are NOT uploaded in this task. The Network Volume created in run `30677597137` (EU-RO-1, 10GB, `photo-restoration-gate3-models`) is empty; weight upload requires new, separate authorization.

## Canary Fixture — RESOLVED (synthetic, verified offline)

- Deterministic synthetic, non-personal fixture generator: `docs/restoration/fixtures/gen_canary_face_fixture.py` (stdlib-only, reproducible).
- Generated PNG: SHA-256 `f4368b08487cfc366f049becbcbc63c7e2345808902021639e051b9c3e08cc1f`, size `787077` bytes (under payload limit); validator `canary-fixture.validator.mjs`.
- Offline proof (run `30653164933`): `GFPGANer constructed`, input pixel SHA-256 `b2e6c6a2...`, restored output SHA-256 `99def1c3...`, faces=1, `gpu_inference_executed=false`. This is aligned-face processing (not a real detected face), which is honest contract evidence.

## Gate Status

- Gate 3 is NOT production or quality approval. Gate 4 remains prohibited. Replicate remains production.
- The handler publication contradiction is corrected: the volume-mapped handler is APPROVED, PUBLISHED, and CONSUMED at digest `sha256:29ca5aa0aae46ab03719c52ae25fa98a61830adbbc8b317bd244ffb7ff837d9b`; no fresh Gate 2 is required unless source, base, or dependencies change.
- `weightsPresent=false` and `weightsVerified=false`. Upload stopped safely before mutation because RunPod S3 credentials and approved local weights were unavailable; downloading replacement weights requires separate authorization.
- RunPod S3 credentials and RunPod API credentials are separate. Cloudflare R2 credentials must never be reused as RunPod credentials. Credential creation requires manual user action, and upload requires new explicit authorization.

## Current Blockers

- ~~GPU/volume region coexistence~~ **RESOLVED** (`regionCompatibilityResolved: true`) — one Network Volume (`photo-restoration-gate3-models`, 10GB, EU-RO-1) was created in run `30677597137` under explicit third-dispatch authorization; RTX 4000 Ada availability in EU-RO-1 was confirmed against live data before creation.
- ~~Mount-path~~ **RESOLVED** — the volume-mapped correction candidate (`ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-volume-dev@sha256:29ca5aa0aae46ab03719c52ae25fa98a61830adbbc8b317bd244ffb7ff837d9b`) is published and its Gate 2 approval is consumed. No further correction or publication work is needed here; Gate 2 is not reopened absent a source/base/dependency change.
- Registry (public), canary fixture (proven offline), region compatibility, and mount-path compatibility are all resolved.
- Weights are not uploaded to the created volume — requires new, separate authorization.
- Gate 3 still requires a separate, explicit written approval statement before any canary execution, independent of the above.

## Abort / Cleanup

If any evidence fails (CUDA unavailable, nonzero provider count, startup failure, budget/cost overrun, unexpected routing), abort immediately, keep production routing disabled, delete temporary RunPod resources, record the failure, do not retry, and do not proceed to Gate 4.

# RunPod Volume-Mapped Handler Candidate — Gate 2 Approval Packet

**GATE 2 APPROVED AND CONSUMED (one-time, not reusable).** Publication executed and verified. No RunPod execution, GPU compute, or Gate 3 activity has occurred.

## Candidate Source (frozen)

- Source commit: `158bbbc` (full: `158bbbcb82b02db0ca0a2e66bc88a2ccfdb6e374`), merged to `main` as `a4877388692841cc70a9c98c9e89b6f0d17ce31c`.
- Candidate subtree (`apps/api/runpod-worker-gpu-serverless-volume-dev`): `716fc09fc35bb966637bef26f3d4840a7088891b`.
- Verified identical: `git diff 158bbbc origin/main -- apps/api/runpod-worker-gpu-serverless-volume-dev` returns empty; `git ls-tree` of both the frozen commit and current `origin/main` report the same subtree hash. No drift.
- Build-only CI run `30660299770` (PR #66) tested `headSha: 158bbbcb82b02db0ca0a2e66bc88a2ccfdb6e374` — confirmed directly via `gh run view 30660299770 --json headSha`, not inferred. CI tested exactly the frozen candidate content.
- Any candidate code, base digest, or dependency change invalidates this readiness evidence and requires a fresh review.

## Immutable Handler Base (unchanged, already published)

- Base image: `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-dev@sha256:1a74aefec1a7f77ebdbf7fd19ba2b9a816600f1e3d43ac7ce10b3b87367a3895` — the currently published handler image, pinned by exact digest in the candidate `Dockerfile`'s `FROM` line (verified by exact string match in CI).
- This candidate does not modify the published handler image or the published CLI worker image in any way.

## Symlink Contract (the only filesystem change)

```
USER root
RUN rm -rf /models \
    && ln -s /runpod-volume/models /models \
    && test "$(readlink /models)" = "/runpod-volume/models"
USER workeruser
```

Verified by reading the candidate `Dockerfile` directly (7 meaningful instructions: `FROM`, `ARG`x2, `LABEL`, `USER root`, one `RUN`, `USER workeruser`) — no `COPY`, no `ENV`, no `CMD`, no `ENTRYPOINT`, no second `RUN`. CMD and ENTRYPOINT are inherited unchanged from the base image (already-cleared entrypoint; CMD already runs `/srv/handler/handler.py`).

## Build Evidence

- Build-only CI run `30660299770`: SUCCESS. `push: false`; no registry login; no `packages: write`; no RunPod secret referenced.
- Local build image ID: `sha256:d66479f1e8e009b7379ac32a30d6c06789f6d687b6cb0a1cdff0be7c935ddc1d`; size `6751978537` bytes; NOT published.
- Non-root runtime user `workeruser`; entrypoint cleared (inherited); CMD `["python3.10","-u","/srv/handler/handler.py"]` (inherited, unchanged).
- No model weights bundled (`test -f /runpod-volume/models/GFPGANv1.4.pth` inside the image returns `absent`); no runtime download.
- `providerPostCount: 0`; `productionRoutingAllowed: false` (both inherited, unchanged, verified via `health` mode output through the symlink).
- Zero CRITICAL vulnerabilities; CVE-2025-32434 absent; SBOM generated (CycloneDX, 324 components, not uploaded/persisted); `gpu_inference_executed: false`.

## Mount-Contract Test Results

- **Test A** (valid mapping): synthetic (non-real) fixtures mounted read-only at `/runpod-volume`; all three weight paths (`/models/GFPGANv1.4.pth`, `/models/facexlib/detection_Resnet50_Final.pth`, `/models/facexlib/parsing_parsenet.pth`) confirmed visible through the symlink; symlink target verified unchanged under mount.
- **Test B** (missing volume): no volume mounted; `restore` mode exits `4` (`EXIT_WEIGHT`); no network/download attempt (`--network none` throughout).
- **Test C** (invalid weights): mismatched-size dummy fixtures mounted; `restore` rejected before CUDA/model construction (`gpu_inference_executed=false`), exit `4`, stderr matches size-mismatch message.
- **Test D** (security): non-root `workeruser` confirmed; `/models` confirmed to be a symlink (not a regular directory); `workeruser` cannot remove/replace `/models` (`PermissionError`); `health` mode reports `providerPostCount=0`, `productionRoutingAllowed=false`.
- Existing `test_handler.py` unit tests (mocks only, unchanged) re-run unmodified inside the candidate image: PASS.

## Gate 2 Closure — Publication Executed and Verified

- **Approved:** yes (explicit one-time user authorization, 2026-07-31T22:51:08Z).
- **Published:** yes.
- **Immutable GHCR repository:** `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-volume-dev`.
- **Tag:** `158bbbcb82b02db0ca0a2e66bc88a2ccfdb6e374` (full frozen source SHA); one code-only tag only; no `latest`, `dev`, branch names, or semver tags.
- **Published registry digest:** `sha256:29ca5aa0aae46ab03719c52ae25fa98a61830adbbc8b317bd244ffb7ff837d9b`.
- **Full published reference:** `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-volume-dev:158bbbcb82b02db0ca0a2e66bc88a2ccfdb6e374@sha256:29ca5aa0aae46ab03719c52ae25fa98a61830adbbc8b317bd244ffb7ff837d9b`.
- **Publication workflow runs:**
  - `30671211535` (2026-07-31T22:51:08Z, source `158bbbc`, all pre-publication verification PASS, image built and pushed successfully, digest captured `sha256:29ca5aa0aae46ab03719c52ae25fa98a61830adbbc8b317bd244ffb7ff837d9b`, post-publication test step had shell-quoting bug and failed).
  - `30672004615` (re-dispatch with fixed test step, all post-publication verification tests PASS: non-root user, symlink target verified inside container, handler path present, no bundled GFPGAN weight).
- **Post-publication verification (run `30672004615`):** all tests PASS (non-root user confirmed; symlink target `/models -> /runpod-volume/models` verified inside container; handler path `/srv/handler/handler.py` present; no bundled GFPGAN weight at `/models/GFPGANv1.4.pth`).
- **`publicationAllowed: false` after consumption.** This approval is one-time and not reusable. Any candidate code, base digest, or dependency change invalidates this evidence and requires a new explicit Gate 2 approval.
- **Publication does NOT authorize:** Network Volume creation, weight upload, RunPod endpoint/template/worker/job creation, GPU compute, restoration inference, paid provider calls, deployment, or Gate 3 execution.
- **Network Volume creation** requires separate, explicit mutation/cost authorization — not covered by this publication approval.
- **Gate 3 approval** remains mandatory after publication and volume preparation, before any RunPod canary.
- **Gate 4 remains prohibited.** Replicate remains production.
- **The existing published CLI-image and handler-image Gate 2 closures remain unchanged and closed.**

## Drift Check & Invalidation

If the source/subtree drifts from the values recorded here (source `158bbbcb82b02db0ca0a2e66bc88a2ccfdb6e374`, subtree `716fc09fc35bb966637bef26f3d4840a7088891b`), if more than one tag or a floating tag exists, if the published digest no longer matches `sha256:29ca5aa0aae46ab03719c52ae25fa98a61830adbbc8b317bd244ffb7ff837d9b`, if weights have been bundled, or if any candidate dependency change has occurred, this Gate 2 closure is invalidated and a fresh Gate 2 approval is required.

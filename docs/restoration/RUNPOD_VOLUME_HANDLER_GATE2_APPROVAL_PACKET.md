# RunPod Volume-Mapped Handler Candidate — Gate 2 Approval Packet

Readiness-only for the volume-mapped RunPod Serverless handler candidate. This packet does NOT grant publication approval. No image has been published, pushed, or executed against RunPod.

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

## Proposed Publication Identity (NOT executed, NOT approved)

- Proposed immutable GHCR repository: `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-volume-dev`.
- Proposed tag: the full frozen source SHA `158bbbcb82b02db0ca0a2e66bc88a2ccfdb6e374`, and only that — one code-only tag. No `latest`, no `dev`, no branch name, no semver tag.
- Registry digest must be captured and independently verified (anonymous pull by digest succeeds, matches the built image ID's content) **before** Gate 2 can be considered closed for this candidate — this has NOT been done; no publication has occurred.
- Publication of this candidate does **not** by itself authorize Network Volume creation or any Gate 3 activity.

## Required Before Any Gate 2 Closure For This Candidate

- Explicit, separate, one-time Gate 2 approval (a distinct approval message from the user) is required before any publication workflow runs.
- Exact source/subtree must remain pinned to the values above at publication time; any drift invalidates this packet.
- Publication must produce exactly one immutable tag; digest must be captured and independently verified before closure.
- No model weights published; no runtime download; no floating tag.
- Network Volume creation requires separate, explicit mutation/cost authorization — not covered by this packet or by any future publication approval.
- A separate Gate 3 approval remains mandatory after publication and volume preparation, before any RunPod canary.
- Gate 4 remains prohibited; Replicate remains production.
- The existing published CLI-image and handler-image Gate 2 closures remain unchanged and closed.

## Abort / Cleanup

If the source/subtree drifts from the values recorded here, if more than one tag or a floating tag would be created, if the digest cannot be independently verified, if weights would be bundled, or if any RunPod call is implied by a future publication attempt, abort and record the failure. This packet grants no publication authority by itself.

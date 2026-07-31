# RunPod Handler Wrapper Gate 2 Approval Packet

Readiness-only for the thin RunPod Serverless handler wrapper candidate. This is NOT approval to publish. No publication workflow has been created and no image is published.

## Wrapper Source (frozen)

- Source commit: `21e292103979f0450dffafe09844fac3b435031b` (current main, contains the final wrapper).
- Wrapper subtree (`apps/api/runpod-worker-gpu-serverless-dev`): `b9402fa975e59ddc245985712b426ae63019761b`.
- Build-only workflow revision: `021bb52` (on main).
- Final build-only CI run: `30644121360` (head `21e2921`, contains the final wrapper subtree; no drift).
- Any wrapper code/dependency change invalidates this readiness evidence.

## Immutable CLI Base

- Base image: `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-dev@sha256:049a304b44bec75562a74eac3f5be312feacd6133da80a0dc86d0a136a86a63a` (immutable digest; source `f65088b5...`).
- SDK: `runpod==1.11.0` (only added dependency; torch/gfpgan/basicsr inherited).

## Build Evidence

- Build-only CI run `30644121360`: SUCCESS.
- Local image id: `sha256:43de99f4a31868325b1d02f0a5d6c616ce45aebab345fe452a9099dacf1ce67f`; size `6751978537` bytes; NOT published (push:false).
- Non-root runtime user `workeruser`; entrypoint cleared `[]`; CMD `["python3.10","-u","/srv/handler/handler.py"]`.
- No model weights bundled; no runtime download; `providerPostCount: 0`; `productionRoutingAllowed: false`.
- Zero CRITICAL vulnerabilities; CVE-2025-32434 absent; `gpu_inference_executed: false`.

## Proposed Publication Identity (readiness only; NOT approved)

- Proposed GHCR repository: `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-dev`
- Proposed immutable tag: exact full wrapper source SHA `21e292103979f0450dffafe09844fac3b435031b` (one immutable tag only).
- No `latest`, `dev`, branch, or semver floating tag.
- Publication contains CODE ONLY, no model weights.
- A publication workflow (NOT created) must pin `sourceCommit 21e292...` / `sourceSubtree b9402fa9...`, push exactly one immutable tag, and the registry digest must be captured and verified before Gate 2 closes.
- Publication does NOT authorize RunPod or GPU execution.

## Required Before Gate 2 Publication

- A NEW explicit one-time Gate 2 approval for the wrapper.
- Exact source/subtree pinned; one immutable tag; digest capture + verification before closure.
- No model weights published; no runtime download.
- A separate Gate 3 approval remains mandatory before any RunPod canary.
- Gate 4 remains prohibited; Replicate remains production.
- The existing CLI-image Gate 2 remains closed and is unchanged.

## Abort / Cleanup

If the source/subtree drifts, a floating/multiple tag would be created, the digest cannot be verified, weights would be bundled, or a RunPod call is implied, abort publication and record the failure.

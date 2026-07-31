# Volume-Mapped RunPod Serverless Handler Candidate (UNPUBLISHED)

A separate, unpublished candidate that corrects the mount-path incompatibility found in the currently published handler image. It is NOT published, NOT routed to production, and does NOT execute GPU inference in this task.

## Why this candidate exists

A read-only, build-test-only mount-path audit (`.github/workflows/mount-path-audit.yml`, run `30659523185`) proved empirically that the published handler image, by exact digest, does **not** see its three required weights when a directory is mounted at `/runpod-volume` — the RunPod Serverless Network Volume convention. `weightPresent`, `auxDetectionPresent`, and `auxParsingPresent` all reported `false` in that test. A control test mounting the same fixtures directly at `/models` reported `true` for all three, proving the presence-check logic itself is correct — the only defect is the missing path mapping. No `/runpod-volume` reference exists anywhere in the worker or handler source.

## Base image (immutable, unchanged)

- `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-dev@sha256:1a74aefec1a7f77ebdbf7fd19ba2b9a816600f1e3d43ac7ce10b3b87367a3895` — the currently published handler image. This candidate derives directly from it and does not modify it.

## The correction

Exactly one filesystem change, made at build time only:

```
/models -> /runpod-volume/models   (symlink)
```

This replaces the base image's empty `/models` directory with a symlink to where RunPod Serverless mounts a Network Volume. No init script; no runtime symlink creation; no environment-variable-driven path resolution; no user-controlled path. The CLI worker's existing checksum-verified weight-loading logic at `/models/GFPGANv1.4.pth`, `/models/facexlib/detection_Resnet50_Final.pth`, and `/models/facexlib/parsing_parsenet.pth` is completely unchanged — it now simply resolves through the symlink to `/runpod-volume/models/...` when a volume is mounted there.

CMD, ENTRYPOINT, non-root runtime user (`workeruser`), and all handler logic are inherited unchanged from the base image. No Python dependency changes. No weights in source, build context, image layers, or CI artifacts.

## Status

- **Build-only, unpublished.** This candidate has not been built and pushed to any registry, and no RunPod resource has been created.
- Building and testing this candidate does **not** constitute publication, GPU approval, or a new Gate 2 pass — it requires a fresh Gate 2 readiness review before any publication is considered.
- Any change to this candidate's source, base digest, or dependencies invalidates all evidence recorded for it.
- Creating a RunPod Network Volume requires separate, explicit mutation/cost authorization — out of scope here.
- Gate 3 and Gate 4 remain prohibited regardless of this candidate's test results. Replicate remains the active production provider.

# Volume-Mapped RunPod Serverless Handler Candidate — Combined chain (UNPUBLISHED, SOURCE ONLY)

The final link in the combined chain. Derives (by local build reference, in a
future authorized build-only workflow) from
`apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-combined-dev/`
(which carries the `cwd=WORKER_DIR` fix and wraps the `outputSha256`-corrected
CLI worker). Adds only the build-time `/models -> /runpod-volume/models`
symlink, identical in structure to
`apps/api/runpod-worker-gpu-serverless-volume-restore-unpack-fix-dev/`. No
handler, worker, CMD, entrypoint, or dependency change. No weights bundled;
no runtime download; no init script.

## Status

**Source only.** No build, no publication, no digest, no deployment, no Gate 2
or Gate 3 review of this candidate has occurred. `test_mount_contract.py`
checks the built image's filesystem (`/models` symlink, weight visibility)
and requires the image to actually be built; it is exercised by a future
authorized build-only CI workflow, not by this task.

## Not yet authorized

Building this candidate (or the combined Serverless handler it derives from)
into an image requires a separate, explicit build authorization and a new or
extended CI workflow — neither exists yet. No workflow currently references
this directory.

# Volume-mapped RunPod Serverless handler candidate (UNPUBLISHED, SOURCE ONLY -- not built by this task)
# COMBINED candidate: derives from the COMBINED Serverless handler candidate
# (apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-combined-dev/),
# which itself wraps the outputSha256-corrected GFPGAN CLI worker candidate
# via the cwd=WORKER_DIR-fixed handler. Adds ONLY a fixed, build-time
# symlink: /models -> /runpod-volume/models. No handler logic, CMD,
# entrypoint, dependency, or CLI worker code is changed. No weights are
# bundled; no runtime download; no init script; no RunPod resource is
# created; not built or published by this task.
#
# Base image reference: the combined Serverless handler candidate is
# unpublished-by-this-task, so this Dockerfile derives from it by immutable
# LOCAL build reference within the same CI job/chain -- not a registry pull.
# A future authorized build-only workflow would build the CLI candidate,
# then the combined Serverless handler candidate, and load the latter into
# the local Docker daemon tagged exactly "gfpgan-serverless-restore-fix-combined:local"
# before building this image, identical in structure to the existing
# apps/api/runpod-worker-gpu-serverless-volume-restore-unpack-fix-dev/Dockerfile
# pattern. This Dockerfile is not intended to be built standalone.
FROM gfpgan-serverless-restore-fix-combined:local

# OCI provenance labels
ARG VCS_REF="unknown"
ARG BUILD_DATE="unknown"
LABEL org.opencontainers.image.title="gfpgan-gpu-serverless-handler-volume-mapped-restore-unpack-fix-combined" \
      org.opencontainers.image.description="Volume-mapped RunPod Serverless handler candidate on the COMBINED (cwd + outputSha256) chain: build-time /models -> /runpod-volume/models symlink only" \
      org.opencontainers.image.source="https://github.com/ai-photo-studio/ai-photo-studio" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="handler-volume-restore-unpack-fix-combined-candidate-v1"

# The base handler image ends with USER workeruser; switch to root ONLY to
# replace the empty /models directory with a fixed symlink (build-time only).
USER root

# Remove the existing empty /models directory (inherited from the CLI worker
# base image) and replace it with a fixed symlink to the RunPod Serverless
# Network Volume mount point (/runpod-volume). This is the ONLY filesystem
# change made by this candidate. No init script; the symlink is created once,
# at build time, and is immutable in the resulting image layer.
RUN rm -rf /models \
    && ln -s /runpod-volume/models /models \
    && test "$(readlink /models)" = "/runpod-volume/models"

# Restore non-root runtime. CMD and ENTRYPOINT are inherited unchanged from
# the base handler image (ENTRYPOINT already cleared; CMD already runs
# /srv/handler/handler.py). Neither is redeclared here.
USER workeruser

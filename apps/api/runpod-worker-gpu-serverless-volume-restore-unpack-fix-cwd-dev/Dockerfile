# Volume-mapped RunPod Serverless handler candidate (UNPUBLISHED, build-test only)
# Derives from the CORRECTED Serverless handler candidate with the
# stdout-protocol cwd fix
# (apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-cwd-dev/), which
# itself wraps the corrected, published GFPGAN CLI worker image. Adds ONLY a
# fixed, build-time symlink: /models -> /runpod-volume/models. No handler
# logic, CMD, entrypoint, dependency, or CLI worker code is changed relative
# to that base beyond what it already carries. No weights are bundled; no
# runtime download; no init script; no RunPod resource is created by
# building or testing this image.
#
# Base image reference: the cwd-fixed Serverless handler candidate is
# UNPUBLISHED, so this Dockerfile derives from it by immutable LOCAL build
# reference within the same CI job/chain -- not a registry pull, mirroring
# the existing apps/api/runpod-worker-gpu-serverless-volume-restore-unpack-fix-dev/Dockerfile
# convention exactly. No build-chain workflow has been created or run for
# this candidate in this task; it is source-only and unbuilt.
FROM gfpgan-serverless-restore-fix-cwd:local

# OCI provenance labels
ARG VCS_REF="unknown"
ARG BUILD_DATE="unknown"
LABEL org.opencontainers.image.title="gfpgan-gpu-serverless-handler-volume-mapped-restore-unpack-fix-cwd" \
      org.opencontainers.image.description="Volume-mapped RunPod Serverless handler candidate on the CORRECTED (restore-unpack-fix) chain with the subprocess cwd stdout-protocol fix: build-time /models -> /runpod-volume/models symlink only" \
      org.opencontainers.image.source="https://github.com/ai-photo-studio/ai-photo-studio" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="handler-volume-restore-unpack-fix-cwd-candidate-v1"

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

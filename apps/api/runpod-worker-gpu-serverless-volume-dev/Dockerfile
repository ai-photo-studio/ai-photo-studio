# Volume-mapped RunPod Serverless handler candidate (UNPUBLISHED, build-test only)
# Derives directly from the immutable, already-published handler image by exact
# digest. Adds ONLY a fixed, build-time symlink: /models -> /runpod-volume/models.
# No handler logic, CMD, entrypoint, dependency, or CLI worker code is changed.
# No weights are bundled; no runtime download; no init script; no RunPod
# resource is created by building or testing this image.
FROM ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-dev@sha256:1a74aefec1a7f77ebdbf7fd19ba2b9a816600f1e3d43ac7ce10b3b87367a3895

# OCI provenance labels
ARG VCS_REF="unknown"
ARG BUILD_DATE="unknown"
LABEL org.opencontainers.image.title="gfpgan-gpu-serverless-handler-volume-mapped" \
      org.opencontainers.image.description="Volume-mapped RunPod Serverless handler candidate: build-time /models -> /runpod-volume/models symlink only" \
      org.opencontainers.image.source="https://github.com/ai-photo-studio/ai-photo-studio" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="handler-volume-candidate-v1"

# The base handler image ends with USER workeruser; switch to root only to
# replace the empty /models directory with a fixed symlink.
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

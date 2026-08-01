# Volume-mapped RunPod Serverless handler candidate (UNPUBLISHED, build-test only)
# Derives from the CORRECTED Serverless handler candidate
# (apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-dev/), which itself
# wraps the corrected GFPGAN CLI worker candidate that fixes the confirmed
# GFPGANer.enhance() 3-value unpack defect. Adds ONLY a fixed, build-time
# symlink: /models -> /runpod-volume/models. No handler logic, CMD, entrypoint,
# dependency, or CLI worker code is changed. No weights are bundled; no
# runtime download; no init script; no RunPod resource is created by building
# or testing this image.
#
# Base image reference: the corrected Serverless handler candidate is
# UNPUBLISHED, so this Dockerfile derives from it by immutable LOCAL build
# reference within the same CI job/chain -- not a registry pull. The
# build-only chain workflow
# (.github/workflows/build-restore-unpack-fix-chain.yml) builds the corrected
# CLI candidate, then the corrected Serverless handler candidate, and loads
# the latter into the local Docker daemon tagged exactly
# "gfpgan-serverless-restore-fix:local" before building this image. This
# Dockerfile is not intended to be built standalone outside that chain.
FROM gfpgan-serverless-restore-fix:local

# OCI provenance labels
ARG VCS_REF="unknown"
ARG BUILD_DATE="unknown"
LABEL org.opencontainers.image.title="gfpgan-gpu-serverless-handler-volume-mapped-restore-unpack-fix" \
      org.opencontainers.image.description="Volume-mapped RunPod Serverless handler candidate on the CORRECTED (restore-unpack-fix) chain: build-time /models -> /runpod-volume/models symlink only" \
      org.opencontainers.image.source="https://github.com/ai-photo-studio/ai-photo-studio" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="handler-volume-restore-unpack-fix-candidate-v1"

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

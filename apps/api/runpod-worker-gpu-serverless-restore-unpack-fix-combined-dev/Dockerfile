# RunPod Serverless handler wrapper (UNPUBLISHED, build-test only, SOURCE ONLY -- not built by this task)
# COMBINED candidate: merges the cwd=WORKER_DIR stdout-protocol fix
# (apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-cwd-dev/) with the
# outputSha256-corrected CLI worker
# (apps/api/runpod-worker-gpu-dev-restore-unpack-fix/). Does NOT reimplement
# GFPGAN; invokes /srv/worker/worker.py via a bounded subprocess. No weights
# bundled; no runtime download; no RunPod resource created; not built or
# published by this task.
#
# Base image reference: the outputSha256-corrected CLI candidate is
# unpublished-by-this-task, so this Dockerfile derives from it by immutable
# LOCAL build reference within the same CI job/chain -- not a registry pull.
# A future authorized build-only workflow would build the CLI candidate
# first (apps/api/runpod-worker-gpu-dev-restore-unpack-fix/) and load it into
# the local Docker daemon tagged exactly "gfpgan-cli-restore-fix:local"
# before building this image, identical to the existing
# apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-dev/Dockerfile
# pattern. This Dockerfile is not intended to be built standalone.
FROM gfpgan-cli-restore-fix:local

# OCI provenance labels
ARG VCS_REF="unknown"
ARG BUILD_DATE="unknown"
LABEL org.opencontainers.image.title="gfpgan-gpu-serverless-handler-restore-unpack-fix-combined" \
      org.opencontainers.image.description="Thin RunPod Serverless handler wrapper combining the cwd=WORKER_DIR stdout-protocol fix with the outputSha256-corrected GFPGAN CLI worker candidate" \
      org.opencontainers.image.source="https://github.com/ai-photo-studio/ai-photo-studio" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="handler-restore-unpack-fix-combined-candidate-v1"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive \
    TORCH_FORCE_WEIGHTS_ONLY_LOAD=1 \
    APP_HOME=/srv/handler

# The base CLI image ends with USER workeruser; switch to root for install steps.
USER root

# Install the pinned RunPod Python SDK. No other heavy deps: the CLI worker image
# already provides torch/gfpgan/basicsr.
RUN python3.10 -m pip install --no-cache-dir runpod==1.11.0 \
    && python3.10 -m pip cache purge

WORKDIR ${APP_HOME}

COPY handler.py /srv/handler/handler.py

# Non-root runtime (base image already runs as workeruser; ensure handler dir readable).
RUN chown -R workeruser:workeruser /srv/handler
USER workeruser

# Clear the base CLI worker ENTRYPOINT so CMD runs the handler.
ENTRYPOINT []
CMD ["python3.10", "-u", "/srv/handler/handler.py"]

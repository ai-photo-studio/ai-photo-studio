# RunPod Serverless handler wrapper (UNPUBLISHED, build-test only)
# Thin wrapper around the immutable GFPGAN GPU CLI worker image, by immutable digest.
# Does NOT reimplement GFPGAN; invokes /srv/worker/worker.py via a bounded subprocess.
# No weights bundled; no runtime download; no RunPod resource created in this task.
FROM ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-dev@sha256:049a304b44bec75562a74eac3f5be312feacd6133da80a0dc86d0a136a86a63a

# OCI provenance labels
ARG VCS_REF="unknown"
ARG BUILD_DATE="unknown"
LABEL org.opencontainers.image.title="gfpgan-gpu-serverless-handler" \
      org.opencontainers.image.description="Thin RunPod Serverless handler wrapper around the immutable GFPGAN CLI worker" \
      org.opencontainers.image.source="https://github.com/ai-photo-studio/ai-photo-studio" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="handler-candidate-v1"

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

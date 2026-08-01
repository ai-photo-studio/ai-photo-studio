# RunPod Serverless handler wrapper (UNPUBLISHED, build-test only)
# Thin wrapper around the CORRECTED GFPGAN GPU CLI worker candidate
# (apps/api/runpod-worker-gpu-dev-restore-unpack-fix/), which fixes the
# confirmed GFPGANer.enhance() 3-value unpack defect (Gate 3 canary runs
# 30691401701 and 30692613631, EXIT_INTERNAL). Does NOT reimplement GFPGAN;
# invokes /srv/worker/worker.py via a bounded subprocess. No weights bundled;
# no runtime download; no RunPod resource created in this task.
#
# Base image reference: the corrected CLI candidate is UNPUBLISHED, so this
# Dockerfile derives from it by immutable LOCAL build reference within the
# same CI job/chain -- not a registry pull. The build-only chain workflow
# (.github/workflows/build-restore-unpack-fix-chain.yml) builds the CLI
# candidate first and loads it into the local Docker daemon tagged exactly
# "gfpgan-cli-restore-fix:local" before building this image. This Dockerfile
# is not intended to be built standalone outside that chain.
FROM gfpgan-cli-restore-fix:local

# OCI provenance labels
ARG VCS_REF="unknown"
ARG BUILD_DATE="unknown"
LABEL org.opencontainers.image.title="gfpgan-gpu-serverless-handler-restore-unpack-fix" \
      org.opencontainers.image.description="Thin RunPod Serverless handler wrapper around the corrected (restore-unpack-fix) GFPGAN CLI worker candidate" \
      org.opencontainers.image.source="https://github.com/ai-photo-studio/ai-photo-studio" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="handler-restore-unpack-fix-candidate-v1"

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

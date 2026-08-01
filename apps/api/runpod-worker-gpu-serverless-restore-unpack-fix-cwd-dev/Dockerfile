# RunPod Serverless handler wrapper (UNPUBLISHED, build-test only)
# Thin wrapper around the CORRECTED, PUBLISHED GFPGAN GPU CLI worker image
# (apps/api/runpod-worker-gpu-dev-restore-unpack-fix/), which fixes the
# confirmed GFPGANer.enhance() 3-value unpack defect. Does NOT reimplement
# GFPGAN; invokes /srv/worker/worker.py via a bounded subprocess. No weights
# bundled; no runtime download; no RunPod resource created in this task.
#
# This candidate's ONLY source change relative to
# apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-dev/ (the source
# of the currently deployed volume-mapped image's handler layer) is one
# added keyword argument in handler.py's subprocess.run() call: cwd=WORKER_DIR.
# This was confirmed offline (no RunPod call; see
# docs/restoration/runpod-invalid-json-stdout-fix.json) to be the cause of
# Gate 3 canary run 30702245089's "worker produced invalid non-JSON output"
# failure: without an explicit cwd=, the worker subprocess inherited this
# handler container's own /srv/handler working directory, which does not
# match the relative path gfpgan/facexlib use internally to look up the
# pre-mounted auxiliary face weights, causing a spurious stdout print (and
# an attempted, unauthorized runtime download) that corrupted the
# single-JSON-document stdout protocol.
#
# Base image reference: the corrected CLI candidate IS published (Gate 2
# APPROVED/PUBLISHED/CONSUMED as part of the three-image chain, PR #91,
# merge 31a6e19), so this Dockerfile derives from it by immutable registry
# digest -- an anonymous GHCR pull, not a mutating action. This candidate
# itself is NOT published and does not replace the currently deployed
# image; publication requires a fresh, separate Gate 2 review.
FROM ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-dev-restore-unpack-fix@sha256:f97245866394310c3aed065e48ebac63555e8f451480b79eebea98f437cb4052

# OCI provenance labels
ARG VCS_REF="unknown"
ARG BUILD_DATE="unknown"
LABEL org.opencontainers.image.title="gfpgan-gpu-serverless-handler-restore-unpack-fix-cwd" \
      org.opencontainers.image.description="Thin RunPod Serverless handler wrapper around the corrected (restore-unpack-fix) GFPGAN CLI worker, with the subprocess cwd stdout-protocol fix" \
      org.opencontainers.image.source="https://github.com/ai-photo-studio/ai-photo-studio" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="handler-restore-unpack-fix-cwd-candidate-v1"

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

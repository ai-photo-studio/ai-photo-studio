# GFPGAN GPU worker candidate (UNPUBLISHED, build-test only)
# Uses an externally-mounted, checksum-verified weight at /models/GFPGANv1.4.pth.
# No weight is bundled; no runtime weight download occurs; no production routing.
# Base image is pinned by immutable digest for linux/amd64.
# Built on ubuntu with official PyTorch cu121 CUDA wheels (no CUDA base toolkit,
# which avoids the nvidia-cublas version conflict in basicsr build metadata).
FROM ubuntu:22.04@sha256:0d779ea97881505f5ef0039336ee85edba27519bdba968c284c86ee066a973c8

# OCI provenance labels
ARG VCS_REF="unknown"
ARG BUILD_DATE="unknown"
LABEL org.opencontainers.image.title="gfpgan-gpu-worker-candidate" \
      org.opencontainers.image.description="Unpublished GFPGAN v1.4 GPU worker candidate (external weight, checksum-verified)" \
      org.opencontainers.image.source="https://github.com/ai-photo-studio/ai-photo-studio" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="candidate-gate2-readiness"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive \
    APP_HOME=/srv/worker

# Minimal runtime packages only (git is a build-time tool and is omitted at runtime).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3.10-venv python3-pip libglib2.0-0 libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR ${APP_HOME}

# Install CUDA-enabled PyTorch/TorchVision from the official PyTorch index.
RUN python3.10 -m pip install --no-cache-dir \
    torch==2.1.2 torchvision==0.16.2 --index-url https://download.pytorch.org/whl/cu121 \
    && python3.10 -m pip cache purge

COPY requirements.txt ./
RUN python3.10 -m pip install --no-cache-dir -r requirements.txt \
    && python3.10 -m pip cache purge \
    && rm -rf ${APP_HOME}/.cache

# Read-only-safe temp dir for transient output (output is returned as base64, not written).
ENV TMPDIR=/tmp

COPY worker.py ./
COPY test_worker.py ./

# External weight mount point; no weight is bundled. Run as a non-root user.
RUN useradd -r -m -u 1001 workeruser \
    && mkdir -p /models /tmp \
    && chown -R workeruser:workeruser /models /tmp
USER workeruser
WORKDIR ${APP_HOME}

ENTRYPOINT ["python3.10", "/srv/worker/worker.py"]

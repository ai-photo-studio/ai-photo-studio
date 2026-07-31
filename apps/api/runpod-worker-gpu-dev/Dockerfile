# GFPGAN GPU worker candidate (UNPUBLISHED, build-test only)
# Uses an externally-mounted, checksum-verified weight at /models/GFPGANv1.4.pth.
# No weight is bundled; no runtime weight download occurs.
# Built on ubuntu with official PyTorch cu121 CUDA wheels (no CUDA base toolkit,
# which avoids the nvidia-cublas version conflict in basicsr build metadata).
FROM ubuntu:22.04

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive \
    APP_HOME=/srv/worker

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3.10-venv python3-pip git libglib2.0-0 libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR ${APP_HOME}

# Install CUDA-enabled PyTorch/TorchVision from the official PyTorch index.
RUN python3.10 -m pip install --no-cache-dir \
    torch==2.1.2 torchvision==0.16.2 --index-url https://download.pytorch.org/whl/cu121

COPY requirements.txt ./
RUN python3.10 -m pip install --no-cache-dir -r requirements.txt

COPY worker.py ./
COPY test_worker.py ./

RUN mkdir -p /models && useradd -r -m -u 1001 workeruser
USER workeruser
WORKDIR ${APP_HOME}

ENTRYPOINT ["python3.10", "/srv/worker/worker.py"]

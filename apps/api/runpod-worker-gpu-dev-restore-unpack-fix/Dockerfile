# GFPGAN GPU worker candidate (UNPUBLISHED, build-test only)
# Uses externally-mounted, checksum-verified weights at /models/...
# No weight is bundled; no runtime weight download occurs; no production routing.
# Base image is pinned by immutable digest for linux/amd64.
# Built on ubuntu with official PyTorch cu126 CUDA wheels.
# BasicSR v1.4.2 is built from the pinned official source with the tracked
# one-line functional_tensor->functional patch applied explicitly at build.
#
# This candidate's ONLY source change relative to apps/api/runpod-worker-gpu-dev
# (the source of the currently APPROVED/PUBLISHED/CONSUMED immutable CLI base
# digest sha256:049a304b44bec75562a74eac3f5be312feacd6133da80a0dc86d0a136a86a63a)
# is one line in worker.py's _run_restore(): the GFPGANer.enhance() return
# value is now unpacked as a 3-tuple ("_, _, out = model.enhance(...)")
# instead of 2 ("out, _ = model.enhance(...)"), matching the verified real
# gfpgan==1.3.8 contract. This candidate is NOT published and does not
# replace the approved image; publication requires a fresh, separate Gate 2
# review.
FROM ubuntu:22.04@sha256:0d779ea97881505f5ef0039336ee85edba27519bdba968c284c86ee066a973c8

# OCI provenance labels
ARG VCS_REF="unknown"
ARG BUILD_DATE="unknown"
LABEL org.opencontainers.image.title="gfpgan-gpu-worker-candidate-restore-unpack-fix" \
      org.opencontainers.image.description="Unpublished GFPGAN v1.4 GPU worker candidate: corrects the GFPGANer.enhance() 3-value unpack that caused Gate 3 canary EXIT_INTERNAL failures" \
      org.opencontainers.image.source="https://github.com/ai-photo-studio/ai-photo-studio" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="candidate-restore-unpack-fix-v1"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive \
    TORCH_FORCE_WEIGHTS_ONLY_LOAD=1 \
    APP_HOME=/srv/worker

# Minimal runtime packages. git/curl/patch are build-time only and removed before runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-venv python3-pip python3-setuptools python3-wheel curl ca-certificates patch \
    libglib2.0-0 libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Fetch official BasicSR v1.4.2 source, verify pinned SHA-256, and apply the
# tracked one-line patch (functional_tensor->functional). The patch file
# itself lives at the single canonical tracked path
# docs/restoration/patches/basicsr-v142-functional-tensor-fix.patch and is
# copied into this build context at build time (matching the existing
# build-gfpgan-gpu-candidate.yml pattern); it is not duplicated here. Not
# built or published in this task -- build-only source correction only.
COPY basicsr-v142-functional-tensor-fix.patch /build/patch.diff
RUN curl -fsSL --retry 5 --retry-all-errors -o basicsr-142.tar.gz \
      "https://github.com/XPixelGroup/BasicSR/archive/651835a1b9d38dbbdaf45750f56906be2364f01a.tar.gz" \
    && echo "f23fe3558fff4cc038186ffd417d69d8bc1fd0eea2a9c755c401e9dfecc18152  basicsr-142.tar.gz" | sha256sum -c - \
    && awk '/^diff --git/{flag=1} flag' patch.diff > one.patch \
    && echo "834cf12b1e625ce59ec2af4152421d2c6c113b8f0a54ba4544f8937b014289ac  one.patch" | sha256sum -c - \
    && tar -xzf basicsr-142.tar.gz \
    && mv BasicSR-651835a1b9d38dbbdaf45750f56906be2364f01a basicsr-142 \
    && cd basicsr-142 && patch -p1 -i /build/one.patch \
    && grep -q "from torchvision.transforms.functional import rgb_to_grayscale" basicsr/data/degradations.py \
    && ! grep -q "functional_tensor" basicsr/data/degradations.py

WORKDIR ${APP_HOME}

# Install common Python deps, then CUDA-enabled PyTorch from the cu126 index.
RUN python3.10 -m pip install --no-cache-dir \
    numpy==1.26.4 opencv-python-headless==4.9.0.80 Pillow==10.2.0 PyYAML==6.0.1 tqdm==4.66.2 scipy==1.11.4 \
    && python3.10 -m pip install --no-cache-dir \
    torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu126

# Install patched BasicSR from source, then gfpgan/facexlib (with deps).
RUN python3.10 -m pip install --no-cache-dir --no-deps --no-build-isolation /build/basicsr-142 \
    && python3.10 -m pip install --no-cache-dir gfpgan==1.3.8 facexlib==0.3.0 \
    && python3.10 -m pip install --no-cache-dir --force-reinstall --no-deps --no-build-isolation /build/basicsr-142 \
    && python3.10 -m pip cache purge

# Verify the installed BasicSR is the patched build.
RUN grep -q "from torchvision.transforms.functional import rgb_to_grayscale" \
      /usr/local/lib/python3.10/dist-packages/basicsr/data/degradations.py \
    && ! grep -q "functional_tensor" /usr/local/lib/python3.10/dist-packages/basicsr/data/degradations.py

# Remove build-time tools and source before runtime.
RUN apt-get purge -y curl git patch 2>/dev/null || true; apt-get autoremove -y; rm -rf /build

COPY worker.py /srv/worker/worker.py
COPY test_worker.py /srv/worker/test_worker.py

# External weight mount root and non-root runtime user.
RUN useradd -r -m -u 1001 workeruser \
    && mkdir -p /models/facexlib /tmp \
    && chown -R workeruser:workeruser /models /tmp \
    && mkdir -p /srv/worker/gfpgan/weights \
    && chown -R workeruser:workeruser /srv/worker \
    && chmod -R a+rX /srv/worker
USER workeruser
WORKDIR ${APP_HOME}

ENTRYPOINT ["python3.10", "/srv/worker/worker.py"]

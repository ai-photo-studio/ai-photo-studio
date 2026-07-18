FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    wget \
    libgl1 \
    libglib2.0-0 \
    g++ \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Pre-install torch from the PyTorch CUDA index (avoids CUDA toolkit pip package bloat)
# Then install remaining packages which depend on basicsr
RUN pip install --no-cache-dir \
    torch==2.5.1 torchvision==0.20.1 \
    --index-url https://download.pytorch.org/whl/cu124 && \
    pip install --no-cache-dir -r requirements.txt

COPY app.py handler.py download_checkpoints.sh ./

# Download model checkpoints at build time so they're baked into the image
RUN mkdir -p /models && bash download_checkpoints.sh

ENV MODEL_DEVICE=cuda
ENV MODEL_CACHE_DIR=/models
ENV LAMA_CHECKPOINT=/models/lama.pth
ENV GFPGAN_CHECKPOINT=/models/GFPGAN.pth
ENV CODEFORMER_CHECKPOINT=/models/codeformer.pth
ENV DDCOLOR_CHECKPOINT=/models/ddcolor.pth
ENV REALESRGAN_CHECKPOINT=/models/RealESRGAN_x4.pth
ENV SERVERLESS=true
ENV PYTHONUNBUFFERED=1
ENV QUEUE_TIMEOUT_SECONDS=60
ENV PROCESSING_TIMEOUT_SECONDS=90
ENV ABSOLUTE_TIMEOUT_SECONDS=150

RUN mkdir -p /models && useradd -m -u 1000 appuser && chown -R appuser:appuser /app /models
USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["sh", "-c", "if [ \"$SERVERLESS\" = \"true\" ] && python -c \"import runpod\" 2>/dev/null; then python handler.py; else uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1; fi"]
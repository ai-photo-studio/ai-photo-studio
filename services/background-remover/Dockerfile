FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UVICORN_WORKERS=1
ENV REMBG_MODEL=u2netp

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./
COPY handler.py ./
COPY providers ./providers
COPY job.py ./

EXPOSE 8000

# RunPod Serverless entry point (used when SERVERLESS=true)
ENV SERVERLESS=true
CMD ["sh", "-c", "if [ \"$SERVERLESS\" = \"true\" ] && python -c \"import runpod\" 2>/dev/null; then python handler.py; else uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1; fi"]

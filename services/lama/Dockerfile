FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY app.py ./
COPY handler.py ./

EXPOSE 8000

ENV SERVERLESS=true
CMD ["sh", "-c", "if [ \"$SERVERLESS\" = \"true\" ] && python -c \"import runpod\" 2>/dev/null; then python handler.py; else uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}; fi"]

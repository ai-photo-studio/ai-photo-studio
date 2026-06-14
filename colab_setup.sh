#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

cd "$ROOT_DIR"

log() {
  printf '\n==> %s\n' "$1"
}

wait_for_health() {
  local port="$1"
  local name="$2"

  "$PYTHON_BIN" - "$port" "$name" <<'PY'
import json
import sys
import time
import urllib.request

port = int(sys.argv[1])
name = sys.argv[2]
deadline = time.time() + 90
last_error = None

while time.time() < deadline:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if payload.get("success") is True:
                print(f"{name}: healthy")
                raise SystemExit(0)
    except Exception as exc:  # noqa: BLE001
        last_error = exc
        time.sleep(1)

raise SystemExit(f"{name}: health check timed out: {last_error}")
PY
}

start_service() {
  local app_dir="$1"
  local port="$2"
  local name="$3"
  local log_file="$4"

  log "Starting ${name} on port ${port}"
  nohup "$PYTHON_BIN" -m uvicorn app:app \
    --app-dir "$app_dir" \
    --host 127.0.0.1 \
    --port "$port" \
    >"$log_file" 2>&1 &
}

log "Python runtime"
"$PYTHON_BIN" - <<'PY'
import platform
import sys

print(platform.python_version())
print(sys.executable)
PY

log "Installing validation dependencies"
"$PYTHON_BIN" -m pip install --upgrade pip setuptools wheel
"$PYTHON_BIN" -m pip install --upgrade -r requirements-validation.txt

log "Verifying GPU and model imports"
"$PYTHON_BIN" - <<'PY'
import importlib

checks = [
    ("torch", "torch"),
    ("rembg", "rembg"),
    ("ultralytics", "ultralytics"),
    ("open_clip", "open_clip"),
    ("realesrgan", "realesrgan"),
]

for label, module_name in checks:
    module = importlib.import_module(module_name)
    print(f"{label}: import ok ({getattr(module, '__file__', 'built-in')})")

import torch

print(f"cuda_available={torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"cuda_device={torch.cuda.get_device_name(0)}")
    print(f"cuda_version={torch.version.cuda}")
else:
    print("cuda_device=cpu-fallback")
PY

log "Launching local validation services"
start_service "services/product-classifier" 8001 "product-classifier" "/tmp/product-classifier.log"
start_service "services/yolo-detector" 8002 "yolo-detector" "/tmp/yolo-detector.log"
start_service "services/real-esrgan" 8003 "real-esrgan" "/tmp/real-esrgan.log"
start_service "services/ic-light-lab" 8004 "ic-light-lab" "/tmp/ic-light-lab.log"
start_service "services/background-remover" 8005 "background-remover" "/tmp/background-remover.log"

wait_for_health 8001 "product-classifier"
wait_for_health 8002 "yolo-detector"
wait_for_health 8003 "real-esrgan"
wait_for_health 8004 "ic-light-lab"
wait_for_health 8005 "background-remover"

log "Running validation script"
"$PYTHON_BIN" scripts/validate-ai.py

log "Validation output"
cat scripts/validation-output.json

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
PID_FILE="$ROOT_DIR/.colab_validation_pids"
LOG_DIR="$ROOT_DIR/.colab_validation_logs"

mkdir -p "$LOG_DIR"

log() {
  printf '\n==> %s\n' "$1"
}

install_deps() {
  log "Upgrading pip tooling"
  "$PYTHON_BIN" -m pip install --upgrade pip setuptools wheel

  log "Installing pinned validation requirements"
  "$PYTHON_BIN" -m pip install --upgrade -r "$ROOT_DIR/requirements-validation.txt"
}

run_preflight() {
  log "Running Colab preflight checks"
  "$ROOT_DIR/scripts/colab-preflight.sh"
}

start_service() {
  local app_dir="$1"
  local port="$2"
  local name="$3"
  local log_file="$LOG_DIR/${name}.log"

  log "Starting ${name} on port ${port}"
  nohup "$PYTHON_BIN" -m uvicorn app:app \
    --app-dir "$ROOT_DIR/$app_dir" \
    --host 127.0.0.1 \
    --port "$port" \
    >"$log_file" 2>&1 &
  echo $! >>"$PID_FILE"
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

launch_services() {
  : >"$PID_FILE"
  start_service "services/product-classifier" 8001 "product-classifier"
  start_service "services/yolo-detector" 8002 "yolo-detector"
  start_service "services/real-esrgan" 8003 "real-esrgan"
  start_service "services/ic-light-lab" 8004 "ic-light-lab"
  start_service "services/background-remover" 8005 "background-remover"
}

wait_for_services() {
  wait_for_health 8001 "product-classifier"
  wait_for_health 8002 "yolo-detector"
  wait_for_health 8003 "real-esrgan"
  wait_for_health 8004 "ic-light-lab"
  wait_for_health 8005 "background-remover"
}

run_validation() {
  log "Running validation script"
  "$PYTHON_BIN" "$ROOT_DIR/scripts/validate-ai.py"
  log "Validation output"
  cat "$ROOT_DIR/scripts/validation-output.json"
}

cleanup() {
  log "Stopping validation services"
  if [[ -f "$PID_FILE" ]]; then
    while IFS= read -r pid; do
      if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
    done <"$PID_FILE"
    rm -f "$PID_FILE"
  fi
  rm -rf "$LOG_DIR"
  log "Cleanup complete"
}

case "${1:-}" in
  setup)
    install_deps
    run_preflight
    ;;
  validate)
    install_deps
    run_preflight
    launch_services
    wait_for_services
    run_validation
    ;;
  cleanup)
    cleanup
    ;;
  *)
    cat <<'EOF'
Usage:
  bash colab_setup.sh setup
  bash colab_setup.sh validate
  bash colab_setup.sh cleanup

Commands:
  setup     Install pinned dependencies and run preflight checks.
  validate  Install dependencies, run preflight, start services, and run validation.
  cleanup   Stop validation services and remove temporary logs.
EOF
    exit 1
    ;;
esac

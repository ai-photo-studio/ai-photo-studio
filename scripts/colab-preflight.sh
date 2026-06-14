#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

"$PYTHON_BIN" - <<'PY'
import platform
import sys

def fail(message: str) -> None:
    raise SystemExit(message)

try:
    import torch
except Exception as exc:  # noqa: BLE001
    fail(f"torch import failed: {exc}")

checks = {}
checks["python_version"] = platform.python_version()
checks["python_executable"] = sys.executable
checks["cuda_available"] = torch.cuda.is_available()
checks["cuda_version"] = torch.version.cuda
checks["gpu_available"] = False

if not torch.cuda.is_available():
    fail("GPU/CUDA not available in this runtime")

checks["gpu_available"] = True
checks["gpu_name"] = torch.cuda.get_device_name(0)

try:
    import numpy
    import scipy
    import numba
except Exception as exc:  # noqa: BLE001
    fail(f"numpy/scipy/numba compatibility check failed: {exc}")

try:
    import rembg
    import ultralytics
    import open_clip
    import realesrgan
except Exception as exc:  # noqa: BLE001
    fail(f"model import failed: {exc}")

print("preflight-ok")
print(f"python={checks['python_version']}")
print(f"executable={checks['python_executable']}")
print(f"cuda_available={checks['cuda_available']}")
print(f"cuda_version={checks['cuda_version']}")
print(f"gpu_name={checks['gpu_name']}")
print(f"numpy={numpy.__version__}")
print(f"scipy={scipy.__version__}")
print(f"numba={numba.__version__}")
print("rembg=ok")
print("ultralytics=ok")
print("open_clip=ok")
print("realesrgan=ok")
PY

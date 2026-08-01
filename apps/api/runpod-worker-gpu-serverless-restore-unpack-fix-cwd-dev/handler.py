#!/usr/bin/env python3
"""RunPod Serverless handler wrapper around the immutable GFPGAN GPU CLI worker.

This wrapper is a thin, separate candidate. It does NOT reimplement GFPGAN
inference. It invokes the immutable CLI worker image's `/srv/worker/worker.py`
through a bounded subprocess, using temporary files only.

Safety invariants:
- start with runpod.serverless.start
- inline/base64 image input only; arbitrary URLs rejected
- bounded 120s subprocess timeout
- subprocess exit code and structured JSON validated
- temp input/output files removed in finally blocks
- providerPostCount: 0, productionRoutingAllowed: false preserved
- all three external weights required for restore (validated inside the CLI worker)
- no secret/stack-trace/local-path leakage in errors
- exactly one logical job per handler invocation

This candidate corrects one defect confirmed offline (no RunPod call; see
docs/restoration/runpod-invalid-json-stdout-fix.json): subprocess.run() below
now passes cwd=WORKER_DIR, matching the CLI worker's own script directory
(the same directory its Dockerfile's WORKDIR/ENTRYPOINT already runs it from
when the CLI image is used standalone). Without this, the worker subprocess
silently inherits the Serverless handler container's own working directory
(/srv/handler), which does not match the relative path
gfpgan==1.3.8/facexlib==0.3.0 use internally to look up the pre-mounted
auxiliary face weights -- causing a spurious "Downloading: ..." stdout print
(and an attempted, unauthorized runtime network download) that corrupts the
single-JSON-document stdout protocol this handler depends on, observed live
as Gate 3 canary run 30702245089's "worker produced invalid non-JSON output"
failure. Everything else in this file is unchanged from
apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-dev/handler.py.
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import time

WORKER = ["python3.10", "/srv/worker/worker.py"]
WORKER_DIR = os.path.dirname(WORKER[1])  # "/srv/worker" -- derived, not duplicated
MAX_INPUT_BYTES = 8_000_000          # mirrors the CLI worker's limit
EXECUTION_TIMEOUT_SECONDS = 120      # bounded, matches CLI worker

# Subprocess exit codes from the CLI worker (kept aligned).
EXIT_OK = 0
EXIT_INPUT = 2
EXIT_WEIGHT = 4
EXIT_CUDA = 5

provider_post_count = 0
production_routing_allowed = False


def _safe_error(message, exc=None):
    """Return a clean error dict; never expose secrets, stack traces, or paths."""
    detail = str(exc) if exc is not None else ""
    # Strip the sensitive CLI-worker path prefix to avoid local-path leakage.
    detail = detail.replace("/srv/worker/worker.py", "worker")
    cleaned = [line for line in detail.splitlines() if not line.startswith("Traceback")]
    return {"error": message, "detail": cleaned[-1] if cleaned else ""}


def validate_input(input_obj):
    """Validate the handler job input.

    Returns the validated dict or raises ValueError with a user-safe message.
    """
    if not isinstance(input_obj, dict):
        raise ValueError("input must be a JSON object")
    mode = input_obj.get("mode")
    if mode not in ("health", "gpu_probe", "restore"):
        raise ValueError("unsupported mode")
    if mode == "restore":
        image_b64 = input_obj.get("imageBase64")
        if not isinstance(image_b64, str) or not image_b64:
            raise ValueError("restore requires imageBase64 (inline/base64 only)")
        try:
            raw = base64.b64decode(image_b64, validate=True)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("imageBase64 is not valid base64") from exc
        if not raw or len(raw) > MAX_INPUT_BYTES:
            raise ValueError("image size out of range")
    return input_obj


def run_cli_worker(validated_input):
    """Invoke the immutable CLI worker via a bounded subprocess using temp files."""
    in_fd, in_path = tempfile.mkstemp(prefix="gfpgan-in-", suffix=".json")
    try:
        with os.fdopen(in_fd, "w") as in_f:
            json.dump(validated_input, in_f)
        start = time.monotonic()
        try:
            proc = subprocess.run(
                [*WORKER, "--input-file", in_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=EXECUTION_TIMEOUT_SECONDS,
                check=False,
                cwd=WORKER_DIR,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError("subprocess execution timed out") from exc
        elapsed = time.monotonic() - start

        # Validate the subprocess exit code.
        if proc.returncode not in (EXIT_OK, EXIT_INPUT, EXIT_WEIGHT, EXIT_CUDA):
            raise RuntimeError(f"worker exited with unexpected code {proc.returncode}")

        # Parse structured JSON stdout; reject invalid/non-JSON output.
        try:
            result = json.loads(proc.stdout)
        except (json.JSONDecodeError, TypeError) as exc:
            raise RuntimeError("worker produced invalid non-JSON output") from exc
        if not isinstance(result, dict):
            raise RuntimeError("worker output was not a JSON object")
        # Preserve fail-closed invariants.
        result["providerPostCount"] = provider_post_count
        result["productionRoutingAllowed"] = production_routing_allowed
        result["elapsedSeconds"] = round(elapsed, 3)
        return result
    finally:
        try:
            if os.path.exists(in_path):
                os.remove(in_path)
        except OSError:
            pass


def handler(job):
    """RunPod handler: exactly one logical job per invocation."""
    try:
        job_input = job.get("input") if isinstance(job, dict) else None
        validated = validate_input(job_input)
    except (ValueError, TypeError) as exc:
        return _safe_error(str(exc), exc)
    except Exception as exc:  # noqa: BLE001
        return _safe_error("invalid request", exc)

    try:
        return run_cli_worker(validated)
    except TimeoutError as exc:
        return _safe_error("execution timed out", exc)
    except (RuntimeError, ValueError) as exc:
        return _safe_error(str(exc), exc)
    except Exception as exc:  # noqa: BLE001
        return _safe_error("internal handler error", exc)


# RunPod Serverless entrypoint (required). Imported lazily so host unit tests
# can import this module without the RunPod SDK installed.
if __name__ == "__main__":
    import runpod  # noqa: PLC0415

    runpod.serverless.start({"handler": handler})

#!/usr/bin/env python3
"""Contract/security tests for the GPU worker candidate.

These tests never download the real GFPGAN weight and never run real GPU
inference. They validate parsing, health, gpu_probe, fail-closed behavior,
weight contract, isolation, and output determinism.
"""
import base64
import io
import json
import os
import subprocess
import sys

import worker as w

EXIT_OK = 0
EXIT_INPUT = 2
EXIT_VALIDATION = 3
EXIT_WEIGHT = 4
EXIT_CUDA = 5


def _tiny_png():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color=(10, 20, 30)).save(buf, "PNG")
    return buf.getvalue()


def test_health():
    out = w.handle({"mode": "health"})
    assert out["ok"] is True
    assert out["mode"] == "health"
    assert out["providerPostCount"] == 0
    assert out["productionRoutingAllowed"] is False
    assert "python" in out


def test_parsing_missing_input():
    try:
        w.read_request()
    except w._InputError:
        pass
    else:
        raise AssertionError("expected input error")


def test_no_such_mode():
    try:
        w.handle({"mode": "nope"})
    except w._InputError:
        pass
    else:
        raise AssertionError("expected input error")


def test_oversized_image():
    big = base64.b64encode(b"x" * (w.MAX_INPUT_BYTES + 1)).decode("ascii")
    try:
        w.handle({"mode": "restore", "imageBase64": big})
    except w._InputError:
        pass
    else:
        raise AssertionError("expected oversized input error")


def test_missing_weight_fails_closed():
    # restore must fail when the weight path is absent
    img = base64.b64encode(_tiny_png()).decode("ascii")
    if not os.path.exists(w.EXPECTED_WEIGHT_PATH):
        try:
            w.handle({"mode": "restore", "imageBase64": img})
        except (w._WeightError, w._CudaError):
            pass
        else:
            raise AssertionError("expected fail-closed restore without weight/CUDA")
    else:
        # If a weight happens to be present, restore must still fail without CUDA.
        try:
            w.handle({"mode": "restore", "imageBase64": img})
        except (w._WeightError, w._CudaError):
            pass
        else:
            raise AssertionError("expected fail-closed restore without CUDA")


def test_cuda_unavailable_reject():
    info = w.cuda_info()
    if not info["available"]:
        img = base64.b64encode(_tiny_png()).decode("ascii")
        try:
            w.handle({"mode": "restore", "imageBase64": img})
        except (w._CudaError, w._WeightError):
            pass
        else:
            raise AssertionError("expected CUDA-unavailable rejection")
    elif os.path.exists(w.EXPECTED_WEIGHT_PATH):
        # CUDA exists but restore must reject a fake weight (size/checksum).
        img = base64.b64encode(_tiny_png()).decode("ascii")
        try:
            w.handle({"mode": "restore", "imageBase64": img})
        except (w._WeightError, w._CudaError):
            pass
        else:
            raise AssertionError("expected weight/checksum rejection")


def test_deterministic_metadata():
    img = base64.b64encode(_tiny_png()).decode("ascii")
    # health+gpu_probe are deterministic
    a = w.handle({"mode": "gpu_probe"})
    b = w.handle({"mode": "gpu_probe"})
    assert a["available"] == b["available"]
    assert str(a) == str(b)


def test_no_runtime_download_code():
    src = open(os.path.join(os.path.dirname(__file__), "worker.py")).read()
    low = src.lower()
    # Flag actual network-client download mechanisms, not the word "download"
    # which legitimately appears in fail-closed documentation strings.
    for bad in ("requests.get", "urllib.request", "urlopen", "wget", "curl ", "requests.post", "http.client", "socket.connect", "httpx."):
        assert bad not in low, f"runtime download code present: {bad}"
    # The weight path must not include a URL.
    assert "http" not in low, "URL present in worker"


def test_secret_scan():
    src = open(os.path.join(os.path.dirname(__file__), "worker.py")).read()
    for bad in ("RUNPOD_API_KEY", "api_key", "password", "secret", "token"):
        assert bad.lower() not in src.lower(), f"secret-like string present: {bad}"


def test_production_isolation():
    assert w.provider_post_count == 0
    assert w.production_routing_allowed is False
    src = open(os.path.join(os.path.dirname(__file__), "worker.py")).read()
    assert "prisma" not in src.lower() and "postgres" not in src.lower() and "express" not in src.lower()


def test_safe_load_enforced():
    # enforce_safe_load must pass when TORCH_FORCE_WEIGHTS_ONLY_LOAD=1 and the
    # opt-out env is unset; must fail otherwise.
    before = os.environ.get("TORCH_FORCE_WEIGHTS_ONLY_LOAD")
    os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"
    os.environ.pop("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", None)
    w.enforce_safe_load()
    os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "0"
    try:
        w.enforce_safe_load()
        raise AssertionError("expected safe-load enforcement failure")
    except w._WeightError:
        pass
    os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"
    os.environ["TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"] = "1"
    try:
        w.enforce_safe_load()
        raise AssertionError("expected opt-out rejection")
    except w._WeightError:
        pass
    os.environ.pop("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", None)
    if before is None:
        os.environ.pop("TORCH_FORCE_WEIGHTS_ONLY_LOAD", None)
    else:
        os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = before


def test_three_weight_contract_fail_closed():
    # validate_weight must fail (size or checksum) when the real weights are
    # absent or of the wrong size; it must not silently pass.
    os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"
    try:
        w.validate_weight()
    except w._WeightError:
        pass
    else:
        # If all three real weights happen to be mounted, this is acceptable.
        if not (os.path.exists(w.EXPECTED_WEIGHT_PATH) and os.path.exists(w.AUX_DETECTION_PATH)
                and os.path.exists(w.AUX_PARSING_PATH)):
            raise AssertionError("validate_weight passed without all three weights present")


def test_aux_symlink_preparation_no_download():
    # prepare_face_aux_symlinks must create symlinks (or no-op if already present)
    # and must not require network. It links to the reserved /models/facexlib paths.
    try:
        w.prepare_face_aux_symlinks()
    except w._WeightError:
        # symlink creation can fail if the mount is absent; that is acceptable
        # but must not reach the network.
        pass
    else:
        for name in ("detection_Resnet50_Final.pth", "parsing_parsenet.pth"):
            link = os.path.join(w.FACE_WEIGHTS_DIR, name)
            if os.path.islink(link):
                assert os.readlink(link).startswith("/models/facexlib/"), "symlink must point to /models/facexlib"
            elif os.path.exists(link):
                raise AssertionError(f"{name} existed as a real file, not a symlink")


def test_cli_health_stdin():
    proc = subprocess.run(
        [sys.executable, w.__file__, "--stdin"],
        input='{"mode":"health"}',
        text=True,
        capture_output=True,
        timeout=60,
    )
    assert proc.returncode == EXIT_OK
    data = json.loads(proc.stdout)
    assert data["mode"] == "health"
    assert data["providerPostCount"] == 0


def test_cli_input_file():
    import tempfile
    d = tempfile.mkdtemp()
    p = os.path.join(d, "req.json")
    with open(p, "w") as f:
        f.write('{"mode":"gpu_probe"}')
    proc = subprocess.run([sys.executable, w.__file__, "--input-file", p], text=True, capture_output=True, timeout=60)
    assert proc.returncode == EXIT_OK
    assert json.loads(proc.stdout)["mode"] == "gpu_probe"


def test_cli_corrupt_input():
    proc = subprocess.run(
        [sys.executable, w.__file__, "--stdin"],
        input='not-json',
        text=True,
        capture_output=True,
        timeout=60,
    )
    assert proc.returncode == EXIT_INPUT
    assert proc.stdout == ""
    assert proc.stderr != ""


def test_cli_oversized():
    big = json.dumps({"mode": "restore", "imageBase64": base64.b64encode(b"x" * (w.MAX_INPUT_BYTES + 1)).decode("ascii")})
    proc = subprocess.run([sys.executable, w.__file__, "--stdin"], input=big, text=True, capture_output=True, timeout=120)
    assert proc.returncode == EXIT_INPUT
    assert proc.stdout == ""
    assert proc.stderr != ""


if __name__ == "__main__":
    for fn in [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]:
        fn()
        print(f"ok {fn.__name__}")
    print("gpu worker candidate tests passed")

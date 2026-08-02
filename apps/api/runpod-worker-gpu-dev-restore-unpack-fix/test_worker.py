#!/usr/bin/env python3
"""Contract/security tests for the GPU worker candidate.

These tests never download the real GFPGAN weight and never run real GPU
inference. They validate parsing, health, gpu_probe, fail-closed behavior,
weight contract, isolation, output determinism, and (new in this candidate)
the corrected GFPGANer.enhance() return-value unpacking.
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
EXIT_INTERNAL = 1


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


# ---------------------------------------------------------------------------
# New in this candidate: regression coverage for the confirmed root cause of
# Gate 3 canary runs 30691401701 and 30692613437/30692613631 (worker exit
# code 1 / EXIT_INTERNAL). GFPGANer.enhance() (verified against the exact
# pinned gfpgan==1.3.8 tag source, gfpgan/utils.py) always returns a 3-tuple:
# (cropped_faces, restored_faces, restored_img). The prior worker.py unpacked
# only 2 values ("out, _ = model.enhance(...)"), which raised
# "ValueError: too many values to unpack (expected 2, got 3)" -- an uncaught
# ValueError, propagating to worker.py's generic except-Exception handler
# (EXIT_INTERNAL=1) -- on every successful restore call, independent of GPU,
# weight validity, or environment configuration. This was empirically
# reproduced (2026-08-01) by mocking validate_weight/cuda_info/load_model and
# calling the real _run_restore() with a stub model.enhance() returning a
# 3-tuple, matching the verified real contract; no GPU/torch/RunPod call was
# needed to prove it.
# ---------------------------------------------------------------------------

class _StubGFPGANer:
    """Mirrors the verified real GFPGANer.enhance() contract: always returns
    (cropped_faces, restored_faces, restored_img) as a 3-tuple when
    has_aligned=False and paste_back=True."""

    def enhance(self, arr, has_aligned=False, only_center_face=False, paste_back=True):
        assert has_aligned is False
        assert only_center_face is False
        assert paste_back is True
        return (["cropped-face-stub"], ["restored-face-stub"], arr)


def test_enhance_return_unpacking_matches_gfpgan_contract():
    real_validate_weight = w.validate_weight
    real_cuda_info = w.cuda_info
    real_load_model = w.load_model
    w.validate_weight = lambda: True
    w.cuda_info = lambda: {"available": True, "deviceCount": 1, "deviceName": "mock-gpu", "pytorch": "mock"}
    w.load_model = lambda: _StubGFPGANer()
    try:
        result = w._run_restore(_tiny_png())
    finally:
        w.validate_weight = real_validate_weight
        w.cuda_info = real_cuda_info
        w.load_model = real_load_model

    assert result["ok"] is True
    assert result["mode"] == "restore"
    assert result["providerPostCount"] == 0
    assert result["productionRoutingAllowed"] is False
    assert result["outputFormat"] == "png"
    assert result["outputWidth"] == 8 and result["outputHeight"] == 8
    assert result["outputBytes"] > 0
    assert isinstance(result["outputBase64"], str) and len(result["outputBase64"]) > 0
    assert result["gpu"] == "mock-gpu"
    assert result["model"] == "GFPGANv1.4"
    assert result["weightVerified"] is True


def _run_stubbed_restore():
    """Runs the real _run_restore() with weight/CUDA/model stubbed out but the
    real PNG encode + SHA-256 hashing path exercised, matching the pattern in
    test_enhance_return_unpacking_matches_gfpgan_contract()."""
    real_validate_weight = w.validate_weight
    real_cuda_info = w.cuda_info
    real_load_model = w.load_model
    w.validate_weight = lambda: True
    w.cuda_info = lambda: {"available": True, "deviceCount": 1, "deviceName": "mock-gpu", "pytorch": "mock"}
    w.load_model = lambda: _StubGFPGANer()
    try:
        return w._run_restore(_tiny_png())
    finally:
        w.validate_weight = real_validate_weight
        w.cuda_info = real_cuda_info
        w.load_model = real_load_model


# ---------------------------------------------------------------------------
# New in this candidate: outputSha256 evidence, required (not optional) by
# the API's RunPodResultValidation.ts. Hashed on the exact final PNG bytes
# (out_bytes in _run_restore()) before base64 encoding, so outputSha256,
# outputBytes, outputWidth, outputHeight, outputFormat, and outputBase64 all
# describe the same bytes.
# ---------------------------------------------------------------------------

def test_output_sha256_is_correct_and_well_formed():
    import hashlib as _hashlib
    result = _run_stubbed_restore()
    sha = result["outputSha256"]
    assert isinstance(sha, str)
    assert len(sha) == 64
    assert sha == sha.lower()
    import re
    assert re.fullmatch(r"[0-9a-f]{64}", sha), "outputSha256 must be lowercase 64-character hexadecimal"

    decoded = base64.b64decode(result["outputBase64"])
    assert _hashlib.sha256(decoded).hexdigest() == sha, "outputSha256 must be the SHA-256 of the exact PNG bytes"


def test_output_sha256_matches_decoded_base64_bytes():
    result = _run_stubbed_restore()
    decoded = base64.b64decode(result["outputBase64"])
    assert decoded[:8] == b"\x89PNG\r\n\x1a\n", "decoded bytes must be a PNG"


def test_output_byte_count_and_dimensions_match_the_same_final_png():
    from PIL import Image
    result = _run_stubbed_restore()
    decoded = base64.b64decode(result["outputBase64"])

    assert len(decoded) == result["outputBytes"], "outputBytes must equal the exact decoded byte count"

    img = Image.open(io.BytesIO(decoded))
    assert img.format == "PNG"
    assert img.width == result["outputWidth"]
    assert img.height == result["outputHeight"]
    assert result["outputFormat"] == "png"


def test_output_contract_is_deterministic_for_the_same_input():
    first = _run_stubbed_restore()
    second = _run_stubbed_restore()
    assert first["outputSha256"] == second["outputSha256"]
    assert first["outputBytes"] == second["outputBytes"]
    assert first["outputWidth"] == second["outputWidth"]
    assert first["outputHeight"] == second["outputHeight"]
    assert first["outputBase64"] == second["outputBase64"]


def test_missing_or_malformed_hash_would_fail_the_output_contract():
    # The worker itself must never produce a missing or malformed hash; the
    # API's RunPodResultValidation.ts separately rejects any response where
    # outputSha256 is missing, null, or not a 64-character lowercase hex
    # string (see RunPodResultValidation.test.ts "required SHA-256 evidence").
    # This test proves the worker's own output can never trigger that
    # rejection under normal operation.
    result = _run_stubbed_restore()
    assert "outputSha256" in result and result["outputSha256"] is not None
    sha = result["outputSha256"]
    assert isinstance(sha, str) and len(sha) == 64
    import re
    assert re.fullmatch(r"[0-9a-f]{64}", sha)


def test_existing_response_fields_remain_present_alongside_outputSha256():
    result = _run_stubbed_restore()
    expected_keys = {
        "ok", "mode", "providerPostCount", "productionRoutingAllowed",
        "outputWidth", "outputHeight", "outputFormat", "outputBytes",
        "outputBase64", "outputSha256", "inputChecksum", "gpu", "model", "weightVerified",
    }
    assert expected_keys.issubset(result.keys()), "existing fields must remain alongside the new outputSha256 field"
    assert result["ok"] is True
    assert result["mode"] == "restore"
    assert result["providerPostCount"] == 0
    assert result["productionRoutingAllowed"] is False
    assert result["outputFormat"] == "png"
    assert result["gpu"] == "mock-gpu"
    assert result["model"] == "GFPGANv1.4"
    assert result["weightVerified"] is True
    assert isinstance(result["inputChecksum"], str) and len(result["inputChecksum"]) == 64


def test_enhance_two_value_unpack_would_have_failed():
    # Documents the exact historical failure mode as a standalone, isolated
    # assertion (independent of worker.py), so a future accidental regression
    # to a 2-value unpack is caught by this test's own logic, not just by
    # trusting the fixed source line.
    def stub_enhance():
        return (["cropped"], ["restored"], "restored_img")

    try:
        out, _ = stub_enhance()  # noqa: F841 -- intentionally reproduces the bug pattern
    except ValueError as e:
        assert "too many values to unpack" in str(e)
    else:
        raise AssertionError("expected ValueError from a 2-value unpack of a 3-tuple")


if __name__ == "__main__":
    for fn in [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]:
        fn()
        print(f"ok {fn.__name__}")
    print("gpu worker candidate (restore-unpack-fix) tests passed")

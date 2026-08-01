#!/usr/bin/env python3
"""GFPGAN GPU worker candidate (UNPUBLISHED, build-test only).

Real GFPGAN v1.4 inference uses an externally-mounted, checksum-verified
weight at /models/GFPGANv1.4.pth. No weight is bundled and no runtime
weight download occurs. restore fails closed without CUDA or a valid weight.

Modes:
  health    - container + Python deps check (no CUDA required)
  gpu_probe - report CUDA availability and device (no model load)
  restore   - GFPGAN v1.4 inference; fails closed without CUDA/valid weight
"""
import base64
import hashlib
import io
import json
import os
import signal
import sys

EXPECTED_WEIGHT_PATH = "/models/GFPGANv1.4.pth"
EXPECTED_WEIGHT_SIZE = 348632874
EXPECTED_WEIGHT_SHA256 = "e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad"

# Auxiliary facexlib weights (externally mounted, checksum-verified, read-only)
AUX_DETECTION_PATH = "/models/facexlib/detection_Resnet50_Final.pth"
AUX_DETECTION_SIZE = 109497761
AUX_DETECTION_SHA256 = "6d1de9c2944f2ccddca5f5e010ea5ae64a39845a86311af6fdf30841b0a5a16d"
AUX_PARSING_PATH = "/models/facexlib/parsing_parsenet.pth"
AUX_PARSING_SIZE = 85331193
AUX_PARSING_SHA256 = "3d558d8d0e42c20224f13cf5a29c79eba2d59913419f945545d8cf7b72920de2"
# FaceRestoreHelper expects aux weights at gfpgan/weights/<filename>; we create
# symlinks there pointing to the read-only /models mounts.
FACE_WEIGHTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gfpgan", "weights")

MAX_INPUT_BYTES = 8_000_000
TIMEOUT_SECONDS = 120

# Exit codes
EXIT_OK = 0
EXIT_INPUT = 2
EXIT_VALIDATION = 3
EXIT_WEIGHT = 4
EXIT_CUDA = 5
EXIT_MODEL = 6
EXIT_INTERNAL = 1

provider_post_count = 0
production_routing_allowed = False


def sha256_file(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            data = f.read(chunk)
            if not data:
                break
            h.update(data)
    return h.hexdigest()


def enforce_safe_load():
    import os as _os
    if _os.environ.get("TORCH_FORCE_WEIGHTS_ONLY_LOAD") != "1":
        raise _WeightError("TORCH_FORCE_WEIGHTS_ONLY_LOAD must be set to 1")
    if _os.environ.get("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"):
        raise _WeightError("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD must not be set")


def _validate_one_weight(path, size, sha, label):
    if not os.path.exists(path):
        raise _WeightError(f"{label} weight not found at {path}")
    got_size = os.path.getsize(path)
    if got_size != size:
        raise _WeightError(f"{label} weight size mismatch: {got_size} != {size}")
    digest = sha256_file(path)
    if digest.lower() != sha.lower():
        raise _WeightError(f"{label} weight checksum mismatch: {digest}")
    return True


def validate_weight():
    enforce_safe_load()
    _validate_one_weight(EXPECTED_WEIGHT_PATH, EXPECTED_WEIGHT_SIZE, EXPECTED_WEIGHT_SHA256, "GFPGANv1.4 main")
    _validate_one_weight(AUX_DETECTION_PATH, AUX_DETECTION_SIZE, AUX_DETECTION_SHA256, "facexlib detection")
    _validate_one_weight(AUX_PARSING_PATH, AUX_PARSING_SIZE, AUX_PARSING_SHA256, "facexlib parsing")
    return True


def prepare_face_aux_symlinks():
    """Create gfpgan/weights/<name> symlinks -> mounted /models/facexlib/<name>.

    facexlib's load_file_from_url returns the local file when it exists;
    creating these symlinks prevents any runtime download.
    """
    os.makedirs(FACE_WEIGHTS_DIR, exist_ok=True)
    pairs = {
        "detection_Resnet50_Final.pth": AUX_DETECTION_PATH,
        "parsing_parsenet.pth": AUX_PARSING_PATH,
    }
    for name, target in pairs.items():
        link = os.path.join(FACE_WEIGHTS_DIR, name)
        if not os.path.exists(link):
            try:
                os.symlink(target, link)
            except OSError as e:  # noqa: BLE001
                raise _WeightError(f"could not create symlink for {name}: {e}") from e


class _WeightError(Exception):
    pass


def cuda_info():
    try:
        import torch
    except Exception as e:  # noqa: BLE001
        return {"available": False, "cudaBuild": None, "error": str(e)}
    return {
        "available": torch.cuda.is_available(),
        "deviceCount": torch.cuda.device_count() if torch.cuda.is_available() else 0,
        "deviceName": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "pytorch": torch.__version__,
    }


def load_model():
    import torch
    from gfpgan import GFPGANer
    prepare_face_aux_symlinks()
    model = GFPGANer(
        model_path=EXPECTED_WEIGHT_PATH,
        upscale=1,
        arch="clean",
        channel_multiplier=2,
        bg_upsampler=None,
    )
    return model


def _run_restore(image_bytes):
    import numpy as np
    from PIL import Image
    validate_weight()
    info = cuda_info()
    if not info["available"]:
        raise _CudaError("CUDA is required for restore; not available")
    model = load_model()
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(img)
    try:
        # GFPGANer.enhance() (verified against the exact pinned gfpgan==1.3.8
        # tag source, gfpgan/utils.py) always returns a 3-tuple:
        # (cropped_faces, restored_faces, restored_img). The prior 2-value
        # unpack ("out, _ = model.enhance(...)") raised
        # "ValueError: too many values to unpack (expected 2, got 3)" on
        # every successful restore call, regardless of GPU/weight/env state --
        # the confirmed root cause of Gate 3 canary runs 30691401701 and
        # 30692613631 (worker exit code 1 / EXIT_INTERNAL). restored_img is
        # non-None here because paste_back=True and has_aligned=False.
        _, _, out = model.enhance(arr, has_aligned=False, only_center_face=False, paste_back=True)
    finally:
        # best-effort; no state shared across requests
        pass
    out_img = Image.fromarray(out)
    buf = io.BytesIO()
    out_img.save(buf, "PNG")
    out_bytes = buf.getvalue()
    return {
        "ok": True,
        "mode": "restore",
        "providerPostCount": provider_post_count,
        "productionRoutingAllowed": production_routing_allowed,
        "outputWidth": out_img.width,
        "outputHeight": out_img.height,
        "outputFormat": "png",
        "outputBytes": len(out_bytes),
        "outputBase64": base64.b64encode(out_bytes).decode("ascii"),
        "inputChecksum": hashlib.sha256(image_bytes).hexdigest(),
        "gpu": info["deviceName"],
        "model": "GFPGANv1.4",
        "weightVerified": True,
    }


class _CudaError(Exception):
    pass


def build_response(mode, payload):
    out = {"ok": True, "mode": mode, "providerPostCount": provider_post_count,
           "productionRoutingAllowed": production_routing_allowed}
    out.update(payload)
    return out


def read_request():
    args = sys.argv[1:]
    use_stdin = "--stdin" in args
    file_index = [i for i, a in enumerate(args) if a == "--input-file"]
    if use_stdin and file_index:
        raise _InputError("exactly one input source is required")
    if file_index and len(file_index) > 1:
        raise _InputError("exactly one input source is required")
    if use_stdin:
        text = sys.stdin.read()
    elif file_index:
        pos = file_index[0]
        if pos + 1 >= len(args) or args[pos + 1].startswith("--"):
            raise _InputError("input file is required")
        with open(args[pos + 1], "r", encoding="utf-8-sig") as f:
            text = f.read()
    else:
        raise _InputError("use --stdin or --input-file")
    if not text or not text.strip():
        raise _InputError("input is empty")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise _InputError(f"invalid JSON: {e}") from e


class _InputError(Exception):
    pass


def handle(input):
    mode = input.get("mode")
    if mode == "health":
        try:
            import torch
            torch_v = torch.__version__
        except Exception:  # noqa: BLE001
            torch_v = None
        return build_response("health", {
            "python": sys.version.split()[0],
            "torch": torch_v,
            "weightPresent": os.path.exists(EXPECTED_WEIGHT_PATH),
            "auxDetectionPresent": os.path.exists(AUX_DETECTION_PATH),
            "auxParsingPresent": os.path.exists(AUX_PARSING_PATH),
            "safeLoad": os.environ.get("TORCH_FORCE_WEIGHTS_ONLY_LOAD") == "1",
        })
    if mode == "gpu_probe":
        info = cuda_info()
        info["providerPostCount"] = provider_post_count
        info["productionRoutingAllowed"] = production_routing_allowed
        return build_response("gpu_probe", info)
    if mode == "restore":
        image_b64 = input.get("imageBase64")
        if not isinstance(image_b64, str) or not image_b64:
            raise _InputError("restore imageBase64 is required")
        image_bytes = base64.b64decode(image_b64)
        if not image_bytes or len(image_bytes) > MAX_INPUT_BYTES:
            raise _InputError("invalid image size")
        return _run_restore(image_bytes)
    raise _InputError(f"unsupported mode: {mode}")


def _timeout_handler(signum, frame):
    raise _TimeoutError("worker timeout")


class _TimeoutError(Exception):
    pass


def main():
    # SIGALRM is unavailable on some platforms (e.g. Windows host runs).
    if hasattr(signal, "SIGALRM"):
        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(TIMEOUT_SECONDS)
    try:
        req = read_request()
        result = handle(req)
        print(json.dumps(result))
        sys.exit(EXIT_OK)
    except _InputError as e:
        print(str(e), file=sys.stderr)
        sys.exit(EXIT_INPUT)
    except _WeightError as e:
        print(str(e), file=sys.stderr)
        sys.exit(EXIT_WEIGHT)
    except _CudaError as e:
        print(str(e), file=sys.stderr)
        sys.exit(EXIT_CUDA)
    except _TimeoutError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
    except Exception as e:  # noqa: BLE001
        print(f"internal error: {e}", file=sys.stderr)
        sys.exit(EXIT_INTERNAL)


if __name__ == "__main__":
    main()

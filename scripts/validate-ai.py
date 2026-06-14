import json
import io
import sys
import time
import platform
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SERVICES = [
    ("product-classifier", "classifier"),
    ("yolo-detector", "yolo"),
    ("real-esrgan", "esrgan"),
    ("ic-light-lab", "iclight"),
    ("background-remover", "rembg"),
]

CATEGORIES = ["perfume", "cosmetics", "furniture", "electronics", "food", "shoes", "fashion"]


def fail(message: str) -> None:
    raise SystemExit(message)


def get_gpu_info() -> dict:
    info = {
        "available": False,
        "deviceName": None,
        "cudaAvailable": False,
        "cudaVersion": None,
        "pythonVersion": platform.python_version(),
    }
    try:
        import torch

        info["cudaAvailable"] = torch.cuda.is_available()
        if torch.cuda.is_available():
            info["available"] = True
            info["deviceName"] = torch.cuda.get_device_name(0)
            info["cudaVersion"] = torch.version.cuda
    except Exception as exc:  # noqa: BLE001
        info["error"] = str(exc)
    return info


def import_or_fail(module_name: str, label: str | None = None):
    try:
        module = __import__(module_name)
        return module
    except Exception as exc:  # noqa: BLE001
        fail(f"{label or module_name} import failed: {exc}")


def create_test_image(category: str) -> bytes:
    from PIL import Image, ImageDraw
    
    img = Image.new("RGBA", (720, 920), (249, 244, 236, 255))
    draw = ImageDraw.Draw(img)
    
    shapes = {
        "perfume": [(240, 120, 480, 640)],
        "cosmetics": [(240, 120, 480, 640)],
        "furniture": [(100, 200, 620, 680)],
        "electronics": [(200, 150, 520, 650)],
        "food": [(150, 100, 570, 700)],
        "shoes": [(180, 200, 540, 680)],
        "fashion": [(200, 100, 520, 700)],
    }
    
    for coords in shapes.get(category, [(200, 150, 520, 650)]):
        draw.rectangle(coords, fill=(156 + hash(category) % 100, 92 + hash(category) % 100, 48 + hash(category) % 100, 255))
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def validate_service_health(port: int, name: str) -> dict:
    start = time.time()
    try:
        url = f"http://127.0.0.1:{port}/health"
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
            return {"service": name, "status": "ok", "latencyMs": int((time.time() - start) * 1000), "data": data}
    except Exception as e:
        return {"service": name, "status": "error", "error": str(e)}


def validate_classifier(port: int, category: str) -> dict:
    image = create_test_image(category)
    start = time.time()
    try:
        url = f"http://127.0.0.1:{port}/classify"
        req = urllib.request.Request(
            url,
            data=image,
            headers={"Content-Type": "image/png", "X-File-Name": f"{category}-test.png"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            result = data.get("data", {})
            return {
                "category": category,
                "detected": result.get("category"),
                "confidence": result.get("confidence"),
                "processingProfile": result.get("processingProfile"),
                "latencyMs": int((time.time() - start) * 1000),
            }
    except Exception as e:
        return {"category": category, "error": str(e)}


def validate_yolo(port: int, category: str) -> dict:
    image = create_test_image(category)
    start = time.time()
    try:
        url = f"http://127.0.0.1:{port}/detect?marginPct=0.12&canvasWidth=1024&canvasHeight=1024"
        req = urllib.request.Request(
            url,
            data=image,
            headers={"Content-Type": "image/png", "X-File-Name": f"{category}-test.png"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            result = data.get("data", {})
            quality = result.get("quality", {})
            return {
                "category": category,
                "detected": result.get("detection", {}).get("label"),
                "confidence": result.get("detection", {}).get("confidence"),
                "overallScore": quality.get("overallScore"),
                "blurScore": quality.get("blurScore"),
                "latencyMs": int((time.time() - start) * 1000),
            }
    except Exception as e:
        return {"category": category, "error": str(e)}


def main():
    start_time = time.time()
    gpu_info = get_gpu_info()

    pil = import_or_fail("PIL", "pillow")
    import_or_fail("rembg")
    import_or_fail("ultralytics")
    import_or_fail("open_clip")
    import_or_fail("realesrgan")

    try:
        import numpy  # noqa: F401
        import scipy  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        fail(f"numpy/scipy compatibility check failed: {exc}")

    results = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "runtimeSeconds": None,
        "environment": {
            "pythonVersion": platform.python_version(),
            "pythonExecutable": sys.executable,
            "platform": platform.platform(),
            "gpu": gpu_info,
        },
        "healthChecks": [],
        "classificationResults": [],
        "yoloResults": [],
        "imports": {
            "pillow": "ok",
            "rembg": "ok",
            "ultralytics": "ok",
            "open_clip": "ok",
            "realesrgan": "ok",
            "numpy": "ok",
            "scipy": "ok",
        },
        "timing": {
            "classificationMs": 0,
            "yoloMs": 0,
            "healthChecksMs": 0,
            "totalMs": 0,
        },
    }

    ports = {
        "classifier": 8001,
        "yolo": 8002,
        "esrgan": 8003,
        "iclight": 8004,
        "rembg": 8005,
    }

    print("=== Classification Validation ===")
    classification_start = time.time()
    for category in CATEGORIES:
        result = validate_classifier(ports["classifier"], category)
        results["classificationResults"].append(result)
        status = "ok" if "error" not in result else "error"
        print(f"  {category}: {status} - detected={result.get('detected')}, confidence={result.get('confidence')}")
    results["timing"]["classificationMs"] = int((time.time() - classification_start) * 1000)

    print("\n=== YOLO Detection Validation ===")
    yolo_start = time.time()
    for category in CATEGORIES:
        result = validate_yolo(ports["yolo"], category)
        results["yoloResults"].append(result)
        status = "ok" if "error" not in result else "error"
        print(f"  {category}: {status} - score={result.get('overallScore')}")
    results["timing"]["yoloMs"] = int((time.time() - yolo_start) * 1000)

    print("\n=== Health Checks ===")
    health_start = time.time()
    for name, port in ports.items():
        result = validate_service_health(port, name)
        results["healthChecks"].append(result)
        print(f"  {name}: {result['status']}")
    results["timing"]["healthChecksMs"] = int((time.time() - health_start) * 1000)

    out_path = ROOT / "validation-output.json"
    results["runtimeSeconds"] = round(time.time() - start_time, 3)
    results["timing"]["totalMs"] = int((time.time() - start_time) * 1000)
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nResults written to: {out_path}")


if __name__ == "__main__":
    main()

from __future__ import annotations

import base64
import io
import json
import socket
import sys
import threading
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw
from uvicorn import Config, Server

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as service  # noqa: E402

app = service.app


def make_test_image() -> bytes:
    img = Image.new("RGBA", (640, 480), (248, 244, 238, 255))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((150, 120, 490, 390), radius=42, fill=(40, 113, 225, 255))
    draw.ellipse((205, 160, 435, 350), fill=(245, 198, 82, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_health(base_url: str) -> None:
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/health", timeout=2) as response:
                payload = response.read().decode("utf-8")
                if '"success":true' in payload.replace(" ", ""):
                    return
        except Exception:  # noqa: BLE001
            time.sleep(0.25)
    raise RuntimeError("health check did not become ready")


def main() -> None:
    port = get_free_port()
    base_url = f"http://127.0.0.1:{port}"
    config = Config(app=app, host="127.0.0.1", port=port, log_level="error", access_log=False)
    server = Server(config=config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        wait_for_health(base_url)
        image = make_test_image()
        req = urllib.request.Request(
            f"{base_url}/relight?style=warm",
            data=image,
            headers={"Content-Type": "image/png", "X-File-Name": "test-product.png"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
            assert response.status == 200
            assert payload["success"] is True
            data = payload["data"]
            for key in ("relightedImageBase64", "shadowImageBase64", "comparisonImageBase64", "originalImageBase64"):
                assert len(base64.b64decode(data[key])) > 0
        print("IC-Light local tests passed.")
    finally:
        server.should_exit = True
        thread.join(timeout=10)


if __name__ == "__main__":
    main()

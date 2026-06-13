from __future__ import annotations

import json
import base64
import io
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
    img = Image.new("RGBA", (900, 600), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((180, 120, 720, 520), radius=48, fill=(18, 130, 218, 255))
    draw.ellipse((270, 170, 630, 470), fill=(246, 194, 72, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_health(base_url: str) -> None:
    deadline = time.time() + 20
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/health", timeout=2) as response:
                payload = response.read().decode("utf-8")
                if '"success": true' in payload or '"success":true' in payload:
                    return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(0.25)
    raise RuntimeError("health check did not become ready") from last_error


def request(method: str, url: str, body: bytes | None = None, content_type: str | None = None, file_name: str | None = None):
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    if file_name:
        headers["X-File-Name"] = file_name
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=30)


def main() -> None:
    port = get_free_port()
    base_url = f"http://127.0.0.1:{port}"

    config = Config(app=app, host="127.0.0.1", port=port, log_level="error", access_log=False)
    server = Server(config=config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        wait_for_health(base_url)

        with request("GET", f"{base_url}/health") as health:
            payload = health.read().decode("utf-8")
            assert health.status == 200, payload
            assert '"success":true' in payload.replace(" ", "")

        image = make_test_image()

        with request("POST", f"{base_url}/detect", image, "image/png", "test-product.png") as resp:
            payload = resp.read().decode("utf-8")
            assert resp.status == 200, payload
            data = json.loads(payload)
            assert data["success"] is True
            assert "croppedImageBase64" in payload
            assert "centeredImageBase64" in payload
            assert "overallScore" in payload

            encoded = data["data"]["images"]["centeredImageBase64"]
            decoded = base64.b64decode(encoded)
            assert len(decoded) > 0

        print("FastAPI yolo detector local tests passed.")
    finally:
        server.should_exit = True
        thread.join(timeout=10)


if __name__ == "__main__":
    main()

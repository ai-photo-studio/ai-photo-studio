#!/usr/bin/env python3
"""Deterministic synthetic, non-personal canary image fixture generator.

Produces a fixed 512x512 RGB PNG with a deterministic gradient/pattern,
a fixed SHA-256, small enough for the Serverless payload limit, and runnable
through the offline GFPGAN aligned-face processing contract
(enhance(has_aligned=True) produces one processed aligned face).

No customer/personal image; no downloaded third-party image; fully reproducible
from this tracked source.
"""
import argparse
import hashlib
import io
import pathlib

from PIL import Image

WIDTH = 512
HEIGHT = 512
FORMAT = "PNG"
# Expected SHA-256 of the generated PNG (deterministic). Computed over the exact bytes
# produced by this generator with default size/determinism.
EXPECTED_SHA256 = "436392b72ef200574a1b14548861264ccdcfedd9e81a4e6ed8710e730fd2e699"


def generate_bytes():
    """Generate the deterministic PNG bytes and return them."""
    img = Image.new("RGB", (WIDTH, HEIGHT))
    px = img.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            # Deterministic structural gradient; not a personal image and not a face.
            r = (x * 3) % 256
            g = (y * 5) % 256
            b = ((x + y) * 7) % 256
            px[x, y] = (r, g, b)
    buf = io.BytesIO()
    img.save(buf, FORMAT)
    return buf.getvalue()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="output PNG path")
    args = parser.parse_args()
    data = generate_bytes()
    digest = hashlib.sha256(data).hexdigest()
    pathlib.Path(args.out).write_bytes(data)
    print(f"wrote {args.out} size={len(data)} sha256={digest}")
    print(f"expected_sha256={EXPECTED_SHA256}")
    if digest != EXPECTED_SHA256:
        print("WARNING: generated SHA-256 differs from EXPECTED_SHA256 (drift)")
        raise SystemExit(2)


if __name__ == "__main__":
    main()

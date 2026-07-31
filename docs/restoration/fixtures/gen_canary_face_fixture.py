#!/usr/bin/env python3
"""Deterministic synthetic, non-personal canary image fixture generator.

Produces a fixed 512x512 RGB PNG with a deterministic gradient/pattern,
a fixed SHA-256, small enough for the Serverless payload limit, and runnable
through the offline GFPGAN aligned-face processing contract.

Uses only the Python standard library (struct + zlib) so it runs on a bare
runner without Pillow. No customer/personal image; no downloaded third-party
image; fully reproducible from this tracked source.
"""
import argparse
import hashlib
import pathlib
import struct
import zlib

WIDTH = 512
HEIGHT = 512
# Expected SHA-256 of the generated PNG (deterministic; computed over the exact
# bytes produced by this generator at 512x512).
EXPECTED_SHA256 = "f4368b08487cfc366f049becbcbc63c7e2345808902021639e051b9c3e08cc1f"


def _png_chunk(tag, payload):
    data = tag + payload
    return struct.pack(">I", len(payload)) + data + struct.pack(">I", zlib.crc32(data) & 0xFFFFFFFF)


def generate_bytes():
    """Build a valid 8-bit RGB PNG with a deterministic gradient/pattern."""
    raw = bytearray()
    for y in range(HEIGHT):
        raw.append(0)  # filter type 0 (None) per scanline
        for x in range(WIDTH):
            r = (x * 3) % 256
            g = (y * 5) % 256
            b = ((x + y) * 7) % 256
            raw.extend((r, g, b))
    co = zlib.compressobj(level=0)
    idat_data = co.compress(bytes(raw)) + co.flush()
    ihdr = struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += _png_chunk(b"IHDR", ihdr)
    png += _png_chunk(b"IDAT", idat_data)
    png += _png_chunk(b"IEND", b"")
    return png


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="output PNG path")
    args = parser.parse_args()
    data = generate_bytes()
    digest = sha256(data)
    pathlib.Path(args.out).write_bytes(data)
    print(f"wrote {args.out} size={len(data)} sha256={digest}")
    print(f"expected_sha256={EXPECTED_SHA256}")
    if digest != EXPECTED_SHA256:
        print("WARNING: generated SHA-256 differs from EXPECTED_SHA256 (drift)")
        raise SystemExit(2)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Bounded, sanitized PNG verification tool for the Gate 3 canary workflow.

Classifies exactly three outcomes without ever leaking a filesystem path,
secret, base64 payload, or full stack trace:
  - tool_unavailable (exit 2): Pillow is missing or not pinned to the exact
    approved version. This must be reported as a TOOLING failure, never as
    evidence that the producer's image bytes are invalid.
  - image_decode_failed (exit 1): Pillow is available and correctly
    versioned, but Image.open(...).verify() raised on the given file.
  - verified (exit 0): Image.open(...).verify() succeeded.

Prints exactly one line of JSON to stdout:
  {"verifyPassed": bool, "exceptionClass": str, "sanitizedMessage": str}
sanitizedMessage is truncated to 200 characters and has every path-like
token (containing "/" or "\\") stripped, so it can never reveal a runner
filesystem path, and it is built only from the exception's own message
text -- never from image bytes, base64, or environment values.
"""
import json
import sys

EXPECTED_PILLOW_VERSION = "12.2.0"
MAX_MESSAGE_LENGTH = 200


def _sanitize(text):
    safe_tokens = [t for t in text.split() if "/" not in t and "\\" not in t]
    return " ".join(safe_tokens)[:MAX_MESSAGE_LENGTH]


def _emit(verify_passed, exception_class, message, exit_code):
    print(json.dumps({
        "verifyPassed": verify_passed,
        "exceptionClass": exception_class,
        "sanitizedMessage": _sanitize(message),
    }))
    sys.exit(exit_code)


def main():
    if len(sys.argv) != 2:
        _emit(False, "UsageError", "exactly one file path argument is required", 2)
        return

    try:
        import PIL
    except Exception as exc:  # noqa: BLE001
        _emit(False, "PillowUnavailable", f"{type(exc).__name__}: import failed", 2)
        return

    if getattr(PIL, "__version__", None) != EXPECTED_PILLOW_VERSION:
        _emit(False, "PillowVersionMismatch", f"expected {EXPECTED_PILLOW_VERSION}", 2)
        return

    from PIL import Image  # noqa: PLC0415

    try:
        Image.open(sys.argv[1]).verify()
    except Exception as exc:  # noqa: BLE001
        _emit(False, type(exc).__name__, str(exc), 1)
        return

    _emit(True, "", "", 0)


if __name__ == "__main__":
    main()

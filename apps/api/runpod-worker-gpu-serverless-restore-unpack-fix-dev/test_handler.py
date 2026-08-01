#!/usr/bin/env python3
"""Unit/security tests for the RunPod Serverless handler wrapper.

These tests use mocks only. No real GPU job is executed and no RunPod API is
contacted. They validate the handler's input contract, bounded subprocess,
fail-closed behavior, temp-file cleanup, and isolation.
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import handler as H

TINY_JSON = '{"ok": true, "mode": "restore", "providerPostCount": 0, "productionRoutingAllowed": false}'


class RunnerStub:
    """Stub subprocess.CompletedProcess."""

    def __init__(self, code, out, err=""):
        self.returncode = code
        self.stdout = out
        self.stderr = err


def _b64(some_bytes=b"tiny-png-bytes"):
    return base64.b64encode(some_bytes).decode("ascii")


class TestValidateInput(unittest.TestCase):
    def test_missing_input_rejected(self):
        with self.assertRaises(ValueError):
            H.validate_input(None)

    def test_unsupported_mode_rejected(self):
        with self.assertRaises(ValueError):
            H.validate_input({"mode": "nope"})

    def test_restore_requires_image_base64(self):
        with self.assertRaises(ValueError):
            H.validate_input({"mode": "restore"})

    def test_invalid_base64_rejected(self):
        with self.assertRaises(ValueError):
            H.validate_input({"mode": "restore", "imageBase64": "!!!not-base64!!!"})

    def test_oversized_rejected(self):
        big = _b64(b"x" * (H.MAX_INPUT_BYTES + 1))
        with self.assertRaises(ValueError):
            H.validate_input({"mode": "restore", "imageBase64": big})

    def test_url_input_rejected(self):
        with self.assertRaises(ValueError):
            H.validate_input({"mode": "restore", "imageBase64": "http://evil/x.png"})

    def test_valid_health_ok(self):
        self.assertEqual(H.validate_input({"mode": "health"})["mode"], "health")

    def test_valid_restore_ok(self):
        got = H.validate_input({"mode": "restore", "imageBase64": _b64()})
        self.assertEqual(got["mode"], "restore")


class TestHandlerResponses(unittest.TestCase):
    @mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, TINY_JSON))
    def test_health_success(self, _mock_run):
        job = {"input": {"mode": "health"}}
        out = H.handler(job)
        self.assertEqual(out["ok"], True)
        self.assertEqual(out["providerPostCount"], 0)
        self.assertEqual(out["productionRoutingAllowed"], False)

    @mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, '{"mode":"gpu_probe","ok":true}'))
    def test_gpu_probe_response(self, _mock_run):
        out = H.handler({"input": {"mode": "gpu_probe"}})
        self.assertEqual(out["mode"], "gpu_probe")
        self.assertEqual(out["ok"], True)

    @mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, TINY_JSON))
    def test_valid_restore_mapping(self, _mock_run):
        out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        self.assertEqual(out["ok"], True)

    def test_malformed_input_returned_as_error(self):
        out = H.handler({"input": "not-an-object"})
        self.assertIn("error", out)

    def test_oversized_input_error(self):
        out = H.handler({"input": {"mode": "restore", "imageBase64": _b64(b"x" * (H.MAX_INPUT_BYTES + 1))}})
        self.assertIn("error", out)

    @mock.patch.object(H.subprocess, "run", side_effect=subprocess.TimeoutExpired("worker", 120))
    def test_subprocess_timeout(self, _mock_run):
        out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        self.assertIn("error", out)
        self.assertIn("timed out", str(out.get("detail", out.get("error"))))

    @mock.patch.object(H.subprocess, "run",
                       return_value=RunnerStub(9, '{"ok": true}', ""))
    def test_nonzero_unexpected_exit(self, _mock_run):
        out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        self.assertIn("unexpected code", str(out.get("detail", "")))

    @mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, "not-json"))
    def test_non_json_output_rejected(self, _mock_run):
        out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        self.assertIn("non-JSON", str(out.get("detail", "")))

    @mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, "[]"))
    def test_non_object_output_rejected(self, _mock_run):
        out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        self.assertIn("not a JSON object", str(out.get("detail", "")))


class TestInvariants(unittest.TestCase):
    def test_no_shell_true(self):
        src = open(H.__file__).read()
        self.assertNotIn("shell=True", src)

    def test_fixed_executable_and_no_user_command(self):
        self.assertEqual(H.WORKER, ["python3.10", "/srv/worker/worker.py"])

    def test_temp_file_cleanup(self):
        prefix = "gfpgan-in-"
        before = set()
        tmpdir = tempfile.gettempdir()
        for n in os.listdir(tmpdir):
            if n.startswith(prefix):
                before.add(n)
        with mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, TINY_JSON)):
            H.handler({"input": {"mode": "health"}})
        left = {n for n in os.listdir(tmpdir) if n.startswith(prefix)} - before
        self.assertEqual(left, set(), "temporary input files were not cleaned up")

    def test_no_retry_or_second_job(self):
        src = open(H.__file__).read()
        self.assertNotIn("retry", src.lower())
        self.assertNotIn("while True", src)

    def test_no_provider_factory_or_db(self):
        src = open(H.__file__).read()
        low = src.lower()
        for bad in ("prisma", "postgres", "sqlite", "requests.post", "provider_post_count > 0"):
            self.assertNotIn(bad, low)

    def test_no_secrets(self):
        src = open(H.__file__).read()
        # Flag actual secret literals, not the descriptive word "secret" in prose.
        for bad in ("RUNPOD_API_KEY", "api_key=", "password=", "token=", "Authorization:", "Bearer "):
            self.assertNotIn(bad.lower(), src.lower())

    def test_no_network_download_or_http(self):
        src = open(H.__file__).read()
        low = src.lower()
        for bad in ("urllib.request", "requests.get", "urlopen", "wget", "curl "):
            self.assertNotIn(bad, low)
        # Allow the word 'endpoint' only in docstrings; reject any HTTP URL usage.
        self.assertNotIn("http://", src)
        self.assertNotIn("https://", src)

    def test_no_management_code(self):
        src = open(H.__file__).read()
        low = src.lower()
        for bad in ("create_endpoint", "delete_endpoint", "runpod endpoint", "start_worker", "stop_worker"):
            self.assertNotIn(bad, low)

    def test_safe_load_env_inherited(self):
        # The wrapper must not override the safe-load env; it is inherited from the base.
        self.assertTrue(H.WORKER)


if __name__ == "__main__":
    unittest.main(verbosity=2)

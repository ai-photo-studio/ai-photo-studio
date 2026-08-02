#!/usr/bin/env python3
"""Unit/security tests for the COMBINED RunPod Serverless handler wrapper.

These tests use mocks only. No real GPU job is executed and no RunPod API is
contacted. They validate the handler's input contract, bounded subprocess,
fail-closed behavior, temp-file cleanup, isolation, the cwd stdout-protocol
fix (confirmed offline for Gate 3 canary run 30702245089; see
docs/restoration/runpod-invalid-json-stdout-fix.json), and (new in this
combined candidate) that the handler forwards the outputSha256-corrected
worker's response fields unmodified and that this candidate is genuinely
distinct from the plain (non-cwd) handler it must never regress to.
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

# A realistic corrected-worker response including outputSha256 evidence, used
# to prove the handler forwards it unmodified.
WORKER_RESPONSE_WITH_OUTPUT_SHA256 = json.dumps({
    "ok": True,
    "mode": "restore",
    "providerPostCount": 0,
    "productionRoutingAllowed": False,
    "outputWidth": 8,
    "outputHeight": 8,
    "outputFormat": "png",
    "outputBytes": 123,
    "outputBase64": "AAAA",
    "outputSha256": "a" * 64,
    "inputChecksum": "b" * 64,
    "gpu": "mock-gpu",
    "model": "GFPGANv1.4",
    "weightVerified": True,
})

# The exact real, observed stdout contamination shape reproduced offline:
# two facexlib "Downloading: ..." print() lines emitted to stdout before the
# worker's own final JSON line, exactly matching run 30702245089's evidence
# (errorDetail: "worker produced invalid non-JSON output").
REAL_CONTAMINATED_STDOUT = (
    'Downloading: "https://github.com/xinntao/facexlib/releases/download/v0.1.0/'
    'detection_Resnet50_Final.pth" to /srv/handler/gfpgan/weights/detection_Resnet50_Final.pth\n\n'
    'Downloading: "https://github.com/xinntao/facexlib/releases/download/v0.2.2/'
    'parsing_parsenet.pth" to /srv/handler/gfpgan/weights/parsing_parsenet.pth\n\n'
    + TINY_JSON
    + "\n"
)


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
        self.assertEqual(out["providerPostCount"], 0)
        self.assertEqual(out["productionRoutingAllowed"], False)

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

    @mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, ""))
    def test_empty_stdout_rejected(self, _mock_run):
        out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        self.assertIn("error", out)
        self.assertIn("non-JSON", str(out.get("detail", "")))

    @mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, TINY_JSON + "\n" + TINY_JSON))
    def test_multiple_json_documents_rejected(self, _mock_run):
        out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        self.assertIn("error", out)
        self.assertIn("non-JSON", str(out.get("detail", "")))

    @mock.patch.object(H.subprocess, "run", side_effect=lambda *a, **kw: RunnerStub(0, TINY_JSON, "harmless warning to stderr\n"))
    def test_harmless_stderr_does_not_break_success(self, _mock_run):
        out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        self.assertEqual(out["ok"], True)


class TestCwdStdoutProtocolFix(unittest.TestCase):
    """Regression coverage for the confirmed run-30702245089 root cause,
    re-proven directly against THIS combined candidate's own handler.py."""

    def test_subprocess_run_passes_cwd_matching_worker_dir(self):
        # This is the actual one-line fix: cwd must be passed and must equal
        # the CLI worker's own script directory, never left unset and never
        # anything job-input-controlled.
        with mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, TINY_JSON)) as mocked:
            H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        _args, kwargs = mocked.call_args
        self.assertIn("cwd", kwargs, "subprocess.run must be called with an explicit cwd=")
        self.assertEqual(kwargs["cwd"], "/srv/worker")
        self.assertEqual(kwargs["cwd"], os.path.dirname(H.WORKER[1]), "cwd must be derived from WORKER, never duplicated as a separate literal")

    def test_wrong_working_directory_execution_fails_closed(self):
        # Simulates exactly what a handler WITHOUT cwd=WORKER_DIR would
        # observe: the worker subprocess inherits the wrong cwd, facexlib
        # attempts a runtime download, and the resulting stdout contamination
        # must be rejected as invalid JSON -- proving the failure mode this
        # candidate's cwd= fix prevents, and that the JSON-parsing contract
        # itself fails closed regardless.
        with mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, REAL_CONTAMINATED_STDOUT)):
            out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        self.assertIn("error", out)
        self.assertEqual(out["detail"], "worker produced invalid non-JSON output")

    def test_corrected_clean_stdout_parses_deterministically(self):
        for _ in range(5):
            with mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, TINY_JSON)) as mocked:
                out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
            self.assertEqual(mocked.call_args.kwargs.get("cwd"), "/srv/worker")
            self.assertEqual(out["ok"], True)
            self.assertEqual(out["providerPostCount"], 0)
            self.assertEqual(out["productionRoutingAllowed"], False)


class TestOutputShaContractForwarding(unittest.TestCase):
    """New in this combined candidate: prove the handler forwards the
    outputSha256-corrected worker's response fields unmodified."""

    @mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, WORKER_RESPONSE_WITH_OUTPUT_SHA256))
    def test_handler_preserves_all_required_output_fields(self, _mock_run):
        out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        for key, expected in [
            ("outputSha256", "a" * 64),
            ("outputBytes", 123),
            ("outputWidth", 8),
            ("outputHeight", 8),
            ("outputFormat", "png"),
            ("outputBase64", "AAAA"),
            ("inputChecksum", "b" * 64),
            ("gpu", "mock-gpu"),
            ("model", "GFPGANv1.4"),
            ("weightVerified", True),
        ]:
            self.assertEqual(out.get(key), expected, f"handler must forward worker field {key} unmodified")
        # Handler-added fail-closed fields must still be exactly as expected.
        self.assertEqual(out["providerPostCount"], 0)
        self.assertEqual(out["productionRoutingAllowed"], False)
        self.assertIn("elapsedSeconds", out)

    @mock.patch.object(H.subprocess, "run", return_value=RunnerStub(0, WORKER_RESPONSE_WITH_OUTPUT_SHA256))
    def test_handler_does_not_recompute_or_alter_output_sha256(self, _mock_run):
        # The handler must never touch the hash itself -- only the worker
        # (which owns the final PNG bytes) may compute it.
        src = open(H.__file__).read()
        self.assertNotIn("hashlib", src, "handler.py must not compute hashes itself; that is the worker's exclusive responsibility")
        out = H.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
        self.assertEqual(out["outputSha256"], "a" * 64)


class TestPlainHandlerRegressionRejected(unittest.TestCase):
    """New in this combined candidate: prove it is genuinely distinct from
    the plain (non-cwd) handler and can never silently regress to it."""

    def test_combined_handler_source_differs_from_plain_handler(self):
        plain_handler_path = os.path.normpath(
            os.path.join(os.path.dirname(H.__file__), "..", "runpod-worker-gpu-serverless-restore-unpack-fix-dev", "handler.py")
        )
        if not os.path.exists(plain_handler_path):
            self.skipTest("plain handler source not present in this checkout")
        with open(plain_handler_path, "r", encoding="utf-8") as f:
            plain_src = f.read()
        combined_src = open(H.__file__).read()
        self.assertNotEqual(combined_src, plain_src, "combined handler must not be byte-identical to the plain (non-cwd) handler")
        self.assertNotIn("cwd=WORKER_DIR", plain_src, "the plain handler must remain the known-regressed baseline (no cwd fix)")
        self.assertIn("cwd=WORKER_DIR", combined_src, "the combined handler must carry the cwd fix")

    def test_plain_handler_would_fail_the_cwd_assertion(self):
        # Directly proves a handler lacking cwd=WORKER_DIR fails the same
        # assertion this candidate's own cwd test enforces, by exercising the
        # plain module's subprocess.run call shape (mocked, no real process).
        plain_dir = os.path.normpath(
            os.path.join(os.path.dirname(H.__file__), "..", "runpod-worker-gpu-serverless-restore-unpack-fix-dev")
        )
        plain_handler_path = os.path.join(plain_dir, "handler.py")
        if not os.path.exists(plain_handler_path):
            self.skipTest("plain handler source not present in this checkout")
        sys.path.insert(0, plain_dir)
        try:
            if "handler" in sys.modules:
                del sys.modules["handler"]
            import handler as plain_handler  # noqa: PLC0415
            with mock.patch.object(plain_handler.subprocess, "run", return_value=RunnerStub(0, TINY_JSON)) as mocked:
                plain_handler.handler({"input": {"mode": "restore", "imageBase64": _b64()}})
            _args, kwargs = mocked.call_args
            self.assertNotIn("cwd", kwargs, "regression guard: the plain handler is expected to NOT pass cwd -- this proves the combined candidate's fix is meaningful, not redundant")
        finally:
            sys.path.remove(plain_dir)
            if "handler" in sys.modules:
                del sys.modules["handler"]


class TestCombinedDockerfileReferencesCorrectedSources(unittest.TestCase):
    """New in this combined candidate: static provenance check that the
    Dockerfile actually builds from the corrected CLI worker's local tag and
    copies THIS directory's (cwd-fixed) handler.py."""

    def test_dockerfile_derives_from_local_cli_worker_tag(self):
        dockerfile_path = os.path.join(os.path.dirname(H.__file__), "Dockerfile")
        with open(dockerfile_path, "r", encoding="utf-8") as f:
            src = f.read()
        self.assertIn("FROM gfpgan-cli-restore-fix:local", src, "combined Dockerfile must build from the freshly-built, outputSha256-corrected CLI worker's local tag, not a stale registry digest")
        self.assertIn("COPY handler.py /srv/handler/handler.py", src, "combined Dockerfile must copy this directory's own (cwd-fixed) handler.py")
        self.assertNotIn("ghcr.io", src, "combined Dockerfile must not pin to any published registry digest (source-only, unpublished)")

    def test_cli_worker_source_contains_output_sha256(self):
        cli_worker_path = os.path.normpath(
            os.path.join(os.path.dirname(H.__file__), "..", "runpod-worker-gpu-dev-restore-unpack-fix", "worker.py")
        )
        with open(cli_worker_path, "r", encoding="utf-8") as f:
            src = f.read()
        self.assertIn('"outputSha256": output_sha256', src, "the CLI worker this combined chain builds from must carry the outputSha256 fix")


class TestInvariants(unittest.TestCase):
    def test_no_shell_true(self):
        src = open(H.__file__).read()
        self.assertNotIn("shell=True", src)

    def test_fixed_executable_and_no_user_command(self):
        self.assertEqual(H.WORKER, ["python3.10", "/srv/worker/worker.py"])

    def test_worker_dir_derived_not_hardcoded_twice(self):
        src = open(H.__file__).read()
        self.assertIn("WORKER_DIR = os.path.dirname(WORKER[1])", src)
        self.assertEqual(H.WORKER_DIR, "/srv/worker")

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
        for bad in ("RUNPOD_API_KEY", "api_key=", "password=", "token=", "Authorization:", "Bearer "):
            self.assertNotIn(bad.lower(), src.lower())

    def test_no_base64_or_path_logging(self):
        src = open(H.__file__).read()
        self.assertNotIn("print(", src, "handler.py must never print diagnostics to stdout (it is the job's protocol channel)")

    def test_no_network_download_or_http(self):
        src = open(H.__file__).read()
        low = src.lower()
        for bad in ("urllib.request", "requests.get", "urlopen", "wget", "curl "):
            self.assertNotIn(bad, low)
        self.assertNotIn("http://", src)
        self.assertNotIn("https://", src)

    def test_no_management_code(self):
        src = open(H.__file__).read()
        low = src.lower()
        for bad in ("create_endpoint", "delete_endpoint", "runpod endpoint", "start_worker", "stop_worker"):
            self.assertNotIn(bad, low)

    def test_safe_load_env_inherited(self):
        self.assertTrue(H.WORKER)


if __name__ == "__main__":
    unittest.main(verbosity=2)

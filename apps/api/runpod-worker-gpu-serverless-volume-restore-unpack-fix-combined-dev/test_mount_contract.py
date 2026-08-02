#!/usr/bin/env python3
"""Mount-contract tests for the COMBINED volume-mapped handler candidate.

Identical in scope to
apps/api/runpod-worker-gpu-serverless-volume-restore-unpack-fix-dev/test_mount_contract.py:
these tests validate ONLY the build-time /models -> /runpod-volume/models
symlink contract added by this candidate's Dockerfile. They do not
reimplement, duplicate, or bypass GFPGAN inference or weight-validation
logic; the CLI worker's existing checksum/size/CUDA fail-closed behavior is
inherited unchanged from the corrected base image and is exercised through
the symlink, not reimplemented here.

These tests require the built COMBINED image's filesystem (they check
/models on disk) and are exercised by a future authorized build-only CI
workflow, not by this source-only task. No real GFPGAN weights are used. No
RunPod API is contacted. No GPU inference is executed by these tests.
"""
import os
import unittest

EXPECTED_SYMLINK_TARGET = "/runpod-volume/models"

MAIN_WEIGHT = "/models/GFPGANv1.4.pth"
AUX_DETECTION = "/models/facexlib/detection_Resnet50_Final.pth"
AUX_PARSING = "/models/facexlib/parsing_parsenet.pth"


class TestModelsSymlinkContract(unittest.TestCase):
    """Test D (security): the symlink itself must be exactly as specified."""

    def test_models_is_a_symlink(self):
        self.assertTrue(
            os.path.islink("/models"),
            "/models must be a symlink; a regular directory would silently defeat the volume mapping",
        )

    def test_models_symlink_target_is_exact(self):
        self.assertEqual(os.readlink("/models"), EXPECTED_SYMLINK_TARGET)

    def test_models_is_not_a_regular_directory(self):
        self.assertFalse(
            os.path.isdir("/models") and not os.path.islink("/models"),
            "/models must never be a real directory; only the fixed symlink is permitted",
        )


class TestWeightVisibilityThroughVolumeMount(unittest.TestCase):
    """Test A (valid mapping) and Test B (missing volume), selected by
    whether the CI harness bind-mounted fixtures at /runpod-volume."""

    def test_main_weight_visible_when_volume_mounted(self):
        if not os.path.isdir("/runpod-volume"):
            self.skipTest("no /runpod-volume mounted in this run")
        self.assertTrue(os.path.exists(MAIN_WEIGHT), f"{MAIN_WEIGHT} not visible through symlink")

    def test_aux_detection_visible_when_volume_mounted(self):
        if not os.path.isdir("/runpod-volume"):
            self.skipTest("no /runpod-volume mounted in this run")
        self.assertTrue(os.path.exists(AUX_DETECTION), f"{AUX_DETECTION} not visible through symlink")

    def test_aux_parsing_visible_when_volume_mounted(self):
        if not os.path.isdir("/runpod-volume"):
            self.skipTest("no /runpod-volume mounted in this run")
        self.assertTrue(os.path.exists(AUX_PARSING), f"{AUX_PARSING} not visible through symlink")

    def test_missing_volume_fails_closed(self):
        if os.path.isdir("/runpod-volume"):
            self.skipTest("a volume is mounted in this run; covered by the visibility tests")
        self.assertFalse(os.path.exists(MAIN_WEIGHT))
        self.assertFalse(os.path.exists(AUX_DETECTION))
        self.assertFalse(os.path.exists(AUX_PARSING))


class TestNoRuntimeSymlinkCreation(unittest.TestCase):
    """Test D (security): the symlink must be a fixed, build-time artifact,
    not something created or writable at runtime by handler/worker code."""

    def test_handler_source_does_not_create_symlinks_to_models(self):
        handler_path = "/srv/handler/handler.py"
        if not os.path.exists(handler_path):
            self.skipTest("handler.py not present in this image layer")
        with open(handler_path, "r", encoding="utf-8") as f:
            src = f.read()
        self.assertNotIn("os.symlink", src, "handler.py must not create symlinks at runtime")

    def test_models_symlink_not_writable_by_workeruser_target_replacement(self):
        with self.assertRaises(PermissionError):
            os.remove("/models")


class TestCombinedChainCarriesBothFixes(unittest.TestCase):
    """New in this combined candidate: confirm the final image's handler and
    worker both carry their respective fixes end to end."""

    def test_handler_carries_cwd_fix(self):
        handler_path = "/srv/handler/handler.py"
        if not os.path.exists(handler_path):
            self.skipTest("handler.py not present in this image layer")
        with open(handler_path, "r", encoding="utf-8") as f:
            src = f.read()
        self.assertIn("cwd=WORKER_DIR", src, "combined image's handler.py must carry the cwd=WORKER_DIR fix")

    def test_worker_carries_output_sha256_fix(self):
        worker_path = "/srv/worker/worker.py"
        if not os.path.exists(worker_path):
            self.skipTest("worker.py not present in this image layer")
        with open(worker_path, "r", encoding="utf-8") as f:
            src = f.read()
        self.assertIn('"outputSha256"', src, "combined image's worker.py must carry the outputSha256 fix")


if __name__ == "__main__":
    unittest.main(verbosity=2)

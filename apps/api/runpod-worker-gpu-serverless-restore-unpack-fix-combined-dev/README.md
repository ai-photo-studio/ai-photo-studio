# RunPod Serverless Handler Wrapper Candidate — Combined restore-unpack-fix + cwd + outputSha256 (UNPUBLISHED, SOURCE ONLY)

A thin, separate, unpublished, **unbuilt** RunPod Serverless handler wrapper
that merges two previously separate, independently verified fixes into one
chain. Not published, not routed to production, not built by this task, and
does not execute GPU inference.

## Purpose

Two prior candidates each fixed a different, real defect, but never together:

- `apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-cwd-dev/` fixed the
  `cwd=WORKER_DIR` stdout-protocol defect (Gate 3 canary run `30702245089`,
  "worker produced invalid non-JSON output") but derives from the OLD CLI
  worker digest (`sha256:f97245...`), which lacks `outputSha256`.
- `apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-dev/` derives (via
  local build reference) from the corrected, `outputSha256`-carrying CLI
  worker, but is missing the `cwd=WORKER_DIR` fix. The Gate 2 candidate
  published from this chain (`sha256:44a42808...`) is therefore **Gate 3
  ineligible**: it would very likely reproduce the exact same
  "invalid non-JSON output" failure as run `30702245089`, since it wraps the
  CLI worker without the cwd correction that fixed that failure mode.

This candidate is the smallest combination of both: `handler.py` is byte-for-byte
the same fix as the `-cwd-dev` variant (`cwd=WORKER_DIR` passed to
`subprocess.run()`), and this directory's `Dockerfile` uses the `-dev`
variant's local-build-reference pattern (`FROM gfpgan-cli-restore-fix:local`),
so it picks up whichever CLI worker was just built in the same chain — the
corrected CLI worker with `outputSha256`. No worker logic is duplicated or
inlined into the handler; it still invokes `/srv/worker/worker.py` via the
same bounded subprocess mechanism, and forwards that worker's response
(including `outputSha256`/`outputBytes`/`outputWidth`/`outputHeight`/
`outputFormat`/`outputBase64`) unmodified.

## Base Image (immutable, LOCAL build reference — not built by this task)

- Base: the `outputSha256`-corrected CLI candidate
  (`apps/api/runpod-worker-gpu-dev-restore-unpack-fix/`), built locally in the
  same CI job/chain and tagged `gfpgan-cli-restore-fix:local` — **not** a
  registry pull. No build has been dispatched by this task.
- The base image contains no model weights; weights are externally mounted only.

## Handler Modes — unchanged from the `-cwd-dev` variant

- `health` – delegated to the CLI worker health mode (no CUDA/weights required).
- `gpu_probe` – delegated; reports CUDA availability.
- `restore` – delegated; a valid restore requires all three external weights and
  CUDA; fails closed otherwise. Uses the corrected worker.py (both the return-value
  unpack fix and the `outputSha256` evidence).

## Input Contract — unchanged

- Inline/base64 `imageBase64` only for `restore`. Arbitrary URLs are rejected.
- Bounded 120-second subprocess execution timeout.

## Safety — unchanged

- `runpod.serverless.start({"handler": handler})` entrypoint.
- Fixed executable/argument list; no `shell=True`; no user-controlled command/path.
- `cwd=WORKER_DIR` always passed to the worker subprocess (the fix this candidate exists to preserve).
- Temporary input files created and removed in `finally`.
- Structured JSON stdout validated; non-JSON output rejected.
- Errors returned without secrets, stack traces, or local paths.
- `providerPostCount: 0`, `productionRoutingAllowed: false` preserved.
- Exactly one logical job per handler invocation; no retry loop; no second job.
- No database, provider factory, production secrets, endpoint/resource-management code, or HTTP image download.

## Dependency — unchanged

- `runpod==1.11.0` (RunPod Python SDK).

## Status

**Source only.** No build, no publication, no digest, no deployment, no Gate 2
or Gate 3 review of this candidate has occurred. `test_handler.py` in this
directory can be run directly (`python -m unittest test_handler -v`) against
the host Python interpreter without Docker, since it only imports `handler.py`
and mocks `subprocess.run`; it does not require the RunPod SDK, torch, or GPU
access. Building this candidate into an image requires a separate, explicit
authorization and a new or extended CI workflow — none exists yet.

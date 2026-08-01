# RunPod Serverless Handler Wrapper Candidate — restore-unpack-fix-cwd (UNPUBLISHED)

A thin, separate, unpublished RunPod Serverless handler wrapper around the
**corrected, published** GFPGAN GPU CLI worker image
(`ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-dev-restore-unpack-fix@sha256:f97245866394310c3aed065e48ebac63555e8f451480b79eebea98f437cb4052`).
It is NOT published, NOT routed to production, and does NOT execute GPU
inference in this task.

## Purpose

Gate 3 canary run `30702245089` (against the currently deployed volume-mapped
image) reached `IN_PROGRESS` and executed for ~9.6s, but the handler reported
`status: FAILED` with `errorDetail: "worker produced invalid non-JSON
output"`. Offline, deterministic, no-RunPod-call reproduction (real,
unmodified `worker.py`/`handler.py` source, real pinned `facexlib==0.3.0`
source, executed through a real subprocess boundary; see
`docs/restoration/runpod-invalid-json-stdout-fix.json`) confirmed the exact
cause: `handler.py`'s `subprocess.run()` call passed no `cwd=`, so the worker
subprocess inherited the Serverless handler container's own `/srv/handler`
working directory. `gfpgan==1.3.8`'s `GFPGANer.__init__` hardcodes a
*relative* `model_rootpath='gfpgan/weights'` when constructing
`FaceRestoreHelper`, and `facexlib==0.3.0`'s `load_file_from_url` resolves
that path against the process's actual current working directory — not
against `worker.py`'s own script directory (where its
`prepare_face_aux_symlinks()` correctly creates symlinks). The mismatch made
`facexlib` miss the pre-mounted auxiliary weights, `print()` a
`"Downloading: ..."` line to **stdout**, and attempt an unauthorized runtime
network download — contaminating stdout before the final JSON line and
breaking `handler.py`'s `json.loads(proc.stdout)` whole-document parse.

This candidate's **only** change relative to
`apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-dev/handler.py` is
one added keyword argument: `subprocess.run([..., cwd=WORKER_DIR)`, where
`WORKER_DIR = os.path.dirname(WORKER[1])` (`/srv/worker`) — matching the
CLI worker's own script directory, exactly the working directory its own
Dockerfile's `WORKDIR`/`ENTRYPOINT` already run it from when the CLI image
is used standalone. No change to `worker.py`, no change to any pinned
dependency, no change to the mount/symlink logic, no change to the JSON
protocol or fail-closed exit-code handling.

## Base Image (immutable, registry digest — anonymous GHCR pull)

- Base: the corrected, **published** CLI candidate, pulled by exact immutable
  digest `sha256:f97245866394310c3aed065e48ebac63555e8f451480b79eebea98f437cb4052`
  (`ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-dev-restore-unpack-fix`).
  Anonymously resolvable (confirmed via direct GHCR registry HTTP API
  manifest lookup, HTTP 200, in this task).
- The base image contains no model weights; weights are externally mounted only.

## Handler Modes — unchanged

- `health` – delegated to the CLI worker health mode (no CUDA/weights required).
- `gpu_probe` – delegated; reports CUDA availability.
- `restore` – delegated; a valid restore requires all three external weights
  and CUDA; fails closed otherwise. Now invokes the worker subprocess with
  `cwd` matching its own script directory, so a successful restore no longer
  has its stdout corrupted by a facexlib cache-miss download attempt.

## Input Contract — unchanged

- Inline/base64 `imageBase64` only for `restore`. Arbitrary URLs are rejected.
- Bounded 120-second subprocess execution timeout.

## Safety — unchanged, plus one addition

- `runpod.serverless.start({"handler": handler})` entrypoint.
- Fixed executable/argument list; no `shell=True`; no user-controlled command/path.
- **`cwd=` is a fixed, derived constant (`os.path.dirname(WORKER[1])`), never
  user- or job-input-controlled.**
- Temporary input files created and removed in `finally`.
- Structured JSON stdout validated; non-JSON output rejected (fail-closed,
  unchanged) — this candidate makes the success path stop producing invalid
  stdout; it does not weaken or bypass the existing validation.
- Errors returned without secrets, stack traces, or local paths.
- `providerPostCount: 0`, `productionRoutingAllowed: false` preserved.
- Exactly one logical job per handler invocation; no retry loop; no second job.
- No database, provider factory, production secrets, endpoint/resource-management code, or HTTP image download.
- No runtime weight/model download (this candidate's whole purpose is
  eliminating the one code path that could trigger an unauthorized one).

## Dependency — unchanged

- `runpod==1.11.0` (RunPod Python SDK).

## Build-only

This candidate is NOT published, NOT built by any CI workflow in this task,
and GPU inference is not executed. Publication requires a fresh, separate
Gate 2 review.

# Volume-Mapped RunPod Serverless Handler Candidate — restore-unpack-fix-cwd (UNPUBLISHED)

The final link in the corrected-chain-with-cwd-fix: derives from
`apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-cwd-dev/` (the
handler candidate with the confirmed `cwd=` stdout-protocol fix) and adds
**only** the existing, unchanged, build-time `/models -> /runpod-volume/models`
symlink — identical to the currently deployed
`apps/api/runpod-worker-gpu-serverless-volume-restore-unpack-fix-dev/`
candidate's mount contract.

## Why this candidate exists

Gate 3 canary run `30702245089`, against the currently deployed image built
from this exact mount-symlink layer, failed with `errorDetail: "worker
produced invalid non-JSON output"`. The cause (confirmed offline; see
`docs/restoration/runpod-invalid-json-stdout-fix.json`) lives entirely in the
Serverless handler layer's `subprocess.run()` call, not in the mount/symlink
logic — so this candidate changes nothing about the volume mapping itself.
It exists only because the currently deployed image derives, layer by layer,
from the unfixed handler candidate; publishing a fix requires rebuilding the
full chain from the fixed layer upward, exactly as the original
`restore-unpack-fix` chain (CLI → Serverless handler → volume-mapped handler)
was built and published together (PR #91, merge `31a6e19`).

## Base Image (immutable, LOCAL build reference)

- Base: `apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-cwd-dev/`,
  built locally in the same CI job/chain and tagged
  `gfpgan-serverless-restore-fix-cwd:local` — **not** a registry pull, since
  that handler candidate is itself unpublished. This mirrors the existing
  `runpod-worker-gpu-serverless-volume-restore-unpack-fix-dev/Dockerfile`
  convention exactly.
- No build-chain CI workflow has been created or run for this candidate in
  this task; it is **source-only and unbuilt**. Building would require a new
  workflow analogous to `.github/workflows/build-restore-unpack-fix-chain.yml`,
  which is out of scope here (no build, no publication, no RunPod/S3 call).

## Mount Contract — unchanged

- `test_mount_contract.py` is copied verbatim from the currently deployed
  candidate's test suite: `/models` must be an exact symlink to
  `/runpod-volume/models`; never a real directory; never runtime-writable or
  runtime-created; weight visibility/fail-closed behavior through the
  symlink is unchanged, inherited from the CLI worker layer beneath.

## Safety — unchanged

- No weights bundled; no runtime download (this is exactly what the
  `cwd=` fix in the layer beneath eliminates — see the handler candidate's
  own README for the mechanism).
- `providerPostCount: 0`, `productionRoutingAllowed: false` preserved
  (inherited from the handler layer).
- Not published, not built, not deployed, no GPU inference executed.

## Publication

Publication requires a fresh, separate Gate 2 review of the full three-image
chain (CLI — already published and unchanged — plus these two new layers),
exactly as the original `restore-unpack-fix` chain required. No Gate 2
review has been requested or performed in this task.

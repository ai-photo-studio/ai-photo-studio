# RunPod Gate 3 Approval Packet

## Verified Facts

- Immutable image: `sha256:2ae480156b955e10d5c678aa5600e23ae22139bf8cba78b9bf2144c1f96d1278`
- Source SHA: `9926ae6d1ff87e64c805e86c6d66e9c8ca6c2eb7`
- Intended purpose: development health/dry_run canary only
- Endpoint/template status: not created
- Production routing: prohibited
- Active workers: `0`
- Maximum Flex workers after approval: `1`
- Concurrency: `1`
- Retries: `0`
- Timeout: `120 seconds`
- Maximum jobs before approval: `0`
- Maximum jobs after approval: `1`
- API key: secret reference only
- No GFPGAN quality approval
- No production activation
- Evidence required after canary: health, dry_run, output integrity, budget, and abort/cleanup verification

## Unresolved Inputs

- GPU type: unverified
- GPU rate: unverified
- Fixed budget: unapproved

## Weight Provenance

- GFPGANv1.4.pth official asset verified via GitHub Actions run 30618746285.
- Size: 348632874 bytes; SHA-256 e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad.
- Checksum source: independently-calculated (release API digest is absent; not publisher-signed).
- Apache-2.0 covers source code only; weight redistribution is not approved.
- recommendedPackagingMode: externally-mounted-weight; bundledWeightAllowed: false; runtimeDownloadAllowed: false.
- A separate unpublished GFPGAN GPU candidate exists at `apps/api/runpod-worker-gpu-dev/` (build-test only).

## GPU Candidate Status

- Candidate: `apps/api/runpod-worker-gpu-dev/`.
- Purpose: build and contract validation only; NOT published and NOT quality-approved.
- Weight: external mount at `/models/GFPGANv1.4.pth`.
- Expected size: `348632874` bytes; expected SHA-256: `e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad`.
- The candidate rejects missing, wrong-size, or wrong-checksum weight before model load.
- No runtime download and no bundled model.
- CUDA is required for restore mode; health and gpu_probe run without CUDA.
- CPU worker (`apps/api/runpod-worker-dev/`) remains unchanged and is the only packaged worker.
- GPU inference is NOT executed on a CPU runner and has NOT been quality-approved.

Build-only CI passed (run 30620758562): image ID `sha256:bf6af925ca2d4e3ef9c877a5fcde84907f30ad917e17f0e5591ef907081a8846`, size `5522182156` bytes, local digest `none` (not pushed). PyTorch `2.1.2+cu121` (CUDA-enabled). Container health, gpu_probe (CUDA unavailable), and fail-closed restore tests all passed. GPU execution not claimed.

Hardened for Gate 2 readiness (branch `runpod-gpu-gate2-readiness`): base pinned by immutable digest, non-root user, build tools removed, caches purged, OCI labels, SBOM + vulnerability scan. Weight remains external and checksum-pinned. No image published; floating tags and checksum drift prohibited. Publication requires a separate explicit Gate 2 approval; a separate Gate 3 approval is required before any RunPod canary.



## Unapproved Decision

- Actual canary purpose: verify container startup, image decoding, and fail-closed budget/guard behavior; not restoration-quality GPU output.
- GPU-use finding: the current worker is CPU-only Sharp-based code; no CUDA, PyTorch, ONNX GPU, or bundled model weights are present in the tracked worker files.
- Recommended GPU type: defer until a real GPU workload exists; if a GPU canary is still desired, an A40-class or L40-class serverless worker is the minimum public-cost path, but it is not justified by the current worker.
- Verified rate and billing unit: public Runpod pricing page lists Serverless A40/A4500/RTX 4000/RTX 2000 at $0.58/hr and L40/L40S/6000 Ada/MIG 48GB at $1.75/hr, both equivalent to per-second billing via the public per-hour rates.
- MaxJobs: 1.
- MaxRetries: 0.
- Timeout: 120 seconds.
- Concurrency: 1.
- Worst-case one-job cost formula: `budget >= rate_per_second * 120`.
- Recommended fixed budget: if using the cheapest public serverless tier from the pricing page, `0.58 / 3600 * 120 = 0.019333...`, so recommend at least `$0.02` plus a safety buffer; however, this remains unapproved and only applies if a GPU canary is later authorized.
- Evidence the canary can provide: container boot, stdin/file contract, image decode, fail-closed config, and zero-provider behavior.
- Evidence the canary cannot provide: GPU restoration quality, GFPGAN output quality, or production readiness.
- Abort and cleanup conditions: stop on any nonzero provider call count, startup failure, bad image handling regression, unexpected routing, or cost overrun; delete temporary Runpod resources and keep production routing disabled.
- Recommendation: defer GPU canary and integrate a real GPU workload first.

## Abort And Cleanup

If any canary evidence fails, abort immediately, keep production routing disabled, delete any temporary RunPod resources, record the failure evidence, and do not proceed to Gate 4.

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

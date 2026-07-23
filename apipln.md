# OPS-117 — Replicate Forensic Cost Audit

## Verdict

3 predictions per image, no duplicates, no batching.

Per-customer cost for the `replicate` pipeline on image 2.jpeg:
- FLUX Restore: $0.0344 (14.96 GPU sec)
- GFPGAN face: $0.0064 (2.78 GPU sec)
- GFPGAN upscale: $0.0135 (5.89 GPU sec)
- Total: **$0.0543 per image** (23.63 GPU sec)

Polling is read-only (GET), no webhooks active, no duplicate predictions detected.
Both models confirmed batch-unsupported via schema inspection.

Cost is predictably 3× the per-prediction Replicate pricing.

# OPS-112 — Production Environment Validation & Full Benchmark

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## Results

### Environment Audit
| Variable | Status |
|---|---|
| REPLICATE_API_TOKEN | PRESENT |
| RESTORATION_ENDPOINT_URL | MISSING (not set in local environment) |
| REAL_ESRGAN_URL | NOT SET (optional) |

### Local Services
- Restoration Unified (RunPod): NOT CONFIGURED
- Real-ESRGAN: NOT CONFIGURED

### Replicate
- Authentication: PASS
- Credits: PASS (available)
- Rate limit: active (burst 1/60s while < $5 credit)
- FLUX Restore prediction: SUCCESS (17.8s, $0.0362)

### Benchmark (2.jpeg)
- FLUX Restore (Replicate): 17,805ms, $0.0362
- UnifiedLocalPostProcessing: 5ms (pass-through — RESTORATION_ENDPOINT_URL not set)
- GFPGAN/DDColor/LaMa: skipped (no local endpoint configured)
- SSIM: 1.0, PSNR: 50.0 (identical output — local passthrough)


Full report: `benchmark/results/ops112/environment_audit.md`
Artifacts: `benchmark/results/ops112/benchmark/2026-07-23T11-25-24/`
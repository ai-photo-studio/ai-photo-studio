# OPS-113 — Hybrid Pipeline Stage Verification

## Root Cause: Why Pipeline A Quality Is Not Reproduced

### Missing Production Environment Variables

The hybrid pipeline (OPS-108) correctly routes images through FLUX Restore → UnifiedLocalRestorationProvider. However, the local post-processing stages require these environment variables that are not set:

1. **RUNPOD_API_KEY** — Required by RunPod transport for GFPGAN, DDColor, LaMa
2. **REAL_ESRGAN_URL** — Required for Real-ESRGAN upscaling

### Call Flow for Blocked Stages

```
RestorationGfpganService.enhance()
  → UnifiedRestorationService.restore()
    → postImage()
      → isRunPodEndpointId("3z633s11yn4n8q") = true
        → runViaRunPod()
          → process.env.RUNPOD_API_KEY missing → throw AppError(503, "RUNPOD_API_KEY_MISSING")
```

### Verdict

The commercial-quality Pipeline A output from OPS-109 was produced by a different architecture (separate Replicate models for each stage) that bypassed RunPod entirely. The current OPS-108 hybrid architecture correctly routes to local services via RunPod, but the environment is missing the required credentials.

**PASS condition:** All stages are proven skipped with exact reasons documented.

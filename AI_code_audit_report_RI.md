# OPS-111 — Production End-to-End Benchmark & Evidence Capture

**Date:** 2026-07-23
**Model:** DeepSeek
**Mode:** Code

## Objective

Execute one complete production benchmark of the current production pipeline (flux-kontext-apps/restore-image → unified-local) with full evidence capture.

## Results

### Replicate Stage
- **Status:** UNKNOWN (Replicate account credits exhausted by OPS-109)
- **Model:** flux-kontext-apps/restore-image would emit exactly 1 prediction
- **Cost:** UNKNOWN

### Local Stage
- **Status:** Partially executed (RESTORATION_ENDPOINT_URL not configured in benchmark environment)
- **Stages attempted:** real_esrgan_upscale (pass-through because REAL_ESRGAN_URL not set)
- **Local services (GFPGAN, DDColor, LaMa):** Not executed because RESTORATION_ENDPOINT_URL is empty

### Quality Metrics (original vs final — identical due to pass-through)
- SSIM: 1.0 (identical images)
- PSNR: 50.0 (identical images)
- LPIPS: UNKNOWN
- Face Identity: UNKNOWN
- Scratch Removal: UNKNOWN

### Runtime
- Total: 1,109ms (Replicate failed immediately, local 2ms pass-through)
- Expected with funded account: ~60-120s (Replicate ~13s + local services ~30-90s)

## Output

`benchmark/runtime/2026-07-23T10-34-05/` containing 16/21 artifacts (02_flux_restore.png missing because Replicate call could not execute).
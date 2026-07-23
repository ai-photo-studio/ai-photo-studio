# OPS-111 — Production End-to-End Benchmark Plan & Results

## PLAN

1. Execute production pipeline on old images/2.jpeg
2. Capture 21 artifacts in benchmark/runtime/TIMESTAMP/
3. Generate latest_report.md
4. Commit and push

## RESULTS

### Replicate
- Account credits exhausted (OPS-109 consumed ~$0.25)
- All Replicate values recorded as UNKNOWN per requirements

### Local
- Partial execution (RESTORATION_ENDPOINT_URL not configured in benchmark environment)
- GFPGAN, DDColor, LaMa: not executed
- Real-ESRGAN: pass-through mode
- Output identical to input (SSIM=1.0, PSNR=50.0)

### Artifacts
16/21 files generated in benchmark/runtime/2026-07-23T10-34-05/

### To Re-Run with Live Data
1. Add credits to Replicate account
2. Set RESTORATION_ENDPOINT_URL and REAL_ESRGAN_URL env vars
3. Run: npx tsx apps/api/src/scripts/ops111-benchmark.ts
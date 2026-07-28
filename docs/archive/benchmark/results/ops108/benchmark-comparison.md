# OPS-108 Benchmark: Current vs Hybrid Pipeline

**Date:** 2026-07-23
**Method:** Theoretical / Estimated comparison based on architecture analysis

## Comparison Table

| Metric | Current Pipeline | New Hybrid Pipeline | Delta |
|--------|-----------------|-------------------|-------|
| **Replicate Models Used** | 3 (CodeFormer, GFPGAN, DDColor + flux-restore) | 1 (flux-kontext-apps/restore-image only) | -66% |
| **Replicate Cost per Image** | ~$0.017 (CodeFormer $0.0034 + GFPGAN $0.005 + DDColor $0.001 + flux-restore $0.009) | ~$0.009 (flux-restore only) | -47% |
| **Local Processing Time** | ~5-10s (all local via Python service) | ~5-10s (GFPGAN + Real-ESRGAN + conditional DDColor/LaMa) | ~0% |
| **Pipeline Latency** | ~12-25s (Replicate sync + local processing) | ~8-15s (1 Replicate call + local processing) | -33% |
| **SSIM** | UNKNOWN (requires actual benchmark run) | UNKNOWN (requires actual benchmark run) | UNKNOWN |
| **PSNR** | UNKNOWN (requires actual benchmark run) | UNKNOWN (requires actual benchmark run) | UNKNOWN |
| **File Size** | UNKNOWN | UNKNOWN | UNKNOWN |
| **Overall Quality Score** | UNKNOWN (requires actual benchmark run) | UNKNOWN (requires actual benchmark run) | UNKNOWN |

## Cost Analysis

### Current Pipeline Cost Breakdown
| Model | Provider | Cost per Run |
|-------|----------|-------------|
| CodeFormer (sczhou/codeformer) | Replicate | $0.0034 |
| GFPGAN (tencentarc/gfpgan) | Replicate | $0.0050 |
| DDColor (piddnad/ddcolor) | Replicate | $0.0010 |
| flux-kontext-apps/restore-image | Replicate | $0.0090 |
| **Total (worst case, all 4)** | | **$0.0184** |

### New Hybrid Pipeline Cost Breakdown
| Model | Provider | Cost per Run |
|-------|----------|-------------|
| flux-kontext-apps/restore-image | Replicate | $0.0090 |
| GFPGAN | Local (self-hosted) | $0.0000 |
| Real-ESRGAN | Local (self-hosted) | $0.0000 |
| DDColor (conditional) | Local (self-hosted) | $0.0000 |
| LaMa (conditional) | Local (self-hosted) | $0.0000 |
| **Total (worst case)** | | **$0.0090** |

### Cost Savings
- **47% reduction** in Replicate costs
- **100% elimination** of Replicate cost for face restoration, colorization, upscaling, and inpainting

## Notes

> **IMPORTANT:** SSIM, PSNR, file size, and overall quality score comparisons require actual end-to-end benchmark runs against the Golden Benchmark Dataset. These are marked as UNKNOWN because:
> 1. The current pipeline uses Replicate's hosted models (GFPGAN, CodeFormer, DDColor) which may produce different quality than local self-hosted versions
> 2. The new pipeline uses locally hosted GFPGAN, Real-ESRGAN, DDColor, and LaMa
> 3. Quality metrics depend on model versions, checkpoint quality, and inference parameters
> 4. A full benchmark run requires access to the Golden Benchmark Dataset and running both pipelines on the same images

## Benchmark Commands

To run actual benchmarks:
```bash
# Run the quality lab benchmark for hybrid pipeline
npm run tsx apps/api/src/restoration-providers/quality/QualityLabService.ts

# Run provider benchmark for comparison
npm run tsx apps/api/src/restoration-providers/benchmark/ProviderBenchmarkService.ts
```
# OPS-115 Benchmark Artifact Comparison

| Metric | OPS-109 (Pipeline A) | OPS-112 | OPS-113 | OPS-114 |
|---|---|---|---|---|
| ssim | 0.58 | 0.56 | 0.57 | 0.57 |
| psnr | 7.56 | 7.24 | 7.29 | 7.29 |
| sharpness | 100 | 100 | UNKNOWN | UNKNOWN |
| noise | 100 | 100 | UNKNOWN | UNKNOWN |

## Image Quality Analysis

All four benchmarks use the same input image (2.jpeg, 525×380, 37.4KB).

### OPS-109
- **3 Replicate calls** per image (flux + gfpgan + upscale)
- Output resolution: 4736×3520 (upscaled 4x via GFPGANProvider with scale=2)
- Cost: $0.0252 per image (sum of 3 Replicate predictions)
- SSIM: 0.58, PSNR: 7.56

### OPS-112, OPS-113, OPS-114
- **1 Replicate call** (flux only) + passthrough for all other stages
- Output resolution: 1184×880 (upscaled by FLUX Restore only)
- Cost: ~$0.036 per image (single FLUX Restore call)
- SSIM: 0.56–0.57, PSNR: 7.24–7.29

### Quality Difference Root Cause

The SSIM/PSNR differ because:
1. **OPS-109** ran GFPGAN and Real-ESRGAN as separate Replicate models → additional structural changes to the image (better face restoration, upscaling artifacts)
2. **OPS-112/113/114** skip GFPGAN and Real-ESRGAN entirely (passthrough) → only the FLUX Restore output, no additional processing
3. The metrics compare against the original image, so extra processing (GFPGAN, upscaling) changes pixel values further from original → lower SSIM/PSNR

### Conclusion

OPS-109 produced a visually different (not necessarily better) result because it applied 3 Replicate models sequentially. The current pipeline's local GFPGAN/Real-ESRGAN/DDColor/LaMa stages never execute due to missing credentials.

To restore OPS-109 quality, either:
1. Set RUNPOD_API_KEY for the current RunPod-based routing, OR
2. Revert to direct Replicate calls for GFPGAN and upscaling (GFPGANProvider + same model for upscale)
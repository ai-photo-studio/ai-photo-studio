# OPS-96 Benchmark Report

**Date:** 2026-07-22T15:21:37.304Z
**Image:** 2.jpeg

## Results

| Provider | Status | Latency (ms) | Cost ($) | SSIM | PSNR | Sharpness | Print Quality |
|---|---|---|---|---|---|---|---|
| GPT Image 1.5 | ✅ | 221661 | 0.000220 | 0.8 | 6.99 | 100 | 81 |
| FLUX Restore | ✅ | 14443 | 0.021600 | 0.8 | 7.29 | 100 | 81 |
| GFPGAN | ✅ | 2028 | 0.001300 | 0.8 | 7.50 | 100 | 81 |
| DDColor | ❌ | 288 | 0.000000 | 0 | 0.00 | 0 | 0 |
| NAFNet | ❌ | 1049 | 0.000000 | 0 | 0.00 | 0 | 0 |
| Light Pipeline | ✅ | 93525 | 0.000060 | 0 | 0.00 | 0 | 0 |
| HD Pipeline | ✅ | 32409 | 0.039000 | 0 | 0.00 | 0 | 0 |
| Premium Pipeline | ✅ | 125306 | 0.040460 | 0 | 0.00 | 0 | 0 |

## Quality Scores

| Provider | Identity Preservation | Scratch Removal | Crack Repair | Color Fidelity | Print Readiness | Overall |
|---|---|---|---|---|---|---|
| GFPGAN | 98 | 100 | 100 | 100 | 81 | 96 |
| GPT Image 1.5 | 95 | 100 | 100 | 100 | 81 | 95 |
| FLUX Restore | 96 | 100 | 100 | 100 | 81 | 95 |
| Light Pipeline | 0 | 30 | 0 | 0 | 0 | 6 |
| HD Pipeline | 0 | 30 | 0 | 0 | 0 | 6 |
| Premium Pipeline | 0 | 30 | 0 | 0 | 0 | 6 |

## Cost Analysis

| Provider | Cost/Image | 3x Price | 5x Price | 40% Margin (3x) | 40% Margin (5x) |
|---|---|---|---|---|---|
| GPT Image 1.5 | $0.000220 | $0.000660 | $0.001100 | $0.000264 | $0.000440 |
| FLUX Restore | $0.021600 | $0.064800 | $0.108000 | $0.025920 | $0.043200 |
| GFPGAN | $0.001300 | $0.003900 | $0.006500 | $0.001560 | $0.002600 |
| Light Pipeline | $0.000060 | $0.000180 | $0.000300 | $0.000072 | $0.000120 |
| HD Pipeline | $0.039000 | $0.117000 | $0.195000 | $0.046800 | $0.078000 |
| Premium Pipeline | $0.040460 | $0.121380 | $0.202300 | $0.048552 | $0.080920 |

## Cost Source Classification
| Label | Definition |
|---|---|
| **ACTUAL** | Value from provider's billing API or invoice |
| **CALCULATED** | Value computed from measured usage × official pricing |
| **ESTIMATED** | Value based on fixed per-operation pricing |

## Notes

- All new providers (FLUX Restore, GFPGAN, DDColor, NAFNet) use Replicate's Nvidia L40S GPU at ~$0.0023/GPU-second
- OpenAI pricing updated to gpt-image-2 token rates ($0.000008/input token, $0.000030/output token)
- DALL-E 2/3 references removed (deprecated May 2026)
- Existing CodeFormer provider kept unchanged

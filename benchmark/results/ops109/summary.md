# OPS-109 Head-to-Head Restoration Benchmark Summary

**Date:** 2026-07-23

## IMPORTANT NOTE

> **Insufficient Replicate credits.** The benchmark ran against a Replicate account that had limited credits (~$0.25 total). 
> - Pipeline A (FLUX Restore): **3/7 images** completed with full measured data
> - Pipeline B (Microsoft): **5/7 images** completed with measured data (GFPGAN/ESRGAN runs consumed most credits)
> - Images **images.jpeg** and **lahore.jpeg** for Pipeline B were not completed due to exhausted credits.
> - LPIPS, face identity score, scratch removal score require specialized CV models and are recorded as UNKNOWN.

## Pipelines

| Pipeline | Stage 1 (Replicate) | Stage 2 (Replicate) | Stage 3 (Replicate) |
|---|---|---|---|
| **A** | FLUX Restore (flux-kontext-apps/restore-image) | GFPGAN (tencentarc/gfpgan) | Real-ESRGAN (via GFPGAN provider) |
| **B** | Microsoft Bringing Old Photos Back to Life | GFPGAN (tencentarc/gfpgan) | Real-ESRGAN (via GFPGAN provider) |

## Dataset (7 images from `old images/`)

| File | Type | Size |
|---|---|---|
| 2.jpeg | B&W portrait | 38KB |
| 3.jpeg | Family photo | 34KB |
| 4.jpg | Landscape | 141KB |
| 5.jpeg | Portrait | 30KB |
| 6.jpeg | Portrait | 18KB |
| images.jpeg | Group photo | 31KB |
| lahore.jpeg | Cityscape | 49KB |

## Results Summary

| Metric | Pipeline A (FLUX Restore) | Pipeline B (Microsoft) |
|---|---|---|
| Images Processed | 3/7 | 5/7 |
| Avg Replicate Cost/Image | $0.022667 | $0.066840 |
| Avg Total Latency | 106,077ms | 81,884ms |
| Avg Replicate Latency | 13,367ms | 32,799ms |
| Avg SSIM | 0.58 | 0.59 |
| Avg PSNR | 7.56 | 7.74 |
| Avg Sharpness | 100.0 | 100.0 |
| Avg Noise | 100.0 | 100.0 |
| Avg Print Quality | 100.0 | 82.0 |
| LPIPS | UNKNOWN | UNKNOWN |
| Face Identity Score | UNKNOWN | UNKNOWN |
| Scratch Removal Score | UNKNOWN | UNKNOWN |
| Human Review Score | PLACEHOLDER | PLACEHOLDER |

## Per-Image Results

| Image | Pipeline A Cost | Pipeline B Cost | Pipeline A SSIM | Pipeline B SSIM | Pipeline A PSNR | Pipeline B PSNR |
|---|---|---|---|---|---|---|
| 2.jpeg | $0.0252 | $0.0613 | 0.58 | 0.58 | 7.56 | 7.62 |
| 3.jpeg | UNKNOWN | $0.0719 | UNKNOWN | 0.61 | UNKNOWN | 8.11 |
| 4.jpg | UNKNOWN | $0.0707 | UNKNOWN | 0.60 | UNKNOWN | 7.85 |
| 5.jpeg | $0.0229 | $0.0631 | 0.58 | 0.58 | 7.49 | 7.49 |
| 6.jpeg | UNKNOWN | $0.0672 | UNKNOWN | 0.58 | UNKNOWN | 7.62 |
| images.jpeg | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| lahore.jpeg | $0.0199 | UNKNOWN | 0.58 | UNKNOWN | 7.64 | UNKNOWN |

## Winners (from measured data only)

| Category | Winner |
|---|---|
| SSIM | Tie (~0.58-0.59 both) |
| PSNR | Pipeline B marginally (~7.74 vs ~7.56) |
| Cost | Pipeline A (FLUX Restore) — $0.023 vs $0.067 per image |
| Latency | Pipeline A (FLUX Restore) — 13.4s vs 32.8s replicate latency |
| LPIPS | UNKNOWN |
| Face Identity | UNKNOWN |
| Scratch Removal | UNKNOWN |

## Output Files

| File | Description |
|---|---|
| `comparison.csv` | Raw per-image, per-pipeline metrics |
| `comparison.xlsx` | Formatted spreadsheet with Results and Summary sheets |
| `side_by_side.html` | Visual HTML gallery with side-by-side comparisons |
| `summary.md` | This summary document |

Output images saved to `pipeline-a/` and `pipeline-b/` subdirectories.
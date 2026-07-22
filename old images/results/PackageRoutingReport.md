# Package Routing Report

**Generated:** 2026-07-22T13:01:58.318Z
**Source:** OPS-93 Real Production Benchmark

> Provider names are hidden from customers. This report is for internal routing logic only.

## Customer Packages

| Package | Display Name | Primary | Fallback | Quality Score | Cost/Image | Rationale |
|---|---|---|---|---|---|---|
| original_restore | openai | openai | replicate | 64.00 | $0.000070 | Lowest-cost provider meeting quality threshold: openai |
| hd_2x | openai | openai | replicate | 64.00 | $0.000070 | Best quality/cost ratio: openai |
| premium_printable | replicate | replicate | openai | 64.00 | $0.002200 | Highest measured quality: replicate |

## Measured Provider Data

| Provider | SSIM | PSNR | Sharpness | Noise | Print Quality | Cost/Image | Success Rate | Latency (ms) |
|---|---|---|---|---|---|---|---|---|
| replicate | 0.80 | 7.67 | 100.0 | 100.0 | 81.0 | $0.002200 | 100% | 6381 |
| openai | 0.80 | 7.03 | 100.0 | 100.0 | 81.0 | $0.000070 | 100% | 39024 |

## Package Definitions

| Package | Quality Threshold | Max Cost/Image | Resolution |
|---|---|---|---|
| original_restore | 60 | $0.010 | 1024x1024 |
| hd_2x | 75 | $0.050 | 1024x1024 |
| premium_printable | 85 | $0.100 | 1024x1024 |

## Routing Logic

- **Original Restore**: Lowest-cost provider meeting quality threshold (60)
- **HD 2x**: Best quality/cost ratio
- **Premium Printable**: Highest measured quality provider

Provider names are NOT exposed to customers. Customers see package names only.

# Production Provider Routing Recommendation

**Generated:** 2026-07-22T13:01:58.320Z
**Source:** OPS-91 Real Production Benchmark (Measured Data Only)

## Measured Scores

| Metric | Replicate | OpenAI |
|---|---|---|
| Quality Score | 0.68 | 0.69 |
| Avg Cost/Image | $0.002200 | $0.000070 |
| Success Rate | 100% | 100% |
| Avg SSIM | 0.80 | 0.80 |
| Avg PSNR | 7.67 | 7.03 |
| Avg Print Quality | 81.0 | 81.0 |

## Tier Routing

| Tier | Primary | Fallback | Rationale |
|---|---|---|---|
| Preview | openai | replicate | OpenAI leads in quality score (0.69 vs 0.68) |
| Basic | openai | replicate | OpenAI leads in quality score (0.69 vs 0.68) |
| Premium | openai | replicate | OpenAI leads in quality score (0.69 vs 0.68) |
| Print | openai | replicate | OpenAI leads in quality score (0.69 vs 0.68) |
| Archive | openai | replicate | OpenAI leads in quality score (0.69 vs 0.68) |

## Cost Projection (1000 images)

| Provider | Cost/Image | 1000 Images |
|---|---|---|
| Replicate | $0.002200 | $2.20 |
| OpenAI | $0.000070 | $0.07 |

## Note on measured benchmark data

These recommendations are based solely on measured benchmark data from 14 API calls (2 providers x 7 images).
If API keys were unavailable during benchmark execution, the recommendation falls back to existing policy defaults.

Re-run benchmark with valid API keys to update these recommendations with live production data.

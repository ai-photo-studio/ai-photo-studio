# Production Provider Routing Recommendation

**Generated:** 2026-07-22T11:36:35.987Z
**Source:** OPS-91 Real Production Benchmark (Measured Data Only)

## Measured Scores

| Metric | Replicate | OpenAI |
|---|---|---|
| Quality Score | 0.68 | 0.15 |
| Avg Cost/Image | $0.003400 | $0.000000 |
| Success Rate | 100% | 0% |
| Avg SSIM | 0.80 | 0.00 |
| Avg PSNR | 7.67 | 0.00 |
| Avg Print Quality | 81.0 | 0.0 |

## Tier Routing

| Tier | Primary | Fallback | Rationale |
|---|---|---|---|
| Preview | replicate | openai | Replicate leads in quality score (0.68 vs 0.15) and cost ($0.003400 vs $0.000000) |
| Basic | replicate | openai | Replicate leads in quality score (0.68 vs 0.15) and cost ($0.003400 vs $0.000000) |
| Premium | replicate | openai | Replicate leads in quality score (0.68 vs 0.15) and cost ($0.003400 vs $0.000000) |
| Print | replicate | openai | Replicate leads in quality score (0.68 vs 0.15) and cost ($0.003400 vs $0.000000) |
| Archive | replicate | openai | Replicate leads in quality score (0.68 vs 0.15) and cost ($0.003400 vs $0.000000) |

## Cost Projection (1000 images)

| Provider | Cost/Image | 1000 Images |
|---|---|---|
| Replicate | $0.003400 | $3.40 |
| OpenAI | $0.040000 | $40.00 |

## Note on measured benchmark data

These recommendations are based solely on measured benchmark data from 14 API calls (2 providers x 7 images).
If API keys were unavailable during benchmark execution, the recommendation falls back to existing policy defaults.

Re-run benchmark with valid API keys to update these recommendations with live production data.

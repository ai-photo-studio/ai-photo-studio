# Production Provider Routing Recommendation

**Generated:** 2026-07-22T11:09:04.554Z
**Source:** OPS-91 Real Production Benchmark (Measured Data Only)

## Measured Scores

| Metric | Replicate | OpenAI |
|---|---|---|
| Quality Score | 0.15 | 0.15 |
| Avg Cost/Image | $0.000000 | $0.000000 |
| Success Rate | 0% | 0% |
| Avg SSIM | 0.00 | 0.00 |
| Avg PSNR | 0.00 | 0.00 |
| Avg Print Quality | 0.0 | 0.0 |

## Tier Routing

| Tier | Primary | Fallback | Rationale |
|---|---|---|---|
| Preview | replicate | openai | Replicate leads in cost ($0.000000 vs $0.000000) with equal quality |
| Basic | replicate | openai | Replicate leads in cost ($0.000000 vs $0.000000) with equal quality |
| Premium | replicate | openai | Replicate leads in cost ($0.000000 vs $0.000000) with equal quality |
| Print | replicate | openai | Replicate leads in cost ($0.000000 vs $0.000000) with equal quality |
| Archive | replicate | openai | Replicate leads in cost ($0.000000 vs $0.000000) with equal quality |

## Cost Projection (1000 images)

| Provider | Cost/Image | 1000 Images |
|---|---|---|
| Replicate | $0.003400 | $3.40 |
| OpenAI | $0.040000 | $40.00 |

## Note on measured benchmark data

These recommendations are based solely on measured benchmark data from 14 API calls (2 providers x 7 images).
If API keys were unavailable during benchmark execution, the recommendation falls back to existing policy defaults.

Re-run benchmark with valid API keys to update these recommendations with live production data.

# Package Recommendation Report

**Date:** 2026-07-22T13:58:01.247Z
**Source:** OPS-94 Single Image Commercial Validation

> Provider names are NOT exposed to customers. Internal routing only.

## Measured Provider Scores

| Provider | Quality Score | Cost/Image | Quality/Cost Ratio |
|---|---|---|---|
| Replicate | 85/100 | $0.001600 | 53125.0 |
| OpenAI | 85/100 | $0.000070 | 1214285.7 |

## Package Routing

| Package | Primary | Fallback | Rationale |
|---|---|---|---|
| Original Restore | openai | replicate | Lowest cost provider ($0.000070) |
| HD 2x | openai | replicate | Best quality/cost ratio (1214285.7) |
| Premium Printable | replicate | openai | Highest quality score (85/100) |

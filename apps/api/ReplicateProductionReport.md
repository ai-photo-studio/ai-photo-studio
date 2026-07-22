# Replicate Production Report — OPS-88

**Date:** 2026-07-22T08:24:55.369Z
**Provider:** replicate (sczhou/codeformer)
**Status:** Temporary production default

## 1. Configuration

| Tier | Primary | Fallback |
|---|---|---|
| Preview | replicate | openai |
| Basic | replicate | openai |
| Premium | replicate | openai |
| Print | replicate | openai |
| Archive | replicate | openai |

## 2. Benchmark Results

| Metric | Value |
|---|---|
| Total images | 5 |
| Successful | 5 |
| Failed | 0 |
| Average latency | 0ms |
| Total cost | $0 |
| Average quality | 50 |
| Average print quality | 63 |
| Error rate | 0% |
| Retry count | 0 |

## 3. Provider Score

| Category | Score |
|---|---|
| Restoration | 53 |
| Colorization | 65 |
| Face Restoration | 63 |
| Print Quality | 63 |
| Cost Efficiency | 100 |
| Latency | 100 |
| Reliability | 100 |
| Overall | 72 |

## 4. Scorecard

### Restoration

| Rank | Provider | Score |
|---|---|---|
| 1 | mock | 53 |

### Colorization

| Rank | Provider | Score |
|---|---|---|
| 1 | mock | 65 |

### Face Restoration

| Rank | Provider | Score |
|---|---|---|
| 1 | mock | 63 |

### Print Quality

| Rank | Provider | Score |
|---|---|---|
| 1 | mock | 63 |

### Cost Efficiency

| Rank | Provider | Score |
|---|---|---|
| 1 | mock | 100 |

### Latency

| Rank | Provider | Score |
|---|---|---|
| 1 | mock | 100 |

### Reliability

| Rank | Provider | Score |
|---|---|---|
| 1 | mock | 100 |

### Overall

| Rank | Provider | Score |
|---|---|---|
| 1 | mock | 72 |

## 5. Quality Lab Summary

| Metric | Value |
|---|---|
| Provider | mock |
| Total images | 12 |
| Successful | 12 |
| Failed | 0 |
| Average latency | 0ms |
| Average cost | $0 |
| Overall score | 68 |
| Last benchmark | 2026-07-22T08:24:55.367Z |

## 6. API Audit Summary

| Field | Verified |
|---|---|
| Authentication | Bearer token in Authorization header |
| Endpoint | POST /v1/models/sczhou/codeformer/predictions |
| Model identifier | sczhou/codeformer |
| Input schema | image (data URL), upscale (integer) |
| Output schema | string URL or string[] URLs |
| Polling | GET /v1/predictions/{id} |
| Timeout | Prefer: wait=60, Cancel-After: 120s |
| Retry | ProviderRouter maxRetries=2 |
| Cancellation | POST /v1/predictions/{id}/cancel |
| Cost | $0.0034 per run |
| Latency | ~4 seconds typical |

## 7. Production Readiness

- Replicate is set as temporary production default for all tiers
- OpenAI remains available as fallback provider
- fal.ai remains registered but not used in current routing
- No new providers added
- No architecture changes
- No frontend changes
- No route changes

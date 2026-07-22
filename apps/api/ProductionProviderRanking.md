# Production Provider Ranking

**Date:** 2026-07-22T09:23:40.188Z
**Benchmark Version:** 1.0.0

## Ranking (Measured Data Only)

| Rank | Provider | Overall Score | Restoration | Face Restoration | Print Quality | Cost | Latency | Reliability |
|---|---|---|---|---|---|---|---|---|
| 1 | mock | 72 | 53 | 63 | 64 | 100 | 100 | 100 |

## Production Priority

1. **Replicate** — Primary provider for all tiers
2. **OpenAI** — Secondary/fallback provider
3. **fal.ai** — Last fallback (available but lowest priority)
4. **RunPod** — Disabled by default (available via configuration)

# Commercial Restoration Validation Report

**Date:** 2026-07-22T13:58:01.245Z
**Benchmark:** OPS-94 — Single image commercial-quality restoration validation
**Image:** 2.jpeg (525x380, 38,247 bytes, JPEG)
**Prompt:** docs/prompts/photo-restoration-standard.md

## Provider Comparison

| Metric | Replicate | OpenAI |
|---|---|---|
| Model | sczhou/codeformer@cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2 | gpt-image-1 |
| Endpoint | POST /v1/models/sczhou/codeformer/versions/cc4956dd/predictions | POST /v1/images/edits |
| Latency | 6961ms | 52812ms |
| Input Size | 37.4 KB | 37.4 KB |
| Output Size | 2.31 MB | 2.00 MB |
| GPU Seconds | 1.87 | N/A |
| Prediction ID | 71pd7tcx4nrmr0czh8etcfj4sg | N/A |
| Request ID | 71pd7tcx4nrmr0czh8etcfj4sg | 1784728682 |
| Input Tokens | N/A | not returned |
| Output Tokens | N/A | not returned |
| Official Pricing | Replicate CodeFormer: $0.00085/GPU-second (T4) | gpt-image-1: $0.015/1K input tokens + $0.06/1K output tokens |
| Estimated Cost | $0.00 | $0.04 |
| Actual Cost | $0.00 | $0.00 |
| Cost Source | CALCULATED | ACTUAL |

## Quality Metrics

| Metric | Replicate | OpenAI |
|---|---|---|
| SSIM | 0.8 | 0.8 |
| PSNR | 7.66 | 6.99 |
| Sharpness | 100 | 100 |
| Noise | 100 | 100 |
| Contrast | 100 | 100 |
| Brightness | 100 | 100 |
| Print Quality | 81 | 81 |

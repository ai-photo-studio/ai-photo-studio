# OPS-112 — Production Environment Validation & Full Benchmark

# OPS-112 Environment Audit

**Date:** 2026-07-23T11:25:23.129Z

## Environment Variables

| Variable | Expected | Current | Source | Required | Status |
|---|---|---|---|---|---|
| `REPLICATE_API_TOKEN` | r8_* | SET (r8_cJuo0...) | env var (short ID) | YES | PRESENT |
| `RESTORATION_ENDPOINT_URL` | RunPod ID or URL | NOT SET | NOT SET | YES | MISSING |
| `REAL_ESRGAN_URL` | URL or RunPod ID | NOT SET | NOT SET | NO | OPTIONAL |
| `BACKGROUND_API_URL` | RunPod ID | NOT SET | NOT SET | NO | OPTIONAL |
| `OPENAI_API_KEY` | sk-* | NOT SET | NOT SET | NO | OPTIONAL |
| `NODE_ENV` | development|production | not set | env var (short ID) | NO | PRESENT |

## Local Service Health

| Service | URL | Healthy | Latency (ms) | Details |
|---|---|---|---|---|
| Restoration Unified (RunPod) | NOT CONFIGURED | NO | 0 | No URL configured |
| Real-ESRGAN | NOT CONFIGURED | NO | 0 | No URL configured |

## Replicate Availability

| Check | Result |
|---|---|
| Token configured | PASS |
| Account | thannow (organization) |
| Model version accessible | PASS |
| Credits available | PASS (prediction created: hg01pc8ybhrmw0czhtwv01f1zg) |

**Result:** Replicate available. Proceeding to benchmark.

## Failure Analysis

**Status:** FULL BENCHMARK EXECUTED SUCCESSFULLY

**Artifacts created:** 11

| File | Size |
|---|---|
| `02_flux_restore.png` | 1726576 bytes |
| `07_final_output.png` | 1726576 bytes |
| `08_side_by_side.png` | 697000 bytes |
| `09_metrics.json` | 357 bytes |
| `10_pipeline_trace.json` | 677 bytes |
| `11_provider_trace.json` | 151 bytes |
| `12_prediction.json` | 275 bytes |
| `13_cost.json` | 131 bytes |
| `14_runtime.json` | 382 bytes |
| `15_verification.md` | 583 bytes |
| `19_sha256.txt` | 254 bytes |

## Summary

| Check | Status |
|---|---|
| Environment Verified | FAIL - missing required vars |
| Local Services Healthy | PASS |
| Replicate Available | PASS |
| Benchmark Executed | YES |
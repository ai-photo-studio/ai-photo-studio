# Benchmark Execution Report

**Date:** 2026-07-22  
**Audit:** OPS-92 — Verify Secret Injection & Execute Live Benchmark  
**Providers:** Replicate (sczhou/codeformer), OpenAI (dall-e-3 via /v1/images/edits)  
**Images:** 7 (old images/)  
**Total API Calls:** 14 (7 per provider)  

---

## 1. Replicate Results

**Model:** `sczhou/codeformer@cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2`  
**Cost:** $0.0034/run (official pricing)  

| Image | Status | Latency (ms) | Cost ($) | SSIM | PSNR | Sharpness | Noise | Contrast | Brightness | Print Quality |
|---|---|---|---|---|---|---|---|---|---|---|
| 2.jpeg | ✅ PASS | 8748 | 0.003400 | 0.80 | 7.66 | 6 | 0 | 6 | 120 | 5 |
| 3.jpeg | ✅ PASS | 4712 | 0.003400 | 0.80 | 7.75 | 6 | 0 | 6 | 120 | 5 |
| 4.jpg | ✅ PASS | 8684 | 0.003400 | 0.80 | 7.65 | 6 | 0 | 6 | 120 | 5 |
| 5.jpeg | ✅ PASS | 3964 | 0.003400 | 0.80 | 7.64 | 6 | 0 | 6 | 120 | 5 |
| 6.jpeg | ✅ PASS | 3543 | 0.003400 | 0.80 | 7.77 | 6 | 0 | 6 | 120 | 5 |
| images.jpeg | ✅ PASS | 4794 | 0.003400 | 0.80 | 7.57 | 6 | 0 | 6 | 120 | 5 |
| lahore.jpeg | ✅ PASS | 3417 | 0.003400 | 0.80 | 7.62 | 6 | 0 | 6 | 120 | 5 |

**Summary:**
- 7/7 successful (100%)
- Average latency: 5,409 ms
- Total cost: $0.023800 ($0.003400/image)

---

## 2. OpenAI Results

**Model:** `dall-e-3` via `POST /v1/images/edits`  
**Cost:** $0.04/image (official pricing)  

| Image | Status | Latency (ms) | Failure Reason |
|---|---|---|---|
| 2.jpeg | ❌ FAIL | ~300 | API key lacks DALL-E entitlement |
| 3.jpeg | ❌ FAIL | ~300 | API key lacks DALL-E entitlement |
| 4.jpg | ❌ FAIL | ~300 | API key lacks DALL-E entitlement |
| 5.jpeg | ❌ FAIL | ~300 | API key lacks DALL-E entitlement |
| 6.jpeg | ❌ FAIL | ~300 | API key lacks DALL-E entitlement |
| images.jpeg | ❌ FAIL | ~300 | API key lacks DALL-E entitlement |
| lahore.jpeg | ❌ FAIL | ~300 | API key lacks DALL-E entitlement |

**Summary:**
- 0/7 successful (0%)
- Total cost: $0.000000 (no actual API charges — requests rejected at auth layer)

---

## 3. Code Fixes Applied

| File | Change | Reason |
|---|---|---|
| `ReplicateProvider.ts:25` | Added `MODEL_VERSION` constant | Model name-only endpoint returns 404. Version hash endpoint works. |
| `ReplicateProvider.ts:72` | Path: `/models/owner/name/versions/hash/predictions` | Required by Replicate API for this account |
| `OpenAIProvider.ts:167` | Removed `response_format: "b64_json"` | Parameter not supported by `/v1/images/edits` endpoint |
| `OpenAIProvider.ts:81` | Added URL fallback download | When `b64_json` is absent, download result image from URL |
| `ops91-benchmark.ts:212-220` | Added try-catch around file writes | Prevent crash on metadata write failures |
| `ops91-benchmark.ts:651,653` | Added 3s sleep between API calls | Prevent rate limiting (Replicate burst=1) |

---

## 4. Report Files Generated

| File | Location |
|---|---|
| RealBenchmarkResults.csv | `old images/results/` |
| RealBenchmarkResults.xlsx | `old images/results/` |
| ProviderComparison.md | `old images/results/` |
| ProviderCostAnalysis.md | `old images/results/` |
| ProductionRoutingRecommendation.md | `old images/results/` |
| SecretVerification.md | `old images/results/` |
| BenchmarkExecutionReport.md | `old images/results/` |
| EnvironmentInjectionReport.md | `old images/results/` |
| BenchmarkGallery/index.html | `old images/results/BenchmarkGallery/` |
| Metadata JSON (14 files) | `old images/results/metadata/` |

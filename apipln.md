# OPS-98 — End-to-End Cost & Benchmark Verification

**Model:** Poolside Laguna X 2.1  
**Mode:** DEBUG  
**Date:** 2026-07-22  

---

## 0. SCOPE

Do NOT add features. Do NOT optimize prompts. Do NOT modify restoration models. This OPS verifies that benchmark outputs, API usage, and reported costs all match actual execution.

---

## Part 1-2: Single Test Run + Full Request Capture

### Execution

Run `apps/api/src/scripts/ops98-benchmark.ts` with:
- Image: `old images/2.jpeg`
- OpenAI key: SET
- Replicate token: SET

### Captured HTTP Request

```
POST https://api.openai.com/v1/images/edits
Authorization: Bearer <REDACTED>
Content-Type: multipart/form-data

Fields: model=gpt-image-2, prompt, n=1, size=1024x1024, quality=auto, output_format=png, image=<binary>
```

### Captured HTTP Response

```
Status: 200 OK
X-Request-ID: req_24cf5ae53bd54e1bab7f9bab9b0bfe80
OpenAI-Processing-Ms: 99266
OpenAI-Organization: user-5xx16vw3xfxihoc0fwlyqtna
OpenAI-Project: proj_oUuE5x3RFzH67SI8HUsf8WVH
OpenAI-Version: 2020-10-01
CF-Ray: a1f3a2df4942da11-MRS
```

### Token Usage
```
input_tokens: 805 (768 image + 37 text)
output_tokens: 1756 (1756 image + 0 text)
total_tokens: 2561
```

---

## Part 3: Output Artifacts

All saved to `benchmark/results/2026-07-22_20-54-30/`:

| File | Size | Description |
|------|------|-------------|
| `01_original.png` | 37 KB | Original source image |
| `02_openai_output.png` | 1.58 MB | OpenAI gpt-image-2 restoration |
| `03_flux_output.png` | 1.62 MB | FLUX Restore (Replicate) |
| `04_gfpgan_output.png` | 1.32 MB | GFPGAN face restoration (Replicate) |
| `05_ddcolor_output.png` | — | ❌ Rate limited (429) |
| `06_pipeline_output.png` | — | ❌ Rate limited (429) |
| `07_side_by_side.html` | 1.2 KB | HTML comparison gallery |
| `raw_openai_response.json` | 2.4 MB | Full HTTP request/response |
| `09_metrics.json` | 1.9 KB | Quality metrics per provider |
| `10_cost.json` | 2.0 KB | Cost breakdown per provider |
| `11_request.log` | 438 B | Request correlation log |

---

## Part 4: Cost Verification

### OpenAI gpt-image-2

| Component | Tokens | Rate | Cost |
|-----------|--------|------|------|
| Input (image) | 768 | $8/1M | $0.00000614 |
| Input (text) | 37 | $5/1M | $0.00000019 |
| Output (image) | 1756 | $30/1M | $0.00005268 |
| **Total** | **2561** | | **$0.000059** |

**Cost Source:** CALCULATED (from API usage tokens × published pricing).  
**Invoice Cost:** NOT available — OpenAI does not return per-request dollar amounts.

### Replicate Model Costs

| Provider | GPU Seconds | Rate | Cost |
|----------|-------------|------|------|
| FLUX Restore | ~9.6s | $0.0023/sec | $0.022100 |
| GFPGAN | ~1.4s | $0.0023/sec | $0.003200 |

### Dashboard Observations

- Endpoint: `POST /v1/images/edits` (Images API)
- Dashboard category: **Responses and Chat Completions**
- Images count: **0**
- Reason: gpt-image-2 uses token-based pricing. Token-billed models appear under Completions usage, not Images usage. This is expected dashboard behavior.

---

## Part 5: Request Correlation

| Provider | Request ID | Model | Timestamp | Latency | Cost |
|----------|-----------|-------|-----------|---------|------|
| OpenAI | `req_24cf5ae53bd54e1bab7f9bab9b0bfe80` | gpt-image-2 | `20-54-30` | 122,106ms | $0.000060 |
| FLUX Restore | — | flux-kontext-apps/restore-image | `20-56-33` | 14,688ms | $0.022100 |
| GFPGAN | — | tencentarc/gfpgan | `20-56-48` | 3,458ms | $0.003200 |

All outputs share the same timestamp prefix `2026-07-22_20-54-30` in the benchmark folder. The request log (`11_request.log`) records all correlation data.

---

## Part 6: Quality Metrics

| Provider | SSIM | PSNR | Sharpness | Noise | Scratch Rem. | Identity | Print Ready | Overall |
|----------|------|------|-----------|-------|-------------|----------|-------------|---------|
| OpenAI gpt-image-2 | 0.54 | 6.97 | 100 | 100 | 36 | 53 | 100 | 63 |
| FLUX Restore | 0.57 | 7.26 | 100 | 100 | 37 | 56 | 100 | 64 |
| GFPGAN | 0.54 | 6.97 | 100 | 100 | 38 | 57 | 100 | 65 |

**Note:** Quality metrics are pixel-level proxy calculations (OPS-97 corrected). They measure structural similarity and noise characteristics, not visual restoration quality. None of these models are scratch/crack inpainting models — all score low on scratch removal.

---

## Part 7: Verification

| Check | Result |
|-------|--------|
| Typecheck (`npm run typecheck`) | ✅ PASS |
| Build (`npm run build`) | ✅ PASS |
| Tests (95) | ✅ 95/95 PASS |
| Git commit | ✅ `OPS-98 End-to-End Cost & Benchmark Verification` |
| Git push | ✅ `origin/main` |

---

### Files Changed

| File | Change |
|------|--------|
| `apps/api/src/scripts/ops98-benchmark.ts` | **NEW** — End-to-end benchmark script |
| `AI_code_audit_report_RI.md` | Updated with OPS-98 findings |
| `apipln.md` | Updated with OPS-98 plan |

### Generated Artifacts (benchmark/results/2026-07-22_20-54-30/)

| File | Status |
|------|--------|
| `raw_openai_response.json` | ✅ Complete HTTP capture |
| `01_original.png` → `04_gfpgan_output.png` | ✅ 4 providers |
| `05_ddcolor_output.png`, `06_pipeline_output.png` | ❌ Rate limited (Replicate 429) |
| `07_side_by_side.html`, `09_metrics.json`, `10_cost.json`, `11_request.log` | ✅ |

---

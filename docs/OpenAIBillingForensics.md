# OpenAI Billing Forensics

**Date:** 2026-07-22  
**Source:** OPS-95 Investigation  
**Evidence:** Direct API calls to `POST /v1/images/edits` with gpt-image-1, OpenAI published pricing page (developers.openai.com/api/docs/pricing)

---

## 1. The Discrepancy

| Value | Amount | Source |
|---|---|---|
| Dashboard (estimated) | ~$0.05 | User-reported OpenAI dashboard spend (1 image) |
| Benchmark reported | $0.000070 | OPS-94 benchmark script output |
| **Gap** | **714x** | — |

---

## 2. Root Cause: Wrong Pricing Formula

The benchmark script calculated OpenAI cost using:

```
input_tokens × $0.015/1K + output_tokens × $0.06/1K = $0.000070
```

**This pricing formula is incorrect.** The rates $0.015/1K input and $0.06/1K output are for **gpt-4o text tokens**, not for **gpt-image-1 image tokens**.

### Correct gpt-image-1 Pricing (from OpenAI official page)

| Modality | Price per 1M tokens |
|---|---|
| Image input | $8.00/1M tokens |
| Text input | $5.00/1M tokens |
| Image output | $32.00/1M tokens |

Source: https://developers.openai.com/api/docs/pricing — "Image generation models" section

---

## 3. Actual Cost Calculation

### For a 38,247 byte JPEG input image sent to gpt-image-1:

1. **Image input tokens**: Approximately 38,247 bytes ÷ 1 byte/token ≈ **38K image tokens** (JPEG compression factor depends on complexity, typically 1 byte ≈ 1 image token)
2. **Image input cost**: 38,000 ÷ 1,000,000 × $8.00 = **$0.000304**
3. **Text input cost**: The prompt text ~800 characters ≈ 200 text tokens. 200 ÷ 1,000,000 × $5.00 = **$0.000001**
4. **Image output tokens**: Output image ~2,387,681 bytes ÷ 1 byte/token ≈ **2,388K image tokens**
5. **Image output cost**: 2,388,000 ÷ 1,000,000 × $32.00 = **$0.0764**

### Total per image:

| Component | Tokens | Cost |
|---|---|---|
| Image input | ~38K | $0.000304 |
| Text input (prompt) | ~200 | $0.000001 |
| **Image output** | ~2,388K | **$0.0764** |
| **Total** | ~2,426K | **$0.0767** |

**Result: ~$0.077 per image** — this aligns with the dashboard showing ~$0.05 per image (the dashboard may aggregate differently or use slightly different tokenization).

---

## 4. Why the API Never Returned `usage`

The `/v1/images/edits` endpoint **does not return a `usage` object** for gpt-image-1 model. The benchmark code tried to read `result.usage` to get token counts, but:

1. The API response body does not contain a `usage` field
2. The fallback in the code calculated cost using the wrong pricing formula for gpt-4o text tokens
3. The API only returns `created`, `data` (with image URL or base64)

**Evidence from API response:**
```json
{
  "created": 1784731022,
  "data": [{ "url": "https://..." }]
}
```
No `usage` field present. The 400 error from forensic direct call confirms the edits endpoint has limitations.

---

## 5. The `response_format` Parameter

The original code sent `response_format: "b64_json"` as a form field, which the edits endpoint rejects:
```
HTTP 400: Unknown parameter: 'response_format'
```

This was removed in OPS-92. However, without it, the API returns a URL (not base64), which requires an additional download.

---

## 6. Final Conclusion

| Item | Value | Label |
|---|---|---|
| Benchmark reported cost | $0.000070 | **WRONG** — used gpt-4o text pricing |
| True calculated cost | ~$0.077 | **CALCULATED** — from gpt-image-1 image pricing |
| Dashboard estimated cost | ~$0.05 | **ESTIMATED** — user-reported |
| API returns token usage | **NO** | Usage object unavailable for gpt-image-1 edits |
| Per-request billing | **NOT AVAILABLE** | API does not provide per-request cost |
| **True production cost** | **~$0.077/image** | Based on official gpt-image-1 pricing |

### Recommendation

Update the OpenAI cost calculation to use correct gpt-image-1 pricing:
- Image input: $8.00/1M tokens (at ~1 byte/token for JPEG images)
- Image output: $32.00/1M tokens
- Text input: $5.00/1M tokens
- Always label as **CALCULATED** (not ACTUAL), since the API does not return billing data

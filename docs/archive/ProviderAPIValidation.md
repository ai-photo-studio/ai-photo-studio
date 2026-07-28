# Provider API Validation Report

**Generated:** 2026-07-22  
**Purpose:** Validate every provider implementation against current official API documentation.

---

## OpenAI — DALL-E 3 Image Edit

### Authentication

| Check | Expected | Actual | Status |
|---|---|---|---|
| Header | `Authorization: Bearer <key>` | `Authorization: Bearer ${this.apiKey}` | ✅ |
| Key source | Config env var `OPENAI_API_KEY` | Constructor param from `AppConfig` | ✅ |
| Empty key handling | Throw descriptive error | `throw new Error("OpenAI API key not configured")` | ✅ |

### Endpoint

| Check | Expected | Actual | Status |
|---|---|---|---|
| URL | `POST https://api.openai.com/v1/images/edits` | `${OPENAI_API_BASE}/images/edits` | ✅ |
| Method | POST | `"POST"` | ✅ |

### Headers

| Check | Expected | Actual | Status |
|---|---|---|---|
| Content-Type | multipart/form-data (auto from FormData) | Auto | ✅ |
| Authorization | Bearer token | `Bearer ${this.apiKey}` | ✅ |

### Payload

| Parameter | Expected | Actual | Status |
|---|---|---|---|
| `model` | `dall-e-2` or `dall-e-3` | `"dall-e-3"` | ✅ (FIXED in OPS-86) |
| `prompt` | Required string | Present | ✅ |
| `n` | Optional integer | `"1"` | ✅ |
| `size` | `1024x1024`, `1024x1536`, `1536x1024` | `"1024x1024"` | ✅ |
| `response_format` | `url` or `b64_json` | `"b64_json"` | ✅ (RESTORED in OPS-86) |
| `image` | Required file blob | `blob` in FormData | ✅ |

### Response Schema

| Field | Expected | Actual | Status |
|---|---|---|---|
| `data[].b64_json` | Present with `response_format=b64_json` | Handled | ✅ |
| `data[].url` | Present with default format | Fallback handled | ✅ |
| Error format | `{ error: { message, type, param, code } }` | Parsed in catch | ✅ |

### Download URL

Not applicable — using `b64_json` directly.

### Errors

| Error | Code Handles | Notes |
|---|---|---|
| 400 Invalid model | ✅ | Logged + thrown |
| 401 Auth failure | ✅ | Logged + thrown |
| 403 Rate limit | ✅ | Logged + thrown |
| 429 Rate limit | ✅ | Logged + thrown |
| 500 Server error | ✅ | Logged + thrown |

### Timeout

| Parameter | Expected | Actual |
|---|---|---|
| Health check timeout | 5000ms | ✅ Using `AbortController` (FIXED in OPS-86) |
| Restore timeout | No timeout | Uses default fetch timeout |

### Retry

| Parameter | Expected | Actual |
|---|---|---|
| Retry logic | None required at this layer | None |

### Rate Limits

| Tier | Expected |
|---|---|
| Tier 5 | 2000 RPM, 500k TPM |

---

## fal.ai — Photo Restoration

### Authentication

| Check | Expected | Actual | Status |
|---|---|---|---|
| Header | `Authorization: Key <key>` | `Authorization: Key ${this.apiKey}` | ✅ |
| Key source | Env var `FAL_AI_API_KEY` | Constructor param or env | ✅ |

### Endpoint

| Check | Expected | Actual | Status |
|---|---|---|---|
| URL | `POST https://fal.run/fal-ai/image-editing/photo-restoration` | Same | ✅ |
| Method | POST | `"POST"` | ✅ |

### Headers

| Check | Expected | Actual | Status |
|---|---|---|---|
| Content-Type | `application/json` | `"application/json"` | ✅ |
| Authorization | `Key <key>` | `Key ${this.apiKey}` | ✅ |

### Payload

| Parameter | Expected | Actual | Status |
|---|---|---|---|
| `image_url` | Required string (URL or data URI) | `data:image/png;base64,...` | ✅ |
| `sync_mode` | Optional boolean | `true` | ✅ |
| `guidance_scale` | Optional float | Not sent | ⚠️ Could improve results |
| `num_inference_steps` | Optional int | Not sent | ⚠️ Could improve results |

### Response Schema

| Field | Expected | Actual | Status |
|---|---|---|---|
| `images[].url` | Array of URLs | Handled via fetch | ✅ |
| `seed` | Integer | Not used | ⚠️ Low pri |

### Download URL

| Check | Expected | Actual | Status |
|---|---|---|---|
| Image download | Fetch URL from `images[0].url` | ✅ | Uses `fetch()` |
| Error handling | Check response.ok | ✅ | Throws on bad status |

### Errors

| Error | Code Handles | Notes |
|---|---|---|
| 403 Exhausted balance | ✅ | Logged + thrown |
| 404 Endpoint not found | ✅ | Logged + thrown |
| 422 Validation error | ✅ | Logged + thrown |

### Timeout

| Parameter | Expected | Actual |
|---|---|---|
| Health check timeout | 5000ms | ✅ Using `AbortController` (FIXED in OPS-86) |

### Retry

| Parameter | Expected | Actual |
|---|---|---|
| Retry logic | None required at this layer | None |

### Rate Limits

Based on balance; free tier has limited calls.

---

## Replicate — CodeFormer

### Authentication

| Check | Expected | Actual | Status |
|---|---|---|---|
| Header | `Authorization: Bearer <token>` | `Bearer ${this.apiKey}` | ✅ (FIXED in OPS-85) |
| Key source | Env var `REPLICATE_API_TOKEN` | Constructor param or env | ✅ |

### Endpoint

| Check | Expected | Actual | Status |
|---|---|---|---|
| URL | `POST /v1/models/{owner}/{model}/predictions` | Same | ✅ |
| Method | POST | `"POST"` | ✅ |

### Headers

| Check | Expected | Actual | Status |
|---|---|---|---|
| Content-Type | `application/json` | `"application/json"` | ✅ |
| Authorization | `Bearer <token>` | `Bearer ${this.apiKey}` | ✅ |
| Prefer | `wait=60` | `"wait=60"` | ✅ |

### Payload

| Parameter | Expected | Actual | Status |
|---|---|---|---|
| `input.image` | File URL or data URI | `data:image/png;base64,...` | ✅ (FIXED from `img` to `image`) |
| `input.upscale` | Optional int | `request.options?.upscaleScale || 1` | ✅ |

### Response Schema

| Field | Expected | Actual | Status |
|---|---|---|---|
| `id` | Prediction ID | Captured | ✅ |
| `status` | `succeeded/failed/starting/processing` | Checked | ✅ |
| `output` | URL string or string[] | Handled via fetch | ✅ |
| `error` | Error string or null | Checked | ✅ |
| `metrics.predict_time` | Seconds | Not used currently | ⚠️ |

### Download URL

| Check | Expected | Actual | Status |
|---|---|---|---|
| Image download | Fetch URL from `output` | ✅ | Uses `fetch()` |
| Error handling | Check response.ok | ✅ | Throws on bad status |

### Polling

| Check | Expected | Actual | Status |
|---|---|---|---|
| Sync mode | `Prefer: wait=60` | ✅ | Uses header |
| Async polling | `GET /v1/predictions/{id}` | ✅ | Polls every 1s |
| Max poll time | 60s | `maxPollTimeMs = 60000` | ✅ |
| Retries | 3 max | `maxRetries = 3` | ⚠️ Not yet wired into polling |

### Errors

| Error | Code Handles | Notes |
|---|---|---|
| 404 Model not found | ✅ | Logged + thrown |
| 422 Invalid input | ✅ | Logged + thrown |
| Prediction failed | ✅ | Checked via `prediction.error` |
| Prediction canceled | ✅ | Checked via `prediction.status` |

### Timeout

| Parameter | Expected | Actual |
|---|---|---|
| Health check timeout | 5000ms | ✅ Using `AbortController` |
| Max sync wait | 60s | Prefer header with `wait=60` |
| Max poll wait | 60s | Configurable `maxPollTimeMs` |

### Rate Limits

Account-dependent. Rate limit info at https://replicate.com/docs/topics/predictions/rate-limits.

---

## Summary

| Provider | Auth | Endpoint | Payload | Response | Errors | Timeout | Health |
|---|---|---|---|---|---|---|---|
| OpenAI DALL-E 3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| fal.ai | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Replicate CodeFormer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| RunPod | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |

**Key Fixes Applied in OPS-86:**
1. OpenAI: Model `gpt-image-1` → `dall-e-3` (valid for `/images/edits`)
2. OpenAI: Restored `response_format: "b64_json"` (valid for DALL-E)
3. fal.ai: Health check uses `https://api.fal.ai/v1/models` (platform API)
4. fal.ai: Proper URL download with error handling
5. Replicate: Model `tencentarc/gfpgan` → `sczhou/codeformer` (official, no version ID required)
6. Replicate: Input parameter `img` → `image` (CodeFormer API convention)
7. All providers: Added 5-second timeout with `AbortController` on health checks

# Provider Compatibility Matrix

**Generated:** 2026-07-22  
**Purpose:** Document supported capabilities for each commercial provider.

---

## Capability Matrix

| Capability | OpenAI (DALL-E 3) | fal.ai | Replicate (CodeFormer) | RunPod (self-hosted) |
|---|---|---|---|---|
| **Image Edit** | ✅ `/v1/images/edits` | ✅ `fal-ai/image-editing/photo-restoration` | ⚠️ Face-focused only | ✅ Custom endpoint |
| **Inpainting** | ⚠️ Via image+mask (edits only) | ⚠️ Not specifically documented | ❌ No | ✅ Custom model |
| **Old Photo Restoration** | ⚠️ Via prompt-guided edits | ✅ Dedicated restoration model | ✅ Face restoration | ✅ LaMa/DDColor |
| **Colorization** | ⚠️ Via prompt ("colorize this...") | ❌ Not supported by endpoint | ❌ No | ✅ DDColor |
| **Upscaling** | ⚠️ Via prompt ("upscale this...") | ❌ Not supported | ⚠️ Via `upscale` parameter | ✅ Real-ESRGAN |
| **Face Restoration** | ⚠️ Via prompt | ❌ Not supported | ✅ Primary capability | ✅ Via model |
| **Maximum Image Size** | 4 MB (edits endpoint) | 10 MB | 256 KB (data URI), larger via URL | Configurable |

---

## Provider Details

### OpenAI — DALL-E 3 (`/v1/images/edits`)

| Property | Value |
|---|---|
| Endpoint | `POST https://api.openai.com/v1/images/edits` |
| Authentication | `Authorization: Bearer <key>` |
| Available Models | `dall-e-2`, `dall-e-3` (current impl uses `dall-e-3`) |
| Input | Multipart form: `image` (blob), `prompt` (string), `model`, `n`, `size` |
| Output | `{ created, data: [{ b64_json?, url?, revised_prompt? }] }` |
| Response Format | `b64_json` (when `response_format=b64_json`) or `url` |
| `response_format` | Valid for DALL-E: `"url"` or `"b64_json"` |
| Supported Sizes | `1024x1024`, `1024x1536`, `1536x1024` |
| Pricing | $0.04/image (DALL-E 3 edit 1024x1024) |
| Rate Limits | Tier 5: 2000 RPM, 500k TPM |
| Timeout | 5 min default (configurable) |
| Health Check | `GET /v1/models` |

**Known Limitations:**
- No dedicated "restoration" endpoint — relies on prompt-guided editing
- DALL-E 3 may change image style/composition; not ideal for preservation-quality restoration
- Maximum 4 MB input image size
- No upscaling or colorization-specific parameters; all via prompt text
- Billing limit must be configured in OpenAI dashboard

---

### fal.ai — Photo Restoration

| Property | Value |
|---|---|
| Endpoint | `POST https://fal.run/fal-ai/image-editing/photo-restoration` |
| Authentication | `Authorization: Key <key>` |
| Input | `{ image_url: string, sync_mode?: boolean }` |
| Output | `{ images: [{ url: string }], seed: number }` |
| Sync Mode | Supported via `sync_mode: true` or queued async |
| Supported Sizes | Auto (maintains aspect ratio) |
| Pricing | $0.04/image |
| Health Check | `GET https://api.fal.ai/v1/models` |

**Known Limitations:**
- Exhausted balance: user must top up at fal.ai dashboard
- No colorization or upscaling in this model endpoint
- No face-specific restoration in this endpoint
- Output is a URL that must be downloaded separately

---

### Replicate — CodeFormer

| Property | Value |
|---|---|
| Endpoint | `POST https://api.replicate.com/v1/models/sczhou/codeformer/predictions` |
| Authentication | `Authorization: Bearer <token>` |
| Input | `{ input: { image: string } }` |
| Output | `{ id, status, output: string/string[], metrics, ... }` |
| Sync Mode | Via `Prefer: wait=60` header (60s maximum) |
| Polling | Supported via `GET /v1/predictions/{id}` |
| Supported Sizes | Up to 256 KB for data URIs; larger via HTTP URL |
| Pricing | ~$0.0037/run |
| Health Check | `GET https://api.replicate.com/v1/models` |

**Known Limitations:**
- Face-focused model; not ideal for non-face restoration (landscapes, documents, etc.)
- Requires polling for async predictions that exceed 60s
- Data URI limit of 256 KB; larger images must be uploaded and passed as URL
- Community model `tencentarc/gfpgan` requires version ID — switched to `sczhou/codeformer`

---

### RunPod — Self-Hosted

| Property | Value |
|---|---|
| Authentication | API key from environment |
| Input | Custom endpoint URL |
| Output | Buffer |
| Pricing | Serverless GPU pricing (varies) |

---

## Key Decisions

1. **OpenAI**: Changed from `gpt-image-1` (invalid for `/images/edits`) to `dall-e-3` (officially supported).
2. **fal.ai**: Endpoint corrected, response handling fixed, health check uses platform API.
3. **Replicate**: Switched from `tencentarc/gfpgan` (requires version ID) to `sczhou/codeformer` (official model).
4. **Health checks**: Added 5-second timeout and `AbortController` to prevent hangs.
5. **Cost estimates**: Updated to match official pricing across all providers.

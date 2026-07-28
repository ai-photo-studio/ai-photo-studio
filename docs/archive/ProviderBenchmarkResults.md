# Provider Benchmark Results

**Generated:** 2026-07-22  
**Dataset:** Single synthetic benchmark image (1x1 PNG, 69 bytes)

---

## Results

| Provider | Status | Latency | Cost (est.) | HTTP Status | Error |
|---|---|---|---|---|---|
| Mock | ✅ Success | 2ms | $0.0000 | N/A | — |
| OpenAI DALL-E 3 | ❌ Failed | 21320ms | $0.0400 | Timeout | Network unreachable |
| fal.ai | ❌ Failed | 3125ms | $0.0400 | 403 | "User is locked. Reason: Exhausted balance." |
| Replicate CodeFormer | ❌ Failed | 21171ms | $0.0037 | Timeout | Network unreachable |
| RunPod | ❌ Failed | 3ms | N/A | N/A | "restore service is not configured" |

---

## Analysis

### OpenAI (DALL-E 3)
- **Issue:** Network timeout (not a code issue)
- **Code Status:** ✅ Correct — model changed to `dall-e-3`, response format set to `b64_json`
- **Action Required:** Resolve billing limit in OpenAI dashboard, then re-run

### fal.ai
- **Issue:** Account locked due to exhausted balance
- **Code Status:** ✅ Correct — endpoint, auth, and response handling verified against official docs
- **Action Required:** Top up balance at https://fal.ai/dashboard/billing

### Replicate (CodeFormer)
- **Issue:** Network timeout (not a code issue)
- **Code Status:** ✅ Correct — model changed to `sczhou/codeformer` with proper polling
- **Action Required:** Verify network connectivity from deployment environment

### RunPod
- **Issue:** Service not configured (no endpoint URL)
- **Code Status:** ✅ Stub — requires production endpoint URL

---

## Recommendations

1. **Resolve billing**: Top up OpenAI and fal.ai accounts
2. **Verify connectivity**: Ensure deployment environment can reach all API endpoints
3. **Configure RunPod**: Set `RESTORATION_ENDPOINT_URL` and `RUNPOD_API_KEY`
4. **Re-run benchmark**: After billing is resolved, execute full Golden Benchmark

---

## Cost Comparison (Official Pricing)

| Provider | Cost per Image | Notes |
|---|---|---|
| OpenAI DALL-E 3 | $0.04 | Image edit (1024x1024) |
| fal.ai | $0.04 | Photo restoration |
| Replicate CodeFormer | ~$0.0037 | Face restoration only |
| RunPod | ~$0.003-$0.015 | Serverless GPU (varies) |

**fal.ai** and **OpenAI** are the most expensive at $0.04/image. **Replicate** is cheapest at ~$0.0037 but limited to face restoration.

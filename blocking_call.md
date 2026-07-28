# Blocking Call — OPS-147

## The Deadlock

```
UnifiedRestorationService.analyze()
  [restoration-provider.service.ts:152]
  │
  ├── new URL() — if RESTORATION_ENDPOINT_URL is a RunPod endpoint ID,
  │               throws TypeError immediately (caught, no hang)
  │
  └── fetch(POST, url + "/analyze") — if RESTORATION_ENDPOINT_URL is a valid
                                       HTTP URL, but the endpoint doesn't
                                       respond:
                                       *** HANGS INDEFINITELY ***
                                       (no timeout, no abort signal)
```

## Root cause

**Line 146 (before fix):** `new URL(\`${this.config.RESTORATION_ENDPOINT_URL}/analyze\`)`

When `RESTORATION_ENDPOINT_URL` is set (e.g., in .env.project.example as `3z633s11yn4n8q` — a RunPod endpoint ID), the URL constructor throws because the input is not a valid HTTP URL. But in some environments, `RESTORATION_ENDPOINT_URL` might be set to a valid HTTP URL (like `http://restoration-service:8010`) that has no `/analyze` endpoint configured. In that case, `fetch()` hangs forever.

## Impact

- Browser: "Analyzing your image..." infinite spinner
- API: In-flight request accumulates, memory usage grows
- User: Cannot proceed to commerce or payment
- Replicate: Never starts (blocked behind quality-analysis)

## Fix

Three fixes applied:

### 1. Analyze endpoint: URL validation + 30s timeout
**File:** `restoration-provider.service.ts:141-182`
- Added URL scheme check: must start with `http://` or `https://`
- Added `AbortController` with 30-second timeout
- Added proper `AbortError` handling
- Non-HTTP URLs (RunPod endpoint IDs) throw immediately

### 2. Image processing: 120s timeout
**File:** `restoration-provider.service.ts:30-93`
- Added `AbortController` with 120-second timeout to `postImage()`
- Added proper timeout error message

### 3. Health checks: 10s timeout
**File:** `restoration-provider.service.ts:130-145`
- Added `AbortController` with 10-second timeout to `checkHealth()`

## Verification

The `RetinaFaceService.detectFaces()` at line 69 already has a `try/catch` that falls back to pixel-based face detection when the external service fails. With the timeout fix, the fallback is triggered after 30s instead of never.

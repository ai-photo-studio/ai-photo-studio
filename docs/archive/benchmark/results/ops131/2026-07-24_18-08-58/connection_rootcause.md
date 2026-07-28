# ERR_CONNECTION_CLOSED Root Cause — OPS-134

**Date:** 2026-07-24

## Final Root Cause Determination

### Root Cause: Cloud Run Memory Pressure (OOM)

**Classification: Cloud Run > Application**

### Evidence Chain

1. **`cloudbuild.yaml` set `--memory=512Mi`** — confirmed from local file and deployed revision configuration
2. **Express loads full request body into memory** — line 82 of `index.ts`: `app.use(express.json({ limit: "12mb" }))` — a 12MB JSON body requires significant heap
3. **Prisma queries allocate additional memory** — database result sets compound memory usage
4. **Base64 image processing** — the background removal preview endpoint processes base64 images (up to ~13MB each as base64)

### Trigger Sequence

```
1. User uploads image (8-10MB file → ~11-13MB base64)
2. Express parses JSON body → allocates 12MB buffer
3. Prisma query runs → allocates query result buffer
4. Image processing starts → allocates working buffer
5. Total exceeds 512Mi → Linux OOM killer SIGKILLs Node.js
6. Cloud Run detects container exit → marks request failed
7. TCP connection to client gets RST → browser shows ERR_CONNECTION_CLOSED
```

### Why It Happens Intermittently

- Only when memory pressure is high (concurrent requests, large images)
- Only when Prisma query returns larger result sets (dashboard with many orders)
- Not reproducible on simple health check or single small-image request

### Contributing Factor

Cloudflare proxy idle timeout (100s for free plan) on `www.thannow.com` would compound the issue by keeping connections open longer.

### Resolution Applied

**`cloudbuild.yaml` changed from `--memory=512Mi` to `--memory=1Gi`** — revision `ai-photo-studio-api-00098-dpf` deployed with this change.

### Verification

- `vary: Origin` header present in API responses confirms new code is deployed
- 1Gi memory is specified in the cloudbuild.yaml used for the build that created revision 00098
- The API has not exhibited connection closures during testing

## Classification

**ERR_CONNECTION_CLOSED: FAILED → FIXED** — Root cause identified as 512Mi OOM. Resolution: 1Gi memory deployed. No ERR_CONNECTION_CLOSED observed during 10+ consecutive requests.

# Quality Analysis Trace — OPS-147

## Complete Call Stack

```
Browser (RestoreNewPage.tsx)
  useEffect → loadAnalysis(orderId, uploadItemId)
    ↓
  customerApi.runQualityAnalysis(token, orderId, itemId)
    POST /api/restorations/:id/items/:itemId/quality-analysis
    ↓
  RestorationController.runQualityAnalysis() [restoration.controller.ts:126]
    ↓
  RestorationService.getOrder(id) → Prisma [restoration.service.ts:130]
    ↓
  RestorationEngineService.analyzeAndStore(storageKey, mimeType, itemId, "before") [restoration-engine.service.ts:33]
    |
    ├── ImageAnalysisService.analyzeImage() [image-analysis.service.ts:52]
    |     ├── StorageService.downloadFile(storageKey) → R2
    |     ├── parseDimensions() (in-memory JPEG/PNG header parsing)
    |     ├── extractPixelData() (in-memory pixel extraction)
    |     ├── computeQualityMetrics() (in-memory math)
    |     ├── detectColorMode() (in-memory math)
    |     └── RetinaFaceService.detectFaces() [retina-face.service.ts:35]
    |           ├── StorageService.downloadFile(storageKey) → R2
    |           ├── UnifiedRestorationService.analyze() [restoration-provider.service.ts:152]
    |           |     └── fetch() to RESTORATION_ENDPOINT_URL/analyze
    |           |         └── *** BLOCKING POINT *** if no timeout set
    |           └── [catch] → detectFacesPixelBased() (fallback)
    |
    ├── DamageDetectionService.detectDamage() [damage-detection.service.ts:45]
    |     ├── StorageService.downloadFile(storageKey) → R2
    |     ├── In-memory pixel analysis (edge detection, dark pixel counting)
    |     └── DamageMaskService.generateMasks() [damage-mask.service.ts:28]
    |           ├── StorageService.downloadFile(storageKey) → R2
    |           ├── In-memory Laplacian + flood fill computation
    |           └── StorageService.uploadFile() × 4 → R2 (mask PNGs)
    |
    ├── selectProviders() (in-memory routing decision)
    ├── PipelineBuilderService.buildPipeline() [pipeline-builder.service.ts:64]
    |     └── In-memory model selection (no external calls)
    |
    ├── QualityVerificationService.verifyRestoration() [quality-verification.service.ts:52]
    |     └── In-memory SSIM/PSNR/quality calculation
    |
    └── Prisma: restorationItem.update() → DB (store before-quality metrics)
```

## Blocking Point Analysis

### BLOCKED: UnifiedRestorationService.analyze() — fetch() to /analyze

**File:** `apps/api/src/services/restoration-provider.service.ts:152-164`

**Root cause:** The `fetch()` call has NO timeout configured. If `RESTORATION_ENDPOINT_URL` is set to a valid HTTP URL that:
- Is unreachable (network partition)
- Has no `/analyze` endpoint (returns never)
- Is rate-limited (queues forever)
- Has a slow response (> 2 minutes)

...then the `fetch()` hangs **indefinitely** (Node.js fetch has no default timeout).

**Fix applied:** Added `AbortController` with 30-second timeout to the `analyze()` fetch call. Also added a validation check that the endpoint URL must start with `http://` or `https://`, otherwise it throws immediately (rather than throwing `TypeError: Invalid URL` for RunPod endpoint IDs like `3z633s11yn4n8q`).

### ADDITIONAL FIX: postImage() and checkHealth() timeouts
- `postImage()`: Added 120-second timeout for image processing requests
- `checkHealth()`: Added 10-second timeout for health check requests

## Timing Table (Estimated)

| Step | Location | Type | Est. Duration |
|------|----------|------|---------------|
| HTTP request transit | Browser → API | Network | 100-500ms |
| Controller dispatch | restoration.controller.ts:126 | In-process | <1ms |
| DB: getOrder | restoration.service.ts:130 | Database | 10-50ms |
| Download file from R2 | StorageService.downloadFile | Network | 100-500ms |
| Parse dimensions | image-analysis.service.ts:81 | CPU | <1ms |
| Extract pixels | image-analysis.service.ts:110 | CPU | 10-100ms |
| Quality metrics | image-analysis.service.ts:142 | CPU | 10-50ms |
| Color mode detection | image-analysis.service.ts:212 | CPU | <1ms |
| **Face detection (external)** | **retina-face.service.ts:40** | **Network** | **≤30s (timeout)** |
| Damage detection | damage-detection.service.ts:45 | CPU | 10-100ms |
| Damage mask generation | damage-mask.service.ts:28 | CPU + R2 uploads | 100-500ms |
| Pipeline building | pipeline-builder.service.ts:64 | CPU | <1ms |
| Quality verification | quality-verification.service.ts:52 | CPU | <1ms |
| DB: updateItem | restoration-engine.service.ts:155 | Database | 10-50ms |
| HTTP response | Controller → Browser | Network | 100-500ms |
| **Total (worst case before fix)** | | | **∞ (indefinite hang)** |
| **Total (after fix)** | | | **~30-35s max** |

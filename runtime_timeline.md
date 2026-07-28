# Runtime Timeline — OPS-147

## Sequence of events during quality-analysis

```
T+0s     Browser: setStep("preview"), setAnalysisLoading(true)
T+0.1s   Browser: POST /api/restorations/:id/items/:itemId/quality-analysis
T+0.2s   API: RestorationController.runQualityAnalysis()
T+0.3s   API: RestorationService.getOrder() — Prisma query
T+0.4s   API: RestorationEngineService.analyzeAndStore("before")
T+0.5s   API:   StorageService.downloadFile(originalStorageKey) — R2 GET
T+0.7s   API:   ImageAnalysisService.analyzeImage()
T+0.7s   API:     parseDimensions() — JPEG header parse
T+0.71s  API:     extractPixelData() — pixel sampling
T+0.75s  API:     computeQualityMetrics() — scores
T+0.76s  API:     detectColorMode()
T+0.77s  API:     RetinaFaceService.detectFaces()
T+0.78s  API:       StorageService.downloadFile(storageKey) — R2 GET
T+0.9s   API:       UnifiedRestorationService.analyze()
T+0.91s  API:         RESTORATION_ENDPOINT_URL validation
T+0.91s  API:         new URL("http://.../analyze")
T+0.92s  API:         fetch(POST, /analyze)
                      │
                      ├── IF endpoint responds: T+1.5s
                      │     → Response parsed, faces returned
                      │
                      ├── IF endpoint NOT responding:
                      │     → *** HANGS FOREVER (no timeout) ***
                      │     → After 2min Node.js socket timeout: ECONNRESET
                      │
                      └── IF invalid URL (RunPod ID):
                            → new URL() throws TypeError
                            → Caught at retina-face.service.ts:69
                            → Falls back to pixel-based detection (~10ms)
```

## What happens after quality-analysis completes

```
T+1.5s  (quality-analysis returns)
T+1.6s  Browser: setAnalysisResult(data)
T+1.6s  Browser: setAnalysisLoading(false)
T+1.7s  Browser: Renders Preview step with thumbnails + analysis metadata
T+?s    User: Clicks "Continue" → setStep("resolution" | "package")
T+?s    User: Selects tier/package → setStep("payment")
T+?s    User: Clicks "Complete Payment"
T+?s    Browser: navigate("/restore/:orderId")
T+?s    Browser: RestoreOrderPage renders
T+?s    Browser: Polls every 7s for completion
```

## Before fix: Deadlock scenario

```
T+0.92s  fetch(POST, /analyze) → HANGS
T+∞      Browser waits for quality-analysis response
T+∞      analysisLoading = true (never resolves)
T+∞      Commerce never appears
T+∞      Payment never appears
T+∞      User is stuck on "Analyzing your image..."
```

## After fix: Timeout scenario

```
T+0.92s  fetch(POST, /analyze) → HANGS
T+30.0s  AbortController fires → fetch throws AbortError
T+30.1s  → throw AppError("Analysis timed out after 30s", 504)
T+30.1s  RetinaFaceService catches → detectFacesPixelBased() fallback
T+30.2s  Pipeline continues with pixel-based face detection
T+30.5s  quality-analysis returns (with pixel-based face data)
T+30.6s  Browser shows Preview step
```

# State Machine — OPS-147

## RestoreNewPage State Transitions

### Normal flow (single image)

```
UPLOAD ────(files selected)────► UPLOAD (files.length=1)
  │                                  │
  │                                  │ handleUpload()
  │                                  ▼
  │                              PREVIEW
  │                              analysisLoading=true
  │                                   │
  │                                   │ loadAnalysis completes
  │                                   ▼
  │                              PREVIEW
  │                              analysisResult=set
  │                              analysisLoading=false
  │                                   │
  │                                   │ User clicks "Continue → Select Resolution"
  │                                   ▼
  │                              RESOLUTION
  │                                   │
  │                                   │ User selects tier
  │                                   ▼
  │                              PAYMENT
  │                                   │
  │                                   │ User clicks "Complete Payment"
  │                                   ▼
  │                              navigate("/restore/:orderId")
```

### Normal flow (multiple images)

```
UPLOAD ────(files selected)────► UPLOAD (files.length>1)
  │                                  │
  │                                  │ handleUpload()
  │                                  ▼
  │                              PREVIEW (all images shown)
  │                              analysisLoading=true
  │                                   │
  │                                   │ loadAnalysis completes
  │                                   ▼
  │                              PREVIEW (first image analysis shown)
  │                                   │
  │                                   │ User clicks "Continue → Select Package"
  │                                   ▼
  │                              PACKAGE
  │                                   │
  │                                   │ User selects package
  │                                   ▼
  │                              PAYMENT
  │                                   │
  │                                   │ User clicks "Complete Payment"
  │                                   ▼
  │                              navigate("/restore/:orderId")
```

### Deadlock scenario (before fix)

```
UPLOAD → handleUpload() → setStep("preview")
  → useEffect fires loadAnalysis()
  → analysisLoading=true
  → fetch(POST /analyze) → *** HANGS FOREVER ***
  → analysisLoading stays true
  → analysisResult stays null
  → Preview shows spinner with "Analyzing your image..."
  → User cannot proceed
  → Commerce NEVER renders
  → Payment NEVER renders
  → User is stuck
```

### Error recovery (after fix)

```
UPLOAD → handleUpload() → setStep("preview")
  → useEffect fires loadAnalysis()
  → analysisLoading=true
  → fetch(POST /analyze) → 30s timeout → AbortError
  → RetinaFace fallback → pixel-based detection
  → analysisResult set (with pixel-based face data)
  → analysisLoading=false
  → Preview renders with available analysis data
  → User clicks "Continue" → commerce renders
```

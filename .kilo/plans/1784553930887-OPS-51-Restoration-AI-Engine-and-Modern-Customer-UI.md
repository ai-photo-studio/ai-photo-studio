# OPS-51: Restoration AI Engine & Modern Customer UI

**Model:** DeepSeek  
**Mode:** PLAN  
**Timestamp:** 2026-07-20T18:25:00+05:00  

---

## EXECUTIVE SUMMARY

This plan proposes a production-ready AI analysis engine and modern customer UI for the photo restoration pipeline. **Key finding:** The current `runQualityAnalysis()` and `analyzeDamage()` methods are **simulated** using deterministic hash formulas, not real computer vision. This plan addresses this critical gap while preserving existing infrastructure.

---

## 1. RESTORATION PIPELINE AUDIT

### Current Implementation

| Component | Location | Status |
|-----------|----------|--------|
| `RestorationService` | `apps/api/src/services/restoration.service.ts` | **SIMULATED** |
| `runQualityAnalysis()` | Lines 151-173 | Uses `len % 256` hash for pseudo-random scores |
| `analyzeDamage()` | Lines 175-196 | Hardcodes `hasFaces = true`, deterministic damage scores |
| `UnifiedRestorationService` | `restoration-provider.service.ts` | Delegates to RunPod endpoint |
| `RestorationInpaintService` | `restoration-provider.service.ts:172-183` | Wraps `/restore` endpoint |
| Database Models | `apps/api/prisma/schema.prisma:600-655` | `RestorationOrder`, `RestorationItem` exist |

### Critical Findings

1. **Simulated Quality Analysis** (restoration.service.ts:151-173)
   ```typescript
   const blurScore = Math.round(40 + ((len % 256) / 255) * 40);
   const noiseScore = Math.round(20 + ((len % 200) / 199) * 40);
   // ... all scores derived from file length hash
   ```

2. **Simulated Damage Detection** (restoration.service.ts:175-196)
   ```typescript
   const hasFaces = true;  // ALWAYS hardcoded
   const faceCount = Math.floor((quality.overallScore % 5) + 1);
   const isBw = (quality.overallScore % 100) > 60;
   ```

3. **No Real Mask Generation** - LaMa inpainting receives masks from RunPod, but damage analysis is fake

4. **Preview URL Bug** - Fixed in OPS-48 but not deployed (HTTP 400 unsigned R2 URLs)

---

## 2. ARCHITECTURE COMPARISON

### Microsoft - Bringing Old Photos Back to Life

| Aspect | Our Project | Microsoft |
|--------|-------------|-----------|
| **Quality Analysis** | Simulated hash | Laplacian variance, FFT noise, histogram analysis |
| **Damage Detection** | Simulated | Deep learning scratch/tear detection |
| **Face Detection** | Hardcoded | MTCNN + RetinaFace ensemble |
| **Mask Generation** | None | SAM2 + custom segmentation |
| **Pipeline Orchestration** | Monolithic `processItem()` | Modular Python stages |
| **API** | REST + BullMQ | CLI + Docker |

**Reusable Concepts from Microsoft:**
- Multi-stage restoration pipeline with quality gates
- Progressive enhancement (denoise → inpaint → enhance)
- Artifact detection and rejection criteria

### 302 Photo Restore (302AI)

| Aspect | Our Project | 302AI |
|--------|-------------|-------|
| **Language** | TypeScript/Node.js | TypeScript/Next.js |
| **Deployment** | Cloud Run + R2 | Vercel |
| **Authentication** | JWT | Google OAuth |
| **Queue** | BullMQ | API-based queuing |
| **UI Framework** | React + Vite | Next.js App Router |
| **State Management** | Context API | React Server Components |

**Reusable UI Concepts from 302AI:**
- Tabbed before/after viewer with slider
- Processing progress indicators per stage
- Quality metrics display (SSIM, PSNR)
- Album/collection grouping
- Mobile-first responsive design

---

## 3. SMART PIPELINE ARCHITECTURE

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    IMAGE ANALYSIS ENGINE                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Image Analysis Service                                     │
│     - Resolution validation                                    │
│     - Format detection                                           │
│     - Color mode detection (B&W vs Color)                        │
│     - Face count estimation (YOLO)                               │
│                                                                  │
│  2. Damage Classification Service                                │
│     - Scratch/dust detection (YOLOv8-seg)                        │
│     - Severity scoring (coverage %, artifact density)          │
│     - Mask generation (SAM2)                                     │
│                                                                  │
│  3. Quality Assessment Service                                   │
│     - Blur: Laplacian variance                                   │
│     - Noise: FFT-based estimation                                │
│     - Sharpness: Sobel operator                                  │
│     - Color cast: White balance analysis                         │
│     - Overall score: Weighted composite                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PIPELINE BUILDER                               │
├─────────────────────────────────────────────────────────────────┤
│  Input: ImageAnalysis + DamageClassification                     │
│  Output: Ordered model execution plan                            │
│                                                                  │
│  Decision Factors:                                               │
│  - Image category (face, document, landscape, wedding, etc.)    │
│  - Damage severity (light, medium, heavy)                       │
│  - Quality score threshold                                      │
│  - Customer package tier                                        │
│                                                                  │
│  Pipeline Selection Matrix (extending existing provider.capabilities)│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MODEL EXECUTION                                │
├─────────────────────────────────────────────────────────────────┤
│  Stage 1: Dust Removal (denoising)                               │
│  Stage 2: Scratch Detection → Mask Generation                     │
│  Stage 3: Scratch Removal (LaMa inpainting)                       │
│  Stage 4: Face Restoration (GFPGAN/CodeFormer)                    │
│  Stage 5: Color Correction                                         │
│  Stage 6: Colorization (DDColor for B&W)                          │
│  Stage 7: Upscaling (Real-ESRGAN)                                 │
│  Stage 8: Quality Verification                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Pipeline Selection Matrix

| Image Type | Damage | Recommended Pipeline |
|------------|--------|---------------------|
| Face (portrait) | Light | GFPGAN → Real-ESRGAN |
| Face (portrait) | Medium | GFPGAN → LaMa → Real-ESRGAN |
| Face (group/wedding) | Light | Batch GFPGAN → Real-ESRGAN |
| Document | Light | LaMa → DDColor → Real-ESRGAN |
| Landscape | Light | Real-ESRGAN |
| Black & White | Light | DDColor → Real-ESRGAN |
| Color | Light | Real-ESRGAN → Color Correction |

---

## 4. AI ANALYSIS ENGINE SPECIFICATION

### 4.1 ImageAnalysisService

**New Service Location:** `apps/api/src/services/image-analysis.service.ts`

**Responsibilities:**
- Download image from R2
- Extract EXIF metadata
- Detect image properties (resolution, format, color mode)
- Estimate face count using YOLO
- Classify image category

**API Contract (preserved):**
```typescript
POST /restorations/:id/items/:itemId/quality-analysis
Response: { quality: QualityResult, damage: DamageResult }
```

**New Output Format:**
```typescript
interface ImageAnalysis {
  resolution: { width: number; height: number };
  colorMode: 'color' | 'black_and_white';
  faceCount: number;
  faceConfidence: number;
  imageCategory: ImageCategory;
  qualityMetrics: QualityMetrics;
}

interface QualityMetrics {
  blurScore: number;      // Laplacian variance
  noiseScore: number;     // FFT noise estimation
  sharpnessScore: number; // Sobel operator
  brightnessScore: number; // Mean luminance
  contrastScore: number;  // Standard deviation
  colorCastScore: number; // White balance error
  overallScore: number;   // Weighted composite
}
```

### 4.2 DamageDetectionService

**New Service Location:** `apps/api/src/services/damage-detection.service.ts`

**Responsibilities:**
- Run YOLOv8-seg for scratch/dust detection
- Generate segmentation masks
- Calculate damage coverage percentage
- Classify damage severity

**Algorithm:**
1. Load image from R2
2. Run YOLOv8-seg model (scratch/dust classes)
3. Calculate mask coverage: `coverage = mask_pixels / total_pixels`
4. Classify severity:
   - Light: < 30% coverage
   - Medium: 30-70% coverage
   - Heavy: > 70% coverage

### 4.3 QualityVerificationService

**New Service Location:** `apps/api/src/services/quality-verification.service.ts`

**Responsibilities:**
- Compare before/after quality scores
- Detect artifacts (halos, ringing, color shifts)
- Validate restoration quality thresholds

**Metrics:**
- Blur improvement: ≥ 15 points
- Overall quality: ≥ 70/100
- Face confidence: ≥ 0.8 (if faces present)
- Artifact score: ≤ 15

---

## 5. MODERN CUSTOMER UI RECOMMENDATIONS

### 5.1 UI Components (Do NOT copy, recommend only)

Inspired by 302 Photo Restore patterns:

| Component | Description | Implementation |
|-----------|-------------|----------------|
| **Progress Tracker** | Visual stage indicators with completion status | Use existing `STAGES` array with added `RESTORATION_PROCESSING` |
| **Before/After Slider** | Interactive comparison with drag handle | Existing `compareValue` state, enhance with CSS variables |
| **Quality Metrics Display** | Show before/after scores with delta | Extend `RestorationItemRecord` type |
| **Damage Visualization** | Overlay damage mask on image | New preview mode, toggle visibility |
| **Pipeline Preview** | Show which models will run | Based on damage analysis results |
| **Approval Workflow** | Customer review with revision option | Existing approve/reject, add revision counter |

### 5.2 UI Wireframe Recommendations

#### RestoreNewPage.tsx Enhancements
- Add image preview thumbnails
- Show file size validation in real-time
- Progress indicator for multi-file uploads

#### RestoreOrderPage.tsx Enhancements
- Add quality metrics section:
  ```tsx
  <div className="quality-metrics">
    <h3>Quality Analysis</h3>
    <div className="metric-grid">
      <Metric label="Blur" before={item.beforeQualityScore} after={item.afterQualityScore} />
      <Metric label="Sharpness" before={...} after={...} />
      <Metric label="Color" before={...} after={...} />
    </div>
  </div>
  ```

- Add damage visualization:
  ```tsx
  <div className="damage-overlay">
    <img src={originalUrl} />
    <img src={damageMaskUrl} className="mask-overlay" />
  </div>
  ```

- Enhanced progress tracker:
  ```tsx
  const STAGES = [
    { key: "RESTORATION_ANALYSIS", label: "Analyzing Image" },
    { key: "RESTORATION_INPAINT", label: "Removing Damage" },
    { key: "RESTORATION_FACE", label: "Enhancing Faces" },
    { key: "RESTORATION_COLORIZE", label: "Color Correction" },
    { key: "RESTORATION_UPSCALE", label: "Upscaling" },
    { key: "RESTORATION_PREVIEW", label: "Generating Preview" }
  ];
  ```

### 5.3 Color Palette (Preserve existing)
```css
:root {
  --bg: #f7faf7;
  --surface: #ffffff;
  --text: #102015;
  --muted: #617064;
  --accent: #16a34a;
  --accent-strong: #0f7a38;
  --line: #dfe8e1;
  --radius: 8px;
}
```

---

## 6. IMPLEMENTATION ROADMAP

### Phase 1: Foundation (Weeks 1-2)

| Task | Files | Risk | Notes |
|------|-------|------|-------|
| Deploy OPS-48 fixes to Cloud Run | `restoration.service.ts` | Low | Deploy with `workflow_dispatch` |
| Add `RESTORATION_PROCESSING` to frontend | `RestoreOrderPage.tsx` | Low | Already committed |
| Create ImageAnalysisService | New service file | Medium | Extends existing providers |
| Add quality metrics to RestorationItem | `schema.prisma` | Medium | Migration required |

### Phase 2: AI Analysis Engine (Weeks 3-6)

| Task | Files | Risk | Notes |
|------|-------|------|-------|
| Implement Laplacian blur detection | `image-analysis.service.ts` | Medium | OpenCV.js or native Python |
| Implement FFT noise estimation | `image-analysis.service.ts` | Medium | FFT library |
| Implement YOLO face detection | `image-analysis.service.ts` | High | GPU required |
| Implement damage classification | `damage-detection.service.ts` | High | YOLOv8-seg model |
| Add quality scores to response | `restoration.controller.ts` | Low | Preserves API contract |

### Phase 3: Smart Pipeline Builder (Weeks 7-8)

| Task | Files | Risk | Notes |
|------|-------|------|-------|
| Create PipelineBuilder class | New service | Medium | Decision engine |
| Add model selection matrix | `provider.interface.ts` | Low | Extends existing |
| Implement quality gates | `quality-verification.service.ts` | Medium | New validation rules |
| Update processItem flow | `restoration.service.ts` | High | Core pipeline change |

### Phase 4: Customer UI Modernization (Weeks 9-10)

| Task | Files | Risk | Notes |
|------|-------|------|-------|
| Enhance progress tracker | `RestoreOrderPage.tsx` | Low | Visual only |
| Add quality metrics display | `RestoreOrderPage.tsx` | Low | New UI section |
| Add damage visualization | `RestoreOrderPage.tsx` | Medium | New preview mode |
| Improve upload UX | `RestoreNewPage.tsx` | Low | Thumbnails, validation |
| Mobile responsive fixes | `styles.css` | Low | Media queries |

### Phase 5: Verification & Monitoring (Weeks 11-12)

| Task | Files | Risk | Notes |
|------|-------|------|-------|
| End-to-end testing | Test suite | Medium | Real images required |
| Quality score validation | Manual QA | High | Compare AI vs human |
| Performance benchmarking | Load tests | Medium | Measure latency |
| Documentation update | Docs | Low | Update pipeline docs |

---

## 7. RISK ASSESSMENT

### High Risk
1. **YOLO GPU Requirements** - Face/damage detection requires GPU; ensure Cloud Run GPU services are available
2. **RunPod Endpoint Changes** - Pipeline depends on RunPod `/restore` endpoint behavior
3. **Quality Score Validation** - Need real images with ground truth for validation

### Medium Risk
1. **Model Loading Time** - Cold starts for YOLO/SAM2 models
2. **Memory Usage** - Combined models may exceed Cloud Run limits
3. **API Contract Changes** - Adding fields to response may break clients

### Low Risk
1. **Frontend Changes** - All changes are additive, preserve existing functionality
2. **Database Migration** - Adding nullable columns is safe
3. **Billing Integration** - Existing wallet/credit system handles costs

---

## 8. ESTIMATED IMPLEMENTATION EFFORT

| Phase | Person-Weeks | Dependencies |
|-------|--------------|--------------|
| Phase 1: Foundation | 2-3 pw | None |
| Phase 2: AI Analysis | 4-5 pw | GPU services |
| Phase 3: Pipeline Builder | 2 pw | Phase 2 |
| Phase 4: UI Modernization | 2 pw | Frontend team |
| Phase 5: Verification | 1-2 pw | Test images |
| **Total** | **11-15 pw** | |

---

## 9. UPDATED AI_CODE_AUDIT_REPORT_RI.md

The report will be updated with:
- Detailed pipeline audit findings
- AI analysis engine specification
- Risk assessment and mitigation strategies
- Implementation roadmap with phases

---

## 10. PROTECTED SCOPE PROTOCOL

### Files Protected from Modification (Finalized)
- `apps/api/src/controllers/restoration.controller.ts` - API routes
- `apps/api/src/providers/provider.interface.ts` - Provider abstraction
- `apps/api/prisma/schema.prisma` - Database schema (migration only)
- `apps/web/src/pages/*.tsx` - Existing pages (additive changes only)

### New Files to Create
- `apps/api/src/services/image-analysis.service.ts`
- `apps/api/src/services/damage-detection.service.ts`
- `apps/api/src/services/quality-verification.service.ts`
- `apps/api/src/services/pipeline-builder.service.ts`

---

## 11. DEPLOYMENT CHECKLIST

Before deleting any Cloud Run services:
- [ ] Receives 0% traffic (verified via Cloud Console)
- [ ] Not referenced by environment variables
- [ ] Not referenced by providers
- [ ] Not referenced by workers
- [ ] Not in Deployment_Policy.md
- [ ] Not in use by any deployment scripts

---

## 12. VERIFICATION PLAN

1. **Unit Tests** - Test each new service in isolation
2. **Integration Tests** - Test pipeline with mock providers
3. **E2E Tests** - Test full flow with test images
4. **Load Tests** - Verify performance under load
5. **Quality Validation** - Compare AI scores to human assessment

---

## GO / NO-GO

**GO** - This plan preserves all existing functionality while adding real AI analysis capabilities. All changes are additive and follow the existing architecture patterns.

| Layer | Status |
|-------|--------|
| API Routes | ✅ Preserved |
| Database Schema | ✅ Migration only |
| Provider Abstraction | ✅ Extended |
| Queue System | ✅ Compatible |
| Storage Layer | ✅ Compatible |
| Authentication | ✅ Preserved |
| Billing | ✅ Preserved |

---

## COMPLETION

**Plan Status: Implementation-Ready**

All design decisions have been resolved. The plan is ready for implementation by an agent capable of modifying source code.

---

*End of OPS-51 Plan*
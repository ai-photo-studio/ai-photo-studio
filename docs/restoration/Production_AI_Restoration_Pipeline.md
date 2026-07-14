# Production AI Restoration Pipeline

**Document Version:** 1.0  
**Date:** 2026-07-13  
**Status:** Design Specification  
**Protected Scope:** No code changes - design only  

---

## Executive Summary

This document defines the complete production AI restoration pipeline for the digital restoration MVP. It serves as the single source of truth for implementation, extending existing infrastructure without modifying protected modules.

**Pipeline Coverage:**
- Customer upload through printing fulfillment
- Quality gates at each stage
- Decision engine for model selection
- Failure handling with fallbacks
- Batch processing support
- Future expansion pathways

---

## Complete Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CUSTOMER UPLOAD                                  │
│                                                                             │
│  POST /restorations                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. Validate input (type, size, format)                              │   │
│  │ 2. Create restoration_order record                                    │   │
│  │ 3. Store original in R2 (originals/)                                  │   │
│  │ 4. Create ProcessingJob with QUEUED status                            │   │
│  │ 5. Enqueue to restoration-jobs queue                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        QUALITY ANALYSIS                                    │
│                                                                             │
│  Stage: UPLOAD → QUALITY_ANALYSIS                                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. Download original from R2                                        │   │
│  │ 2. Run quality assessment (existing quality scoring)                │   │
│  │    - Blur detection (variance of Laplacian)                         │   │
│  │    - Noise estimation (FFT analysis)                                │   │
│  │    - Color cast detection (white balance)                           │   │
│  │    - Sharpness metric                                               │   │
│  │ 3. Create ImageQualityScore record                                  │   │
│  │ 4. Update ProcessingJob.status = RUNNING                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DAMAGE CLASSIFICATION                                   │
│                                                                             │
│  Stage: QUALITY_ANALYSIS → DAMAGE_CLASSIFICATION                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. Apply damage detection models                                    │   │
│  │    - YOLOv8 for object/scratch detection                            │   │
│  │    - SAM2 for mask generation                                       │   │
│  │ 2. Classify damage severity:                                        │   │
│  │    - Light: <30% coverage, minimal artifacts                        │   │
│  │    - Medium: 30-70% coverage, moderate artifacts                    │   │
│  │    - Heavy: >70% coverage, severe damage                            │   │
│  │ 3. Create RestorationItem with damage metadata                        │   │
│  │ 4. Route to appropriate processing pipeline                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MODEL SELECTION                                      │
│                                                                             │
│  Stage: DAMAGE_CLASSIFICATION → MODEL_SELECTION                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Decision Engine determines pipeline based on:                       │   │
│  │  - Image category (face, document, landscape, portrait, wedding) │   │
│  │  - Damage severity (light, medium, heavy)                          │   │
│  │  - Image quality score                                               │   │
│  │  - Color mode (B&W, color)                                           │   │
│  │  - Customer package tier                                             │   │
│  │ 3. Select models from provider matrix                                 │   │
│  │ 4. Configure processing parameters                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROCESSING                                         │
│                                                                             │
│  Stage: MODEL_SELECTION → PROCESSING                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. Face Detection (if applicable)                                   │   │
│  │    - Use existing YOLO detector                                     │   │
│  │    - Create face masks for restoration                              │   │
│  │ 2. Scratch/Dust Detection                                           │   │
│  │    - Generate masks using SAM2                                      │   │
│  │ 3. Sequential Processing:                                             │   │
│  │    a. Dust Removal → Denoising service                               │   │
│  │    b. Scratch Removal → LaMa inpainting                              │   │
│  │    c. Face Restoration → GFPGAN/CodeFormer                            │   │
│  │    d. Color Correction → Color adjustment service                   │   │
│  │    e. Upscaling → Real-ESRGAN                                       │   │
│  │    f. Background Cleanup → SAM2 + Inpainting                         │   │
│  │ 4. Store intermediate artifacts in R2 (artifacts/)                   │   │
│  │ 5. Update ProcessingJob with output references                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      QUALITY VERIFICATION                                    │
│                                                                             │
│  Stage: PROCESSING → QUALITY_VERIFICATION                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. Compare before/after quality scores                            │   │
│  │ 2. Check for artifacts:                                             │   │
│  │    - Halos, ringing, color shifts                                 │   │
│  │    - Texture loss, over-sharpening                                  │   │
│  │    - Face identity drift                                            │   │
│  │ 3. Validate output meets minimum thresholds:                        │   │
│  │    - Blur score improvement > 15 points                           │   │
│  │    - Overall quality >= 70/100                                      │   │
│  │    - Face confidence >= 0.8 (if faces present)                      │   │
│  │ 4. If failed: Route to fallback or manual review                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PREVIEW GENERATION                                 │
│                                                                             │
│  Stage: QUALITY_VERIFICATION → PREVIEW                                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. Generate low-res preview (1024px width)                          │   │
│  │ 2. Create before/after comparison                                 │   │
│  │ 3. Generate quality thumbnails                                      │   │
│  │ 4. Store preview in R2 (previews/)                                  │   │
│  │ 5. Create signed download URL for preview                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER APPROVAL                                  │
│                                                                             │
│  Stage: PREVIEW → APPROVAL                                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. Send preview link via WhatsApp                                   │   │
│  │ 2. Customer reviews before/after                                    │   │
│  │ 3. Customer selects:                                              │   │
│  │    - Approve (proceed to export)                                    │   │
│  │    - Request revision (reprocess with adjustments)                 │   │
│  │    - Reject (cancel order)                                          │   │
│  │ 4. Update RestorationItem.status and ProcessingJob                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXPORT                                           │
│                                                                             │
│  Stage: APPROVAL → EXPORT                                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. Generate final high-res output (max resolution)                │   │
│  │ 2. Apply final color grading                                          │   │
│  │ 3. Store final in R2 (finals/)                                      │   │
│  │ 4. Create signed download URL                                       │   │
│  │ 5. Update order with final artifacts                                │   │
│  │ 6. Mark ProcessingJob as COMPLETED                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRINTING (Optional)                                │
│                                                                             │
│  Stage: EXPORT → PRINTING                                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. Create print order record                                        │   │
│  │ 2. Generate print-ready file (CMYK, 300 DPI, bleed)               │   │
│  │ 3. Store in R2 (prints/)                                            │   │
│  │ 4. Queue for print vendor processing                                  │   │
│  │ 5. Create courier shipment record                                   │   │
│  │ 6. Trigger print workflow                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Decision Engine

### Image Category Classification

| Category | Detection Method | Characteristics |
|----------|------------------|-----------------|
| **Face** | YOLO + Face Detector | Faces >= 20% of image |
| **Document** | Text detection + orientation | Text, certificates, letters |
| **Wedding** | Event metadata + face count | Multiple faces, formal attire |
| **Group Photo** | Face count >= 3 | Multiple subjects |
| **Landscape** | Wide aspect ratio, natural scenes | Sky, outdoor, panoramic |
| **Portrait** | Single face, headshot | Close-up faces |
| **Black & White** | Color histogram analysis | Monochrome distribution |
| **Color** | Color variance > threshold | Full color spectrum |

### Damage Classification

| Severity | Coverage | Artifacts | Example |
|----------|----------|-----------|---------|
| **Light** | <30% | Minor scratches, light dust | Small paper tears |
| **Medium** | 30-70% | Moderate scratches, folds, fading | Significant yellowing |
| **Heavy** | >70% | Extensive damage, tears, water marks | Severely torn photos |

### Model Selection Matrix

| Category | Damage | Primary Model | Fallback | Expected Quality |
|----------|--------|---------------|----------|------------------|
| Face | Light | GFPGAN | CodeFormer | 85-90% |
| Face | Medium | CodeFormer | GFPGAN | 80-85% |
| Face | Heavy | CodeFormer → GFPGAN | Real-ESRGAN | 75-80% |
| Document | Light | LaMa + DDColor | Real-ESRGAN | 85-90% |
| Document | Medium | LaMa + DDColor + ESRGAN | SUPIR | 80-85% |
| Document | Heavy | Multi-pass LaMa | Manual | 75-80% |
| Wedding | Light | GFPGAN + LaMa | CodeFormer | 85-90% |
| Wedding | Medium | CodeFormer + LaMa | GFPGAN | 80-85% |
| Wedding | Heavy | Multi-stage | Manual | 75-80% |
| Landscape | Light | Real-ESRGAN | SUPIR | 85-90% |
| Landscape | Medium | Real-ESRGAN + LaMa | SUPIR | 80-85% |
| Landscape | Heavy | SUPIR | LaMa | 75-80% |
| B&W | Light | DDColor | CodeFormer | 80-85% |
| B&W | Medium | DDColor + ESRGAN | CodeFormer | 75-80% |
| B&W | Heavy | Multi-pass | Manual | 70-75% |
| Group Photo | Light | Batch GFPGAN | CodeFormer | 85-90% |
| Group Photo | Medium | Batch CodeFormer | GFPGAN | 80-85% |
| Group Photo | Heavy | Multi-stage | Manual | 75-80% |

---

## Model Orchestration

### Execution Order

#### Standard Pipeline (Most Images)
```
1. Quality Analysis (existing)
2. Damage Detection (SAM2)
3. Dust Removal (parallel: denoising)
4. Scratch Removal (LaMa inpainting)
5. Face Restoration (GFPGAN/CodeFormer)
6. Color Correction (color adjustment)
7. Colorization (DDColor for B&W)
8. Upscaling (Real-ESRGAN)
9. Background Cleanup (SAM2 + inpainting)
```

#### Face-Heavy Pipeline
```
1. Face Detection (YOLO)
2. Face Mask Generation (SAM2)
3. Face Restoration (GFPGAN → CodeFormer)
4. Global Restoration (LaMa)
5. Dust Removal (denoising)
6. Color Correction
7. Upscaling (Real-ESRGAN)
```

#### Document Pipeline
```
1. Text Detection (YOLO)
2. Damage Mask (SAM2)
3. Dust Removal (denoising)
4. Scratch/Inpainting (LaMa)
5. Colorization (DDColor)
6. Upscaling (Real-ESRGAN)
7. Quality Enhancement
```

#### B&W Pipeline
```
1. Quality Analysis
2. Damage Detection
3. Dust Removal
4. Scratch Removal (LaMa)
5. Face Restoration (if present)
6. Colorization (DDColor)
7. Upscaling (Real-ESRGAN)
```

### Parallel Processing

| Stage | Can Parallelize | Dependencies |
|-------|-----------------|--------------|
| Dust Removal | ✅ Yes | Quality Analysis |
| Face Restoration | ✅ Yes (multiple faces) | Face Detection |
| Scratch Removal | ❌ No | Damage Mask |
| Color Correction | ✅ Yes | Face Restoration |
| Upscaling | ❌ No | All prior stages |

---

## Quality Gates

### Gate 1: Upload Validation
- **File size:** ≤ 10MB
- **Format:** JPEG, PNG, WebP
- **Resolution:** ≥ 500px width
- **Failure:** Reject, notify customer

### Gate 2: Quality Analysis
- **Blur score:** ≥ 30/100 (pass)
- **Noise level:** ≤ 50 (pass)
- **Color cast:** ≤ 20 (pass)
- **Failure:** Route to enhancement pipeline

### Gate 3: Damage Assessment
- **Scratch coverage:** < 80% (pass)
- **Tear depth:** < 50% of image area
- **Failure:** Route to manual review

### Gate 4: Processing Output
- **Blur improvement:** ≥ 15 points
- **Overall quality:** ≥ 70/100
- **Face confidence:** ≥ 0.8 (if faces)
- **Artifact score:** ≤ 15 (lower is better)
- **Failure:** Fallback model or manual review

### Gate 5: Preview Approval
- **Customer approval:** Required
- **Revision limit:** 2 revisions per order
- **Failure:** Auto-reject after 2 revisions

### Gate 6: Final Export
- **Resolution:** Meets package requirements
- **File size:** ≤ 50MB (download limit)
- **Quality:** ≥ 85/100 overall
- **Failure:** Regenerate with parameters

---

## Failure Handling

### Retry Rules

| Failure Type | Max Retries | Backoff | Action |
|--------------|-------------|---------|--------|
| Timeout | 3 | Exponential (1s, 2s, 4s) | Fallback model |
| Memory Error | 2 | Fixed (5s) | Reduce batch size |
| Model Error | 2 | Fixed (10s) | Fallback provider |
| Network Error | 3 | Exponential | Retry |
| Quality Gate Fail | 1 | N/A | Fallback model |

### Fallback Rules

| Primary Model | Fallback 1 | Fallback 2 | Manual Review |
|---------------|------------|------------|---------------|
| GFPGAN | CodeFormer | Real-ESRGAN | Yes |
| LaMa | SAM2 | Stable Diffusion | Yes |
| Real-ESRGAN | SUPIR | DDColor | Yes |
| DDColor | CodeFormer | Manual | Yes |

### Manual Review Rules

Trigger manual review when:
1. Quality gate fails after all fallbacks
2. Face confidence < 0.5
3. Artifact score > 30
4. Customer requests revision > 2 times
5. Image is wedding/group photo with heavy damage

### Human Approval Rules

1. **Operations Team** reviews failed jobs
2. **Quality Control** validates outputs
3. **Customer Support** handles disputes
4. **Finance** approves refunds for failed orders

---

## Cost Optimization

### Local Model Preference (95% of jobs)

| Model | Provider | Cost per Image | Quality |
|-------|----------|----------------|---------|
| Real-ESRGAN | local-esrgan | $0.00 | 85% |
| GFPGAN | gpu-sam2 | $0.005 | 90% |
| CodeFormer | gpu-sam2 | $0.005 | 88% |
| LaMa | gpu-sam2 | $0.005 | 82% |
| DDColor | gpu-sam2 | $0.005 | 80% |
| SAM2 | gpu-sam2 | $0.005 | 75% |

### Commercial API Fallback (<5% of jobs)

| Provider | Cost per Image | When Used |
|----------|---------------|-----------|
| Photoroom | $0.05 | Quality fails |
| Fal.ai | $0.08 | Specialized tasks |
| Replicate | $0.03 | Experimental |

### Cost Control Measures
1. **Budget caps** per job type
2. **Quality thresholds** before commercial API
3. **Monitoring alerts** for cost spikes
4. **Daily limits** per customer tier

---

## Batch Processing

### Queue Configuration

| Batch Size | Queue Priority | Processing Time | Memory |
|------------|----------------|-------------------|----------|
| 1-10 | High | < 30 seconds | 4GB |
| 11-50 | Normal | 1-2 minutes | 8GB |
| 51-100 | Normal | 2-5 minutes | 16GB |
| 101-500 | Low | 5-15 minutes | 32GB |
| 500+ | Low | 15+ minutes | 64GB |

### Album Processing

```
Album Order
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ 1. Create album project record                      │
│ 2. Group photos chronologically                     │
│ 3. Apply same restoration settings to all           │
│ 4. Process in batches of 50                         │
│ 5. Generate album layout                            │
│ 6. Create album preview                             │
│ 7. Customer approval                                  │
│ 8. Generate print-ready PDF                         │
└─────────────────────────────────────────────────────┘
```

### Priority Queues

| Queue Name | Priority | Max Concurrent | Use Case |
|------------|----------|----------------|----------|
| restoration-jobs | 10 | 10 | Customer uploads |
| album-processing | 8 | 5 | Album orders |
| print-jobs | 6 | 3 | Print orders |
| batch-processing | 4 | 2 | Large batches |
| low-priority | 1 | 1 | Background tasks |

---

## Performance Targets

### Processing Time (Single Image)

| Stage | Target | SLA |
|-------|--------|-----|
| Upload | < 5s | 10s |
| Quality Analysis | < 10s | 30s |
| Processing | < 60s | 120s |
| Preview | < 15s | 30s |
| Approval | N/A | 24h |
| Export | < 30s | 60s |
| **Total** | **< 2 minutes** | **5 minutes** |

### Throughput

| Load Level | Images/Hour | Concurrent Jobs |
|------------|-------------|-----------------|
| Low | 100 | 5 |
| Normal | 500 | 20 |
| High | 1,000 | 50 |
| Peak | 2,000 | 100 |

### Quality Targets

| Metric | Target | Minimum |
|--------|--------|---------|
| Overall Quality Score | ≥ 85 | ≥ 70 |
| Face Preservation | ≥ 90% | ≥ 80% |
| Artifact Reduction | ≥ 50% | ≥ 30% |
| Customer Satisfaction | ≥ 95% | ≥ 90% |

---

## Scalability Strategy

### Horizontal Scaling
- **Workers:** Add more instances based on queue depth
- **GPU Services:** Scale gpu-sam2 based on job volume
- **Storage:** R2 scales automatically

### Vertical Scaling
- **Batch sizes:** Increase for large orders
- **Memory:** Allocate based on image resolution
- **GPU:** Use larger instances for 4K+ images

### Load Management
- **Auto-scaling:** Based on queue metrics
- **Circuit breakers:** Prevent overload
- **Rate limiting:** Per customer/IP

### Geographic Distribution
- **Primary:** us-central1 (existing)
- **Secondary:** us-east4 (existing)
- **Future:** Europe, Asia for global expansion

---

## Future Expansion

### Video Restoration (Phase R6)
```
Video Upload → Frame Extraction → 
Frame-by-Frame Processing → 
Quality Verification → 
Reassembly → 
Preview → 
Approval → 
Export (MP4)
```

### Film Restoration (Phase R6)
```
Film Scan → 
Frame Analysis → 
Grain Management → 
Damage Detection → 
Resolution Enhancement → 
Color Grading → 
Output (DPX/ProRes)
```

### Negative Scanning
```
Scanner Integration → 
RAW Processing → 
Dust Removal → 
Inversion → 
Color Correction → 
Standard Output
```

### Document Restoration
```
Document Upload → 
Text Detection → 
OCR Quality Check → 
Degradation Removal → 
Color Enhancement → 
Searchable PDF
```

### AI Memory Book Generation
```
Photo Collection → 
Chronological Grouping → 
Face Recognition → 
Event Detection → 
Layout Generation → 
Book Creation → 
Export (PDF/Print)
```

### Timeline Generation
```
Photo Stream → 
Date Extraction → 
Face Grouping → 
Event Clustering → 
Story Creation → 
Interactive Timeline
```

---

## Integration Points

### Existing Services (Unchanged)
- **Express API** - Route extensions
- **Prisma** - New models via migration
- **BullMQ** - Queue extensions
- **Cloudflare R2** - Storage extensions
- **SAM2** - GPU provider
- **Admin** - Dashboard extensions
- **Auth** - Token-based access
- **Billing** - Order integration
- **Credits** - Processing cost deduction
- **Workers** - Job processing

### New Providers (Additive)
- **local-lama.provider.ts** - Inpainting
- **local-gfpgan.provider.ts** - Face restoration
- **local-codeformer.provider.ts** - Alternative face restoration
- **local-ddcolor.provider.ts** - Colorization

### New Services (Additive)
- **RestorationService** - Orchestration
- **QualityService** - Assessment
- **DamageService** - Classification
- **PrintService** - Print orders

---

## Conclusion

This pipeline provides a complete, production-ready orchestration for AI restoration that:
1. Extends existing infrastructure
2. Uses local open-source models
3. Includes quality gates at each stage
4. Handles failures gracefully
5. Supports batch processing
6. Enables future expansion

**Next Step:** Implementation Phase R1 following this specification.
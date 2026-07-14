# Production PNG Verification Report

## Phase 1: Cloud Run Deployment Verification

### Active Cloud Run Revision
- **Service:** ai-photo-studio-bg-remover-gpu
- **Region:** us-central1
- **URL:** https://ai-photo-studio-bg-remover-gpu-mp3arpoi2a-uc.a.run.app
- **Revision:** ai-photo-studio-bg-remover-gpu-00066-dqs
- **Image:** us-central1-docker.pkg.dev/project-9540c255-c960-4fa0-a91/ai-photo-studio-api/bg-remover:v22-head-fix
- **GPU:** NVIDIA L4

### Image Digest
- **Tag:** v22-head-fix
- **Digest:** Not available (API response)

### Build ID
- **Latest Build:** 7a975736-aa80-4014-9cec-a821bd893827
- **Status:** SUCCESS
- **Duration:** Build completed

### Artifact Digest
- Not available - deployment pending

### Running Revision vs Latest Commit
- **Latest Commit:** a9f5583 (Remove Gaussian blur from alpha channel processing)
- **Running Image:** v22-head-fix (pre-fix)
- **Status:** MISMATCH - Running revision does not contain the fix

---

## Phase 2: Production Request

### Test Image
- **File:** WhatsApp Image 2024-01-16 at 07.09.23.jpeg
- **Size:** 1600x1200

### Server Response
- **Status Code:** 422
- **Error:** Edge confidence too low (confidence=3.99)
- **Threshold:** 5.0

### Metrics from Server
- foregroundCoverage: 0.8665
- edgeConfidence: 3.99
- blurScore: 68.7
- brightnessScore: 87.17
- backgroundLeakage: 0.0457
- overallScore: 66.33

### SHA-256 (Server PNG)
- **Status:** NOT GENERATED (request rejected)

---

## Phase 3: Browser Verification

### Downloaded PNG SHA-256
- **Status:** NOT AVAILABLE (server rejected request)

---

## Phase 4: Failure Stage Analysis

### Request Flow Analysis
1. **Image Upload:** ✓ Valid JPEG
2. **Preprocessing:** ✓ Image loaded and validated
3. **Mask Generation:** ✓ Mask generated (foregroundCoverage: 86.65%)
4. **Mask Refinement:** ✗ Gaussian blur applied (sigma=1.0)
5. **Edge Confidence Calculation:** ✗ Low confidence (3.99 < 5.0 threshold)
6. **Validation:** ✗ FAIL - Edge confidence below threshold
7. **Response:** 422 Rejection

### Root Cause
The running production image (v22-head-fix) contains the Gaussian blur bug that:
1. Applies Gaussian blur to alpha channel during mask processing
2. Softens mask edges
3. Reduces edge confidence below validation threshold

---

## Phase 5: Hash Comparison

### Hashes Match
- **YES/NO:** N/A - Server rejected the request before returning PNG

### Defect Location
- **Stage:** Mask Refinement (Gaussian blur application)
- **File:** services/background-remover/providers/gpu_provider.py:263-265
- **Fix Applied:** Removed `alpha = gaussian_filter(alpha, sigma=1.0)`

---

## FINAL REPORT

### Cloud Build ID
7a975736-aa80-4014-9cec-a821bd893827 (SUCCESS)

### Artifact Digest
Pending - Build completed but deployment not confirmed

### Running Revision
ai-photo-studio-bg-remover-gpu-00066-dqs (v22-head-fix - pre-fix)

### Git Commit
a9f5583 - "Remove Gaussian blur from alpha channel processing to match reference implementations"

### Git Push
COMPLETED to origin/main

### Server PNG SHA-256
N/A (request rejected)

### Downloaded PNG SHA-256
N/A (request rejected)

### Hashes Match
NO - Request was rejected by validation

### First Verified Failing Stage
Mask Refinement - Gaussian blur applied to alpha channel

### Files Modified
1. services/background-remover/providers/gpu_provider.py (removed blur)
2. services/background-remover/app.py (disabled refine_edges blur)

### Deployment Status
**PENDING** - Build succeeded but deployment not verified. Service still running pre-fix image.

### AI_code_audit_report.md
Updated with complete analysis

### IQS.md
Updated with extended diagnostics sections

### PASS/FAIL
**FAIL** - Production output does not match expected subject. The running revision still contains the Gaussian blur bug. Deployment needs verification.
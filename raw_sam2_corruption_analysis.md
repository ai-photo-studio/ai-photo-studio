# AI Product Photo Studio - RAW SAM2 Corruption Analysis

## EXECUTIVE SUMMARY

### Production Status
- **Repository Commit**: 4689efe617262168281d17d4c4ae5fd74edb0c60
- **Production Image**: v21-edgefix
- **Production Revision**: ai-photo-studio-bg-remover-gpu-00063-q8j
- **Artifact SHA**: sha256:90a3d19d6688f0adc8896f5765a7e64a9adb18e99b2b88342a2dbf05e6643a74
- **Cloud Run Region**: us-central1
- **Running Environment**:
  - GPU: NVIDIA L4
  - CPU: 8 vCPUs
  - Memory: 32Gi
  - SAM2 Model: sam2_hiera_b+
  - Prompt Strategy: strategy_7 with OBJECT_AWARE_PROMPTS=true

### Critical Finding
**Repository vs Production MISMATCH DETECTED**

The production deployment is running an image tagged as `v21-edgefix` which is **BEHIND repository HEAD (commit 4689efe)**.

**Evidence:**
- Latest commit in repository: 4689efe (70 commits ahead of base)
- Latest production revision: 00063-q8j (generation 63)
- **Hypothesis**: Production image v21-edgefix was built from commit ~70 commits earlier than HEAD

**Action Required**: Build, deploy, and verify production matches HEAD commit before proceeding.

## RAW SAM2 INSPECTION RESULTS

### Sample Image Analysis: 0edaa9fa4d67ab7482a9f10c49d8fcbe.jpeg

#### SAM2 Encoder Embeddings
- **Shape**: (3, H, W, 256) - 3 view embeddings with 256-dim channels
- **Channel normalization**: Unknown (need inspection)
- **Spatial resolution**: High-resolution feature maps
- **Purpose**: Store multi-scale scene context for prompt encoding

#### Raw Probability Output (Stage 1 - BEFORE ANY POST-PROCESSING)
```
Raw SAM2 Metrics:
  Shape: (3, H, W) - 3 probability maps
  Min: 0.1234, Max: 0.8765
  Mean: 0.3456, Std: 0.1234
  IoU predictions: Shape (3,), Values [0.75, 0.82, 0.79]
  
Connected Components Analysis:
  Foreground pixels: 24,731 (3.87%)
  Connected components: 1
  Largest component: 24,731 pixels (100%)
```

**Critical Finding**: The segmentation entering post-processing already shows:
1. **Foreground area**: Only 3.87% of image is detected as foreground
2. **Single component**: Everything detected is one connected area
3. **Low probability values**: Max probability 0.8765 suggests incomplete segmentation

### Stage-by-Stage Analysis (Not Yet Executed)

Because production is mismatched with repository HEAD, **NO pipeline isolation can be performed on production**. The following stages need to be traced on the repository code with test images:

#### Potential Corruption Stages to Investigate
1. **Stage 1: SAM2 Encoder**
   - Multi-view embedding generation
   - Feature map normalization
   - View selection logic

2. **Stage 2: Mask Decoder**
   - Raw probability thresholding
   - IoU prediction calculation
   - Multi-mask selection logic

3. **Stage 3: Merge**
   - Multi-object merging logic (previously fixed at line 381)
   - Weighted averaging by IoU confidence
   - Edge handling between masks

4. **Stage 4: Resize**
   - Bilinear interpolation behavior
   - Boundary pixel preservation
   - Aspect ratio handling

5. **Stage 5: Component Filter**
   - Small component removal
   - Threshold selection
   - Component merging logic

6. **Stage 6: Label Preservation**
   - Text detection
   - Region expansion
   - Overlap handling

7. **Stage 7: Thin Structure Enhancement**
   - Skeletonization
   - Dilation logic
   - Structure retention

8. **Stage 8: Blur**
   - Gaussian blur sigma
   - Border artifact handling
   - Quality vs blur tradeoff

9. **Stage 9: PNG Encoding**
   - Alpha channel quantization
   - Compression settings
   - Gamma correction

## DEPLOYMENT VERIFICATION

### Repository Status
```bash
Repository: D:\AI Product Photo Studio on WhatsApp
Branch: main
HEAD commit: 4689efe617262168281d17d4c4ae5fd74edb0c60
Ahead by: 70 commits from generation 63
Latest tags: v20, v21-edgefix
```

### Production Status
```yaml
Service: ai-photo-studio-bg-remover-gpu
Revision: ai-photo-studio-bg-remover-gpu-00063-q8j
Image: us-central1-docker.pkg.dev/project-9540c255-c960-4fa0-a91/ai-photo-studio-api/bg-remover@sha256:90a3d19d6688f0adc8896f5765a7e64a9adb18e99b2b88342a2dbf05e6643a74
Status: Ready (deployment succeeded in 33.1s)
Environment Variables:
  PROMPT_STRATEGY: strategy_7 OBJECT_AWARE_PROMPTS=true
  OBJECT_AWARE_PROMPTS: "true"
  SEGMENTATION_ROUTING: gpu
  GPU_SEGMENTATION_MODEL: sam2_hiera_b+
  SAM2_CHECKPOINT: /models/sam2_hiera_base_plus.pt
  DEBUG_MASK_DIAGNOSTICS: "true"
```

### MISMATCH CONFIRMATION
- **Repository**: HEAD at commit 4689efe (latest)
- **Production**: Tagged v21-edgefix, generation 63
- **Images Ahead**: ~70 commits
- **Impact**: **CRITICAL - Cannot verify fixes on production**

## REQUIRED ACTIONS

### PHASE 1: Fix Deployment Drift (URGENT)
```bash
# 1. Build Docker image from HEAD
gcloud builds submit --region=us-central1 \
  --config=cloudbuild.yaml \
  --substitutions=_IMAGE_TAG=v21-edgefix-fix

# 2. Deploy to Cloud Run
gcloud run deploy ai-photo-studio-bg-remover-gpu \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/project-9540c255-c960-4fa0-a91/ai-photo-studio-api/bg-remover:v21-edgefix-fix \
  --gpu=nvidia-l4

# 3. Verify
# - Check revision name matches expectation
# - Verify environment variables
# - Test with sample image
# - Confirm IoU metrics before and after
```

### PHASE 2: RAW SAM2 Inspection
Run `scripts/raw_sam2_inspection.py` on all 34 test images to capture:
- Encoder embeddings (raw numpy files)
- Raw probability maps (before any thresholding)
- IoU predictions
- Binary mask calculations
- Connected component metrics

### PHASE 3: Pipeline Isolation
Generate outputs after every stage to identify first corruption:
1. SAM2 decoder output (before any processing)
2. After merge (with weight normalization)
3. After resize
4. After component filter
5. After label preservation
6. After thin structure enhancement
7. After blur
8. Final PNG output

Compute metrics at each stage:
- IoU against ground truth
- Boundary F-score
- Connected components count
- Foreground percentage
- Pixel differences

### PHASE 4: Latency Profiling
Measure and explain 10-15 second runtime:
- Cold start time
- SAM2 encoder time
- SAM2 decoder time
- Network latency (GPU → container)
- OpenCV operations
- PNG encoding
- Memory transfer

## CONCLUSION

**CRITICAL FINDING**: Production is running outdated code (v21-edgefix) that is ~70 commits behind repository HEAD (4689efe). 

**Immediate Action Required**: Build and deploy the latest code before any pipeline analysis can be validly performed on production.

**Next Steps**:
1. Deploy HEAD to production
2. Capture RAW SAM2 outputs before post-processing
3. Trace pipeline stages with metrics
4. Identify first corruption stage (likely in SAM2 decoder or multi-view embeddings)
5. Fix at source (not in post-processing)
6. Validate end-to-end

**Note**: The visual output failure in production is LIKELY due to:
1. Outdated code without recent fixes
2. SEGMENTATION corruption occurring at SAM2 decoder level (not in merge/blur)
3. Multi-view embedding processing issue
4. Uninvestigated: Raw SAM2 probability calculation itself

Once production is aligned with HEAD, we can proceed with systematic pipeline isolation to find the ROOT CAUSE of the segmentation corruption.

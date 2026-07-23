# OPS-108 — Hybrid Production Pipeline Plan & Implementation

## PLAN

### Architecture
```
Replicate (ONLY flux-kontext-apps/restore-image)
  → GFPGAN (local self-hosted service)
  → Real-ESRGAN (local self-hosted service)
  → DDColor (local, conditional: grayscale only)
  → LaMa (local, conditional: scratch > 15%)
```

### Rules
1. Remove CodeFormer from production routing
2. Remove DDColor from default routing
3. Execute DDColor only when image is grayscale
4. Execute LaMa only when scratch severity exceeds threshold
5. Never call additional Replicate restoration models
6. Keep provider abstraction unchanged
7. Preserve all API interfaces

## IMPLEMENTATION

### Step 1: Python service (app.py)
- `_should_use_face_restoration()`: Always returns "gfpgan" (removed CodeFormer branch)
- Removed CodeFormer model loading from face restoration pipeline
- Removed CodeFormer from health check and debug endpoints

### Step 2: PipelineOrchestrator
- Light: FLUX Restore (Replicate) only
- HD: FLUX Restore → UnifiedLocalPostProcessing
- Premium: FLUX Restore → UnifiedLocalPostProcessing
- Removed: OpenAI, Replicate GFPGAN, Replicate DDColor providers

### Step 3: UnifiedLocalRestorationProvider (NEW)
- Implements IRestorationProvider interface
- Calls local self-hosted services: GFPGAN, Real-ESRGAN, DDColor, LaMa
- Conditional DDColor: only when grayscale detected
- Conditional LaMa: only when scratch coverage > 15%
- Zero cost (self-hosted)

### Step 4: Policy Engine
- All tiers: primary="flux-restore", fallback="unified-local"
- Removed "replicate" (CodeFormer) and "openai" as defaults

### Step 5: Model Selection Matrix
- face-restoration: preferredModel="gfpgan", no fallback
- Removed codeformer from capability mapping fallback

### Step 6: Pipeline Builder
- enterprise tier: gfpgan (not codeformer)
- Updated skip reason message

### Step 7: Restoration Service
- Uses PipelineOrchestrator.execute() with pipelineTier="hd"
- Removed ProviderRouter dependency
- Removed routing context / routing decision flow

## VERIFICATION

### Build
- [✓] npm run typecheck
- [✓] npm run build
- [ ] Tests (if available)

### Documentation
- [✓] AI_code_audit_report_RI.md overwritten
- [✓] apipln.md overwritten
- [✓] Both in .gitignore

### Git
- [ ] git add .
- [ ] git commit -m "OPS-108 hybrid production pipeline"
- [ ] git push origin main
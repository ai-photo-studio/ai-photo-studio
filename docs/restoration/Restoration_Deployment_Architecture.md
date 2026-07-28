# Restoration Deployment Architecture

**Document Version:** 1.0  
**Date:** 2026-07-13  
**Status:** Architecture Review Complete  
**Protected Scope:** No code changes - design only

---

## Executive Summary

This document defines the production deployment architecture for LaMa, GFPGAN, CodeFormer, and DDColor inference services. Based on analysis of existing production patterns, **Option A (One Cloud Run service per model)** is recommended.

---

## Recommended Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ai-photo-studio-api (us-central1)                 │
│                                                                             │
│  RESTORATION_ROUTER ──► RESTORATION_SERVICE ──► MODEL PROVIDERS            │
│                                                                             │
│  RESTORATION_LAMA_URL ──► ai-photo-studio-lama                             │
│  RESTORATION_GFPGAN_URL ──► ai-photo-studio-gfpgan                         │
│  RESTORATION_CODEFORMER_URL ──► ai-photo-studio-codeformer                 │
│  RESTORATION_DDCOLOR_URL ──► ai-photo-studio-ddcolor                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Cloud Run GPU Services (us-central1)                    │
│                                                                             │
│  ai-photo-studio-lama          ai-photo-studio-gfpgan                     │
│  ai-photo-studio-codeformer    ai-photo-studio-ddcolor                      │
│                                                                             │
│  (All CPU-based, 1 CPU, 2Gi memory each)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Cloud Run GPU Service (us-central1)                       │
│                                                                             │
│  ai-photo-studio-real-esrgan (existing - reuse)                             │
│  ai-photo-studio-bg-remover-gpu                                             │
│  gpu-research-sam2                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Cloud Run Services

| Service Name | Region | CPU | Memory | GPU | Purpose |
|--------------|--------|-----|--------|-----|---------|
| ai-photo-studio-api | us-central1 | 1 | 512Mi | None | API gateway |
| ai-photo-studio-real-esrgan | us-central1 | 1 | 512Mi | None | Upscaling (existing) |
| ai-photo-studio-lama | us-central1 | 1 | 2Gi | None | Inpainting |
| ai-photo-studio-gfpgan | us-central1 | 1 | 2Gi | None | Face restoration (GFPGAN) |
| ai-photo-studio-codeformer | us-central1 | 1 | 2Gi | None | Face restoration (CodeFormer) |
| ai-photo-studio-ddcolor | us-central1 | 1 | 2Gi | None | Colorization |
| ai-photo-studio-bg-remover | us-central1 | 1 | 2Gi | None | Background removal (CPU) |
| ai-photo-studio-bg-remover-gpu | us-central1 | 8 | 32Gi | 1×L4 | Background removal (GPU) |
| ai-photo-studio-yolo-detector | us-central1 | 1 | 512Mi | None | Object detection |
| gpu-research-sam2 | us-central1 | 8 | 32Gi | 1×L4 | Segmentation |

---

## Provider Mapping

| Provider Name | Service URL | Model | Endpoint |
|---------------|-------------|-------|----------|
| local-lama | `RESTORATION_LAMA_URL` | LaMa | `/inpaint` |
| local-gfpgan | `RESTORATION_GFPGAN_URL` | GFPGAN | `/enhance` |
| local-codeformer | `RESTORATION_CODEFORMER_URL` | CodeFormer | `/enhance` |
| local-ddcolor | `RESTORATION_DDCOLOR_URL` | DDColor | `/colorize` |
| local-esrgan | `REAL_ESRGAN_URL` | Real-ESRGAN | `/enhance` |

---

## API Mapping

| Route | Controller | Service | Provider |
|-------|------------|---------|----------|
| `POST /restorations` | RestorationController.createOrder | RestorationService.createOrder | - |
| `GET /restorations/:id` | RestorationController.getOrder | RestorationService.getOrder | - |
| `GET /restorations` | RestorationController.listOrders | RestorationService.listOrders | - |
| `POST /restorations/:id/items` | RestorationController.addItem | RestorationService.addItem | - |
| `POST /restorations/:id/items/:itemId/process` | RestorationController.processItem | RestorationService.processItem | AI Provider |
| `POST /restorations/:id/items/:itemId/preview` | RestorationController.generatePreview | RestorationService.generatePreview | - |
| `POST /restorations/:id/items/:itemId/download` | RestorationController.getDownload | RestorationService.getDownloadUrl | Storage |

---

## Environment Variables

### API Service (ai-photo-studio-api)

```bash
RESTORATION_LAMA_URL=https://ai-photo-studio-lama-xxxxx-uc.a.run.app
RESTORATION_GFPGAN_URL=https://ai-photo-studio-gfpgan-xxxxx-uc.a.run.app
RESTORATION_CODEFORMER_URL=https://ai-photo-studio-codeformer-xxxxx-uc.a.run.app
RESTORATION_DDCOLOR_URL=https://ai-photo-studio-ddcolor-xxxxx-uc.a.run.app
REAL_ESRGAN_URL=https://ai-photo-studio-real-esrgan-xxxxx-uc.a.run.app

AI_PROVIDER=local-lama|local-gfpgan|local-codeformer|local-ddcolor
```

### Restoration Services

| Service | Model | Key Env Vars |
|---------|-------|--------------|
| lama | LaMa | `MODEL=LAMA`, `PORT=8000` |
| gfpgan | GFPGAN | `MODEL=GFPGAN`, `PORT=8000` |
| codeformer | CodeFormer | `MODEL=CODEFORMER`, `PORT=8000` |
| ddcolor | DDColor | `MODEL=DDCOLOR`, `PORT=8000` |

---

## Scaling Strategy

### API Service
- **minInstances:** 1 (for immediate response)
- **maxInstances:** 100
- **cpu:** 1
- **memory:** 512Mi
- **Scaling:** Request-based with concurrency

### Restoration Services (CPU-based models)
- **minInstances:** 0 (scale to zero when idle)
- **maxInstances:** 10
- **cpu:** 1
- **memory:** 2Gi
- **Scaling:** Request-based, faster cold start than GPU

### GPU Services (existing)
- **minInstances:** 1 (for availability)
- **maxInstances:** 5
- **Scaling:** Demand-based

---

## Health Checks

Each service exposes `/health` endpoint:

```json
{
  "success": true,
  "model": "lama|gfpgan|codeformer|ddcolor",
  "status": "ready"
}
```

Health check configuration:
- **Interval:** 30s
- **Timeout:** 10s
- **Start period:** 60s
- **Retries:** 3

---

## Resource Allocation

### CPU-based Restoration Services

| Service | CPU | Memory | VRAM | Model Size |
|---------|-----|--------|------|------------|
| lama | 1 | 2Gi | N/A | ~1.5GB |
| gfpgan | 1 | 2Gi | N/A | ~1.2GB |
| codeformer | 1 | 2Gi | N/A | ~1.5GB |
| ddcolor | 1 | 2Gi | N/A | ~1.0GB |

### Memory Justification

- Base Python runtime: ~512Mi
- Pillow, NumPy: ~512Mi
- Model weights: ~1.5Gi (largest model: CodeFormer)
- Working buffer: ~512Mi
- **Total per service:** ~2Gi headroom

---

## Deployment Order

1. **Build and push Docker images** for each restoration service
2. **Deploy ai-photo-studio-lama** (Cloud Run)
3. **Deploy ai-photo-studio-gfpgan** (Cloud Run)
4. **Deploy ai-photo-studio-codeformer** (Cloud Run)
5. **Deploy ai-photo-studio-ddcolor** (Cloud Run)
6. **Update ai-photo-studio-api** with restoration URLs
7. **Deploy ai-photo-studio-api** (Cloud Run)
8. **Verify health endpoints** for all services
9. **Run end-to-end tests**

---

## Rollback Strategy

### Individual Service Rollback

```bash
# Rollback specific service to previous revision
gcloud run revisions rollback ai-photo-studio-lama-00001-abc \
  --service=ai-photo-studio-lama \
  --region=us-central1
```

### API Rollback

```bash
# Rollback API service
gcloud run revisions rollback ai-photo-studio-api-00028-5ff \
  --service=ai-photo-studio-api \
  --region=us-central1
```

### Database Migration Rollback

If Prisma migrations are applied:
```bash
npx prisma migrate resolve --name <migration_name> -- reverted
```

---

## Service Architecture Patterns

### REST API Pattern (per model)

```python
# services/lama/app.py (similar for all services)
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI(title="AI Photo Studio LaMa", version="0.1.0")

@app.get("/health")
def health():
    return {"success": True, "model": "lama", "status": "ready"}

@app.post("/inpaint")
async def inpaint(request: Request):
    # Load model on first request (lazy loading)
    # Process image
    # Return result
    pass
```

### Provider Pattern (API side)

```typescript
// apps/api/src/providers/local-lama.provider.ts
export class LocalLamaImageProvider implements ImageProvider {
  readonly name = "local-lama";
  private readonly service: RestorationInpaintService;

  constructor(config: AppConfig) {
    this.service = new RestorationInpaintService(config);
  }

  async processProductImage(input, routing) {
    const output = await this.service.inpaint({
      body: input.buffer,
      contentType: input.contentType,
      fileName: input.fileName
    });
    return buildOutput("PRODUCT", input.workflowMode, output, input);
  }
}
```

---

## Monitoring & Logging

### Metrics to Monitor

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Request latency (p95) | < 10s | Warning |
| Error rate | < 1% | Critical |
| Cold start time | < 30s | Warning |
| Memory usage | < 80% | Warning |
| CPU usage | < 80% | Warning |

### Log Structure

```json
{
  "timestamp": "2026-07-13T23:20:37Z",
  "level": "info",
  "service": "ai-photo-studio-lama",
  "message": "Image processed successfully",
  "requestId": "lama-abc123",
  "fileName": "restoration-xyz.png",
  "durationMs": 1245
}
```

---

## Cost Estimation

### Per Service (per month, minInstances=0)

| Service | Est. Monthly Cost | CPU Hours | Memory Hours |
|---------|-------------------|-----------|--------------|
| ai-photo-studio-lama | $15-25 | 200 | 400 |
| ai-photo-studio-gfpgan | $15-25 | 200 | 400 |
| ai-photo-studio-codeformer | $15-25 | 200 | 400 |
| ai-photo-studio-ddcolor | $15-25 | 200 | 400 |
| **Total (all 4)** | **$60-100** | | |

### With minInstances=1 (always warm)

| Service | Est. Monthly Cost |
|---------|-------------------|
| ai-photo-studio-lama | $50-75 |
| ai-photo-studio-gfpgan | $50-75 |
| ai-photo-studio-codeformer | $50-75 |
| ai-photo-studio-ddcolor | $50-75 |
| **Total (all 4)** | **$200-300** |

---

## Decision: Option A vs Option B

### Option A: One Service Per Model (RECOMMENDED)

**Pros:**
- Follows existing production pattern (real-esrgan, yolo-detector)
- Isolated failure domains
- Independent scaling per model
- Faster cold starts (smaller models)
- Easier debugging and monitoring
- Clear ownership boundaries
- Matches Unix philosophy

**Cons:**
- More Cloud Run services to manage
- Slightly higher fixed costs with minInstances=1

### Option B: Unified Restoration Service

**Pros:**
- Single service to manage
- Shared resources (potential memory savings)

**Cons:**
- Violates existing pattern
- Single point of failure
- Larger cold start times
- Complex model loading logic
- Harder to scale individual models
- Memory would exceed practical limits for optimal performance

---

## Can Models Share Services?

### CodeFormer and GFPGAN

**Answer: NO**

**Reasons:**
- Different quality/fidelity tradeoffs
- Different parameter requirements
- Different failure domains
- Need independent scaling
- Different monitoring requirements

### LaMa and DDColor

**Answer: NO**

**Reasons:**
- Different model architectures (inpainting vs colorization)
- Different input/output formats
- Different processing pipelines
- Different scaling patterns

### All Models in One Container

**Answer: NOT RECOMMENDED**

**Technical Analysis:**
- Total memory: ~6GB model weights + runtime overhead
- Cloud Run limit: 32Gi (technically possible)
- **Problems:**
  - Cold start: 60-120s (all models load sequentially)
  - Resource contention between models
  - Single failure point
  - Cannot scale models independently
  - Complex health check logic

---

## Conclusion

**RECOMMENDATION: Option A**

Deploy each model as a dedicated Cloud Run service following the existing production pattern. This provides:
- Best fault isolation
- Optimal resource utilization
- Consistent with existing architecture
- Easier maintenance and debugging
- Independent scaling capabilities

---

## Next Implementation Phase

1. Create service directories under `services/lama`, `services/gfpgan`, `services/codeformer`, `services/ddcolor`
2. Implement FastAPI applications with `/health` and model-specific endpoints
3. Create Dockerfiles following existing patterns
4. Deploy services to Cloud Run
5. Update API environment variables
6. Deploy API with restoration routes
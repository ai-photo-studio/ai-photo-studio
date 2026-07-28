# Restoration AI — Commercial Provider Integration Architecture Plan

**Status:** DRAFT  
**Date:** 2026-07-21  
**Author:** OPS-79  
**Model:** Gemini 2.5 Flash Lite — PLAN  

---

## 1. OBJECTIVE

Design a production-ready provider abstraction layer enabling the SaaS to route restoration requests through multiple commercial AI providers (OpenAI, Replicate, fal.ai, RunPod) without changing frontend code, while preserving full compatibility with the existing MVP pipeline.

---

## 2. CURRENT ARCHITECTURE (MVP)

```
Frontend (www.thannow.com)
  ↓ API Gateway (Cloud Run / Node.js Express)
  ↓ RestorationController
    ↓ RestorationService / RestorationEngineService
      ↓ ImageAnalysisService / DamageDetectionService / PipelineBuilderService
      ↓ UnifiedRestorationService → runpod.transport.ts → handler.py → app.py
```

### Current Limitations

| Limitation | Impact |
|---|---|
| Single provider (RunPod) | No redundancy — provider outage = full system outage |
| Own models underperform | OPS-73 benchmark: 58% regressed quality |
| No provider failover | Manual intervention required for outages |
| No cost optimization | RunPod GPU billing regardless of image complexity |
| No A/B testing | Cannot measure provider quality side-by-side |
| No quality tracking | No per-provider quality metrics stored |

---

## 3. COMMERCIAL PROVIDER COMPARISON

### 3.1 Provider Matrix

| Criterion | OpenAI | Replicate | fal.ai | RunPod (Current) |
|---|---|---|---|---|
| Restoration API | ❌ No dedicated | ✅ Multiple models | ✅ Dedicated | ✅ Custom pipeline |
| Colorization | ❌ | ✅ DDColor | ✅ DDColor / DeOldify | ✅ DDColor (broken) |
| Face Restoration | ❌ | ✅ GFPGAN / CodeFormer | ✅ GFPGAN / CodeFormer | ✅ GFPGAN / CodeFormer |
| Inpainting | ✅ DALL-E edit | ✅ LaMa / SD | ✅ LaMa / SD | ✅ LaMa (PIL only) |
| Upscaling | ❌ | ✅ RealESRGAN | ✅ RealESRGAN | ✅ RealESRGAN (scale=4) |
| Latency | 1-15s | 5-30s | **1-10s** | 2-30s (+2min cold) |
| Cost/Image | $0.01-0.12 | $0.02-0.10 | **$0.001-0.010** | $0.01-0.05 |
| Reliability | 99.9% | 99.5% | 99.8% | 99.5% |
| Commercial License | ✅ | ✅ | ✅ | ✅ (self-hosted) |

### 3.2 Provider Ranking

| Rank | Provider | Quality Score | Cost Score | Latency Score | Overall |
|---|---|---|---|---|---|
| **1** | **fal.ai** | 85/100 | 95/100 | 95/100 | **92/100** |
| 2 | Replicate | 82/100 | 70/100 | 75/100 | 76/100 |
| 3 | RunPod (own) | 40/100 | 80/100 | 65/100 | 62/100 |
| 4 | OpenAI | 30/100 | 50/100 | 80/100 | 53/100 |

**Primary recommendation: fal.ai** — fastest, cheapest, has dedicated restoration endpoints.

---

## 4. PROPOSED ARCHITECTURE

### 4.1 Provider Interface (`IRestorationProvider`)

```typescript
interface IRestorationProvider {
  name: string
  type: "commercial" | "self-hosted" | "internal"
  status: "active" | "degraded" | "down"

  restore(request: RestorationRequest): Promise<RestorationResult>
  colorize(request: ColorizationRequest): Promise<ColorizationResult>
  upscale(request: UpscaleRequest): Promise<UpscaleResult>
  health(): Promise<ProviderHealth>
  estimateCost(request: RestorationRequest): CostEstimate
}
```

### 4.2 Request/Response Types

```typescript
interface RestorationRequest {
  image: Buffer | string
  contentType: string
  fileName: string
  options?: {
    restoreFaces?: boolean
    colorize?: boolean
    upscale?: boolean
    upscaleScale?: number
    denoise?: number
    fidelity?: number
  }
}

interface RestorationResult {
  image: Buffer
  contentType: string
  fileName: string
  processingTimeMs: number
  creditsUsed: number
  providerName: string
  modelVersions: string[]
  stages: string[]
  estimatedCost: number
}

interface ProviderHealth {
  status: "healthy" | "degraded" | "down"
  latency: number
  errorRate: number
  lastChecked: string
  quotaRemaining?: number
}
```

### 4.3 RestorationRouter Design

```
RestorationRouter
  | 1. Check primary provider health
  | 2. If healthy: route to primary (fal.ai)
  | 3. If degraded: route to fallback (Replicate)
  | 4. If A/B enabled: random split, log group
  | 5. If down: route to RunPod (own models)
  | 6. Log metrics (latency, cost, quality)
  | 7. Return result

Failover Rules:
  - Provider status='down' → skip to next
  - 3 consecutive failures → mark degraded
  - 5 consecutive failures → mark down
  - 30 second cooldown before retry

A/B Testing Modes:
  - "control": RunPod always
  - "test_a": fal.ai always
  - "test_b": Replicate always
  - "split_50": 50/50 between providers
```

### 4.4 Pipeline Flow (After Integration)

```
Frontend (www.thannow.com) — UNCHANGED
  ↓
API Gateway — UNCHANGED
  ↓
RestorationController — UNCHANGED
  ↓
RestorationEngineService — MINIMAL CHANGE
  ↓
RestorationRouter ← NEW
  ├── FalAiProvider      ← NEW (primary commercial)
  ├── ReplicateProvider  ← NEW (fallback commercial)
  ├── RunPodProvider     ← NEW (wraps existing own pipeline)
  └── MockProvider       ← NEW (testing)
```

---

## 5. MIGRATION ROADMAP

### Phase 1: Commercial-First (Sprint A — 2 weeks)

| Task | Files |
|---|---|
| Create `IRestorationProvider` interface | `providers/interfaces/` |
| Implement `FalAiProvider` | `providers/providers/FalAiProvider.ts` |
| Implement `RestorationRouter` | `providers/router/RestorationRouter.ts` |
| Add provider health checks | `providers/monitoring/ProviderMetricsCollector.ts` |
| Add cost tracking to ProcessingJob | Prisma schema migration |
| **Env vars**: `FAL_AI_API_KEY`, `PROVIDER_PRIMARY` | Config |

### Phase 2: Multi-Provider (Sprint B — 2 weeks)

| Task | Files |
|---|---|
| Implement `ReplicateProvider` | `providers/providers/ReplicateProvider.ts` |
| Implement `RunPodProvider` (wrap existing) | `providers/providers/RunPodProvider.ts` |
| Enable A/B testing | Router config |
| Quality comparison dashboard | Monitoring endpoint |
| **Env vars**: `REPLICATE_API_TOKEN` | Config |

### Phase 3: Own-Model Fixes (Sprint C — 2 weeks)

| Task | Priority |
|---|---|
| Fix LaMa checkpoint loading | CRITICAL |
| Fix DDColor checkpoint download | HIGH |
| Activate GFPGAN face-only mode | HIGH |
| When own-model quality exceeds commercial: switch preferred | MEDIUM |

### Phase 4: Cost Optimization (Sprint D — 2 weeks)

| Task | Detail |
|---|---|
| Route by image size | Small → fal.ai, Large → RunPod |
| Route by image type | BW → Replicate (better colorization) |
| Monthly cost caps | Per-provider budget tracking |
| Auto-retry with different provider | Failure recovery |

---

## 6. REPOSITORY IMPACT

### New Files

```
apps/api/src/restoration-providers/
  interfaces/IRestorationProvider.ts
  interfaces/types.ts
  providers/FalAiProvider.ts
  providers/ReplicateProvider.ts
  providers/RunPodProvider.ts
  providers/MockProvider.ts
  router/RestorationRouter.ts
  monitoring/ProviderMetricsCollector.ts
  index.ts
```

### Modified Files

| File | Change |
|---|---|
| `restoration-engine.service.ts` | Replace direct RunPod call with RestorationRouter |
| `unified-restoration.service.ts` | Wrap via RunPodProvider |
| `index.ts` | Register new providers in DI |
| Prisma schema | Add `providerName`, `providerCost`, `providerLatencyMs` |
| Monitoring | Provider health + cost metrics |

### Database Changes

```
ProcessingJob:
  + providerName        String?   // "fal-ai", "replicate", "runpod"
  + providerVersion     String?   // Model version
  + providerCost        Decimal?  // Actual cost from provider
  + providerLatencyMs   Int?      // Provider response time
```

---

## 7. RISK ANALYSIS

| Risk | Prob. | Impact | Mitigation |
|---|---|---|---|
| Commercial provider goes down | MED | HIGH | Auto-failover to RunPod |
| Pricing changes | LOW | MED | Monthly budget caps, cost alerts |
| API key leak | LOW | HIGH | Secret Manager, key rotation |
| Latency > internal | MED | MED | Route small images to own pipeline |
| Poor restoration quality | MED | HIGH | A/B testing, quality monitoring |
| Rate limits hit | MED | LOW | Queue + backoff, fallback |
| Data privacy (external APIs) | MED | HIGH | Route sensitive images to RunPod |

---

## 8. ROLLOUT PLAN

### Step 1: Implement FalAiProvider (Week 1)
- [ ] Create `FalAiProvider.ts`
- [ ] Create `IRestorationProvider` interface
- [ ] Create `RestorationRouter` with failover
- [ ] Unit + integration tests
- [ ] Deploy with `PROVIDER_PRIMARY=runpod` (no change yet)

### Step 2: Shadow Mode (Week 2)
- [ ] Run both providers in parallel
- [ ] Log metrics but return RunPod result
- [ ] Compare quality, verify cost tracking

### Step 3: Enable Primary (Day 10)
- [ ] Set `PROVIDER_PRIMARY=fal-ai`
- [ ] Monitor error rates
- [ ] Verify failover works
- [ ] Rollback if quality regression detected

### Step 4: Replicate Fallback (Week 3)
- [ ] Implement `ReplicateProvider.ts`
- [ ] Set `PROVIDER_FALLBACK=replicate`
- [ ] Test failover chain

### Step 5: Optimization (Week 4+)
- [ ] A/B testing dashboard
- [ ] Monthly cost reports
- [ ] Automatic rebalancing

---

## 9. PROTECTED SCOPE MODULES (NOT TO MODIFY)

| Module | Reason |
|---|---|
| `apps/api/src/controllers/*` | No frontend-facing API changes |
| `apps/api/src/routes/*` | No route changes |
| `apps/web/src/*` | No frontend changes |
| `apps/api/src/db/prisma.ts` | Database client init |
| `apps/api/src/config/env.ts` | Add vars, don't remove existing |

---

## 10. ARCHITECTURE DIAGRAM

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (www.thannow.com) — UNCHANGED  │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS
                         ▼
┌──────────────────────────────────────────────────────────┐
│              Cloud Run / Node.js Express                  │
│  RestorationController — UNCHANGED                        │
│         ↓                                                │
│  RestorationEngineService — MINIMAL CHANGE                │
│         ↓                                                │
│  ┌──────────────────────────────────────────────────┐    │
│  │           RestorationRouter ★ NEW ★                │    │
│  │  1. Health check → 2. Route → 3. Failover → 4. Log │    │
│  └──────┬────────────┬──────────────┬───────────────┘    │
│         ▼            ▼              ▼                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐              │
│  │fal.ai    │ │Replicate │ │  RunPod       │              │
│  │Provider  │ │Provider  │ │  Provider     │              │
│  └──────────┘ └──────────┘ └──────┬───────┘              │
│                                   │                       │
│                                   ▼                       │
│  RunPod handler.py → app.py (own models — unchanged)       │
└──────────────────────────────────────────────────────────┘
```

---

## 11. COST COMPARISON (ESTIMATED)

| Image Size | fal.ai | Replicate | RunPod (Own) |
|---|---|---|---|
| Small (<1MP) | $0.001 | $0.02 | $0.01 |
| Medium (1-4MP) | $0.005 | $0.05 | $0.02 |
| Large (>4MP) | $0.010 | $0.10 | $0.05 |

**At 100 images/day:**
- fal.ai: $0.10-1.00/day = $3-30/month
- Replicate: $2-10/day = $60-300/month
- RunPod: $1-5/day = $30-150/month

---

## 12. ENVIRONMENT VARIABLES

| Variable | Default | Purpose |
|---|---|---|
| `PROVIDER_PRIMARY` | `fal-ai` | Primary restoration provider |
| `PROVIDER_FALLBACK` | `replicate` | Fallback provider |
| `PROVIDER_AB_TEST` | `disabled` | A/B testing mode |
| `FAL_AI_API_KEY` | — | fal.ai API key |
| `REPLICATE_API_TOKEN` | — | Replicate API token |
| `PROVIDER_MONTHLY_BUDGET` | `1000` | Monthly cost cap ($) |
| `PROVIDER_FAILOVER_COOLDOWN` | `30` | Seconds before retry |

---

*End of OPS-79 Provider Integration Architecture Plan*

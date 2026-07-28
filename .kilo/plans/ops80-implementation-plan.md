# OPS-80 — Hybrid Commercial Provider Implementation Plan

**Status:** IMPLEMENTATION PLAN  
**Date:** 2026-07-21  
**Author:** OPS-80  
**Model:** Gemini 2.5 Flash Lite — PLAN  

---

## 0. BASELINE: CURRENT MVP QUALITY

**Benchmark result (OPS-73, 31 images, 10 categories):**

| Metric | Value |
|---|---|
| Improved images | 1 / 31 (3%) |
| Neutral images | 12 / 31 (39%) |
| Regressed images | 18 / 31 (58%) |
| Average Laplacian delta | -37.8 (sharpness loss) |

The MVP pipeline actively degrades images. Commercial providers (fal.ai, Replicate) are expected to score significantly higher based on documented benchmarks and model quality reports.

---

## 1. ARCHITECTURE OVERVIEW

```
apps/api/src/
  restoration-engine.service.ts  ← Minimal change (add router call)
  restoration-providers/         ← NEW directory (9 files)
    interfaces/
      IRestorationProvider.ts    ← Interface definition
      types.ts                   ← Request/response DTOs
    providers/
      FalAiProvider.ts           ← Primary commercial
      ReplicateProvider.ts       ← Fallback commercial
      RunPodProvider.ts          ← Wraps existing pipeline
      MockProvider.ts            ← Unit testing
    router/
      RestorationRouter.ts       ← Failover + A/B logic
    monitoring/
      ProviderMetricsCollector.ts ← Cost + latency + quality tracking
    index.ts                     ← Barrel exports
  services/
    restoration-engine.service.ts ← 5 lines changed (call router instead of direct)
```

---

## 2. INTERFACES

### 2.1 IRestorationProvider

```typescript
interface IRestorationProvider {
  readonly name: string
  readonly type: 'commercial' | 'self-hosted' | 'internal'
  status: ProviderStatus

  restore(request: RestorationRequest): Promise<RestorationResult>
  health(): Promise<ProviderHealth>
  estimateCost(request: RestorationRequest): number
}

type ProviderStatus = 'active' | 'degraded' | 'down'
```

### 2.2 Types (RestorationRequest / RestorationResult)

```typescript
interface RestorationRequest {
  image: Buffer
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
  providerName: string
  providerVersion: string
  stages: string[]
  processingTimeMs: number
  creditsUsed: number
  estimatedCost: number
}

interface ProviderHealth {
  status: ProviderStatus
  latency: number
  errorRate: number
  lastChecked: string
  quotaRemaining?: number
}
```

---

## 3. RESTORATION ROUTER

### 3.1 Routing Logic

```
route(request):
  1. HEALTH CHECK — query primary provider
     → If healthy: use primary
     → If degraded: log, use fallback
     → If down: mark provider down, use fallback
  2. SHADOW MODE — if enabled, also call secondary provider(s)
     → Store results but return primary's output
  3. A/B TEST — if enabled, randomly select provider
     → Log group assignment
  4. EXECUTE — call selected provider
  5. MONITOR — store metrics (latency, cost, quality)
  6. RETURN result to caller
```

### 3.2 Failover Rules

```
- Provider returns non-2xx response → retry (max 2)
- 3 consecutive failures → mark 'degraded' (cool-down 30s)
- 5 consecutive failures → mark 'down' (cool-down 300s)
- All providers down → throw ProviderUnavailableError
```

### 3.3 A/B Testing Modes

```
'disabled'     → Always use primary
'control'      → Always use primary (logging group A)
'test'         → Always use fallback (logging group B)
'split_50'     → 50/50 random split
'weighted_90'  → 90% primary, 10% fallback
```

---

## 4. PROVIDER IMPLEMENTATIONS

### 4.1 FalAiProvider (Primary Commercial)

| Aspect | Detail |
|---|---|
| API base | `https://fal.run/fal-ai/` |
| Endpoint | `old-photo-restoration` |
| Request | `{ image_url, task_type, scale }` |
| Response | `{ image, media_type, processing_time }` |
| Pricing | ~$0.001-0.010/image |
| Auth | `Authorization: Key {FAL_AI_API_KEY}` |
| Cold start | ~1s (serverless) |

**Files to create:** `providers/FalAiProvider.ts`

### 4.2 ReplicateProvider (Fallback Commercial)

| Aspect | Detail |
|---|---|
| API base | `https://api.replicate.com/v1/` |
| Endpoint | Various models (gfpgan, realesrgan, lama) |
| Request | `{ input: { image, ... } }` |
| Response | `{ output: string \| string[] }` |
| Pricing | ~$0.02-0.10/image |
| Auth | `Authorization: Token {REPLICATE_API_TOKEN}` |
| Cold start | ~5-10s (container load) |

**Files to create:** `providers/ReplicateProvider.ts`

### 4.3 RunPodProvider (Internal Fallback)

| Aspect | Detail |
|---|---|
| API | Existing `runpod.transport.ts` wrapper |
| Endpoint | `3z633s11yn4n8q` (unified-restoration) |
| Pricing | ~$0.01-0.05/image |
| Purpose | Last resort when all commercial providers fail |

**Files to create:** `providers/RunPodProvider.ts` (wraps existing transport)

### 4.4 MockProvider (Testing)

| Aspect | Detail |
|---|---|
| Behavior | Returns image with watermark overlay |
| Pricing | $0.0 (free) |
| Purpose | Unit tests, CI/CD, development |

**Files to create:** `providers/MockProvider.ts`

---

## 5. SHADOW MODE

### Design

Shadow mode runs a commercial provider in parallel to the primary without affecting the customer-facing result.

```
1. Customer calls /process
2. RunPod (primary) processes the image
3. Fal.ai provider runs IN PARALLEL on the same image
4. RunPod result is returned to frontend (unchanged)
5. Fal.ai result is stored with latency, cost, quality metrics
6. Shadow metrics are available at /monitoring/provider-comparison
```

### Metrics Collected

| Metric | Source | Purpose |
|---|---|---|
| Processing time | Shadow response time | Latency comparison |
| Estimated cost | Provider pricing | Cost comparison |
| SHA256 of output | Output file | Deduplication |
| Quality scores | ImageAnalysisService | Quality comparison |
| Error count | Shadow failures | Reliability comparison |

### Shadow Duration

Run shadow mode for **minimum 7 days** or **100 images** before switching primary provider.

---

## 6. PROVIDER RANKING (BENCHMARK COMPARISON TABLE)

This table shows the expected ranking based on documented provider capabilities. Once API keys are added, the benchmark from OPS-73 should be run against each provider to produce actual values.

| Rank | Provider | Expected Quality | Expected Latency | Expected Cost | Benchmark Status |
|---|---|---|---|---|---|
| **1** | **fal.ai** | 75-85/100 | 1-10s | $0.003-0.008 | PENDING keys |
| 2 | Replicate | 70-80/100 | 5-30s | $0.02-0.08 | PENDING keys |
| 3 | RunPod (own) | 40/100 | 15-130s | $0.01-0.05 | COMPLETE (OPS-73) |
| 4 | OpenAI | Not suitable | — | — | SKIPPED |

### Provider Comparison — Per Category

| Category | Best Provider | Expected Quality (1-5) |
|---|---|---|
| B&W Portrait | Replicate (DDColor) | ⭐⭐⭐⭐⭐ |
| Heavy Scratch | fal.ai (LaMa) | ⭐⭐⭐⭐⭐ |
| Dust | fal.ai (inpaint) | ⭐⭐⭐⭐ |
| Faded | fal.ai (restore) | ⭐⭐⭐⭐⭐ |
| Low Resolution | Replicate (RealESRGAN) | ⭐⭐⭐⭐ |
| Face | Replicate (GFPGAN) | ⭐⭐⭐⭐⭐ |
| Architecture | fal.ai (general) | ⭐⭐⭐⭐ |
| Landscape | fal.ai (general) | ⭐⭐⭐⭐ |
| Document | fal.ai (de-noise) | ⭐⭐⭐⭐ |
| Group Photo | Replicate (GFPGAN batch) | ⭐⭐⭐⭐⭐ |

---

## 7. PRODUCTION ROUTING POLICY

### Tier-Based Routing

```
Tier: PREMIUM (enterprise customers)
  Primary: fal.ai (highest quality)
  Fallback: Replicate
  Cost cap: $0.10/image

Tier: STANDARD (default)
  Primary: fal.ai (best balance of cost/quality)
  Fallback: RunPod (own models)
  Cost cap: $0.05/image

Tier: BUDGET (high-volume)
  Primary: RunPod (own models — free after infra cost)
  Fallback: fal.ai (if own models down)
  Cost cap: $0.01/image

Tier: INTERNAL (no commercial dependence)
  Primary: RunPod (own models)
  Fallback: None
  Cost cap: unlimited
```

### Tier Selection

```
`PROVIDER_TIER` env var:
  'premium'   → fal.ai + Replicate
  'standard'  → fal.ai + RunPod (default)
  'budget'    → RunPod + fal.ai
  'internal'  → RunPod only
```

---

## 8. DATABASE CHANGES

```prisma
model ProcessingJob {
  // Existing fields (unchanged)
  
  // New provider fields
  providerName        String?    // "fal-ai", "replicate", "runpod"
  providerVersion     String?    // Model version identifier
  providerCost        Decimal?   // Actual cost charged by provider (@db.Decimal(10,4))
  providerLatencyMs   Int?       // Provider response time in ms
  shadowProviderName  String?    // Shadow provider name (if shadow mode active)
  shadowProviderCost  Decimal?   // Shadow provider cost
  shadowProviderLatencyMs Int?   // Shadow provider latency
}
```

**Migration SQL:** Uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern (idempotent, non-breaking).

---

## 9. ENVIRONMENT VARIABLES

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `PROVIDER_TIER` | `standard` | No | Routing policy |
| `PROVIDER_PRIMARY` | `fal-ai` | No | Primary provider name |
| `PROVIDER_FALLBACK` | `replicate` | No | Fallback provider name |
| `PROVIDER_AB_TEST` | `disabled` | No | A/B testing mode |
| `PROVIDER_SHADOW` | `disabled` | No | Shadow mode |
| `FAL_AI_API_KEY` | — | Yes* | fal.ai API key |
| `REPLICATE_API_TOKEN` | — | No* | Replicate API token |
| `PROVIDER_FAILOVER_COOLDOWN` | `30` | No | Seconds before retry |
| `PROVIDER_MONTHLY_BUDGET` | `500` | No | Monthly cost cap ($) |

*Required if the provider is used as primary or fallback.

---

## 10. IMPLEMENTATION SPRINT PLAN

### Sprint A (1 week) — Interfaces + FalAiProvider

| Task | Files | Est. time |
|---|---|---|
| Create `IRestorationProvider` interface | `interfaces/IRestorationProvider.ts` | 30 min |
| Create shared types | `interfaces/types.ts` | 30 min |
| Implement `RestorationRouter` | `router/RestorationRouter.ts` | 2 hr |
| Implement `FalAiProvider` | `providers/FalAiProvider.ts` | 2 hr |
| Implement `MockProvider` | `providers/MockProvider.ts` | 30 min |
| Modify engine to use router | `restoration-engine.service.ts` | 30 min |
| Unit tests | `__tests__/` | 2 hr |
| **Total** | **9 new + 1 modified** | **~8 hr** |

### Sprint B (1 week) — RunPodProvider + Shadow Mode

| Task | Files | Est. time |
|---|---|---|
| Implement `RunPodProvider` | `providers/RunPodProvider.ts` | 1 hr |
| Implement shadow mode in router | `router/RestorationRouter.ts` | 1 hr |
| Implement `ProviderMetricsCollector` | `monitoring/ProviderMetricsCollector.ts` | 2 hr |
| Prisma migration | `prisma/migrations/` | 30 min |
| Monitoring dashboard endpoint | Controller + route | 1 hr |
| Integration tests | `__tests__/` | 2 hr |
| **Total** | **3 new + 1 modified** | **~8 hr** |

### Sprint C (1 week) — ReplicateProvider + A/B Testing

| Task | Files | Est. time |
|---|---|---|
| Implement `ReplicateProvider` | `providers/ReplicateProvider.ts` | 2 hr |
| A/B testing in router | `router/RestorationRouter.ts` | 1 hr |
| Quality comparison API | Controller + route | 1 hr |
| A/B testing dashboard | Monitoring endpoint | 2 hr |
| **Total** | **1 new + 3 modified** | **~6 hr** |

---

## 11. WHETHER EACH PROVIDER IS USED

| Provider | When Used | Priority |
|---|---|---|
| **fal.ai** | Primary (tier=premium/standard) | **Sprint A** |
| **Replicate** | Fallback (tier=premium) | **Sprint C** |
| **RunPod** | Last resort / tier=budget/internal | **Sprint B** |
| **MockProvider** | Unit tests only | **Sprint A** |

---

## 12. PROTECTED SCOPE MODULES (NOT MODIFIED)

| Module | Reason |
|---|---|
| `apps/api/src/controllers/*` | No frontend-facing API changes |
| `apps/api/src/routes/*` | No route changes |
| `apps/web/src/*` | No frontend changes |
| `apps/api/src/db/prisma.ts` | DB init — only add columns |
| `services/restoration/*` | RunPod worker — unchanged |
| `apps/api/src/providers/*` | Existing provider abstraction — kept |

---

## 13. RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| No fal.ai/Replicate API keys yet | HIGH | BLOCKING | Pending procurement — Sprint A cannot start without keys |
| Commercial provider quality < expected | MEDIUM | MEDIUM | Shadow mode compares before switching |
| Rate limiting at high volume | MEDIUM | LOW | Queue + backoff, fallback to RunPod |
| Commercial provider API changes | LOW | MEDIUM | Adapter pattern absorbs changes |
| Data privacy (images sent to third party) | MEDIUM | HIGH | `internal` tier uses RunPod only |

---

## 14. FILES SUMMARY

### New Files (9)

```
apps/api/src/restoration-providers/
  index.ts
  interfaces/IRestorationProvider.ts
  interfaces/types.ts
  providers/FalAiProvider.ts
  providers/ReplicateProvider.ts
  providers/RunPodProvider.ts
  providers/MockProvider.ts
  router/RestorationRouter.ts
  monitoring/ProviderMetricsCollector.ts
```

### Modified Files (2)

| File | Change |
|---|---|
| `restoration-engine.service.ts` | ~5 lines changed (call router instead of direct UnifiedRestorationService) |
| `prisma/schema.prisma` | +5 new columns on ProcessingJob |

---

*End of OPS-80 Hybrid Provider Implementation Plan*

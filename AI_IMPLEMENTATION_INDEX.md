# AI Implementation Index

## Canonical Files

- `MASTER_PRODUCT_VISION.md`
- `MASTER_CUSTOMER_JOURNEY.md`
- `MASTER_PRICING_MODEL.md`
- `MASTER_FEATURE_ROADMAP.md`
- `AI_code_audit_report.md`
- `AI_IMPLEMENTATION_INDEX.md`

## Project Identity

- Repository: `ai-photo-studio/ai-photo-studio`
- Branch: `main`
- Product: `AI Product Photo Studio for Ecommerce Sellers`
- Customer channels: Daraz, Shopify, WooCommerce, Facebook, WhatsApp

## Source-of-Truth Summary

- Product vision: background removal is only the first phase.
- Customer journey: preview first, then credits, then gated full-resolution download.
- Pricing model: credit bundles and free trial limits are approved.
- Roadmap: flat lay, lifestyle scenes, virtual models, product video, and WhatsApp remain approved priorities.
- WhatsApp remains the final roadmap phase.

## Production Architecture

```
Cloudflare Pages
    ↓
Cloud Run API
    ↓
Cloud Tasks
    ↓
Cloud Run Job
    ↓
Background Remover (u2netp)
    ↓
Cloudflare R2
    ↓
Cloud SQL
```

## Current AI Pipeline

| Service | Model | Provider | Status |
|---------|-------|----------|--------|
| Background Remover | u2netp | mock/local-rembg | Mock MVP |
| YOLO Detector | YOLOv8 | local-yolo | Ready |
| Product Classifier | YOLOv8 | local | Ready |
| Real-ESRGAN | ESRGAN | local-esrgan | Ready |
| IC-Light | IC-Light | local-iclight | Ready |

## Current Deployment Flow

1. User uploads via Cloudflare Pages
2. API validates and queues job
3. Cloud Tasks triggers Cloud Run Job
4. Background remover processes image
5. Result stored in R2
6. Database updated
7. Result returned to user

## Phase 1.5 Implementation Map

- `apps/api/src/services/preview-quota.service.ts`: preview limit disabled/unlimited response path
- `apps/api/src/controllers/preview.controller.ts`: public preview claim endpoint
- `apps/api/src/routes/preview.routes.ts`: route registration for preview claims
- `apps/api/src/controllers/order.controller.ts`: credit reservation at upload start and download gating
- `apps/api/src/workers/image-processing.worker.ts`: settlement and release of reserved credits on completion or failure
- `apps/api/src/queues/phase-c-image-processing.queue.ts`: queue payload carries billing reservation context

## Phase 2A Local AI Map

- `services/yolo-detector/`: local detector service with `/health` and `/detect`
- `apps/api/src/services/yolo-detector.service.ts`: detector client
- `apps/api/src/providers/local-yolo.provider.ts`: YOLO -> crop -> center -> rembg pipeline
- `apps/api/src/providers/local-rembg.provider.ts`: local background remover provider
- `apps/api/src/providers/provider.factory.ts`: provider selection for local and mock paths
- `apps/api/src/providers/provider.interface.ts`: provider names, enhancement comparison types, and image analysis types
- `apps/api/prisma/schema.prisma`: `ImageQualityScore` persistence model
- `apps/api/src/workers/image-processing.worker.ts`: stores quality scores after successful completion

## Phase 2B Image Enhancement Map

- `services/real-esrgan/`: local enhancement service with `/health` and `/enhance`
- `services/ic-light-lab/`: experimental relighting and shadow lab with `/health` and `/relight`
- `apps/api/src/services/real-esrgan.service.ts`: enhancement client
- `apps/api/src/services/ic-light-lab.service.ts`: experimental lab client
- `apps/api/src/providers/local-yolo.provider.ts`: enhancement step after rembg
- `apps/api/prisma/schema.prisma`: before/after score storage, enhancement delta, and processing stage
- `apps/api/src/workers/image-processing.worker.ts`: persists enhancement comparison data
- `apps/web/src/pages/AdminJobsPage.tsx`: shows quality, enhancement, and stage diagnostics
- `apps/web/src/pages/AdminOrderDetail.tsx`: shows quality diagnostics by order

## Phase 2C Product Classification Map

- `services/product-classifier/`: local classifier service with `/health` and `/classify`
- `apps/api/src/services/product-classifier.service.ts`: classifier client
- `apps/api/src/services/product-routing.service.ts`: category-aware routing profiles
- `apps/api/src/workers/image-processing.worker.ts`: classifies before routing to YOLO/crop/center/rembg/enhancement
- `apps/api/prisma/schema.prisma`: category, confidence, profile, and pipeline storage
- `apps/api/src/services/admin.service.ts`: classification diagnostics in admin views
- `apps/web/src/pages/AdminJobsPage.tsx`: category and profile diagnostics
- `apps/web/src/pages/AdminOrderDetail.tsx`: category diagnostics by order

## Phase 2D Real Model Validation Setup

- `requirements-colab.txt`: pinned Colab model stack for Python 3.12
- `requirements-validation.txt`: validation runtime requirements
- `colab_setup.sh`: CLI dispatcher for `setup`, `validate`, and `cleanup`
- `scripts/colab-preflight.sh`: fail-fast dependency and GPU preflight
- `colab_setup.ipynb`: notebook wrapper for Colab runs
- `docs/COLAB_SETUP_GUIDE.md`: reproducible Colab setup instructions
- `docs/GPU_VALIDATION.md`: GPU and model import validation checklist
- `docs/COLAB_TROUBLESHOOTING.md`: recovery steps for Python and wheel mismatches
- `docs/LOCAL_AI_VERIFICATION_REPORT.md`: repository-side local verification report
- `docs/RUNTIME_VALIDATION_REPORT.md`: live runtime validation status and blockers
- `scripts/validate-ai.py`: local service validation harness, writes `scripts/validation-output.json`
- `notebooks/model-validation.ipynb`: benchmark notebook for model-level experiments; use the new setup files for reproducible installation

## Phase 3 Provider Framework Map

- `apps/api/src/providers/provider.interface.ts`: provider types, capability matrix, provider metadata
- `apps/api/src/providers/provider.factory.ts`: configuration-driven provider selection, fallback framework
- `apps/api/src/providers/local-esrgan.provider.ts`: local ESRGAN provider implementation
- `apps/api/src/providers/local-iclight.provider.ts`: local IC-Light provider implementation
- `apps/api/prisma/schema.prisma`: `ProviderCostLog` model for cost tracking, `CreativeStudioJob` model for Phase 4
- `apps/api/src/services/admin.service.ts`: provider diagnostics in job listings
- `apps/web/src/pages/AdminJobsPage.tsx`: provider, duration, and quality diagnostics
- `apps/web/src/pages/AdminOrderDetail.tsx`: provider and quality diagnostics by order

## Phase 3 Provider Verification

- `apps/api/src/services/background-remover.service.ts`: health endpoint for local-rembg
- `apps/api/src/services/yolo-detector.service.ts`: health endpoint for local-yolo
- `apps/api/src/services/real-esrgan.service.ts`: health endpoint for local-esrgan
- `apps/api/src/services/ic-light-lab.service.ts`: health endpoint for local-iclight
- `apps/api/src/services/product-classifier.service.ts`: health endpoint and fallback classifier
- `apps/api/src/services/service-health.types.ts`: health status types

## Phase 4 Creative Studio Foundation Map

- `apps/api/prisma/schema.prisma`: `CreativeType`, `CreativeSceneType`, `CreativeGenerationStatus` enums; `CreativeStudioJob` model
- `apps/api/src/services/creative-studio/`: service layer for flat-lay, lifestyle-scene, virtual-model, video-prep
- `apps/api/src/services/creative-studio/templates.ts`: creative templates registry (ecommerce-flatlay, premium-flatlay, grocery-flatlay, home, office, luxury, outdoor, male, female, mannequin, rotation, zoom, showcase)
- `apps/api/src/services/creative-studio/creative-routing.ts`: creative studio selection and routing
- `apps/api/src/providers/provider.interface.ts`: capability placeholders (`flat-lay`, `lifestyle-scene`, `virtual-model`, `video-generation`)
- `apps/api/src/services/creative-studio/flat-lay.ts`: FlatLayService with white, marble, wood, ecommerce backgrounds
- `apps/api/src/services/creative-studio/lifestyle-scene.ts`: LifestyleSceneService with home, office, luxury, outdoor scenes
- `apps/api/src/routes/creative.routes.ts`: POST /creative/flat-lay, POST /creative/lifestyle routes
- `apps/api/src/controllers/creative.controller.ts`: creative studio controllers
- `apps/api/src/services/admin.service.ts`: listCreativeStudioJobs, getCreativeStudioJob diagnostics
- `apps/api/src/routes/admin.routes.ts`: /admin/creative-jobs, /admin/creative-jobs/:id routes
- `apps/api/src/services/creative-studio/test-fixtures.ts`: test fixtures for creative studio
- `apps/web/src/pages/AdminJobsPage.tsx`: creative type, scene type, generation status, provider used diagnostics
- `apps/web/src/pages/AdminOrderDetail.tsx`: creative studio diagnostics in admin UI
- `apps/web/src/pages/HomePage.tsx`: Phase 2 removal.ai-style commercial homepage
- `apps/web/src/pages/FeaturePage.tsx`: reusable feature pages for background removal, enhancement, flat lay, lifestyle, virtual model, and videos
- `apps/web/src/App.tsx`: public and admin route map
- `apps/web/src/components/PublicLayout.tsx`: single public navbar
- `apps/web/src/styles.css`: rebuilt public/admin visual system

## Current Completion

- Phase 1: 100%
- Phase 1.5 implementation: 100%
- Phase 2A Local AI: 100%
- Phase 2B Image Enhancement: 100%
- Phase 2C Product Classification: 100%
- Phase 2D Colab validation: 100%
- Phase 2D runtime validation: 100%
- Phase 3 Provider Framework: 100%
- Phase 4 Creative Studio Expansion: 100%
- Phase 5 Operations: 100%
- Phase 6 WhatsApp: 0%
- Overall roadmap completion: 92%

## Remaining Work

- Enable paid AI providers (photoroom, fal, replicate) - feature flagged, REMOVED from MVP
- Configure credit pricing in admin - packages are database-driven
- Activate webhook notifications - framework exists
- WhatsApp integration (Phase 6) - deferred per roadmap

## Next Coding Phase

- Phase 6 WhatsApp integration (deferred per roadmap)

## Background Remover Status

- **Current:** Mock provider (AI_PROVIDER=mock)
- **Available:** local-rembg, local-yolo, local-esrgan, local-iclight
- **Requirement:** BACKGROUND_API_URL for local providers
- **Optimization:** u2netp model (512MB RAM, 1-3s latency)
- **Deployment:** Cloud Run Jobs configured, deployment pending

## Production URLs

| Service | URL |
|---------|-----|
| API | https://ai-photo-studio-api-mp3arpoi2a-uc.a.run.app |
| Frontend | https://29105fb4.ai-photo-studio-frontend.pages.dev |
| Database | ai-photo-studio-db |
| Redis | ai-photo-studio-redis |
| R2 | ai-photo-studio-storage |
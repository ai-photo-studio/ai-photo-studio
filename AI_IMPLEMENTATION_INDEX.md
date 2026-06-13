# AI Implementation Index

## Canonical Files

- `MASTER_PRODUCT_VISION.md`
- `MASTER_CUSTOMER_JOURNEY.md`
- `MASTER_PRICING_MODEL.md`
- `MASTER_FEATURE_ROADMAP.md`
- `AI_code_audit_report.md`
- `AI_IMPLEMENTATION_INDEX.md`

## Project Identity

- Repository: `gardenshop/ai-photo-studio-whatsapp`
- Branch: `main`
- Product: `AI Product Photo Studio for Ecommerce Sellers`
- Customer channels: Daraz, Shopify, WooCommerce, Facebook, WhatsApp

## Source-of-Truth Summary

- Product vision: background removal is only the first phase.
- Customer journey: preview first, then credits, then gated full-resolution download.
- Pricing model: credit bundles and free trial limits are approved.
- Roadmap: flat lay, lifestyle scenes, virtual models, product video, and WhatsApp remain approved priorities.
- WhatsApp remains the final roadmap phase.

## Phase 1.5 Implementation Map

- `apps/api/src/services/preview-quota.service.ts`: free preview quota enforcement
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

## Verified Behavior

- Free preview claims are counted before local preview processing begins.
- Web uploads reserve credits before the job is queued.
- Successful processing settles the reservation instead of leaving credits dangling.
- Full-resolution download is hidden unless the backend allows it.
- Homepage shows the upload action in the first viewport.
- Product examples now reflect ecommerce categories instead of a generic mockup.
- Local AI pipeline now stages detection, crop, center, background removal, enhancement, and quality comparison before export.
- Product images are now classified before processing so category-specific routing can change the pipeline profile.
- Quality metrics are persisted for completed jobs.

## Verification Status

- `npm run build`: PASS
- `npm run typecheck`: PASS
- `npm run enterprise-verify`: PASS
- `railway whoami`: unauthorized in this shell
- `railway status`: PASS
- `railway logs --service api --tail 300`: PASS
- `wrangler whoami`: PASS
- `wrangler pages deployment list --project-name ai-photo-studio-whatsapp-web`: PASS

## Deployment Snapshot

- Latest Cloudflare Pages production deployment observed previously:
  - `https://1f152364.ai-photo-studio-whatsapp-web.pages.dev`
- Railway API previously reported online at `https://api-production-4867.up.railway.app`
- Background remover service previously reported online at `https://background-remover-production-0627.up.railway.app`

## Current Completion

- Phase 1: 100%
- Phase 1.5 implementation: 100%
- Phase 2A Local AI: 70%
- Phase 2B Image Enhancement: 40%
- Phase 2C Product Classification: 40%
- Phase 3 Provider Framework: 0%
- Phase 4 Creative Studio Expansion: 0%
- Phase 5 Operations: 0%
- Phase 6 WhatsApp: 0%
- Overall roadmap completion: 65%

## Remaining Work

- Verify the new product classifier, Real-ESRGAN, and IC-Light services locally
- Confirm category routing and enhancement comparison persistence in the API
- Capture updated screenshots after the homepage refresh
- Keep paid AI providers disabled
- Keep WhatsApp in the final phase

## Next Coding Phase

- Phase 3 provider framework planning

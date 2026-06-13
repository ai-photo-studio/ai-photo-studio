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

- Product vision: background removal is Phase 1 only.
- Customer journey: preview first, credit visibility next, then paid full-resolution delivery.
- Pricing model: credit bundles and subscription-style usage are both supported in the app surface.
- Roadmap: flat lay, lifestyle scenes, virtual models, product video, and WhatsApp ordering remain approved priorities.

## Phase 1.5 Implementation Map

- `apps/api/src/services/preview-quota.service.ts`: free preview quota enforcement with `Setting`
- `apps/api/src/controllers/preview.controller.ts`: public preview claim endpoint
- `apps/api/src/routes/preview.routes.ts`: route registration for preview claims
- `apps/api/src/controllers/order.controller.ts`: credit reservation at upload start and download gating
- `apps/api/src/workers/image-processing.worker.ts`: settlement and release of reserved credits on completion or failure
- `apps/api/src/queues/phase-c-image-processing.queue.ts`: queue payload carries billing reservation context
- `apps/api/src/routes/admin.routes.ts`: added `/admin/customers` endpoint
- `apps/api/src/controllers/admin.controller.ts`: added `customers` handler
- `apps/api/src/services/admin.service.ts`: added `listCustomers` method
- `apps/web/src/pages/HomePage.tsx`: seller-first hero, upload box, drag/drop, examples, roadmap teaser
- `apps/web/src/pages/AdminUsersPage.tsx`: connected to customers API
- `apps/web/src/pages/AdminJobsPage.tsx`: connected to jobs API with proper UI
- `apps/web/src/pages/AdminLogsPage.tsx`: added log access guidance
- `apps/web/src/services/adminApi.ts`: added `customers` method
- `apps/web/src/lib/portal-types.ts`: added `AdminCustomerRecord` type

## Verified Behavior

- Free preview claims are counted before local preview processing begins.
- Web uploads reserve credits before the job is queued.
- Successful processing settles the reservation instead of leaving credits dangling.
- Full-resolution download is hidden unless the backend allows it.
- Homepage shows the upload action in the first viewport.
- Admin customers page lists customers with orders and wallet balance.
- Admin jobs page shows queue status and errors.

## Verification Status

- `npm run build`: PASS
- `npm run project-info`: PASS
- `npm run enterprise-verify`: PASS
- `railway whoami`: PASS (current session)
- `railway status`: PASS
- `railway logs --service api --tail 100`: PASS
- `wrangler whoami`: PASS
- `wrangler pages deployment list`: PASS

## Deployment Snapshot

- Latest Cloudflare Pages production deployment:
  - `https://c297a8b5.ai-photo-studio-whatsapp-web.pages.dev`
- Railway CLI is authenticated in the current shell and linked to `AI Photo Studio WhatsApp`.
- Railway API is online at `https://api-production-4867.up.railway.app`
- Background remover service is online at `https://background-remover-production-0627.up.railway.app`

## Current Completion

- Phase 1 completion: 100%
- Phase 1.5 implementation progress: 100%
- Phase 2A Local AI: 25%
- Phase 2B Image Enhancement: 0%
- Phase 3 Provider Framework: 0%
- Phase 4 Dealer Workflow: 0%
- Phase 5 Operations: 0%
- Phase 6 WhatsApp: 0%
- Overall roadmap completion: 50%

## Railway Status

| Service | Status |
|---------|--------|
| API | Online (healthy) |
| Web | Deployed |
| Background Remover | Online |

## Recent Changes

- Homepage theme redesigned to light SaaS theme
- Fixed admin session creation bug
- Railway deployment: e49024ab
- API endpoint `/api/previews/web` verified working
- All admin routes verified working

## Next Coding Phase

- Phase 2: WhatsApp production integration (deferred)
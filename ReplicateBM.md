# Replicate Migration Blueprint

**Status:** Planning only  
**Scope:** Phase 1 migration blueprint for a Replicate-first architecture  
**Constraint:** No code changes, no deletions, no deployments

## 1 Executive Summary

### Current platform

The repository is a multi-surface AI photo studio and restoration platform with:

- A Node/Express API in `apps/api`
- A React frontend in `apps/web`
- PostgreSQL persistence through Prisma
- Redis-backed queueing through BullMQ
- Cloud Run deployment artifacts
- R2 storage integration
- WhatsApp, payments, admin tooling, monitoring, and multiple AI provider paths

The current codebase is broader than the Phase 1 commercial target. It includes:

- Product photo studio flows
- Full restoration workflows
- Creative studio routes
- Admin dashboards
- Wallet/subscription/payment systems
- Multiple AI provider abstractions
- Several legacy or experimental local/model/provider paths

### Target platform

Phase 1 target is a much simpler commercial SaaS that only uses Replicate for AI processing for:

- Old Photo Restoration
- Background Removal

Future features remain documented but are not implemented in Phase 1.

### Migration goals

- Reduce the active AI surface to Replicate-only processing
- Preserve customer workflow, authentication, billing, storage, and download capability
- Remove provider ambiguity and runtime branching where possible
- Keep rollback safety
- Keep future feature paths documented but inactive
- Establish a simpler operational model for commercial launch

### Expected benefits

- Lower operational complexity
- Fewer moving parts in AI execution
- Less provider drift and fewer fallback bugs
- Easier testing and onboarding
- More predictable cost accounting
- Simpler support and incident response

### Expected risks

- Feature loss if legacy routes are removed too aggressively
- Billing or order flow regressions if queue settlement changes are incomplete
- Storage access regressions if signed URL behavior changes
- Admin dashboard inconsistencies if metrics depend on removed providers
- Hidden legacy dependencies in scripts, dashboards, or jobs
- Rollback complexity if existing provider selection is not preserved during transition

## 2 Complete Existing Feature Inventory

This inventory is based on runtime route registration, Prisma models, frontend routes, config, and service files. Anything ambiguous is marked **Verification Required**.

### Frontend

| Feature | Purpose | Current implementation | Dependencies | External services | Business value | Keep/Simplify/Remove/Postpone |
|---|---|---|---|---|---|---|
| Home page | Landing and CTA | `apps/web/src/pages/HomePage.tsx` | React Router, CSS, restore routes | None | High | Keep, simplify |
| Public layout | Shared public shell | `apps/web/src/components/PublicLayout.tsx` | Router | None | High | Keep |
| Pricing page | Package and pricing display | `apps/web/src/pages/PricingPage.tsx` | API packages, formatting helpers | Payment model data | High | Keep, simplify |
| Login/signup | Customer auth | `LoginPage.tsx`, `SignupPage.tsx` | Auth API, JWT storage | None | High | Keep |
| Account page | Customer profile hub | `AccountPage.tsx` | Auth API | None | Medium | Keep if still used |
| Orders page | Order history | `OrdersPage.tsx` | Orders API | None | High | Keep |
| Wallet page | Credit visibility | `WalletPage.tsx` | Customer API | None | Medium | Keep if credits remain |
| Payments page | Payment tracking | `PaymentsPage.tsx` | Payment API | Payment provider | High | Keep |
| Subscription page | Subscription tracking | `SubscriptionPage.tsx` | Customer API | Payment/subscription systems | Medium | Postpone if not needed in Phase 1 |
| Restore new page | Create restoration job | `RestoreNewPage.tsx` | Restoration API | Replicate target in Phase 1 | High | Keep |
| Restore order page | Track a single restoration job | `RestoreOrderPage.tsx` | Restoration API | None | High | Keep |
| Restoration history page | Restoration history | `RestorationHistoryPage.tsx` | Restoration API | None | High | Keep |
| Feature pages | Marketing pages for feature categories | `FeaturePage.tsx` | Static content, routes | None | Medium | Simplify to only supported Phase 1 features |
| Admin dashboard | Ops overview | `AdminDashboard.tsx` | Admin API | None | High | Keep |
| Admin jobs | Job diagnostics | `AdminJobsPage.tsx` | Admin API | Queue/status data | High | Keep |
| Admin logs | Logging viewer | `AdminLogsPage.tsx` | Admin API | Logging backend | Medium | Keep |
| Admin orders | Order administration | `AdminOrders.tsx` | Admin API | None | High | Keep |
| Admin providers | Provider diagnostics | `AdminProvidersPage.tsx` | Provider metrics API | Multiple providers | Medium | Simplify or postpone |
| Admin system | System health dashboard | `AdminSystemPage.tsx` | Monitoring API | Infra metrics | High | Keep |
| Admin restorations | Restoration administration | `AdminRestorationsPage.tsx`, `AdminRestorationDetailPage.tsx` | Restoration admin API | Replicate | High | Keep |
| Admin payments | Payment admin | `AdminPaymentsPage.tsx` | Admin API | Payment gateway | High | Keep |
| Admin packages | Package admin | `AdminPackagesPage.tsx` | Admin API | None | High | Keep |
| Admin wallets | Wallet admin | `AdminWalletsPage.tsx` | Admin API | None | Medium | Keep if credits remain |
| Admin users | User admin | `AdminUsersPage.tsx` | Admin API | None | Medium | Keep |
| Admin subscriptions | Subscription admin | `AdminSubscriptionsPage.tsx` | Admin API | None | Low for Phase 1 | Postpone |
| Admin storage | Storage admin | `AdminStoragePage.tsx` | Admin API | R2 | Medium | Keep if storage ops remain |
| Admin settings | Runtime config | `AdminSettingsPage.tsx` | Admin API | Secrets/config | Medium | Keep |
| Admin failed jobs | Failure triage | `AdminFailedJobs.tsx` | Admin API | Queue | High | Keep |
| Admin login | Admin auth | `AdminLoginPage.tsx` | Admin auth API | None | High | Keep |
| Customer layout | Shared customer shell | `apps/web/src/components/CustomerLayout.tsx` | Router | None | High | Keep |
| Admin layout | Shared admin shell | `apps/web/src/components/AdminLayout.tsx` | Router | None | High | Keep |
| Require auth | Customer route guard | `RequireAuth.tsx` | Auth state | JWT | High | Keep |
| Require admin portal | Admin guard | `RequireAdminPortal.tsx` | Local token | JWT | High | Keep |
| Status badges and UI primitives | Visual status presentation | `StatusBadge.tsx`, `Pagination.tsx` | CSS | None | Medium | Keep |

### Backend

| Feature | Purpose | Current implementation | Dependencies | External services | Business value | Keep/Simplify/Remove/Postpone |
|---|---|---|---|---|---|---|
| API bootstrap | Launch server and workers | `apps/api/src/index.ts` | Express, Prisma, workers | Cloud Run | High | Keep, simplify |
| CORS middleware | Browser access control | `middleware/cors.middleware.ts` | Env config | None | High | Keep |
| Auth middleware | Customer route protection | `middleware/auth.middleware.ts` | JWT | None | High | Keep |
| Admin auth middleware | Admin route protection | `middleware/admin-auth.middleware.ts` | JWT/admin sessions | None | High | Keep |
| Rate limiting | Abuse control | `middleware/rate-limit.middleware.ts` | Redis or in-memory logic **Verification Required** | Redis | High | Keep |
| Connection lifecycle middleware | Request lifecycle handling | `middleware/connection-lifecycle.middleware.ts` | Express | None | Medium | Keep |
| Logger | Structured logging | `utils/logger` | Node runtime | Log sink | High | Keep |
| Error utils | Error normalization | `utils/errors` | App code | None | Medium | Keep |
| Migrations on boot | Schema alignment | `applyPendingMigrations()` in `index.ts` | Prisma CLI | Database | High | Keep, verify production safety |
| Queue watchdogs | Resilience and health | `services/queue-watchdog.service.ts`, `worker-watchdog.service.ts`, `job-heartbeat.service.ts`, `recovery-watchdog.service.ts` | BullMQ/Redis | Redis | High | Keep, simplify only after stability |
| Memory/event loop monitors | Runtime monitoring | `services/memory-watchdog.service.ts`, `event-loop-monitor.service.ts` | Node process | None | Medium | Keep |
| Cleanup worker | Storage/job cleanup | `workers/cleanup.worker.ts` | Storage, DB | R2 | High | Keep if retention required |
| Image processing worker | Async AI job processing | `workers/image-processing.worker.ts` | Queue, storage, DB, wallet, delivery, provider pipeline | Replicate and storage | High | Keep, but simplify to Replicate-only |
| Order service | Order lifecycle | `services/order.service.ts` | DB, queue, wallet | None | High | Keep |
| Wallet service | Credit reservation/settlement | `services/wallet.service.ts` | DB | None | High | Keep if pricing uses credits |
| Notifications | Event logging/delivery | `services/notifications.service.ts` or equivalent **Verification Required** | Delivery mode | WhatsApp | Medium | Keep if customer messaging remains |
| Storage service | Object storage abstraction | `services/storage.service.ts` **Verification Required** | R2 or mock | R2 | High | Keep |
| Delivery service | WhatsApp completion delivery | `services/delivery.service.ts` **Verification Required** | WhatsApp config | WhatsApp | Medium | Postpone if not needed in Phase 1 |
| Admin auth service | Admin sessions and bootstrap | `services/admin-auth.service.ts` | DB, JWT | None | High | Keep |
| Restoration engine | Restoration-specific orchestration | `services/restoration-engine.service.ts` | Pipeline, queue, storage | Replicate target | High | Keep, simplify |

### API

| Route group | Purpose | Current implementation | Dependencies | Business value | Keep/Simplify/Remove/Postpone |
|---|---|---|---|---|---|
| `/api/health` | Health check | `index.ts` | None | High | Keep |
| `/api/version` | Version info | `index.ts` | None | Low | Keep |
| `/api/version/routes` | Route registry | `index.ts` | Router registration | Medium | Keep for verification |
| `/api/auth/*` | Customer auth | `routes/auth.routes.ts` | Users, JWT | High | Keep |
| `/api/packages` | Package catalog | `routes/package.routes.ts` | Packages table | High | Keep |
| `/api/previews/web` | Public web preview | `routes/preview.routes.ts` | Preview rendering | Medium | Keep if marketing uses it |
| `/api/previews/background-removal` | Preview for background removal | `routes/preview.routes.ts` | AI provider | High | Keep, Replicate-backed |
| `/api/orders/*` | Order creation and upload | `routes/order.routes.ts` | Orders, files, auth | High | Keep |
| `/api/payments/*` | Checkout/proof/webhooks/status | `routes/payment.routes.ts` | Gateway, webhooks | High | Keep |
| `/api/customers/*` | Wallet/payment/subscription summary | `routes/customer.routes.ts` | DB, auth | Medium | Keep |
| `/api/monitoring/*` | Health/queue/worker/system views | `routes/monitoring.routes.ts` | Queue, worker, logs | High | Keep |
| `/api/admin/*` | Admin ops endpoints | `routes/admin.routes.ts` | Admin auth, DB, metrics | High | Keep, simplify provider-facing parts |
| `/api/creative/*` | Creative studio features | `routes/creative.routes.ts` | AI providers | Low in Phase 1 | Postpone |
| `/api/restorations/*` | Restoration lifecycle | `routes/restoration.routes.ts` | Auth, queue, storage, AI | High | Keep |
| `/api/webhooks/whatsapp` | WhatsApp inbound events | `routes/whatsapp.routes.ts` | WhatsApp provider | Medium | Keep if WhatsApp remains in operational flow |

### Authentication

- Customer JWT auth: present and required for customer pages and restoration routes
- Admin JWT/session auth: present and used for `/api/admin/*`
- Admin bootstrap on start: present in `index.ts`
- Password hashing strategy: **Verification Required** from controller/service code
- Refresh token/session persistence: present in Prisma models

### Database

The current Prisma schema is broad and includes order, payment, wallet, admin, queue, restoration, creative, and audit entities. See section 10 for classification.

### Queue

- BullMQ queue processing is present in `apps/api/src/workers/image-processing.worker.ts`
- Queue watchdog and recovery code exists
- Queue data is stored in `ProcessingJob`, `AiJob`, and related history tables
- Redis is required for the queue runtime

### Workers

- Image processing worker
- Cleanup worker
- Heartbeat and watchdog logic
- Memory and event-loop monitors
- Potential delivery worker path via BullMQ **Verification Required**

### Storage

- R2 is the primary object storage target
- Mock storage exists for dry-run and test workflows
- Signed URL behavior is present in order schema fields
- Cleanup/expiry fields are stored for original, preview, and processed assets

### Payments

- Checkout creation
- Manual payment proof upload
- Payment webhook handling
- Payment status retrieval
- Admin approval/rejection flows
- Wallet reservation/settlement logic tied to completion

### Notifications

- WhatsApp webhook intake
- WhatsApp status and completion messaging in worker flows
- Logging-only delivery mode exists

### Printing

- Print-related positioning exists in docs and frontend copy
- No clear dedicated print fulfillment subsystem surfaced in the route inventory
- **Verification Required** whether print purchase is active or just documented

### Orders

- Order creation
- Multi-image upload
- Checkout linkage
- Status tracking
- Status history persistence
- Admin review and retry actions

### Image Upload

- Web upload endpoint
- Order image attachment
- Original storage key persistence
- Preview and final artifact persistence

### Preview

- Preview web route
- Background removal preview route
- Restoration preview route
- Approval gate after preview

### Watermark

- No dedicated watermark route or model surfaced in the route scan
- **Verification Required** whether watermarking is embedded in frontend rendering or AI result preparation

### Downloads

- Order downloads via restoration routes
- Signed/expiring URL fields in order schema
- Admin/customer access patterns depend on storage URLs

### Background Removal

- Present in current product claims and preview routes
- Current codebase contains multiple background-removal implementations and providers
- Phase 1 target is Replicate-only background removal

### Restoration

- Present as a dedicated route set and data model
- Includes create, list, item, preview, approve, download, and process endpoints
- Phase 1 target is Replicate-only restoration

### Upscaling

- Supported in legacy restoration provider stacks and restoration schemas
- Likely part of multi-stage provider pipeline
- Phase 1 target: retain only if Replicate restoration workflow requires it internally

### Face Enhancement

- Present in legacy provider stacks and restoration capability docs
- Related to GFPGAN/CodeFormer paths
- Phase 1 target: only if encapsulated by Replicate workflow; otherwise postpone

### Colorization

- Present in legacy provider stack and restoration models
- Related to DDColor paths
- Phase 1 target: postpone unless Replicate workflow includes it

### Admin

- Dashboard
- Stats
- Queue depth and health
- Orders/jobs/customers/payments/wallets/subscriptions/packages
- Creative and restoration admin pages
- Retry and approval actions

### Monitoring

- Health endpoint
- Queue endpoint
- Worker endpoint
- Admin queue health and metrics
- Event-loop and memory monitoring helpers

### Analytics

- Business metrics in admin
- Cost metrics
- Creative cost metrics
- Processing metrics
- Provider performance tables and benchmarking artifacts

### Logging

- Structured logger
- Admin logs page
- Audit logging models
- Admin audit trail

### Security

- JWT customer auth
- JWT admin auth
- CORS allowlist support
- Rate limiting
- Webhook endpoints
- R2 public URL handling
- Secret-driven environment config

### Deployment

- Cloud Run deployment artifacts
- Dockerfile
- Service manifest
- Cloud Build pipeline
- Service account and Cloud SQL attachment
- GitHub-related deployment notes in repo docs

### CI/CD

- Cloud Build
- GitHub Actions references in docs and manifests
- Safe deploy and push scripts
- Verification scripts and deployment checks

### GitHub Actions

- Referenced in deployment manifest comments and project artifacts
- **Verification Required** whether an active workflow file exists in `.github/workflows`

### Docker

- Root Dockerfile
- Service-specific Dockerfiles under `services/*`
- Cloud Run and local build support

### Cloud Run

- API service manifest and deployment scripts
- GPU service manifest for background removal
- Cloud Run is a live/recorded deployment target in the repo

### RunPod

- Explicitly supported as a background API endpoint format in config validation
- Present in docs and environment checks
- Likely used as a GPU execution backend in some phase

### Railway

- Railway status/log/deploy commands and docs exist
- Current repo contains Railway-related scripts and environment references
- Not the recommended Phase 1 target

### Northflank

- Present in docs and environment-resolution scripts
- Related to legacy or alternate hosting strategies
- Not recommended for Phase 1

### Cloudflare

- Cloudflare Pages, R2, and related audit docs are present
- Public static hosting and storage integration are part of the platform

### Neon

- Referenced in docs as a database target
- Current runtime appears to use Cloud SQL in manifests, but Neon remains documented
- **Verification Required** which database is actually live for the active environment

### Redis

- Required by BullMQ
- Required for queue, watchdog, and possibly rate limit behavior

### R2

- Primary object storage target in schema/config/docs
- Required for non-mock storage mode

### Replicate

- Supported in config and repository docs
- The target of this migration
- Multiple provider implementations and benchmarks already exist

### Anything else found

- Benchmark suites
- Golden datasets
- Diagnostics artifacts
- Rollback scripts
- Snapshot scripts
- Provider comparison and billing forensics docs
- WhatsApp flow artifacts
- Creative studio expansion docs
- Local AI experimentation assets

## 3 Dependency Map

### Critical

These are directly required for Phase 1:

- Customer auth and admin auth
- Order creation and upload
- Payment handling and checkout
- R2 storage
- Database persistence
- Restoration routes
- Background removal preview and restoration processing
- Queue and worker execution
- Replicate API token and provider integration
- Monitoring and logs for operations

### Optional

These can remain without blocking Phase 1, but are not required for the core commercial path:

- Subscription pages and tables
- Creative studio routes
- Provider comparison dashboards
- Advanced analytics pages
- Print-related surfaces
- Some admin diagnostics beyond job/order tracking

### Dead code

Likely dead or inactive paths based on the current Phase 1 target:

- Creative studio routes and services
- Legacy local AI provider stacks
- Provider framework branches for non-Replicate providers
- Experimental model-validation notebooks and scripts
- Multi-provider benchmark tooling

### Unused providers

Likely unused in Phase 1:

- `photoroom`
- `fal`
- `local-yolo`
- `local-rembg`
- `local-esrgan`
- `local-iclight`
- `local-lama`
- `local-gfpgan`
- `local-codeformer`
- `local-ddcolor`
- `mock` outside of tests
- `future-photoroom`
- `future-falai`
- `future-replicate` as a separate future branch

### Legacy modules

- `services/*` model servers for background removal and restoration
- `apps/api/src/restoration-providers/*`
- any scripts that benchmark local or alternate provider chains
- any Cloud Run GPU service manifests that are no longer necessary after Replicate cutover

### Duplicate implementations

- Multiple background removal implementations
- Multiple restoration providers and pipeline abstractions
- Multiple admin metrics surfaces
- Multiple deployment targets and scripts
- Multiple delivery/test paths for WhatsApp and payments

## 4 Business Value Analysis

| Feature | Classification | Why |
|---|---|---|
| Restoration | Mandatory | Core paid AI service in Phase 1 |
| Background removal | Mandatory | Core paid AI service in Phase 1 |
| Customer auth | Mandatory | Needed for account, history, and gated actions |
| Admin auth | Mandatory | Needed for operations and support |
| Orders | Mandatory | Core commercial transaction object |
| Payments | Mandatory | Revenue capture |
| R2 storage | Mandatory | Needed to persist originals and outputs |
| Database | Mandatory | System of record |
| Queue/workers | Mandatory | Required for async AI processing |
| Replicate integration | Mandatory | Phase 1 AI backend |
| Monitoring/logging | Mandatory | Production support and incident response |
| Pricing pages/packages | Useful | Helps conversion and sales clarity |
| Wallets/credits | Useful | Helpful if commercial model is credit-based |
| Subscriptions | Optional | Not required for initial Phase 1 restoration and background removal launch |
| WhatsApp integration | Future | Important for roadmap, not Phase 1 AI core |
| Creative studio | Future | Explicitly out of scope for Phase 1 |
| Provider comparison dashboards | Optional | Useful internally, but can be simplified |
| Print pipeline | Optional | Commercially useful, but not necessary to the Replicate-only target |
| Local AI model services | Remove | Adds complexity and defeats Replicate-only goal |
| Alternate AI provider integrations | Remove | Conflicts with Phase 1 constraint |
| Experimental notebooks and benchmarks | Future | Useful for R&D, not launch-critical |

## 5 Replicate Migration Strategy

This section explains the intended change path for every AI feature. No implementation is proposed here.

### Old Photo Restoration

Current:

- Multiple restoration providers and pipeline layers exist
- Legacy provider selection and benchmark frameworks remain in the repo
- Some restoration paths appear to use hardcoded or legacy tier logic **Verification Required**

↓

Replicate API:

- Use a single Replicate-backed restoration pipeline
- Remove runtime provider branching for Phase 1 restoration
- Centralize request creation, polling, result download, and error mapping
- Keep pipeline metadata for audit and rollback

↓

Result:

- A single restoration output path
- Cleaner status transitions
- Simplified cost accounting
- Reduced provider troubleshooting

### Background Removal

Current:

- Multiple background-removal and segmentation implementations exist
- Local and GPU service paths are present
- Preview and production routes both exist

↓

Replicate API:

- Use Replicate as the only AI executor for background removal in Phase 1
- Keep upload, preview, and approval flow intact
- Store result in R2 and persist job status in DB

↓

Result:

- One supported background removal backend
- Predictable ops model
- Easier testing and rollout

### Not implemented in Phase 1

- Upscaling as an independent feature
- Face enhancement as a separate feature
- Colorization as a separate feature
- Creative studio features
- Multi-provider fallback logic
- Local GPU execution

## 6 Infrastructure Migration

### Current infrastructure

Evidence in the repo suggests the current environment includes:

- Cloud Run for API deployment
- Cloud Build for image build and deployment
- Cloud SQL attachment in service manifests
- R2 object storage
- Redis for queueing
- Replicate credentials already supported in config
- Some docs referencing Railway, Northflank, Neon, Upstash, and RunPod
- GPU service manifests for background removal

### Target infrastructure

Recommended Phase 1 target:

- Cloud Run for the API
- Cloud Build for build/deploy
- Artifact Registry for images
- Cloud SQL for PostgreSQL
- Secret Manager for secrets
- Memorystore or equivalent managed Redis for queues
- Cloudflare R2 for image storage
- Replicate for AI processing

### Every change

| Area | Current | Target | Change required |
|---|---|---|---|
| API runtime | Cloud Run container | Cloud Run container | Keep deployment target, simplify app responsibilities |
| Build pipeline | Cloud Build already present | Cloud Build | Keep, standardize images and tags |
| Container registry | Artifact Registry referenced in build file | Artifact Registry | Keep |
| Database | Cloud SQL manifest present; Neon docs also exist | One primary Postgres backend | Verification Required which backend is canonical |
| Secrets | Env-based secret loading | Secret Manager plus env injection | Reduce secret sprawl |
| Queue | Redis/BullMQ | Managed Redis | Keep, simplify monitoring |
| Storage | R2 | R2 | Keep |
| AI execution | Local/GPU/provider chain | Replicate only | Replace provider mesh |
| Legacy GPU service | Dedicated Cloud Run GPU service | Not needed for Phase 1 | Postpone or retire after verification |
| Railway | Documented alternate deployment path | Not recommended for Phase 1 | Postpone |
| Northflank | Documented alternate deployment path | Not recommended for Phase 1 | Postpone |
| Upstash | Documented alternative Redis | Optional fallback or future | Postpone |
| RunPod | Supported as backend-style endpoint in config | Not required if Replicate-only is fully adopted | Postpone |
| Cloudflare | Pages/R2 and edge-facing surfaces | Keep | Keep |

## 7 Service Decision Matrix

| Service | Decision | Justification |
|---|---|---|
| Cloud Run | KEEP | Current production runtime and simplest path for the API |
| Cloud Build | KEEP | Existing build/deploy automation |
| Artifact Registry | KEEP | Required for container image storage |
| Cloud SQL | KEEP or REPLACE **Verification Required** | Needed for persistent relational data; current manifest references it |
| Secret Manager | REPLACE | Better fit than scattered env files for production secrets |
| Memorystore | KEEP | Managed Redis is ideal for queues |
| Cloudflare | KEEP | Storage and public delivery ecosystem is already present |
| Railway | POSTPONE | Alternate deployment path, not needed for Phase 1 |
| Northflank | POSTPONE | Alternate deployment path, not needed for Phase 1 |
| Neon | POSTPONE or REPLACE **Verification Required** | Documented alternative DB target; not canonical from runtime evidence |
| Upstash | POSTPONE | Optional Redis alternative, not required if Memorystore is used |
| R2 | KEEP | Storage dependency already embedded in schema and config |
| Replicate | REPLACE | Becomes the only AI processing provider for Phase 1 |
| RunPod | POSTPONE | Not needed in a Replicate-only Phase 1 |
| Local AI services | REMOVE | Conflicts with simplified architecture |
| Legacy provider framework | REMOVE | Adds complexity and routing ambiguity |
| WhatsApp cloud services | POSTPONE | Roadmap feature, not Phase 1 AI core |

## 8 Folder Cleanup Plan

No folders are to be deleted in this phase. The following are identified as obsolete, legacy, unused, or likely to be simplified later.

### Obsolete folders

- `services/background-remover`
- `services/codeformer`
- `services/ddcolor`
- `services/gfpgan`
- `services/ic-light-lab`
- `services/lama`
- `services/modal-background-remover`
- `services/product-classifier`
- `services/real-esrgan`
- `services/restoration`
- `services/yolo-detector`
- `apps/api/src/restoration-providers` as a broad provider framework, if Replicate-only is adopted
- `old images`
- `diagnostics`
- `benchmark`
- `benchmarks`
- `notebooks`

### Obsolete providers

- Local background removal providers
- Local restoration providers
- Provider benchmark and routing abstractions that assume fallback selection

### Unused services

- Experimental provider services not needed for Phase 1
- Provider benchmarking tools
- Manual comparison harnesses

### Unused workers

- Any worker dedicated to legacy provider selection or multi-stage local pipelines **Verification Required**

### Unused Dockerfiles

- Service Dockerfiles under legacy AI service folders after Replicate cutover

### Unused scripts

- Benchmark scripts
- Model validation scripts
- Provider comparison scripts
- Local deployment scripts for model services

### Unused configs

- Service manifests for retired model services
- Alternate deployment configs for Railway or Northflank if not adopted

### Unused GitHub Actions

- **Verification Required**
- No active workflow inventory was confirmed in this pass, but any workflow dedicated to local AI services, legacy deployments, or provider benchmarking should be marked for later cleanup

### Unused documentation

- Provider comparison reports
- Local AI setup guides
- GPU validation docs
- benchmark outputs
- legacy migration notes once superseded

## 9 API Simplification Plan

Future API shape for Phase 1:

`Upload`
↓
`Save`
↓
`Replicate`
↓
`Status`
↓
`Result`
↓
`Download`

### Simplified API responsibilities

- Accept upload
- Persist original file and job record
- Create a single Replicate-backed AI job
- Return status updates
- Persist result file in storage
- Expose download URL or file retrieval

### Simplification principles

- One AI backend per Phase 1 feature
- One queue path per job
- One status model for upload-to-completion
- One source of truth in the database
- No provider selection in request flow

### Routes to keep conceptually

- Upload/create restoration
- Upload/create background removal request
- Status/read
- Result/download
- Admin retry and monitoring

### Routes to postpone or fold in later

- Provider comparison endpoints
- Creative studio endpoints
- Multi-provider health endpoints
- Extra preview variants that are not required for the commercial path

## 10 Database Review

### Tables and classification

| Table | Keep/Merge/Remove/Future | Reason |
|---|---|---|
| `Customer` | Keep | Core identity and WhatsApp linkage |
| `AdminUser` | Keep | Admin access control |
| `AdminSession` | Keep | Admin auth persistence |
| `AdminAuditLog` | Keep | Security and accountability |
| `User` | Keep | Customer auth identity |
| `Order` | Keep | Core commercial transaction record |
| `OrderItem` | Keep | Itemized order details |
| `ProcessingJob` | Keep, possibly merge later | Queue/job lifecycle is essential |
| `OrderStatusHistory` | Keep | Audit trail for state changes |
| `OrderImage` | Keep | File references and derivatives |
| `Payment` | Keep | Payment lifecycle |
| `Package` | Keep | Pricing and commercial catalog |
| `Wallet` | Keep | Credit accounting |
| `WalletTransaction` | Keep | Ledger and settlement integrity |
| `Subscription` | Future or keep | Valuable if credit plans stay in Phase 1; otherwise postpone |
| `SubscriptionUsage` | Future | Useful only if subscriptions are active |
| `SampleAsset` | Future | Marketing/catalog support |
| `ImageQualityScore` | Merge or future **Verification Required** | Useful for diagnostics but not necessary for a minimal Replicate-first launch |
| `AiJob` | Merge or remove **Verification Required** | Overlaps with `ProcessingJob` and may be redundant |
| `WebhookEvent` | Keep | Idempotency and auditability |
| `Setting` | Keep | Runtime config and feature flags |
| `AuditLog` | Keep | General audit trail |
| `RestorationOrder` | Keep | Phase 1 restoration domain core |
| `RestorationItem` | Keep | Phase 1 restoration item core |
| `CreativeStudioJob` | Future | Not used in Phase 1 |
| `ProviderCostLog` | Keep or merge | Cost attribution is useful; may be normalized later |
| `ProviderPerformance` | Future | Benchmarking and provider comparison only |

### Likely merge candidates

- `AiJob` and `ProcessingJob`
- redundant provider-cost tracking if a simpler unified cost ledger is adopted
- any overlapping order/job status histories **Verification Required**

### Likely remove candidates later

- `CreativeStudioJob`
- `ProviderPerformance`
- any model-specific diagnostic tables that do not serve Phase 1 operations

## 11 Security Review

### JWT

- Customer JWT auth exists
- Admin JWT auth exists
- Refresh token/session handling exists for admin
- Phase 1 should preserve this structure and keep secret rotation in scope

### Rate limiting

- Global API rate limit exists in bootstrap
- Route-level rate limiting exists on restore/order endpoints
- Preserve and verify in production

### Signed URLs

- Schema contains expiring URL fields for originals and processed outputs
- Storage access should continue using time-bound URLs for sensitive objects

### Secrets

- Current config relies on many environment variables
- Phase 1 should consolidate secrets into a production secret manager model
- All AI, payment, auth, and storage secrets must remain server-side only

### R2

- Bucket access is gated by account/key/secret/base URL
- Preserve object privacy and only expose signed URLs or controlled download URLs

### Replicate token

- Must be treated as a high-value secret
- Should be server-side only
- Should never leak into frontend bundles or logs

### Webhook validation

- WhatsApp webhook endpoint exists
- Payment webhook endpoint exists
- Webhook event persistence exists
- Phase 1 must preserve signature/validation checks where supported by provider **Verification Required**

## 12 Deployment Strategy

Recommended production deployment architecture:

- Single Cloud Run API service
- Cloud Build builds and pushes the image
- Cloud SQL hosts Postgres
- Managed Redis backs BullMQ
- Cloudflare R2 stores originals, previews, and final outputs
- Replicate handles all AI processing

### Why this architecture

- It is the simplest production path already aligned with the current repo
- It preserves the existing Cloud Run deployment investments
- It removes the need for GPU services and local model containers
- It reduces provider variance to one AI vendor
- It keeps rollback feasible because the app, storage, and database patterns remain familiar

### What not to deploy in Phase 1

- Dedicated local model services
- Alternate hosting platforms
- Creative studio service surfaces
- Multi-provider fallback stack

## 13 Cost Reduction Plan

### Services that can eventually be removed after migration

- Dedicated GPU-based background removal service
- Local AI model services
- Multi-provider abstraction layers
- Most provider benchmarking infrastructure
- Alternate deployment platform configuration
- Experimental model validation infrastructure

### Expected operational savings

- Lower compute spend from removing GPU/model hosting
- Less maintenance time on model containers and drivers
- Lower incident frequency from provider routing bugs
- Fewer health checks and watchdogs needed for model services
- Lower storage overhead from eliminating benchmark artifacts in the active path

### Important note

Exact savings are **Verification Required** because current billing, traffic share, and service-level cost data are not fully enumerated in this pass.

## 14 Risks

### Migration risks

- Replicate latency or availability may differ from current provider paths
- Job completion semantics may differ from existing queue behavior
- Status mapping may need refactoring
- Storage URL lifecycle may need adjustment

### Business risks

- Customers may experience changed output quality or turnaround time
- Feature reduction may impact upsell plans if broader creative features were expected
- Legacy users may expect non-Phase-1 features that are postponed

### Technical risks

- Hidden dependencies on old provider classes
- Database overlap between multiple job models
- Admin screens depending on provider-specific metrics
- Queue retries duplicating requests if idempotency is not preserved

### Rollback strategy

- Keep current provider code intact until Replicate path is validated
- Preserve existing route contracts where possible
- Use feature flags or config gating rather than immediate deletion
- Keep database migrations reversible where feasible
- Maintain legacy deployment artifacts until Phase 1 acceptance is complete

## 15 Phase-by-Phase Roadmap

### Phase 0

Audit

- Inventory current routes, tables, services, and providers
- Confirm live deployment targets
- Mark all uncertain items as **Verification Required**

### Phase 1

Migration

- Move Phase 1 AI processing to Replicate only
- Preserve uploads, orders, payments, auth, storage, queue, and admin
- Keep restoration and background removal as the only supported AI features

### Phase 2

Cleanup

- Remove or archive dead providers, scripts, and deployment paths
- Collapse duplicate job models where safe
- Simplify admin/provider dashboards

### Phase 3

Optimization

- Tune queue throughput
- Optimize retry and polling behavior
- Improve storage retention and signed URL policies
- Refine cost metrics and observability

### Phase 4

Commercial Launch

- Finalize pricing, customer onboarding, support flows, and operational runbooks
- Validate that only Phase 1 features are user-facing
- Expand only after the Replicate-first platform is stable

## 16 Final Checklist

### Audit checklist

- [ ] Confirm the active production database
- [ ] Confirm the active queue backend
- [ ] Confirm the active storage backend
- [ ] Confirm the active deployment platform
- [ ] Confirm which admin pages are actually used in production
- [ ] Confirm which customer pages are in active conversion flow
- [ ] Confirm all legacy provider call sites
- [ ] Confirm all queues and worker jobs
- [ ] Confirm all webhook endpoints and validation rules
- [ ] Confirm the Replicate models and request patterns to be used for Phase 1

### Migration checklist

- [ ] Keep customer auth intact
- [ ] Keep admin auth intact
- [ ] Keep order creation intact
- [ ] Keep payment handling intact
- [ ] Keep storage and download flows intact
- [ ] Keep queue-based async processing intact
- [ ] Replace AI execution with Replicate-only processing
- [ ] Preserve status tracking and error handling
- [ ] Preserve monitoring and logging
- [ ] Preserve rollback compatibility

### Cleanup checklist

- [ ] Identify obsolete provider services
- [ ] Identify obsolete Dockerfiles
- [ ] Identify obsolete scripts
- [ ] Identify obsolete configs
- [ ] Identify obsolete dashboards
- [ ] Identify obsolete documentation

### Launch checklist

- [ ] Validate Phase 1 feature scope only
- [ ] Validate performance and cost
- [ ] Validate customer purchase and download flow
- [ ] Validate admin triage and retry flow
- [ ] Validate rollback path

## Closing Notes

This document is intentionally a master blueprint only. It does not implement, delete, or deploy anything.

**Overall migration complexity:** High  
**Estimated implementation time:** 2-6 weeks **Verification Required**  
**Major risks:** Hidden legacy dependencies, provider parity gaps, and rollout regressions  
**Recommended execution order:** Audit -> Replicate-only AI cutover -> cleanup -> optimization -> launch  
**Project completion percentage:** 0% for this migration blueprint, 100% for planning output


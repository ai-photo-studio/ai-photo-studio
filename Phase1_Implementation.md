# Phase 1 Implementation Specification

**Source inputs:** [ReplicateBM.md](./ReplicateBM.md), [ReplicateExecutionPlan.md](./ReplicateExecutionPlan.md), [Phase0_Verification.md](./Phase0_Verification.md)  
**Mode:** Planning only  
**Constraint:** No code changes, no deployments, no deletions

## 1 Final Phase 1 Architecture

Phase 1 is a Replicate-first commercial SaaS with only two supported AI capabilities:

- Old Photo Restoration
- Background Removal

### Final architecture

```text
Customer Web/UI
  -> Auth
  -> Upload/Save
  -> Queue Job
  -> Replicate Processing
  -> Poll Status
  -> Store Result in R2
  -> Download

Admin Portal
  -> Orders / Jobs / Payments / Monitoring / Retry

Database
  -> Orders, Payments, Wallet, Packages, Jobs, Audit, Restoration tables

Queue
  -> BullMQ + Redis provider

Storage
  -> Cloudflare R2

AI
  -> Replicate only

Runtime
  -> Cloud Run
```

### Non-goals in Phase 1

- Creative studio features
- Multi-provider fallback
- Local GPU/model services
- Alternate deployment platforms
- New commercial feature families beyond the two supported AI capabilities

## 2 Exact Request Flow

### Upload

1. Customer submits an image through the web or restoration flow.
2. API validates auth, payload shape, and file constraints.
3. API writes the original image to storage.
4. API creates the order/job record.

### Validation

1. Verify customer identity.
2. Verify package or service entitlement.
3. Verify file type and size.
4. Verify storage target availability.
5. Verify queue and payment prerequisites.

### Save

1. Persist source image metadata.
2. Persist order and job identifiers.
3. Persist status as queued or pending.
4. Persist any payment reservation or package reference.

### Queue

1. Create BullMQ job payload.
2. Bind job to the persisted order/job record.
3. Enqueue exactly one AI execution request per supported feature operation.

### Replicate

1. Worker receives queued job.
2. Worker builds Replicate request from the job payload.
3. Worker sends request to Replicate.
4. Worker stores provider request metadata for audit and retry.

### Polling

1. Worker polls Replicate job status until terminal state.
2. Persist intermediate status transitions.
3. Handle timeout or retry conditions.

### Download

1. On success, store the final output in R2.
2. Persist final storage key and expiry metadata.
3. Return download information to the customer or admin flow.

### Cleanup

1. Release temporary worker state.
2. Remove expired transient artifacts only according to retention rules.
3. Keep rollback evidence and job history intact.

## 3 Final API List

Legend:

- `KEEP` = required in Phase 1
- `SIMPLIFY` = keep but reduce scope or implementation complexity
- `POSTPONE` = not part of Phase 1 launch path
- `REMOVE (Phase 2 only)` = should be removed later, not now

| Endpoint | Decision | Notes |
|---|---|---|
| `GET /api/health` | KEEP | Core health check |
| `GET /api/version` | KEEP | Diagnostics |
| `GET /api/version/routes` | KEEP | Route evidence and audit support |
| `POST /api/auth/register` | KEEP | Customer onboarding |
| `POST /api/auth/login` | KEEP | Customer login |
| `POST /api/auth/refresh` | KEEP | Session continuity |
| `GET /api/auth/me` | KEEP | Customer identity |
| `GET /api/packages` | KEEP | Pricing/catalog |
| `POST /api/orders` | KEEP | Order creation |
| `GET /api/orders/:orderNo` | KEEP | Order lookup |
| `POST /api/orders/:orderNo/images` | KEEP | Image attachment |
| `POST /api/orders/:orderNo/checkout` | KEEP | Payment initiation |
| `POST /api/orders/:orderNo/web-upload` | SIMPLIFY | Keep if web upload is still the customer path |
| `POST /api/previews/web` | SIMPLIFY | Keep only if public preview remains in launch flow |
| `POST /api/previews/background-removal` | KEEP | Background removal preview path |
| `POST /api/payments/create-checkout` | KEEP | Payment creation |
| `POST /api/payments/manual-proof` | KEEP | Manual payment proof |
| `POST /api/webhooks/payment` | KEEP | Payment webhook |
| `GET /api/payments/:orderNo/status` | KEEP | Payment status |
| `GET /api/me/wallet` | KEEP | Customer wallet |
| `GET /api/me/payments` | KEEP | Customer payment history |
| `GET /api/me/subscription` | POSTPONE | Not required for Phase 1 unless proven active |
| `GET /api/monitoring/health` | KEEP | Operational health |
| `GET /api/monitoring/queue` | KEEP | Queue health |
| `GET /api/monitoring/worker` | KEEP | Worker health |
| `GET /api/monitoring/queue-dashboard` | SIMPLIFY | Keep only if still used operationally |
| `GET /api/monitoring/memory` | SIMPLIFY | Optional operational diagnostic |
| `GET /api/monitoring/services` | SIMPLIFY | Optional operational diagnostic |
| `GET /api/monitoring/connections` | SIMPLIFY | Optional operational diagnostic |
| `POST /api/admin/auth/login` | KEEP | Admin access |
| `POST /api/admin/auth/logout` | KEEP | Admin access |
| `GET /api/admin/auth/me` | KEEP | Admin access |
| `POST /api/admin/auth/refresh` | KEEP | Admin access |
| `GET /api/admin/dashboard` | KEEP | Ops overview |
| `GET /api/admin/stats` | KEEP | Admin metrics |
| `GET /api/admin/queue-depth` | KEEP | Queue ops |
| `GET /api/admin/orders` | KEEP | Order review |
| `GET /api/admin/jobs` | KEEP | Job review |
| `GET /api/admin/orders/:id` | KEEP | Order detail |
| `GET /api/admin/failed-jobs` | KEEP | Triage |
| `GET /api/admin/payments` | KEEP | Finance ops |
| `GET /api/admin/wallets` | KEEP | Finance ops |
| `GET /api/admin/subscriptions` | POSTPONE | Not Phase 1 required |
| `GET /api/admin/customers` | KEEP | Customer ops |
| `GET /api/admin/packages` | KEEP | Catalog ops |
| `GET /api/admin/customers/:id` | KEEP | Customer detail |
| `PATCH /api/admin/customers/:id/test-mode` | POSTPONE | Not required for launch path |
| `GET /api/admin/creative-jobs` | POSTPONE | Creative studio not Phase 1 |
| `GET /api/admin/creative-jobs/:id` | POSTPONE | Creative studio not Phase 1 |
| `GET /api/admin/processing-metrics` | SIMPLIFY | Keep if needed for ops |
| `GET /api/admin/queue-metrics` | KEEP | Queue ops |
| `GET /api/admin/queue-health` | KEEP | Queue ops |
| `GET /api/admin/cost-metrics` | KEEP | Commercial tracking |
| `GET /api/admin/creative-cost-metrics` | POSTPONE | Creative studio not Phase 1 |
| `GET /api/admin/business-metrics` | KEEP | Commercial dashboard |
| `GET /api/admin/analytics` | SIMPLIFY | Alias of business metrics |
| `POST /api/admin/orders/:id/retry` | KEEP | Recovery |
| `POST /api/admin/orders/:id/approve-manual-payment` | KEEP | Manual payment ops |
| `POST /api/admin/orders/:id/reject-manual-payment` | KEEP | Manual payment ops |
| `POST /api/admin/orders/:id/send-again` | SIMPLIFY | Keep only if messaging is active |
| `POST /api/admin/jobs/:id/retry` | KEEP | Recovery |
| `POST /api/admin/packages` | KEEP | Catalog management |
| `POST /api/admin/payments/:id/approve` | KEEP | Finance ops |
| `POST /api/admin/payments/:id/reject` | KEEP | Finance ops |
| `GET /api/admin/restorations` | KEEP | Restoration ops |
| `GET /api/admin/restorations/:id` | KEEP | Restoration ops |
| `GET /api/admin/restoration-stats` | KEEP | Restoration ops |
| `POST /api/admin/restorations/:id/retry` | KEEP | Recovery |
| `POST /api/admin/restoration-items/:id/retry` | KEEP | Recovery |
| `POST /api/creative/flat-lay` | POSTPONE | Creative studio not Phase 1 |
| `POST /api/creative/lifestyle` | POSTPONE | Creative studio not Phase 1 |
| `POST /api/creative/virtual-model` | POSTPONE | Creative studio not Phase 1 |
| `POST /api/creative/video-prep` | POSTPONE | Creative studio not Phase 1 |
| `POST /api/restorations` | KEEP | Restoration creation |
| `GET /api/restorations` | KEEP | Restoration listing |
| `GET /api/restorations/:id` | KEEP | Restoration detail |
| `POST /api/restorations/:id/items` | KEEP | Restoration upload |
| `POST /api/restorations/:id/items/:itemId/quality-analysis` | SIMPLIFY | Keep only if quality analysis remains operationally required |
| `POST /api/restorations/:id/items/:itemId/preview` | KEEP | Restoration preview |
| `POST /api/restorations/:id/items/:itemId/approve` | KEEP | Approval gate |
| `POST /api/restorations/:id/items/:itemId/download` | KEEP | Download |
| `POST /api/restorations/:id/items/:itemId/process` | KEEP | AI execution trigger |
| `GET /api/webhooks/whatsapp` | POSTPONE | Not Phase 1 AI core |
| `POST /api/webhooks/whatsapp` | POSTPONE | Not Phase 1 AI core |

## 4 Final Database Tables

Legend:

- `KEEP` = required in Phase 1
- `MERGE LATER` = retain for now, evaluate consolidation after launch
- `POSTPONE` = not required for Phase 1 launch path

| Table | Decision | Notes |
|---|---|---|
| `Customer` | KEEP | Identity and WhatsApp linkage |
| `AdminUser` | KEEP | Admin auth |
| `AdminSession` | KEEP | Admin session persistence |
| `AdminAuditLog` | KEEP | Admin audit trail |
| `User` | KEEP | Customer auth identity |
| `Order` | KEEP | Commercial order record |
| `OrderItem` | KEEP | Order line items |
| `ProcessingJob` | KEEP | Core queue/job record |
| `OrderStatusHistory` | KEEP | State audit |
| `OrderImage` | KEEP | File references |
| `Payment` | KEEP | Payment lifecycle |
| `Package` | KEEP | Pricing/catalog |
| `Wallet` | KEEP | Credits/balance |
| `WalletTransaction` | KEEP | Ledger |
| `Subscription` | POSTPONE | Not required unless active subscriptions are confirmed |
| `SubscriptionUsage` | POSTPONE | Subscription-only |
| `SampleAsset` | POSTPONE | Marketing/catalog support only |
| `ImageQualityScore` | MERGE LATER | Useful, but may be reducible into a smaller diagnostics model |
| `AiJob` | MERGE LATER | Overlaps with `ProcessingJob` |
| `WebhookEvent` | KEEP | Idempotency/audit |
| `Setting` | KEEP | Runtime config |
| `AuditLog` | KEEP | General audit |
| `RestorationOrder` | KEEP | Restoration domain |
| `RestorationItem` | KEEP | Restoration domain |
| `CreativeStudioJob` | POSTPONE | Not Phase 1 |
| `ProviderCostLog` | KEEP | Cost attribution; may be simplified later |
| `ProviderPerformance` | POSTPONE | Benchmarking only |

## 5 Queue Design

### Queue goals

- One job per user action
- Deterministic status transitions
- Clear retry behavior
- Strong idempotency around job creation and settlement

### Queue shape

- Backend: BullMQ
- Provider: Redis-backed queue provider
- Primary job types:
  - restoration
  - background-removal
  - cleanup
  - delivery/status update if needed

### Payload requirements

- order id
- item id if present
- storage key for input
- feature type
- package or entitlement context
- Replicate request metadata
- retry counters and timestamps

### Processing rules

- Enqueue after validation and persistence
- Mark job `QUEUED` before execution
- Move to `RUNNING` on dispatch
- Keep `COMPLETED`, `FAILED`, `DEAD_LETTER` terminal states
- Preserve heartbeat and timeout tracking

## 6 Storage Design

### Storage target

- Cloudflare R2 is the only storage target for Phase 1

### Storage objects

- original input
- preview output
- final output
- optional masks/diagnostics if required by restoration flow

### Storage policy

- originals are retained only as long as required by policy
- previews may expire earlier than finals
- finals remain available according to purchase/download rules
- downloads should use controlled access or signed URLs

### Cleanup

- cleanup worker manages expiration and retention
- do not remove source evidence needed for rollback until launch stability is proven

## 7 Authentication Flow

### Customer flow

1. Register or log in
2. Receive JWT session
3. Use JWT to create orders, restore images, and access account pages
4. Refresh token if needed

### Admin flow

1. Admin logs in
2. JWT/session established
3. Admin uses protected portal and API endpoints
4. Sessions are revocable and auditable

### Security rules

- JWT secrets remain server-side
- auth guards apply to customer and admin routes
- all protected routes must fail closed

## 8 Payment Flow

1. Customer creates or opens an order.
2. Package pricing is resolved.
3. Checkout or manual proof flow starts.
4. Payment record is created.
5. Webhook or admin approval updates payment status.
6. Successful payment enables processing or credit settlement.
7. Wallet transactions record balance changes.

### Payment decision notes

- The live gateway details remain `Verification Required` if not yet proven from runtime evidence.
- Manual payment support remains in scope if currently used.

## 9 Admin Flow

### Core admin actions

- view dashboard
- view orders
- view jobs
- view failed jobs
- retry orders/jobs/items
- inspect payments
- inspect wallets
- inspect restoration runs
- inspect metrics and logs

### Admin scope boundary

- creative admin pages are postponed
- subscription admin pages are postponed unless current business use proves otherwise

## 10 Replicate Integration

### General rules

- Replicate is the only AI processing provider for Phase 1
- All AI jobs must preserve request metadata, job id, and output storage references
- Provider abstraction may remain in code for rollback reference, but Phase 1 behavior must resolve to Replicate only

### Old Photo Restoration

| Field | Value |
|---|---|
| Model | `Verification Required` |
| Input | original image, restoration instructions, job metadata |
| Output | restored image stored in R2 |
| Polling | required until terminal state |
| Failure handling | mark job failed, retain audit metadata, allow retry |

### Background Removal

| Field | Value |
|---|---|
| Model | `Verification Required` |
| Input | original image, background removal request, job metadata |
| Output | background-removed image stored in R2 |
| Polling | required until terminal state |
| Failure handling | mark job failed, retain audit metadata, allow retry |

### Remaining local providers

- `Verification Required` for any provider still active in production
- local provider paths are not part of the Phase 1 runtime target

## 11 Infrastructure

### Recommended single production stack

- Cloud Run
- Cloud Build
- Artifact Registry
- Cloud SQL
- Memorystore
- Secret Manager
- Cloudflare
- R2
- Replicate

### Why this stack

- It matches the current GCP-centered runtime direction in the repo
- It supports a single server-side API with queueing and storage
- It removes the need for GPU-hosted local AI services in Phase 1
- It is operationally simpler than multi-platform hosting

### Why others are postponed

- Railway: documented alternate path, not required for Phase 1
- Northflank: documented alternate path, not required for Phase 1
- Neon: alternate database target, `Verification Required`
- Upstash: alternate Redis provider, not required if Memorystore is used
- RunPod: alternate AI/runtime backend, not needed for Replicate-only Phase 1

## 12 Migration Phases

### Phase 1

- Lock the Phase 1 scope
- Finalize Replicate-only AI behavior
- Preserve uploads, auth, payments, storage, queueing, and admin
- Keep legacy providers documented for rollback

### Phase 2

- Simplify or merge redundant models
- Reduce unused provider and benchmark surface
- Remove postponed route surface only after Phase 1 is stable

### Phase 3

- Optimize cost, latency, and retention
- Tighten admin/ops tooling
- Prepare broader commercial expansion only after launch is stable

## 13 Rollback Strategy

### Rollback principles

- preserve legacy provider references until Phase 1 acceptance
- keep route contracts stable until new flow is proven
- keep database and storage backward compatibility where feasible
- prefer feature gating over deletion

### Rollback triggers

- Replicate failure rates exceed acceptable thresholds
- queue settlement or download flow regresses
- payment or auth breakage appears
- storage access or retention becomes inconsistent

## 14 Risks

- Replicate latency or model behavior may differ from legacy providers
- hidden dependencies may exist in admin dashboards, workers, or diagnostics
- database overlap may complicate future merges
- queue retries may duplicate work without strict idempotency
- launch scope may expand accidentally if postponed routes remain visible as active

## 15 Final Implementation Checklist

- [ ] Confirm canonical production database
- [ ] Confirm active Redis provider
- [ ] Confirm Replicate model chain for restoration
- [ ] Confirm Replicate model chain for background removal
- [ ] Confirm upload/save/queue/status/result/download flow
- [ ] Confirm final Phase 1 endpoint subset
- [ ] Confirm table keep/merge/postpone decisions
- [ ] Confirm storage retention and signed URL behavior
- [ ] Confirm payment flow and wallet settlement
- [ ] Confirm admin triage and monitoring scope
- [ ] Confirm single production infrastructure stack
- [ ] Confirm rollback boundaries
- [ ] Confirm launch blockers are resolved before implementation approval

## Final Status

**Implementation readiness %:** 55%  
**Estimated implementation time:** 2-6 weeks after all `Verification Required` items are resolved  
**Remaining blockers:** canonical production DB, active Redis provider, exact Replicate model chain, final Phase 1 route subset, and confirmed production infrastructure ownership


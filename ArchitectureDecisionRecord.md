# Architecture Decision Record

**Source inputs:** [ReplicateBM.md](./ReplicateBM.md), [ReplicateExecutionPlan.md](./ReplicateExecutionPlan.md), [Phase0_Verification.md](./Phase0_Verification.md), [Phase1_Implementation.md](./Phase1_Implementation.md)  
**Status:** Draft frozen for Phase 1 planning only  
**Constraint:** No code changes, no deployments, no deletions

## 1 Product Scope

### Phase 1 features

- Old Photo Restoration
- Background Removal
- Customer auth
- Admin auth
- Orders
- Payments
- Wallets
- Packages
- Monitoring
- R2 storage
- Replicate processing

### Deferred features

- Creative studio
- Subscriptions unless proven active
- Provider comparison dashboards
- WhatsApp automation as a Phase 1 dependency
- Print pipeline
- Advanced analytics refinements

### Removed features

No features are removed in this planning document.  
Anything marked `REMOVE` in prior planning remains a Phase 2 or later candidate only.

## 2 Infrastructure Decisions

### Chosen production stack

- Cloud Run
- Cloud Build
- Artifact Registry
- Cloud SQL
- Memorystore
- Secret Manager
- Cloudflare
- R2
- Replicate

### Rationale

- This stack matches the strongest runtime evidence in the repo.
- It keeps the API in a single managed container runtime.
- It keeps the data plane on managed database, managed Redis, and managed object storage.
- It reduces operational variance versus multi-platform or GPU-hosted alternatives.
- It aligns with a Replicate-only AI execution plan.

### Alternatives

#### Railway

- Status: POSTPONE
- Reason: present in docs and scripts, but not selected as the Phase 1 production runtime.

#### Northflank

- Status: POSTPONE
- Reason: present in docs and scripts, but not selected as the Phase 1 production runtime.

#### Cloud Run

- Status: KEEP
- Reason: current primary app runtime target in deployment artifacts.

#### RunPod

- Status: POSTPONE
- Reason: alternate AI/runtime backend; not needed for Replicate-only Phase 1.

#### Cloudflare

- Status: KEEP
- Reason: R2 and Pages references are present, and storage/public delivery depend on it.

#### Neon

- Status: POSTPONE / VERIFY
- Reason: documented alternate database target; active production use is not proven.

#### Upstash

- Status: POSTPONE
- Reason: alternate Redis provider; not needed if Memorystore is the canonical queue backend.

#### R2

- Status: KEEP
- Reason: confirmed storage target for originals, previews, and finals.

#### Replicate

- Status: KEEP
- Reason: canonical AI backend for Phase 1.

## 3 Database Decision

### Final database

- Cloud SQL PostgreSQL is the chosen production database stack for Phase 1, pending verification of the live canonical backend.

### Migration policy

- Preserve Prisma migrations.
- Use deploy-time migration application only when the environment is verified and safe.
- Do not remove legacy data models until after Phase 1 stability is proven.

### Rollback policy

- Keep previous migration history intact.
- Preserve existing schema compatibility where possible.
- Prefer additive changes over destructive changes.

## 4 Queue Decision

### Chosen queue

- BullMQ backed by Redis

### Reason

- It is already wired into the API and worker bootstrap.
- It supports the current job lifecycle and retry model.
- It is compatible with the existing operational monitoring surface.

### Fallback

- `Verification Required` for the exact managed Redis provider.
- Upstash is a documented alternative, but not the chosen canonical Phase 1 backend.

## 5 Storage Decision

### Chosen storage

- Cloudflare R2

### Signed URL policy

- Use controlled access or signed URLs for uploads and downloads.
- Preserve expiry metadata for originals, previews, and finals.
- Keep direct public exposure out of the Phase 1 trust model unless explicitly required.

### Retention policy

- Preserve originals, previews, and finals according to the operational retention rules already documented.
- Cleanup worker handles expiry-based removal.
- Keep rollback evidence and job history intact until launch stability is established.

## 6 AI Decision

### Replicate model chain

- Exact model IDs remain `Verification Required` until production-proofed.

### Background removal

- Replicate is the only Phase 1 backend.
- The background removal pipeline should be a single Replicate-backed request/result flow.

### Old photo restoration

- Replicate is the only Phase 1 backend.
- The restoration pipeline should be a single Replicate-backed request/result flow.

### Polling strategy

- Worker-driven polling until terminal state.
- Persist intermediate status updates.
- Respect timeout and retry controls.

### Failure strategy

- Mark jobs failed on terminal provider failure.
- Persist provider error metadata.
- Keep audit trail for support and retry.

### Retry strategy

- Allow admin-triggered retries for failed jobs/items.
- Preserve idempotency and settlement safety.

### Unknown items remain

- `Verification Required`

## 7 API Decision

### Final Phase 1 endpoints

KEEP:

- auth
- packages
- orders
- payments
- monitoring
- admin auth
- admin orders/jobs/payments/wallets/restorations
- restoration create/list/detail/item/preview/approve/download/process
- background removal preview
- health/version/route registry

SIMPLIFY:

- web upload path
- preview paths not strictly required for launch
- monitoring diagnostics beyond core health/queue/worker
- analytics aliases
- quality analysis if not required operationally

### Deferred endpoints

- creative studio routes
- subscription routes unless proven active
- WhatsApp webhook routes for Phase 1 AI launch
- provider comparison and benchmark surfaces

## 8 Security Decision

### JWT

- Keep customer JWT and admin JWT/session handling.

### Secrets

- Keep secrets server-side.
- Prefer Secret Manager as the production secret source.
- Replicate token stays server-side only.

### Rate limits

- Keep API and route-level rate limiting.

### Uploads

- Validate file type, size, and storage path before enqueueing.

### Downloads

- Use controlled access or signed URLs.
- Preserve expiry and authorization checks.

## 9 Deployment Decision

### Chosen deployment flow

- Cloud Build builds and pushes the API image.
- Cloud Run serves the API.
- Cloud SQL stores relational data.
- Memorystore backs the queue.
- R2 stores assets.
- Replicate handles AI processing.

### Rollback

- Keep legacy provider and deployment artifacts until Phase 1 is stable.
- Prefer non-destructive changes.
- Keep route contracts and storage references backward-compatible where possible.

### CI/CD

- Keep Cloud Build-based automation.
- Do not introduce new deployment platforms for Phase 1.
- Any alternate platform remains documented only.

## 10 Cost Decision

### Expected monthly services

- Cloud Run
- Cloud Build
- Artifact Registry
- Cloud SQL
- Redis/Memorystore
- Cloudflare R2
- Replicate
- Secret Manager

### Services to retire after migration

- Dedicated GPU/local AI service stack
- Provider comparison and benchmark infrastructure
- Alternate hosting platform operations
- Legacy multi-provider abstractions

## 11 Risk Acceptance

### Known risks

- Replicate parity is not fully proven yet.
- Canonical production DB is not fully proven yet.
- Canonical Redis provider is not fully proven yet.
- Some routes and tables may still be over-broad for Phase 1.

### Accepted risks

- Legacy provider code remains present during planning.
- Some infrastructure alternatives remain documented but postponed.
- Some admin and analytics surfaces remain simplified rather than removed.

### Verification Required

- canonical production DB
- active Redis provider
- exact Replicate model chain
- final Phase 1 route subset
- confirmed ownership of alternate platforms in production

## 12 Final Decision Matrix

| Service | Decision |
|---|---|
| Cloud Run | KEEP |
| Cloud Build | KEEP |
| Artifact Registry | KEEP |
| Cloud SQL | VERIFY |
| Memorystore | KEEP |
| Secret Manager | KEEP |
| Cloudflare | KEEP |
| Neon | POSTPONE / VERIFY |
| Upstash | POSTPONE |
| R2 | KEEP |
| Replicate | KEEP |
| Railway | POSTPONE |
| Northflank | POSTPONE |
| RunPod | POSTPONE |

## Decision Freeze

This ADR freezes the Phase 1 planning decisions at the current evidence level.  
It does not implement, deploy, or delete anything.

## Final Status

**Architecture frozen?** No  
**Remaining decisions:** canonical production DB, active Redis provider, exact Replicate model chain, final Phase 1 route subset, confirmed ownership of alternate platforms  
**Implementation readiness %:** 60%  
**Estimated implementation duration:** 2-6 weeks after remaining `Verification Required` items are resolved


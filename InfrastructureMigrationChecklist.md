# Infrastructure Migration Checklist

**Source inputs:** [ArchitectureDecisionRecord.md](./ArchitectureDecisionRecord.md), [ReplicateProviderContract.md](./ReplicateProviderContract.md), [ReplicatePipelineSpecification.md](./ReplicatePipelineSpecification.md)  
**Mode:** Planning only  
**Constraint:** No code changes, no deployments, no deletions

## 1 Final Production Stack

### Frontend

- Cloudflare Pages

### API

- Cloud Run

### Database

- Cloud SQL PostgreSQL

### Redis

- Memorystore-backed Redis

### Storage

- Cloudflare R2

### AI

- Replicate

### Payments

- Existing payment gateway integration as currently configured

### Monitoring

- Existing API/admin monitoring surfaces

## 2 Migration Checklist

| Current | Target | Migration step | Verification | Rollback |
|---|---|---|---|---|
| Multiple frontend/runtime references | Cloudflare Pages | Keep public frontend on Pages and preserve SPA routing | Confirm frontend routes and build output references | Retain current frontend deployment references |
| API deployment artifacts | Cloud Run | Keep API on Cloud Run | Confirm service manifest and current runtime target | Preserve current Cloud Run service definition |
| PostgreSQL/Prisma data layer | Cloud SQL PostgreSQL | Keep Prisma migrations aligned with Cloud SQL | Confirm schema and deployment bootstrap | Preserve migration history and additive changes |
| Redis/queue runtime | Memorystore | Keep BullMQ on managed Redis | Confirm queue bootstrap and Redis URL target | Preserve current Redis path and queue code |
| Object storage | Cloudflare R2 | Keep storage on R2 | Confirm storage config and retention flow | Preserve object keys and expiry metadata |
| AI backend | Replicate | Route AI jobs only through provider layer | Confirm provider abstraction and Replicate-only behavior | Preserve legacy provider abstraction until stable |
| Payments | Existing gateway | Keep payment flow as-is for Phase 1 | Confirm payment routes and webhook behavior | Preserve payment status and wallet records |
| Monitoring | Existing monitoring | Keep monitoring endpoints and admin views | Confirm queue/worker/health endpoints | Preserve monitoring routes and logs |

## 3 Railway

### Required services

- `Verification Required`

### Environment variables

- `Verification Required`

### Secrets

- `Verification Required`

### Persistent volumes

- `Verification Required`

### Health checks

- `Verification Required`

### Decision

- `POSTPONE`

## 4 Neon

### Database

- `Verification Required`

### Prisma

- `Verification Required`

### Connection

- `Verification Required`

### Backup

- `Verification Required`

### Migration policy

- `Verification Required`

### Decision

- `POSTPONE`

## 5 Redis

### Chosen provider

- Memorystore-backed Redis

### BullMQ

- BullMQ remains the queue engine.

### Retry

- Preserve retry and backoff behavior through the existing queue layer.

### Persistence

- Queue state persistence remains `Verification Required` until the exact managed provider is proven in production.

## 6 Cloudflare

### Pages

- Keep public frontend on Cloudflare Pages.

### R2

- Keep object storage on R2.

### DNS

- `Verification Required`

### Caching

- `Verification Required`

## 7 Replicate

### API key

- Keep server-side only.

### Provider

- Replicate is the only Phase 1 AI provider.

### Polling

- Worker-driven polling until terminal state.

### Model chain

- `Verification Required`

### Cost logging

- Keep provider cost logging in the provider layer.

## 8 Services NOT Used

### Northflank

- Decision: `POSTPONE`

### RunPod

- Decision: `POSTPONE`

### Cloud Run GPU

- Decision: `POSTPONE`

### Legacy AI services

- Decision: `REMOVE LATER`

## 9 Deployment Order

1. Confirm Cloud Run API runtime remains the canonical API path.
2. Confirm Cloudflare Pages remains the canonical frontend path.
3. Confirm Cloud SQL is the canonical PostgreSQL backend.
4. Confirm Memorystore is the canonical Redis backend.
5. Confirm R2 remains the canonical object storage backend.
6. Confirm Replicate remains the only AI backend.
7. Confirm payment, auth, and monitoring dependencies are still wired to the same runtime paths.
8. Confirm rollback artifacts remain intact before any implementation begins.

## 10 Final Readiness

- The target stack is intentionally single-path for Phase 1.
- Any unresolved provider, database, or queue ownership remains `Verification Required`.
- No removal or cutover is authorized by this document.

## Final Status

**Infrastructure frozen?** No  
**Remaining blockers:** canonical production DB, active Redis provider, exact Replicate model identifiers, final Phase 1 route subset, and any production-only infrastructure behavior not visible in local source  
**Migration readiness %:** 65%  
**Estimated implementation duration:** 2-6 weeks after remaining `Verification Required` items are resolved


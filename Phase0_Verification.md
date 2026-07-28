# Phase 0 Verification Report

**Source inputs:** [ReplicateBM.md](./ReplicateBM.md), [ReplicateExecutionPlan.md](./ReplicateExecutionPlan.md)  
**Mode:** Planning only  
**Constraint:** No code changes, no deployments, no deletions

## 1 Database

### Canonical production DB

- Status: `Verification Required`
- Evidence: Prisma is configured for PostgreSQL and deployment artifacts reference Cloud SQL, but the live canonical production database is not proven from local source evidence alone.
- Impact: All data persistence, migration, and rollback decisions depend on this.

### Prisma usage

- Status: `Verified`
- Evidence: `apps/api/prisma/schema.prisma` exists, the API bootstrap calls `prisma migrate deploy`, and Prisma client dependencies are present.
- Impact: Migration and schema management are clearly in use.

### Active migrations

- Status: `Verification Required`
- Evidence: Migration folders exist, but production-applied migration state is not confirmed.
- Impact: Schema compatibility could still drift if production is behind.

## 2 Queue

### BullMQ

- Status: `Verified`
- Evidence: `bullmq` is a dependency and the worker bootstrap imports BullMQ.
- Impact: Phase 1 async processing depends on this queue layer.

### Redis provider

- Status: `Verification Required`
- Evidence: `REDIS_URL` is required by config, but the active managed provider behind it is not proven here.
- Impact: Queue execution and watchdog behavior depend on it.

### Upstash vs Memorystore

- Status: `Verification Required`
- Evidence: Both are referenced in planning material, but neither is proven as the live production provider.
- Impact: Production queue topology is still unresolved.

## 3 Storage

### R2

- Status: `Verified`
- Evidence: `STORAGE_PROVIDER` defaults to `r2`, and R2 credentials are required unless mock storage is used.
- Impact: Object storage is part of the active architecture.

### Signed URLs

- Status: `Verification Required`
- Evidence: Order schema includes expiring URL fields, but runtime signing behavior is not proven in this pass.
- Impact: Download security and preview access require confirmation.

### Upload/download flow

- Status: `Verified`
- Evidence: Order, restoration, and storage fields/routes exist for originals and processed assets.
- Impact: File persistence and retrieval are core to Phase 1.

## 4 Authentication

### Customer

- Status: `Verified`
- Evidence: Customer auth routes, frontend auth helpers, and route guards exist.
- Impact: Customer access is required for order and restoration flows.

### Admin

- Status: `Verified`
- Evidence: Admin auth routes, middleware, and admin portal guards exist.
- Impact: Admin triage and monitoring rely on this.

### JWT

- Status: `Verified`
- Evidence: `JWT_SECRET` and `ADMIN_JWT_SECRET` are required by config.
- Impact: Session and route protection depend on JWT correctness.

## 5 Payments

### Complete payment flow

- Status: `Verified`
- Evidence: Payment create, proof, webhook, and status routes exist.
- Impact: Revenue collection and order activation depend on this flow.

### Wallet

- Status: `Verified`
- Evidence: Wallet and wallet transaction models and pages exist.
- Impact: Credit reservation, settlement, and refunds depend on it.

### Packages

- Status: `Verified`
- Evidence: Package schema, package routes, and package UI exist.
- Impact: Pricing and checkout selection depend on it.

## 6 AI

### Exact Replicate models

- Status: `Verification Required`
- Evidence: Replicate provider code exists, but the final Phase 1 model chain is not locked in this verification pass.
- Impact: Restoration/background removal behavior cannot be finalized yet.

### Provider abstraction

- Status: `Verified`
- Evidence: Multiple provider, router, policy, and pipeline classes exist under `apps/api/src/restoration-providers`.
- Impact: This is a real architectural dependency and the source of most migration complexity.

### Remaining local providers

- Status: `Verified`
- Evidence: Local or alternate provider implementations exist for background removal, restoration, enhancement, and classification.
- Impact: These are legacy/alternative paths that must be accounted for in cleanup planning.

## 7 API

### Routes actually required for Phase 1

- Status: `Verification Required`
- Evidence: Candidate routes are documented in the migration plans, but the final launch subset still needs confirmation.
- Impact: Route pruning and simplification should not begin until the minimal set is validated.

### Routes to postpone

- Status: `Verified`
- Evidence: Creative studio, some subscription/admin surfaces, and provider comparison surfaces are documented as out of Phase 1 scope.
- Impact: These can remain documented but should not be treated as launch blockers.

## 8 Infrastructure

### Railway

- Status: `Verification Required`
- Evidence: Strongly present in docs and scripts, but not proven as canonical production runtime.

### Northflank

- Status: `Verification Required`
- Evidence: Referenced in docs and planning artifacts, but not proven live.

### Cloudflare

- Status: `Verified`
- Evidence: R2 and Pages references are present across the repository.

### Neon

- Status: `Verification Required`
- Evidence: Mentioned in docs and plans, but the active production DB backend is not proven.

### RunPod

- Status: `Verification Required`
- Evidence: Config and docs support RunPod-style endpoint references, but live use is not confirmed.

### GCP

- Status: `Verified`
- Evidence: Cloud Run, Cloud Build, Cloud SQL, and Artifact Registry artifacts are present.

## 9 External Services

| Service | Purpose | Required? | Can Remove? | Depends On |
|---|---|---:|---:|---|
| Cloud Run | Production API runtime | Yes | No | Container build, env config |
| Cloud Build | Build and deploy images | Yes | No | Registry and service config |
| Artifact Registry | Image storage | Yes | No | Cloud Build, Cloud Run |
| Cloud SQL | PostgreSQL hosting | `Verification Required` | No now | Prisma, app persistence |
| Memorystore | Managed Redis | `Verification Required` | No now | BullMQ queue, watchdogs |
| Upstash | Alternate Redis | `Verification Required` | Yes later | Queue backend alternative |
| Cloudflare | Pages/R2 ecosystem | Yes | No | Storage and frontend delivery |
| R2 | Object storage | Yes | No | Upload/download flow |
| Replicate | AI processing | Yes | No | Restoration and background removal |
| Railway | Alternate hosting | No for Phase 1 | Yes later | Legacy docs/scripts |
| Northflank | Alternate hosting | No for Phase 1 | Yes later | Legacy docs/scripts |
| Neon | Alternate DB target | No unless proven live | Yes later | Database selection |
| RunPod | Alternate AI/runtime | No for Phase 1 | Yes later | Legacy AI/provider stack |

## 10 Final Dependency Graph

```text
Phase 1 Launch
  ├─ Customer auth
  ├─ Admin auth
  ├─ Database
  │   ├─ Prisma
  │   ├─ Orders
  │   ├─ Payments
  │   ├─ Wallet
  │   └─ Jobs/Audit
  ├─ Queue
  │   ├─ BullMQ
  │   └─ Redis provider
  ├─ Storage
  │   └─ R2
  ├─ AI
  │   └─ Replicate
  ├─ API routes
  │   ├─ Upload/save/status/result/download
  │   ├─ Orders/payments/packages
  │   └─ Admin triage and monitoring
  └─ Infrastructure
      ├─ Cloud Run
      ├─ Cloud Build
      ├─ Artifact Registry
      ├─ Cloud SQL or verified canonical DB
      └─ Secret/ops layer
```

## Verified Items

- Prisma is used.
- BullMQ is used.
- R2 is used.
- Customer and admin JWT auth are used.
- Payments, wallets, and packages are used.
- Replicate support exists.
- Cloud Run and Cloud Build artifacts exist.
- Cloudflare and GCP artifacts exist.

## Remaining Blockers

- Canonical production DB.
- Active migration state.
- Active Redis provider.
- Exact Replicate model chain.
- Confirmed Phase 1 route subset.
- Confirmed production infra ownership for alternate platforms.

## Migration Readiness %

- `45%`

## Estimated Implementation Effort

- `2-6 weeks` after all `Verification Required` items are resolved


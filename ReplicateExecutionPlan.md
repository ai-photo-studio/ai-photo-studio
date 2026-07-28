# Replicate Execution Plan

**Source of truth:** [ReplicateBM.md](./ReplicateBM.md)  
**Mode:** Planning only  
**Constraint:** No code changes, no deployments, no deletions

## 1 Executive Summary

### Current architecture

The current system is a broad AI photo studio stack with:

- Express API and React frontend
- Prisma/PostgreSQL data layer
- BullMQ/Redis queueing
- Cloud Run deployment artifacts
- R2 storage
- WhatsApp, payments, admin, monitoring, and analytics
- Multiple AI providers, local services, benchmark scripts, and legacy infrastructure references

### Target architecture

Phase 1 target is a narrower commercial SaaS with:

- Replicate as the only AI processing backend
- Old Photo Restoration
- Background Removal
- Existing auth, orders, payments, storage, queueing, and admin support retained
- Future features documented but not implemented

### Migration principles

- Preserve rollback at every step
- Keep runtime behavior stable until a single dependency is validated
- Change one layer at a time
- Verify with runtime evidence, not assumptions
- Avoid deleting anything during execution planning
- Keep unsupported features visible but inactive

## 2 Validation

Classification is based on [ReplicateBM.md](./ReplicateBM.md). Anything not fully proven from local evidence is marked `Verification Required`. Nothing is marked `Blocked` as a hard stop yet because the planning phase can proceed, but several prerequisites must be validated before execution.

### Verified

- Phase 1 scope is limited to Old Photo Restoration and Background Removal
- Customer auth exists
- Admin auth exists
- Orders, payments, storage, queueing, and monitoring exist
- Cloud Run, Cloud Build, Docker, R2, Redis, Replicate, Railway, Northflank, Neon, RunPod, Upstash references exist in the repo
- Replicate is already supported in config and docs
- `ReplicateBM.md` identifies a large number of legacy/local AI provider paths
- `.gitignore` contains `AI_code_audit_report_RI.md` only once

### Verification Required

- Active production database backend
- Active queue backend
- Active storage backend
- Canonical deployment path
- Whether WhatsApp is live in the customer flow
- Whether subscriptions are active in Phase 1 launch scope
- Whether print fulfillment is active or documented only
- Whether any GitHub Actions workflow is actively used
- Whether some provider/worker tables are redundant and safe to merge
- Exact Replicate model chain for each AI feature
- Exact webhook validation behavior for each provider

### Blocked

- No execution phase is blocked at planning time
- Implementation of any phase is blocked until the corresponding prerequisite verification is completed

### Dependency

- Replicate integration depends on storage, queueing, and job persistence
- Background removal and restoration depend on upload, order, and status APIs
- Deployment cleanup depends on confirmed runtime evidence for active infrastructure
- Database merge decisions depend on observed job and audit usage

## 3 Implementation Phases

Each phase is intentionally small and rollback-friendly.

### Phase 0 - Evidence Lock

**Goal**  
Confirm the canonical runtime stack before any implementation begins.

**Files**  
`ReplicateBM.md`, `AI_code_audit_report_RI.md`

**Dependencies**  
None

**Expected result**  
Every `Verification Required` item has an evidence owner and a verification path.

**Rollback**  
No code or infrastructure changes are made, so rollback is not needed.

**Verification**  
Cross-check current runtime evidence against `ReplicateBM.md`.

**Estimated time**  
0.5-1 day

### Phase 1 - AI Backend Consolidation

**Goal**  
Define the exact Replicate-only execution path for restoration and background removal.

**Files**  
`ReplicateBM.md`

**Dependencies**  
Verified AI feature mapping, verified Replicate models, verified storage path

**Expected result**  
One AI backend decision per Phase 1 feature.

**Rollback**  
Keep legacy provider assumptions documented until the new path is proven.

**Verification**  
Confirm input, status, result, and download handling for both features.

**Estimated time**  
1-2 days

### Phase 2 - API Boundary Mapping

**Goal**  
Map the minimal API surface needed for upload, save, Replicate, status, result, and download.

**Files**  
`ReplicateBM.md`

**Dependencies**  
Phase 1 AI backend decision

**Expected result**  
A strict route-by-route keep/postpone/merge plan.

**Rollback**  
No implementation changes yet.

**Verification**  
Validate that every required customer and admin call has a target endpoint.

**Estimated time**  
0.5-1 day

### Phase 3 - Data Model Triage

**Goal**  
Classify database tables into keep, merge, future, or remove-later groups.

**Files**  
`ReplicateBM.md`

**Dependencies**  
Verified table usage and job lifecycle evidence

**Expected result**  
Clear decision boundaries for `ProcessingJob`, `AiJob`, `ImageQualityScore`, `ProviderCostLog`, and related tables.

**Rollback**  
No schema changes are applied in this plan.

**Verification**  
Confirm which tables are active in production workflows.

**Estimated time**  
1 day

### Phase 4 - Infrastructure Decision Lock

**Goal**  
Select the single production infrastructure path and label alternatives as postponed.

**Files**  
`ReplicateBM.md`

**Dependencies**  
Verified runtime and deployment evidence

**Expected result**  
One primary deployment target and one primary database/queue/storage stack.

**Rollback**  
Preserve alternative infrastructure references in documentation only.

**Verification**  
Confirm Cloud Run, Cloud Build, Artifact Registry, Cloud SQL, Memorystore, Secret Manager, Cloudflare, and R2 roles.

**Estimated time**  
1 day

### Phase 5 - Cleanup Candidate Inventory

**Goal**  
Enumerate legacy files, scripts, docs, and services for later removal.

**Files**  
`ReplicateBM.md`

**Dependencies**  
Phases 0-4

**Expected result**  
A non-destructive cleanup list with no deletions.

**Rollback**  
No deletions are performed.

**Verification**  
Check that each cleanup candidate is truly outside the Phase 1 path.

**Estimated time**  
0.5-1 day

### Phase 6 - Commercial Launch Gate

**Goal**  
Define the minimum launch-ready checklist for a Replicate-first product.

**Files**  
`ReplicateBM.md`

**Dependencies**  
Validated plan from prior phases

**Expected result**  
Launch gate criteria and launch blockers are explicit.

**Rollback**  
Launch is not executed in this task.

**Verification**  
Confirm customer flow, admin triage, monitoring, and rollback readiness.

**Estimated time**  
0.5 day

## 4 Migration Order

Only one task should be active at any time.

1. Confirm canonical runtime evidence
   - Prerequisite: access to current deployment/runtime records
2. Confirm Phase 1 AI scope
   - Prerequisite: Phase 0 evidence lock
3. Confirm Replicate model chain for restoration
   - Prerequisite: AI scope confirmation
4. Confirm Replicate model chain for background removal
   - Prerequisite: AI scope confirmation
5. Confirm storage and download flow
   - Prerequisite: queue and job persistence evidence
6. Confirm API boundary map
   - Prerequisite: AI and storage flow confirmation
7. Confirm database table classification
   - Prerequisite: runtime table usage evidence
8. Confirm infrastructure target stack
   - Prerequisite: deployment and service evidence
9. Confirm rollback boundaries
   - Prerequisite: all prior confirmations
10. Confirm cleanup inventory
    - Prerequisite: all keep/replace decisions

## 5 Cleanup Order

Nothing is removed now. The following may eventually be removed after validation:

- Legacy local AI service folders
- Legacy provider framework under `apps/api/src/restoration-providers`
- Multi-provider benchmark scripts
- Model validation notebooks and scripts
- Alternate deployment configs for Railway and Northflank
- Legacy GPU service manifests
- Provider comparison reports
- Unused diagnostic artifacts
- Duplicate job-model surfaces if confirmed redundant
- Future-only UI surfaces that are not needed in Phase 1

## 6 Infrastructure Migration

Recommended order for infrastructure decisions:

1. Cloud Run
   - Keep as the primary app runtime unless runtime evidence contradicts it
2. Cloud Build
   - Keep as build/deploy automation if already active
3. Artifact Registry
   - Keep as the image registry
4. Cloud SQL
   - Verify canonical Postgres backend and keep or replace only after proof
5. Memorystore
   - Use as the managed Redis target if queueing is production-critical
6. Secret Manager
   - Adopt as the secret source for production values
7. Cloudflare
   - Keep for R2 and public delivery surfaces
8. R2
   - Keep as object storage
9. Replicate
   - Adopt as the only AI backend for Phase 1
10. Neon
    - Postpone or replace depending on verification of actual active backend
11. Upstash
    - Postpone unless a managed Redis fallback is needed
12. RunPod
    - Postpone because Phase 1 is Replicate-only
13. Railway
    - Postpone because it is not the recommended Phase 1 production path
14. Northflank
    - Postpone because it is not the recommended Phase 1 production path

## 7 Risk Review

### Phase 0

- **Risk:** Evidence gaps remain unresolved
- **Impact:** Later decisions may be based on incomplete data
- **Rollback:** None needed; this is read-only planning

### Phase 1

- **Risk:** Replicate output behavior differs from legacy provider behavior
- **Impact:** Customer quality or turnaround may change
- **Rollback:** Keep legacy provider documentation and routing assumptions until cutover proof exists

### Phase 2

- **Risk:** Over-simplifying the API could hide needed admin or customer actions
- **Impact:** Gaps in upload, status, or download flow
- **Rollback:** Preserve route inventory and existing endpoint contracts until verified

### Phase 3

- **Risk:** Misclassifying tables may lead to unnecessary schema work later
- **Impact:** Data model churn or accidental duplication
- **Rollback:** No schema changes in this plan

### Phase 4

- **Risk:** Picking the wrong canonical infra target
- **Impact:** Rollout complexity and duplicate operations
- **Rollback:** Keep all alternate infra references documented until verified

### Phase 5

- **Risk:** Cleanup candidates may still be referenced by scripts or docs
- **Impact:** False positives in future cleanup work
- **Rollback:** No deletions now

### Phase 6

- **Risk:** Launch checklist may omit a production dependency
- **Impact:** Launch delays or incident risk
- **Rollback:** Launch remains gated; no deployment in this task

## 8 Verification Checklist

### Phase 0

- **Success criteria:** All `Verification Required` items have owners and evidence sources
- **Evidence required:** Runtime snapshots, manifests, route lists, schema review
- **CLI verification:** `rg`, `Get-Content`, or equivalent local inspection only
- **Runtime verification:** Production logs or service descriptors

### Phase 1

- **Success criteria:** Replicate-only AI path is fully specified for both supported features
- **Evidence required:** Replicate request/response shape, model IDs, storage path
- **CLI verification:** Local source inspection only
- **Runtime verification:** Replicate-backed job evidence

### Phase 2

- **Success criteria:** Every required customer and admin action has a route target
- **Evidence required:** Route inventory and controller mapping
- **CLI verification:** Route tree inspection
- **Runtime verification:** None yet

### Phase 3

- **Success criteria:** Each table has a keep/merge/future/remove-later classification
- **Evidence required:** Prisma schema and usage references
- **CLI verification:** Schema inspection and code references
- **Runtime verification:** Job and admin data usage evidence

### Phase 4

- **Success criteria:** One production infra stack is selected and all alternates are postponed
- **Evidence required:** Service manifests, deployment files, environment docs
- **CLI verification:** File inspection only
- **Runtime verification:** Active service descriptors

### Phase 5

- **Success criteria:** Cleanup inventory is exhaustive but non-destructive
- **Evidence required:** File tree, route tree, docs inventory
- **CLI verification:** `rg --files`
- **Runtime verification:** Not required

### Phase 6

- **Success criteria:** Launch minimums are explicit and measurable
- **Evidence required:** Checklist completeness
- **CLI verification:** Document review only
- **Runtime verification:** Not allowed in this task

## 9 Commercial Launch Checklist

Minimum requirements before launch:

- Replicate-only AI path confirmed for Old Photo Restoration
- Replicate-only AI path confirmed for Background Removal
- Upload, save, status, result, and download flow confirmed
- Auth, orders, payments, and storage preserved
- Queueing and retry behavior verified
- Admin triage and monitoring verified
- Canonical database and storage targets confirmed
- Secrets and webhook validation reviewed
- Rollback path preserved
- Cleanup candidates documented but not removed

## 10 Final Roadmap

Complete execution order:

1. Validate runtime evidence
2. Confirm canonical infra and data targets
3. Confirm Replicate models and request flow
4. Confirm API boundary map
5. Confirm database table classifications
6. Confirm rollback boundaries
7. Produce cleanup inventory
8. Prepare launch checklist
9. Defer all deletions and deployments until implementation approval

## Final Status

**Overall migration readiness:** Medium, pending verification of runtime targets and AI model chain  
**Blocking items:** Canonical production DB, queue, storage, and exact Replicate implementation details  
**Estimated migration duration:** 2-6 weeks after verification and implementation approval  
**Project completion percentage:** 0% implementation, 100% planning


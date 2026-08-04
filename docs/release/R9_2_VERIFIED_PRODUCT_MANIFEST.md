# R9.2 Verified Product Manifest — Replicate Restoration MVP

Branch: `release/r9.2-replicate-mvp-v3`
Base: `main`
Date: 2026-08-04
Active production provider: **Replicate only** (`sczhou/codeformer`), per `rules.md`.

This manifest records exactly what was verified for the R9.2 Replicate
restoration MVP release, how it was verified, and what is deliberately NOT in
it. It is evidence, not narrative.

---

## 1. Provider-neutral decoupling (RunPod removed from the release path)

The R9.2 pipeline previously required five RunPod-named source files to
compile. Those files were **never tracked in git** — they existed only as
untracked working-tree files in this release worktree — and they are not part
of this release. They have been removed from the release worktree and nothing
in the Replicate/P3A/P3B path imports from them.

### 1.1 Import chains found (pre-repair)

| # | Chain | Symbols | Classification |
|---|-------|---------|----------------|
| 1 | `RestorationProviderRouter.ts` → `../runpod/RunPodRoutingConfig` | `evaluateRunPodAuthorization`, `RunPodConfigurationError`, `RunPodRoutingConfig` | `RUNPOD_IMPLEMENTATION` |
| 2 | `RestorationProviderRouter.ts` → `../runpod/RunPodEndpointIdentity` | `RunPodIdentityError`, `verifyRunPodEndpointIdentity`, `RunPodEndpointIdentitySnapshot` | `RUNPOD_IMPLEMENTATION` |
| 3 | `RestorationProviderRouter.ts` → `../runpod/RunPodObservability` | `logRunPodGuardRejection`, `logRunPodIdentityRejection`, `logRunPodRollbackState` | `RUNPOD_IMPLEMENTATION` |
| 4 | `RestorationProviderRouter.ts` → `../runpod/RunPodObservability` | `logProviderSelection` | `PROVIDER_NEUTRAL_CONTRACT` |
| 5 | `RestorationProviderRouter.test.ts` → `../runpod/RunPodRoutingConfig`, `../runpod/RunPodEndpointIdentity`, `../runpod/RunPodApprovedCandidate` | `RunPodConfigurationError`, `RunPodIdentityError`, `RunPodEndpointIdentitySnapshot`, `RUNPOD_APPROVED_CANDIDATE`, `RunPodRoutingConfig` | `TEST_ONLY_RUNPOD_COUPLING` |
| 6 | `p3a-replicate-execution-worker.test.ts` (local `selection` union member `"runpod"`) | — | `TEST_ONLY_RUNPOD_COUPLING` |
| 7 | `runpod/RunPodResultValidation.ts` | `RunPodResultValidationError`, `validateRunPodResult`, `RunPodResultValidationContext` | `DEAD_IMPORT` (imported by nothing) |

Verified to have **no** RunPod import at any depth:
`replicate-execution.worker.ts`, `RestorationExecutionPorts.ts`,
`DefaultRestorationExecutionPorts.ts`, `PipelineOrchestrator.ts`,
`RestorationExecutionCoordinator.ts`,
`p3a-replicate-execution-worker.pg-race.test.ts`,
`p3b-replicate-r2-canary.ts`, `p3b-replicate-r2-canary.test.ts`.

### 1.2 Neutral contracts extracted

| Old symbol / location | New symbol / location |
|---|---|
| `logProviderSelection` — `apps/api/src/restoration-providers/runpod/RunPodObservability.ts` | `logProviderSelection` — `apps/api/src/restoration-providers/pipeline/ProviderNeutralContracts.ts` (log message changed from `"RunPod router provider selection"` to `"Restoration provider selection"`; signature, level and fields unchanged) |

No other symbol in the five RunPod files described a provider-agnostic shape:
`RunPodRoutingConfig`, `RunPodEndpointIdentity`, `RunPodApprovedCandidate`
and `RunPodResultValidation` all encode RunPod-specific endpoint identity,
image digests, GPU/data-centre values and dispatch-authorization semantics.
None of them was copied, renamed, or re-created in a neutral file.

### 1.3 RunPod dependencies removed

Removed from the release worktree (all previously untracked; none were ever
committed on `main`, so none appear as added or modified files on this branch):

- `apps/api/src/restoration-providers/runpod/RunPodApprovedCandidate.ts`
- `apps/api/src/restoration-providers/runpod/RunPodEndpointIdentity.ts`
- `apps/api/src/restoration-providers/runpod/RunPodObservability.ts`
- `apps/api/src/restoration-providers/runpod/RunPodResultValidation.ts`
- `apps/api/src/restoration-providers/runpod/RunPodRoutingConfig.ts`

Removed from `RestorationProviderRouter.ts`:

- the `"runpod"` member of `RestorationProviderSelection`
- `runpodConfig`, `runpodIdentitySnapshot`, `runpodExecutorFactory` deps
- the entire `executeRunPod()` authorization/identity/dispatch branch

`RestorationProviderSelection` is now exactly `"replicate" | "mock"`. Both
route to the same Replicate/PipelineOrchestrator executor. Any other runtime
value throws `InvalidProviderSelectionError` before any executor is touched.
No fallback, retry-on-another-provider, or disabled-by-default compatibility
shim was added.

Frozen RunPod worker-image sources (`apps/api/runpod-worker-*`) and the RunPod
GitHub workflows were **not** touched; the freeze at tag
`runpod-hybrid-v2-freeze-2026-08-02` is unaffected by this release.

### 1.4 Zero-RunPod proof

- Static import scan for `restoration-providers/runpod` across `apps/api/src`:
  the only two hits are forbidden-token **assertion lists** inside
  `RestorationProviderRouter.test.ts` and
  `p3a-replicate-execution-worker.test.ts`. Zero import statements.
- Case-insensitive scan for `runpod` / `RUNPOD_` / `api.runpod.ai` across
  `apps/api/src/restoration-providers/pipeline/`: zero hits in any
  non-test file. `RestorationProviderRouter.ts` and
  `ProviderNeutralContracts.ts` contain no vendor name at all.
- `RestorationProviderRouter.test.ts` asserts the router source contains none
  of `runpod`, `RunPod`, `RUNPOD_`, `restoration-providers/runpod`,
  `runpodExecutorFactory`, `fallback`, `api.runpod.ai`.
- `p3a-replicate-execution-worker.test.ts` `(l2)` still asserts the worker
  source contains no `restoration-providers/runpod`, `RunPodProviderExecutor`,
  or `runpodExecutorFactory` reference.
- Runtime call counters: `p3a-replicate-execution-worker.test.ts` `(l)` and
  `p3a-replicate-execution-worker.pg-race.test.ts` `(pg8)` both assert
  `externalCallAttempts === 0` — a throwing `globalThis.fetch` spy. Both pass.
- `p3a-replicate-execution-worker.pg-race.test.ts` `(pg7)` asserts no
  RunPod-adjacent row was created. Passes.

---

## 2. Prisma / database repair

Root cause: this worktree's `apps/api/prisma/schema.prisma` was missing the
entire R9.2 additive model block, while the four R9.2 migrations that create
those tables were already present. The generated client therefore had no
`fixedOrder`, `restorationDraft`, `paymentAttempt`, `restorationEntitlement`,
`restorationMaster`, `replicateExecution`, `imageVariant`,
`digitalEntitlement`, `printEntitlement`, `addOnOrderLink`,
`fulfilmentOrder`, `shipment`, or `paymentEvent` delegate, producing 38
`TS2339`/`TS2551` typecheck errors.

Repairs applied (smallest possible; no new business logic, no new migration):

1. Appended the R9.2 additive enum/model block to
   `apps/api/prisma/schema.prisma` so the schema matches the migrations that
   already exist in this worktree. No model above the R9.2 marker comment was
   modified. Prisma package versions were **not** changed (`prisma` /
   `@prisma/client` `^5.20.0`, CLI 5.22.0) — there was no version conflict.
2. Made `apps/api/prisma/migrations/20260729000100_add_guest_ownership_token_hash/migration.sql`
   idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). The
   preceding migration `20260728_add_guest_ownership_token` already adds the
   same two columns idempotently, so a deploy from an empty database aborted
   with Postgres `42701 column "guestOwnershipTokenHash" of relation "Order"
   already exists`. The resulting schema is byte-identical; only the failure
   mode on re-application changed.
   *Operator note:* this edits a migration that is already applied in
   production. Prisma records a checksum per applied migration; confirm
   `prisma migrate status` against the production database before deploying.

### 2.1 Commands and exit codes

All DB-dependent commands ran against a **disposable local PostgreSQL 17.7**
cluster created with `initdb` in a scratch directory on `127.0.0.1:55437`,
with `DATABASE_URL` / `DISPOSABLE_DATABASE_URL` passed only as environment
variables scoped to the child command. Neither value was ever written to any
`.env` file. No Neon / Northflank / remote database was contacted.

| Command | Exit |
|---|---|
| `npx prisma validate` | 0 |
| `npx prisma generate` | 0 (Prisma Client v5.22.0) |
| `npx prisma migrate deploy` (from empty) | 0 — 21 migrations applied |
| `npx prisma migrate deploy` (second run) | 0 — "No pending migrations to apply." |
| `npx prisma migrate status` | 0 — "Database schema is up to date!" |
| `npm run typecheck` (api + web) | 0 |
| `npm run build` (api + web) | 0 |
| `npm run lint` | 0 (script is `eslint … \|\| exit 0`; no `eslint.config.js` exists on `main` — pre-existing, out of scope) |

---

## 3. Test evidence

Runner: `npx tsx --test`, from `apps/api`.

| Suite | Exit | Result |
|---|---|---|
| `src/domain/fixedOrder/fixedOrderGuards.test.ts` | 0 | pass |
| `src/domain/payment/paymentReadiness.test.ts` | 0 | pass |
| `src/domain/pricing/offerProvider.test.ts` | 0 | pass |
| `src/domain/pricing/priceBook.test.ts` | 0 | pass (9 internal PASS checks) |
| `src/domain/restorationDraft/imageValidation.test.ts` | 0 | pass |
| `src/domain/restorationDraft/market.test.ts` | 0 | pass |
| `src/domain/restorationDraft/uploadInputValidation.test.ts` | 0 | pass |
| `src/services/restoration-view.test.ts` | 0 | pass |
| `src/restoration-providers/pipeline/DefaultRestorationExecutionPorts.test.ts` | 0 | 6/6 |
| `src/restoration-providers/pipeline/RestorationExecutionCoordinator.test.ts` | 0 | 7/7 |
| `src/restoration-providers/pipeline/RestorationProviderRouter.test.ts` | 0 | 7/7 |
| `src/services/p3a-replicate-execution-worker.test.ts` | 0 | **24/24** |
| `src/services/p3a-replicate-execution-worker.pg-race.test.ts` (real disposable PG 17.7) | 0 | **10/10** |
| `src/scripts/p3b-replicate-r2-canary.test.ts` | 0 | **21/21** |

### 3.1 Repair iterations

1. **38 Prisma typecheck errors** → appended the missing R9.2 model block to
   `schema.prisma`, ran `prisma generate` → typecheck exit 0.
2. **`migrate deploy` from empty failed (42701)** → made the
   `20260729000100` migration idempotent → deploy exit 0, second deploy
   no-op, status clean.
3. **`RestorationProviderRouter.test.ts` 6/7** — the new source-scan guard
   failed because the router's own doc comment used the words "RunPod" and
   "fallback" → reworded the comment (no logic change) → 7/7. The guard was
   left strict; it was not weakened to accommodate the source.

### 3.2 P3B dry-run evidence

`DISPOSABLE_DATABASE_URL=… npx tsx src/scripts/p3b-replicate-r2-canary.ts --dry-run` → exit **0**

```
--dry-run: mocked Replicate + mocked R2, real disposable PostgreSQL
  disposable postgres: initdb exit 0 (password file deleted immediately)
  disposable postgres: started and identity-verified on 127.0.0.1:45697
  disposable postgres: createdb + prisma migrate deploy from empty, exit 0
  first invocation outcome: SUCCEEDED
  replay invocation outcome: INELIGIBLE
  replay safety: PROVEN (zero additional provider/storage/commit calls)
  counts: claims=1 providerCalls=1 downloads=1 uploads=1 commits=1 deletes=0
  cleanup: postgresStopped=true tempDirRemoved=true portFreed=true residualExecutionRows=0
  canary key layout (not written in dry-run): canary/r9.2/<run-id>/source.png, canary/r9.2/<run-id>/master.png
  RESULT: dry-run PASSED
```

`--live-canary` was **not** run and is not authorized by this release.

### 3.3 Zero-side-effect confirmation

- Zero RunPod calls (no RunPod code remains in the release path).
- Zero live Replicate calls — every provider port in every suite is an
  in-process mock; `globalThis.fetch` is a throwing spy.
- Zero real R2 writes — storage ports are mocks; the dry-run only prints the
  key layout it *would* use.
- Zero Bank Alfalah / payment-gateway calls — payment state is seeded rows only.
- Zero production-database access — only the disposable loopback PostgreSQL
  17.7 instances, guarded by the fail-closed loopback/blocked-host check in
  the pg-race test and canary runner.

---

## 4. Release file list

Modified:

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260729000100_add_guest_ownership_token_hash/migration.sql`

Added:

- `apps/api/prisma/migrations/20260802183254_r92_p0a_fixed_order_foundation/migration.sql`
- `apps/api/prisma/migrations/20260803000000_r92_p1a_fixed_order_source_draft_unique/migration.sql`
- `apps/api/prisma/migrations/20260803010000_r92_p1b_fixed_order_item_pricing_provenance/migration.sql`
- `apps/api/prisma/migrations/20260803020000_r92_p1c_b_fixed_order_pricebook_snapshot/migration.sql`
- `apps/api/src/domain/fixedOrder/fixedOrderGuards.ts`
- `apps/api/src/domain/fixedOrder/fixedOrderGuards.test.ts`
- `apps/api/src/domain/payment/paymentReadiness.ts`
- `apps/api/src/domain/payment/paymentReadiness.test.ts`
- `apps/api/src/domain/pricing/approvedOfferProvider.ts`
- `apps/api/src/domain/pricing/offerProvider.ts`
- `apps/api/src/domain/pricing/offerProvider.test.ts`
- `apps/api/src/domain/pricing/priceBook.ts`
- `apps/api/src/domain/pricing/priceBook.test.ts`
- `apps/api/src/domain/pricing/priceBookValidator.ts`
- `apps/api/src/domain/restorationDraft/imageValidation.ts`
- `apps/api/src/domain/restorationDraft/imageValidation.test.ts`
- `apps/api/src/domain/restorationDraft/market.ts`
- `apps/api/src/domain/restorationDraft/market.test.ts`
- `apps/api/src/domain/restorationDraft/uploadInputValidation.test.ts`
- `apps/api/src/restoration-providers/pipeline/ProviderNeutralContracts.ts`
- `apps/api/src/restoration-providers/pipeline/RestorationExecutionPorts.ts`
- `apps/api/src/restoration-providers/pipeline/DefaultRestorationExecutionPorts.ts`
- `apps/api/src/restoration-providers/pipeline/DefaultRestorationExecutionPorts.test.ts`
- `apps/api/src/restoration-providers/pipeline/RestorationExecutionCoordinator.ts`
- `apps/api/src/restoration-providers/pipeline/RestorationExecutionCoordinator.test.ts`
- `apps/api/src/restoration-providers/pipeline/RestorationProviderRouter.ts`
- `apps/api/src/restoration-providers/pipeline/RestorationProviderRouter.test.ts`
- `apps/api/src/services/replicate-execution.worker.ts`
- `apps/api/src/services/p3a-replicate-execution-worker.test.ts`
- `apps/api/src/services/p3a-replicate-execution-worker.pg-race.test.ts`
- `apps/api/src/scripts/p3b-replicate-r2-canary.ts`
- `apps/api/src/scripts/p3b-replicate-r2-canary.test.ts`
- `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` (this file)

Explicitly **not** staged: any `.env` file or secret value, `node_modules`,
any RunPod source file, temporary evidence/log/disposable-database artifacts,
Agent Manager / CLI-automation files, `AI_code_audit_report_RI.md`.

The P3A worker is still not exported from any controller, route, or queue
processor — asserted by `p3a-replicate-execution-worker.test.ts` `(k)`.
Opening this PR does not activate live customer processing.

---

## 5. Protected Scope Protocol

This manifest is release evidence. It is **append-only**.

1. Do not rewrite, condense, or "tidy" any section above. Corrections are
   appended as a dated amendment section, with the original text left intact.
2. Any claim in this manifest may only be changed by re-running the exact
   command that produced it and recording the new exit code alongside the old.
3. The zero-RunPod, zero-live-call, and disposable-database-only guarantees in
   sections 1.4 and 3.3 must not be relaxed. Re-introducing any RunPod import,
   routing branch, endpoint, or fallback into the Replicate release path
   requires a new, separately authorized packet and an explicit amendment here.
4. The migration-checksum caveat in section 2 must be resolved (or explicitly
   waived by the operator) before any production `migrate deploy`.
5. An open pull request is not a merge and not a deployment. This document
   records verification only; it does not authorize activation, live canary
   runs, or production release.

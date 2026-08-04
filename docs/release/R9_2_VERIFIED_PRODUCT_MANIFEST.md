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

---

## 6. R9.2-P4A — Verified-payment-to-execution-queue transaction boundary (2026-08-04)

Branch: `feat/r9.2-p4a-payment-queue`. This section is a dated amendment,
appended per the Protected Scope Protocol above. Nothing in sections 1–5 was
changed.

### 6.1 What this packet builds

`apps/api/src/services/p4a-payment-verified-execution-queue.service.ts`
exports one function, `applyVerifiedPaymentEvidence`, which accepts
NORMALIZED, ALREADY-VERIFIED payment evidence (order id, attempt id,
provider, provider event id, provider reference, amount, currency, a
content-derived dedupe hash) from a function-call interface representing a
future, separately authorized trusted gateway adapter. In one
`prisma.$transaction` it: loads and matches the `FixedOrder`/`PaymentAttempt`
pair; rejects on amount/currency/provider/provider-reference mismatch or a
disallowed attempt state; appends a deduplicated `PaymentEvent`; marks the
`PaymentAttempt` `PAID`; locks the `FixedOrder` (`status: LOCKED`,
`lockedAt`); and creates-or-reuses exactly one `RestorationEntitlement`,
`RestorationMaster`, and `ReplicateExecution` (status `QUEUED`, deterministic
`idempotencyKey` via the existing
`computeReplicateExecutionIdempotencyKey` from `fixedOrderGuards.ts`). It
never calls Replicate, R2, or any network endpoint, and it never modifies the
P3A worker's claiming logic (`replicate-execution.worker.ts` is untouched).

No new Prisma migration was required or added: every field and unique
constraint this packet relies on (`PaymentAttempt.amountMinor/currency/
providerRef`, `PaymentEvent.dedupeHash` unique, `RestorationEntitlement.
fixedOrderId` unique, `RestorationMaster.restorationEntitlementId` unique,
`ReplicateExecution.restorationMasterId`/`idempotencyKey` unique) already
existed in the R9.2 schema block recorded in section 2.

### 6.2 Blocker ledger (repo-wide grep for BLOCKED / REAL_PRODUCT_DEFECT / OWNER_ACTION_REQUIRED / ENVIRONMENT_ONLY / DEFERRED)

25 files matched, case-sensitive substring only (not whole-word), excluding
`node_modules`. Every P4A-scope-relevant hit classified below; all others are
either unrelated identifier names (`ORDER_BLOCKED_STATUSES`,
`ATTEMPT_BLOCKED_STATUSES` in `paymentReadiness.ts` — plain constant names,
not blocker markers), RunPod-gate documentation already covered by sections
1–5 and the RunPod freeze, or third-party browser-extension bundled files
under `.codex/chrome-ops105/**` (not part of this repository's source; not
inspected further; **FALSE_BLOCK / not-applicable**):

| File | Classification |
|---|---|
| `apps/api/src/services/p3a-replicate-execution-worker.pg-race.test.ts` | test file names its own `BLOCKED_PATTERNS` array (managed-DB host denylist) — **FALSE_BLOCK**, not a defect marker |
| `apps/api/src/domain/payment/paymentReadiness.ts` | `ORDER_BLOCKED_STATUSES` / `ATTEMPT_BLOCKED_STATUSES` are domain constant names, already-shipped and reused unchanged by this packet — **FALSE_BLOCK** |
| `scripts/safe-*` (6 files) | shell-script safety guard identifiers (`safe-git-push`, `safe-deploy`, `safe-r2-check`) — **FALSE_BLOCK**, out of P4A scope |
| `docs/restoration/RUNPOD_*`, `.github/workflows/verify-basicsr-*` | RunPod Gate 2/3 approval and freeze documentation — **EXTERNAL_DEPENDENCY / already governed by the RunPod freeze in section 39-44 of `rules.md`**; out of P4A scope |
| `.codex/chrome-ops105/**` bundled extension JS | third-party vendor code, not part of this application — **not applicable** |

No `ACTIVE_PRODUCT_DEFECT` was found anywhere in the payment-verification ->
execution-queue path. Nothing was previously mislabeled as blocked in this
area — the P4A transaction boundary was genuinely **not yet implemented**,
not blocked: `paymentReadiness.ts` and `fixedOrderGuards.ts` already existed
as reusable pure domain logic (see section 6.1), but no service called them
to actually write the `PaymentEvent`/entitlement/master/execution chain.

### 6.3 Trust boundary

`applyVerifiedPaymentEvidence` is not registered on any Express router and is
not imported by any controller. Confirmed by a static source scan
(`p4a-payment-verified-execution-queue.service.pg-race.test.ts` test `(q10)`)
of every file under `apps/api/src/controllers/` and `apps/api/src/routes/`
for a reference to the module or function name — zero hits. The legacy
`apps/api/src/controllers/payment.controller.ts` / `routes/payment.routes.ts`
were checked and confirmed to operate on the older `Order`/`PaymentStatus`
models only; they contain no reference to `FixedOrder`, `PaymentAttempt`, or
this new module. Mismatched/attacker-shaped evidence (wrong amount, wrong
currency, wrong provider reference, wrong provider, disallowed attempt state,
malformed shape) is also rejected at the data-consistency layer even if this
function were ever mis-wired to an entry point later — tests `(q4)`–`(q9)`.

### 6.4 Test evidence

Runner: `npx tsx --test`, from `apps/api`, against a disposable local
PostgreSQL 17.7 cluster (`initdb`/`pg_ctl`/`createdb` on `127.0.0.1`, random
port, `DATABASE_URL`/`DISPOSABLE_DATABASE_URL` passed only as environment
variables, never written to `.env`).

| Command | Exit |
|---|---|
| `npx prisma validate` | 0 |
| `npx prisma generate` | 0 (Prisma Client v5.22.0) |
| `npx prisma migrate deploy` (from empty) | 0 — 21 migrations applied |
| `npx prisma migrate deploy` (second run) | 0 — "No pending migrations to apply." |
| `npx prisma migrate status` | 0 — "Database schema is up to date!" |

| Suite | Exit | Result |
|---|---|---|
| `src/services/p4a-payment-verified-execution-queue.service.pg-race.test.ts` (new, real disposable PG 17.7) | 0 | **14/14** |
| `src/services/p3a-replicate-execution-worker.test.ts` (regression) | 0 | **24/24** (unmodified) |
| `src/services/p3a-replicate-execution-worker.pg-race.test.ts` (regression, real disposable PG 17.7) | 0 | **10/10** (unmodified) |
| `src/scripts/p3b-replicate-r2-canary.test.ts` (regression) | 0 | **21/21** (unmodified) |
| `src/scripts/p3b-replicate-r2-canary.ts --dry-run` (regression) | 0 | `RESULT: dry-run PASSED` (unmodified) |
| `npm run lint` (repo root) | 0 | one real `no-unused-vars` error was found and fixed in the new P4A test file during this packet; zero errors remain attributable to P4A files. Pre-existing `apps/web` lint errors (unrelated `.tsx` files already modified before this packet started) are out of scope and unchanged by this packet; the script's own exit-code policy is unchanged from section 2.1 |
| `npm run typecheck` (api + web) | 0 |
| `npm run build` (api + web) | 0 |

The 14 new P4A tests: `(q1)` happy path (attempt PAID, order LOCKED,
entitlement/master/execution created, execution QUEUED with the deterministic
key); `(q2)` exact-replay idempotency (zero duplicate rows); `(q3)` two REAL
concurrent `applyVerifiedPaymentEvidence` calls over the shared Postgres
connection pool converge on exactly one PaymentEvent/entitlement/master/
execution row via the DB's own unique constraints (no application-level
lock); `(q4)`–`(q8)` amount/currency/provider-reference mismatch, order/
attempt not found, and disallowed-terminal-attempt-state rejections, each
proven to write nothing; `(q9)` malformed/manual-input-shaped evidence is
rejected before any business-state read; `(q10)` the trust-boundary
controller/route scan; `(q11)` out-of-scope tables (`ImageVariant`,
`DigitalEntitlement`, `PrintEntitlement`, `AddOnOrderLink`, `FulfilmentOrder`,
`Shipment`) are never touched; `(q12)` zero external network calls (throwing
`globalThis.fetch` spy, `externalCallAttempts === 0`); `(q13)` full teardown.

### 6.5 Disposable PostgreSQL cleanup evidence

`pg_ctl -D <tempdata> -m fast -w stop` reported `server stopped`. A
subsequent `Test-NetConnection 127.0.0.1:<port>` reported
`TcpTestSucceeded: False`, confirming the port was released. The temporary
data directory was then deleted (`Remove-Item -Recurse -Force`) and confirmed
absent. No real/system PostgreSQL installation or data directory was touched
at any point — only a throwaway `initdb` cluster created and destroyed inside
this session's scratch directory.

### 6.6 Deferred Bank Alfalah adapter note

This packet deliberately contains **zero** Bank Alfalah protocol knowledge:
no signature verification, no callback field names, no endpoint URLs, no
credentials. The `VerifiedPaymentEvidence` input type is a plain, provider-
neutral normalized shape. Building the actual trusted gateway adapter that
verifies a real Bank Alfalah callback/return and calls
`applyVerifiedPaymentEvidence` with the result is explicitly out of scope and
is a separate, later, owner-authorized packet — consistent with the payment
manual-proof-mode state recorded in `rules.md`.

### 6.7 Confirmation this does not activate live processing

Opening the PR for this packet does not activate live customer payment
verification or live restoration processing: `applyVerifiedPaymentEvidence`
has no caller anywhere in this repository (proved by test `(q10)` and by the
absence of any import of the module outside its own test file), and the P3A
worker it feeds (`replicate-execution.worker.ts`) is likewise still not
exported from any controller, route, or queue processor (unchanged, per
section 4). No RunPod, Replicate, R2, or Bank Alfalah network call is
possible from this code path (section 6.4, zero-network-call proof).

## 7. R9.2-P4B — Merge P4A + internal one-call worker runner (2026-08-04)

Branch: `feat/r9.2-p4b-worker-runner`, built from `origin/main` immediately
after PR #116 was merged. This section is a dated amendment, appended per the
Protected Scope Protocol above. Nothing in sections 1–6 was changed.

### 7.1 PR #116 merge result

PR #116 (`feat/r9.2-p4a-payment-queue`, head
`e62387520ee2d080112fec4c53b585ea4adb4dde`) was verified against its expected
five-file P4A scope (`p4a-payment-verified-execution-queue.service.ts`,
`p4a-payment-verified-execution-queue.service.pg-race.test.ts`,
`docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md`, `reports/LATEST.md`,
`rules.md`), `mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`, and no
required failing checks (no CI checks were configured on the branch at all).
No PR defect was found; it was merged normally (`gh pr merge 116 --merge`,
merge commit `822f21e98e25e1658435163daf43bf1e031426bd`) without deleting the
source branch, without a force-push, and without squashing, matching this
repository's established merge-commit convention (`git log --merges`).

### 7.2 What this packet builds

`apps/api/src/services/p4b-internal-worker-runner.service.ts` exports
`InternalWorkerRunner` (a single-concurrency, bounded poll/backoff loop with
cooperative graceful shutdown) and `PrismaQueuedExecutionCandidateRepository`
(a read-only "peek" for the oldest `ReplicateExecution` row with
`status = 'QUEUED'`, excluding ids the current process already proved
`INELIGIBLE` so a stuck/anomalous row cannot starve newer legitimate work).
`apps/api/src/scripts/p4b-worker-runner-main.ts` is the standalone process
entry point (`npm run worker:p4b`): it loads configuration via the same
`loadConfig()` the HTTP process uses (fail-closed on any missing required
variable), refuses to start unless `RESTORATION_PROVIDER === "replicate"`,
constructs the real, UNCHANGED P3A adapters
(`PrismaReplicateExecutionRepository`, `R2MasterPersistence`,
`PipelineOrchestratorProviderExecutor`), and wires `SIGTERM`/`SIGINT` to a
cooperative shutdown that always lets an in-flight `processReplicateExecution`
call finish before stopping. Root cause addressed: after P4A, QUEUED
`ReplicateExecution` rows existed with no process that would ever call the
P3A worker on them — this packet is exactly that process, and nothing else.

The runner never claims a row itself (the P3A worker's own atomic
`UPDATE ... WHERE status = 'QUEUED'` remains the only claim), never calls
`applyVerifiedPaymentEvidence` or mutates any payment/order row, never
creates a second `ReplicateExecution`, and never resubmits a terminal
(`SUCCEEDED`/`FAILED`) row (the P3A worker's own
`computeExecutionIneligibilityReasons` rejects it). Concurrency is fixed at 1
by construction: `InternalWorkerRunner.run` is one sequential `while` loop
with no `Promise.all`, no worker pool, and no concurrency configuration
knob. No new Express router, controller, or Prisma migration was added.

### 7.3 No HTTP surface (static proof)

`p4b-internal-worker-runner.service.pg-race.test.ts` test `(pg1)` walks every
file under `apps/api/src/routes/` and `apps/api/src/controllers/` and asserts
none references `p4b-internal-worker-runner.service` or
`p4b-worker-runner-main` — zero hits. `p4b-worker-runner-main.ts` is not
imported by `apps/api/src/index.ts` or by any file reachable from it; it is a
separate process entry point only reachable by direct execution
(`npm run worker:p4b` / `node dist/scripts/p4b-worker-runner-main.js`).

### 7.4 Test evidence

Runner: `npx tsx --test`, from `apps/api`, against a disposable local
PostgreSQL 17 cluster (`initdb`/`pg_ctl`/`createdb` on `127.0.0.1`, random
port, `DATABASE_URL`/`DISPOSABLE_DATABASE_URL` passed only as environment
variables, never written to `.env`).

| Command | Exit |
|---|---|
| `npx prisma migrate deploy` (from empty) | 0 — all migrations applied |

| Suite | Exit | Result |
|---|---|---|
| `src/services/p4b-internal-worker-runner.service.test.ts` (new, fake ports, no DB) | 0 | **13/13** |
| `src/services/p4b-internal-worker-runner.service.pg-race.test.ts` (new, real disposable PG 17) | 0 | **10/10** |
| `src/services/p4a-payment-verified-execution-queue.service.pg-race.test.ts` (regression) | 0 | **14/14** (unmodified) |
| `src/services/p3a-replicate-execution-worker.test.ts` (regression) | 0 | **24/24** (unmodified) |
| `src/services/p3a-replicate-execution-worker.pg-race.test.ts` (regression, real disposable PG 17) | 0 | **10/10** (unmodified) |
| `src/scripts/p3b-replicate-r2-canary.test.ts` (regression) | 0 | **21/21** (unmodified) |
| `src/scripts/p3b-replicate-r2-canary.ts --dry-run` (regression) | 0 | `RESULT: dry-run PASSED` (unmodified) |
| `npx tsc -p tsconfig.json --noEmit` (api) | 0 | clean |
| `npm run build` (api) | 0 | clean |
| `npx eslint` on the 4 new P4B files | 0 errors | 2 pre-existing-pattern `no-explicit-any` warnings on the required `globalThis.fetch` spy, identical to every other P3A/P4A test file |

The 13 fake-port unit tests prove: sequential concurrency-1 processing in
order; no overlapping in-flight calls (real timer-based overlap check);
empty-queue exponential backoff capped at `maxBackoffMs`; a per-process
exclude-list so an `INELIGIBLE` row cannot starve newer work; terminal
outcomes are recorded without resubmission; `requestStop()` halts the loop
promptly; an in-flight execution always finishes before shutdown takes
effect; candidate-lookup and worker-throw errors are logged without crashing
the loop; constructor fail-closed validation of `pollIntervalMs`/
`maxBackoffMs`; `maxIterations` bounding; and the `onResult` observability
hook fires once per processed execution with the true outcome.

The 10 real-Postgres tests prove: the migrated chain tables are reachable;
the static no-HTTP-route scan; an ineligible (unpaid) QUEUED row is picked up
and correctly left QUEUED, never claimed, by the real P3A worker; two
independent `InternalWorkerRunner` instances racing on one real QUEUED row
produce exactly one provider call and one `SUCCEEDED` outcome (with at most
one `CLAIM_LOST`, matching the same atomic-claim proof already established
for two concurrent P3A workers); restart/replay safety (a fresh runner
instance performs zero further provider/storage work once nothing new is
legitimately claimable); graceful shutdown end-to-end against the real DB (the
in-flight execution completes, then the loop stops); fail-closed startup
configuration (`startP4BWorkerRunnerProcess` refuses a non-`"replicate"`
`RESTORATION_PROVIDER` before constructing any port, and separately refuses
to start at all when a required env var is missing entirely, both via the
same `loadConfig()` gate the HTTP process uses); zero external network calls;
and full teardown.

### 7.5 Disposable PostgreSQL cleanup evidence

`pg_ctl -D <tempdata> -m fast -w stop` reported `server stopped`. A
subsequent `Test-NetConnection 127.0.0.1:<port>` reported
`TcpTestSucceeded: False`, confirming the port was released. The temporary
data directory was then deleted (`Remove-Item -Recurse -Force`) and confirmed
absent (`Test-Path` → `False`). No real/system PostgreSQL installation or
data directory was touched at any point.

### 7.6 Deployment expectation

`p4b-worker-runner-main.ts` is intended to run as its own Northflank
service/deployment, separate from the `api` HTTP service documented in
`reports/LATEST.md` — e.g. `npm run worker:p4b --workspace apps/api` in
development, or the built `dist/scripts/p4b-worker-runner-main.js` after
`npm run build` in production. Actually creating that Northflank service and
pointing it at live Replicate/R2 production credentials is explicitly out of
scope for this packet and remains a separate, later, owner-authorized action.

### 7.7 Deferred Bank Alfalah adapter note (unchanged)

Identical to section 6.6: this packet adds zero Bank Alfalah protocol
knowledge. `applyVerifiedPaymentEvidence` still has no caller anywhere in
this repository.

### 7.8 Confirmation this does not activate live processing

Opening the PR for this packet does not activate live customer payment
verification or live restoration processing. `applyVerifiedPaymentEvidence`
still has no caller (unchanged from section 6.7). The P4B runner exists as
code and is proven correct against a disposable database, but no Northflank
service was created or deployed, and no live Replicate/R2/Bank Alfalah
credential was read, constructed into a client, or called (section 7.4,
zero-network-call proof).

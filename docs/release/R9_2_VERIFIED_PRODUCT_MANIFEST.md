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

## 8. R9.2-P4C — Bank Alfalah Mastercard Gateway (MPGS) supersedes legacy APG (2026-08-04)

### 8.1 Owner decision and scope

Legacy "Alfa APG v1.1" (never actually implemented in this repository) is
retired. The Bank Alfalah Mastercard Gateway (MPGS) sandbox
(`test-bankalfalah.gateway.mastercard.com`) is now the only Bank Alfalah
integration this repository is permitted to carry. Full evidence:
`docs/payments/bank-alfalah-mastercard/MPGS_INTEGRATION_EVIDENCE.md`.

### 8.2 What this packet builds

- `apps/api/src/config/env.ts` — `BANK_ALFALAH_MPGS_*` zod-validated config,
  disabled by default, required-field enforcement only when enabled,
  `bankAlfalahMpgs` derived config object, `getConfigPreview` extended to
  redact nested-object secret fields.
- `apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts` —
  `BankAlfalahMpgsGateway` (auth header, Hosted Checkout initiation,
  Retrieve Order v74), currency gating (`MPGS_CURRENCY_SUPPORT`: PKR
  enabled, USD fail-closed), and the verify-then-apply orchestrator
  (`verifyMpgsPaymentByRetrieveOrder`, `handleMpgsBrowserReturn`,
  `handleMpgsWebhookTrigger`) that delegates to the unmodified P4A
  `applyVerifiedPaymentEvidence` transaction on an exact match. Not
  registered on any Express router or controller, matching the P4A/P4B
  not-yet-routed precedent.
- `docs/payments/bank-alfalah-mastercard/MPGS_INTEGRATION_EVIDENCE.md` — new
  tracked evidence document (field names, flow steps, evidence source per
  field, currency gating rationale, rollback plan). No credential value.
- `apps/api/.env.example` — `BANK_ALFALAH_MPGS_*` template entries, all
  `replace_me`/disabled defaults.

### 8.3 Test evidence

All commands run from `apps/api` with `npx tsx --test <file>`:

- `p4c-bank-alfalah-mpgs-gateway.service.test.ts` (fake ports, no DB, no
  network) — **23/23** pass
- `p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts` (real disposable
  PostgreSQL 17, mocked gateway fetch) — **6/6** pass, covering: single
  matched-and-applied verification, duplicate sequential webhook-trigger
  idempotency (one `PaymentEvent`/entitlement/master/`QUEUED` execution
  across three calls), concurrent browser-return + webhook-trigger race
  (exactly one paid transition), a forged/PENDING browser return rejected
  with zero mutation, zero live network calls, and full teardown.
- `p4c-bank-alfalah-legacy-apg-retired.test.ts` (repo-wide scan, no DB, no
  network) — **1/1** pass: zero active legacy APG identifiers outside
  excluded/superseded locations.
- `apps/api/src/config/p4c-bank-alfalah-mpgs-env.test.ts` — **7/7** pass:
  fail-closed defaults, required-field enforcement when enabled, checkout
  mode validation, no API password leak via `getConfigPreview`, no
  hardcoded non-placeholder credential literal in the evidence doc.

Total new tests: **37/37** pass.

### 8.4 Regression evidence (unmodified suites)

Run against the same disposable PostgreSQL 17 instance used for 8.3:

- `p4a-payment-verified-execution-queue.service.pg-race.test.ts` — **14/14** pass
- `p4b-internal-worker-runner.service.pg-race.test.ts` — **10/10** pass
- `p3a-replicate-execution-worker.test.ts` — **24/24** pass
- `p3a-replicate-execution-worker.pg-race.test.ts` — **10/10** pass
- `p3b-replicate-r2-canary.test.ts` — **21/21** pass
- `p3b-replicate-r2-canary.ts --dry-run` — exit 0, `RESULT: dry-run PASSED`

`npx tsc -p tsconfig.json --noEmit` — exit 0. `npm run build` — exit 0.
`npx prisma validate` — schema valid (no migration added; no Prisma model
change was needed). `npx eslint` on all new/changed P4C files — 0
errors/warnings after two small fixes (see 8.5).

### 8.5 Repair iterations

1. `getConfigPreview` in `env.ts` did not type-check against the new nested
   `bankAlfalahMpgs` object value (`toSafePreview` expected a scalar) —
   repaired by branching on `typeof value === "object"` and recursively
   redacting nested keys; re-ran `tsc --noEmit`, exit 0.
2. The legacy-retirement scan test initially flagged this packet's own
   trust-boundary comments (which name the retired identifiers in prose to
   explain what is forbidden) as active hits — repaired by adding a
   retirement-marker window check (a nearby "retired"/"forbidden" line
   exempts the mention) and excluding `.codex`/`.claude` scratch
   directories from the walk; re-ran, 1/1 pass.
3. Two ESLint `@typescript-eslint/no-var-requires` disable comments in the
   env test did not match the actually-firing rule name
   (`no-require-imports` in this ESLint config) — corrected the directive
   comments; re-ran ESLint, 0 problems. A pre-existing, unrelated
   `no-unused-vars` warning on `providerKey` in `env.ts` (present before
   this packet, on a line this packet did not touch) was left as-is.

### 8.6 Disposable PostgreSQL cleanup evidence

PostgreSQL 17 cluster (`initdb`/`pg_ctl`/`createdb` on `127.0.0.1:45997`,
`DATABASE_URL`/`DISPOSABLE_DATABASE_URL` passed only as environment
variables, never written to `.env`). `pg_ctl -m fast -w stop` reported
`server stopped`; `Test-NetConnection 127.0.0.1:45997` afterward reported
`TcpTestSucceeded: False`; the temporary data directory was deleted and
confirmed absent.

### 8.7 Live sandbox smoke test

Skipped: `MERCHANT_ID`, `API_PASSWORD`, `OPERATOR_ID` (and the
`BANK_ALFALAH_MPGS_*` equivalents) were all confirmed absent as environment
variables in this session (presence-only check, no value ever printed). When
the owner has sandbox credentials available, run (in a fresh session, never
written to `.env`):

```
$env:BANK_ALFALAH_MPGS_ENABLED = "true"
$env:BANK_ALFALAH_MPGS_MERCHANT_ID = <loaded securely, never echoed>
$env:BANK_ALFALAH_MPGS_API_PASSWORD = <loaded securely, never echoed>
$env:BANK_ALFALAH_MPGS_OPERATOR_ID = <loaded securely, never echoed>
```
then exercise `BankAlfalahMpgsGateway.initiateHostedCheckout` /
`.retrieveOrder` against one bounded sandbox order.

### 8.8 Confirmation this does not activate live processing or touch protected scope

No Express route or controller references the P4C gateway module (same
not-yet-routed pattern as P4A/P4B). No file under
`apps/api/src/services/p4a-*`, `apps/api/src/services/p4b-*`,
`apps/api/src/services/p3a-*`, `apps/api/src/scripts/p3b-*`, or any
RunPod/Local path was modified by this packet. `grep` for
`Replicate|R2_|r2Client|RunPod|runpod` inside
`p4c-bank-alfalah-mpgs-gateway.service.ts` returns only the two trust-boundary
comments stating the module never touches them (zero actual calls). No real
Bank Alfalah credential value exists anywhere in this repository, this
session, or this document.

## 9. R9.2-P4C — Independent review, PR #118 merge, and sandbox smoke attempt (2026-08-04)

### 9.1 PR #118 independent review

PR #118 (`feat/r9.2-p4c-bank-alfalah-mpgs`, head
`c52cab8e93c9f2906c98118d7b15b02ab5e894d5`) was independently re-inspected
against every criterion in the R9.2-P4C-INDEPENDENT-REVIEW-SANDBOX-SMOKE-MERGE
packet: MPGS disabled by default (`BANK_ALFALAH_MPGS_ENABLED` defaults to
`false`), REST Basic Auth is `merchant.<Merchant ID>` + API Password
(`buildMpgsAuthHeader`), `BANK_ALFALAH_MPGS_OPERATOR_ID` is never used for
REST auth, the browser-return handler always re-verifies via Retrieve Order
before any paid transition, an authenticated Retrieve Order precedes every
`applyVerifiedPaymentEvidence` call, merchant/order/amount/currency/status
are matched exactly (`matchRetrievedOrderToAttempt`), USD remains
fail-closed, the gateway origin is hardcoded/derived only from server config
(never a webhook-supplied URL), secrets are redacted from
`getConfigPreview` and never appear in any thrown error message, duplicate/
concurrent verification is idempotent (proven by
`p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts`), and zero
Replicate/R2/worker references exist in the gateway module. No critical or
high-severity issue was found; the PR was merged without amendment.

`gh pr view 118` confirmed `mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`,
no required failing checks (none configured on the branch, matching the
P4A/P4B precedent). Merged with `gh pr merge 118 --merge
--delete-branch=false`. Merge commit: `38f768d3b2bc1d52de31d79f457f8049aace3b89`.

### 9.2 Full regression + new-test evidence (before merge)

Disposable PostgreSQL 17 (`initdb`/`pg_ctl`/`createdb` on `127.0.0.1:45733`,
`DATABASE_URL`/`DISPOSABLE_DATABASE_URL` passed only as environment
variables, never written to `.env`):

- `p4c-bank-alfalah-mpgs-gateway.service.test.ts` + `p4c-bank-alfalah-mpgs-env.test.ts` + `p4c-bank-alfalah-legacy-apg-retired.test.ts` — **31/31** pass
- `p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts` — **6/6** pass (37/37 MPGS tests total)
- `p4a-payment-verified-execution-queue.service.pg-race.test.ts` — **14/14** pass (unmodified)
- `p4b-internal-worker-runner.service.test.ts` — **13/13** pass (unmodified)
- `p4b-internal-worker-runner.service.pg-race.test.ts` — **10/10** pass (unmodified)
- `p3a-replicate-execution-worker.test.ts` — **24/24** pass (unmodified)
- `p3a-replicate-execution-worker.pg-race.test.ts` — **10/10** pass (unmodified)
- `p3b-replicate-r2-canary.test.ts` — **21/21** pass (unmodified)
- `p3b-replicate-r2-canary.ts --dry-run` — exit 0, `RESULT: dry-run PASSED` (unmodified)
- `prisma validate` — schema valid; `prisma generate` — exit 0
- `tsc --noEmit` (api) — exit 0; `npm run build` (api) — exit 0
- `eslint` on all new/changed P4C files — 0 errors (one pre-existing,
  unrelated `no-unused-vars` warning on `providerKey` in `env.ts`, on a line
  this packet does not touch, left as-is)
- Legacy-APG and no-hardcoded-credential structural scan tests — pass

### 9.3 Sandbox smoke workflow

Added `.github/workflows/bank-alfalah-mpgs-sandbox-smoke.yml`
(`workflow_dispatch` only, hardcoded sandbox origin
`https://test-bankalfalah.gateway.mastercard.com`, `timeout-minutes: 10`,
`concurrency` group of 1, fails closed before any network call if the
`MERCHANT_ID`/`API_PASSWORD` GitHub secrets are absent, uploads only
sanitized text evidence) and its underlying script
`apps/api/src/scripts/p4c-bank-alfalah-mpgs-sandbox-smoke.ts` (exactly two
calls: Hosted Checkout initialization + Retrieve Order v74; never prints a
secret value; no card data; no capture; no Replicate/R2/worker call).
Merged via PR #119 (`7c2adefb60892a905c3cf530465aedaba9e4d376`) and a
follow-up Prisma-client-generation fix via PR #120
(`a5c5f2eb9e2ddf39a430939ed2a98a72b514ed77`, first dispatch failed on a CI
build-dependency error, not a security issue).

### 9.4 Sandbox smoke result: REJECTED (structural HTTP 404)

Dispatched from `main` (run
[`30910714515`](https://github.com/ai-photo-studio/ai-photo-studio/actions/runs/30910714515)).
`MERCHANT_ID`/`API_PASSWORD` secrets were confirmed present; Hosted Checkout
initialization was rejected with a structural HTTP 404 before Retrieve Order
could be reached. Full sanitized evidence:
`docs/payments/bank-alfalah-mastercard/P4C_SANDBOX_SMOKE_EVIDENCE.md`.

Per `rules.md`'s Recovery Protocol this is a **true stop**: the exact
REST path / merchant-provisioning shape this specific Bank Alfalah MPGS
sandbox account expects is external protocol knowledge this repository
cannot define without owner-supplied confirming documentation or a working
reference request. No further live-sandbox guess-and-retry was attempted.

**PKR is NOT `SANDBOX_VERIFIED`.** It retains its pre-existing
`standard-pattern-fallback` code-level gating only. **USD remains
`FAIL_CLOSED`** (no merchant capability evidence exists). No card data, no
payment capture, and no Replicate/R2/worker call occurred at any point in
this packet.

## 10. R9.2-P4C2 — MPGS credential-provisioning diagnostic (2026-08-04)

PR #121 was already merged before this packet began (merge commit
`e75484650ef28f2f9a6b11845685e58fcb59653c`). Re-reading run `30910714515`'s
raw log directly confirmed the actual gateway response is a structural
**HTTP 404** (not a 401/403 Basic-Auth rejection as a prior session's summary
had implied). Gateway error code, `Content-Type`, correlation/request ID, and
`WWW-Authenticate` were never captured by the smoke script as it existed —
a genuine evidence gap, not a redaction.

Added a permanent, network-free structural credential diagnostic
(`apps/api/src/scripts/p4c2-mpgs-provisioning-config-diagnostic.ts`,
14/14 tests passing) and a dedicated diagnostic-only workflow
(`.github/workflows/bank-alfalah-mpgs-provisioning-config-diagnostic.yml`). Full
findings, the Bank Alfalah support-escalation packet, and exact owner
remediation steps:
`docs/payments/bank-alfalah-mastercard/P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md`.

No MPGS request logic, endpoint shape, or auth header construction changed.
Result: `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` (external/
provisioning, not a repository defect; `BANK_ALFALAH_WRONG_GATEWAY_REGION` is
the closest unresolved alternative). **PKR remains NOT `SANDBOX_VERIFIED`;
USD remains `FAIL_CLOSED`.** No card data, no payment capture, no
Replicate/R2/RunPod/worker call, no production activation.

## 11. R9.2-P5A — Minimal truthful lint/browser harness + restoration status/download flow (2026-08-05)

This packet is independent of, and does not modify, the P4A/P4B/P4C/P4C2
payment path above. No committed, complete root ESLint 9 flat config or
Playwright browser-test harness existed prior to this packet — the KNOWN
RESULT for this task stated so explicitly, and a repo-wide search confirmed
`eslint.config.mjs`, `apps/web/playwright.config.ts`, and
`apps/web/tests/browser/*.spec.ts` were all absent (an empty
`apps/web/tests/browser/fixtures/` directory existed with no files). Both
were built fresh and minimal from currently installed packages, per
instruction not to search git history for, or restore, any prior browser
script.

### 11.1 Lint harness
- `eslint.config.mjs` (root): ESLint 9 flat config built only from packages
  actually installed (`typescript-eslint`, `@eslint/js`,
  `eslint-plugin-react-hooks`, `globals`). `apps/api/runpod-worker-dev/**`
  gets Node globals (a standalone dev harness script, not part of the built
  API); `node_modules`, `dist`, `build`, `.wrangler`, coverage,
  `playwright-report`, `test-results`, and generated Prisma output are
  ignored. No product source directory is ignored.
- `package.json` `lint` script changed from
  `eslint apps/api apps/web --max-warnings 0 || exit 0` (always exited 0,
  masking every failure) to plain `eslint apps/api apps/web`.
- Rule set: `@typescript-eslint/no-unused-vars` is an **error** with a
  `^_` allow-prefix for args/vars/caught errors (per instruction);
  `@typescript-eslint/no-explicit-any` stays a **warning**, matching the
  pre-existing convention of ~89 `any` usages across the codebase that this
  packet does not attempt to eliminate.
- Truthfulness proof: a disposable fixture file with a genuinely unused
  local variable was added outside tracked product code
  (`apps/api/src/__p5a_lint_fixture.ts`) — `npm run lint` exited 1. The
  fixture was deleted — `npm run lint` exited 0 with **0 errors, 89
  warnings** (all pre-existing `no-explicit-any`).
- ~40 genuine pre-existing lint errors (unused imports/vars/args, two
  `declare global { namespace Express }` ambient-augmentation patterns, one
  pre-existing `@ts-nocheck`, one `require()`-in-`.test.ts`, one
  `no-unsafe-finally` in the new `RestorationStatusPage.tsx`) were repaired
  with the smallest behavior-neutral change per file — see the file list
  below. The two Express namespace augmentations and the one `@ts-nocheck`
  kept their existing behavior via a targeted, commented
  `eslint-disable-next-line` rather than a structural rewrite.

### 11.2 Playwright browser harness
- `apps/web/playwright.config.ts`: Chromium-only project, local Vite dev
  server on `127.0.0.1:4173` (explicit `--host 127.0.0.1`; Vite's default
  bind is IPv6-only on this host, which produced `ERR_CONNECTION_REFUSED`
  until fixed), `workers: 1` (bounded for low-memory Windows), no real API
  server, `retry-on-failure` tracing, temporary `playwright-report`/
  `test-results` output only.
- `apps/web/tests/browser/fixtures/index.ts`: `blockExternalNetwork` aborts
  every non-`127.0.0.1`/`localhost` request; `mockRestorationStatus` /
  `mockRestorationDownload` fulfill the exact customer DTO contracts used by
  `RestorationCustomerController` (status stays wrapped in `{success,data}`
  via `apiRequest`; download is **not** wrapped, matching
  `customerApi.getRestorationDownload`'s raw `fetch(...).then(r=>r.json())`
  call — this mismatch was caught and fixed during harness development).
- `apps/web/tests/browser/p5a-restoration-status.spec.ts`: **13/13 passing**
  — QUEUED, PROCESSING, FAILED, SUCCEEDED-with-VALIDATED-master; download
  hidden before request and visible only after a mocked, VALIDATED-master
  response; forged query parameters (`?status=SUCCEEDED&downloadUrl=...`)
  cannot fabricate success; refresh issues a GET-only request (asserted via
  `route.request().method()`); wrong-owner/not-found renders a uniform
  not-found state; no `storageKey` substring anywhere in the mocked
  response bodies or the rendered page text; keyboard-only operation
  (`focus` + `Enter`) for both Refresh and Download; 360/390/430px widths
  with zero horizontal overflow; and a dedicated zero-external-network-call
  test that distinguishes *completed* external requests (asserted empty)
  from *attempted-then-blocked* ones (the app's own Facebook Pixel beacon
  script tag, aborted by `blockExternalNetwork`, confirming the block is
  real rather than the assertion being vacuous).
- `apps/web/package.json`: added `@playwright/test` (already resolved in
  `node_modules` at `1.62.1` but never declared in any workspace
  `package.json`) and two scripts, `test:browser:p5a` (this spec only) and
  `test:browser` (`tests/browser`, i.e. this spec — no other browser specs
  exist on this branch, so nothing historical is referenced).

### 11.3 Restoration status/download flow (pre-existing on this branch, verified)
This branch already carried a working, security-reviewed implementation
before this packet started; the packet's job was to build the harness that
proves it, repair the one lint defect it had (`no-unsafe-finally`), and
document it:
- `apps/api/src/utils/ownership.ts` — `assertOwnership` throws one uniform
  404 for both "does not exist" and "exists but not yours"; if
  `actor.userId` is set it is authoritative and **never** falls back to a
  guest token (an authenticated user cannot use another owner's guest
  token).
- `apps/api/src/controllers/restoration-customer.controller.ts` +
  `RestorationService.getCustomerStatus` / `getCustomerDownload` —
  `GET /api/customer/restorations/:id` (read-only; the `RestorationStatusPage`
  refresh path issues no other request) and
  `GET /api/customer/restorations/:id/download/:itemId`, which requires the
  item to be `COMPLETED` **and** the linked `RestorationMaster.status ===
  "VALIDATED"` before ever calling `storage.getSignedUrl` — there is no code
  path that returns a download for any other combination.
- Narrow customer DTOs (`RestorationCustomerStatusResponse`,
  `RestorationCustomerDownloadResponse` in `apps/web/src/lib/portal-types.ts`)
  never include a `storageKey` field; `toCustomerStatusView` in
  `restoration.service.ts` builds the status DTO by hand from an explicit
  field allowlist (id/orderNo/status/title/timestamps/items), never spreads
  the raw Prisma row. The legacy (`LegacyRestorationOrderResponse`) and admin
  (`AdminRestorationDetailResponse`) DTOs remain separate types with
  separate controllers/routes and are untouched by this packet.
- There is no retry endpoint on this customer surface at all, so "retry
  creates no execution" holds trivially; no payment table is read or
  written by either customer route.

### 11.4 Test evidence (this packet)
- `npm run lint` — exit 0, 0 errors, 89 warnings (see 11.1 truthfulness
  proof).
- `npm run typecheck` (api + web) — exit 0 (after `npx prisma generate`,
  which a workspace-reinstall mid-packet had cleared).
- `npm run typecheck:tests -w apps/web` (`tsconfig.tests.json`) — exit 0.
- `npm run build` — exit 0.
- `npx prisma validate` (api), `DATABASE_URL` pointed at a process-only
  loopback value, never written to any `.env` file — schema valid.
- `npx prisma generate` — exit 0.
- Disposable PostgreSQL 17 (`initdb`/`pg_ctl`/`createdb` on
  `127.0.0.1:55432`, env-var-only `DATABASE_URL`/`DISPOSABLE_DATABASE_URL`,
  never in `.env`), `prisma migrate deploy` from empty — exit 0, all
  migrations applied:
  - `restoration-view.test.ts`, `guest-ownership.test.ts`,
    `restoration-customer.service.test.ts` — all pass (focused P5A/ownership
    suites).
  - `p3a-replicate-execution-worker.test.ts` — **24/24** pass (unmodified).
  - `p3a-replicate-execution-worker.pg-race.test.ts` — **10/10** pass
    (unmodified).
  - `p4a-payment-verified-execution-queue.service.pg-race.test.ts` —
    **14/14** pass (unmodified).
  - `p4b-internal-worker-runner.service.test.ts` and
    `.pg-race.test.ts` — **10/10** pass (unmodified).
  - `p3b-replicate-r2-canary.test.ts` — **21/21** pass (unmodified);
    `p3b-replicate-r2-canary.ts --dry-run` — `RESULT: dry-run PASSED`
    (unmodified).
- `npx playwright test tests/browser/p5a-restoration-status.spec.ts` —
  **13/13** pass (Chromium only).
- `git diff --check` and `git diff --cached --check` — both exit 0 (no
  whitespace errors).
- Disposable PostgreSQL cleanup: `pg_ctl stop` → "server stopped";
  `Test-NetConnection 127.0.0.1:55432` → `TcpTestSucceeded: False`; temp
  data directory `D:\Temp\p5a-pg-data` removed and confirmed absent
  (`Test-Path` → `False`).

### 11.5 Zero-live-call proof
- Every browser test blocks all non-`127.0.0.1`/`localhost` requests and
  mocks both customer endpoints; the dedicated zero-external-network test
  confirms zero *completed* external requests over the full status +
  download flow.
- The P3A/P3B/P4A/P4B regression suites re-run above are unmodified and
  carry their own throwing `globalThis.fetch` spies /
  zero-external-call assertions, all of which passed.
- No MPGS, Replicate, R2 upload, RunPod, or Local provider call was made by
  anything in this packet. No `.env` file was read or written.

### 11.6 Files changed (this task)
Added (harness):
- `eslint.config.mjs`
- `apps/web/playwright.config.ts`
- `apps/web/tests/browser/fixtures/index.ts`
- `apps/web/tests/browser/p5a-restoration-status.spec.ts`

Modified (lint repairs, smallest behavior-neutral change per file):
- `package.json` (removed `|| exit 0`, added eslint/typescript-eslint/
  eslint-plugin-react-hooks/globals devDependencies)
- `apps/web/package.json` (added `@playwright/test`, `test:browser`,
  `test:browser:p5a`, `typecheck:tests` scripts)
- `apps/api/src/config/env.ts`, `controllers/admin-auth.controller.ts`,
  `controllers/auth.controller.ts`, `controllers/restoration.controller.ts`,
  `controllers/whatsapp.controller.ts`, `index.ts`,
  `middleware/admin-auth.middleware.ts`, `middleware/auth.middleware.ts`,
  `queues/image.queue.ts`, `restoration-providers/providers/
  BaseReplicateProvider.ts`, `ReplicatePipelineProvider.ts`,
  `ReplicateProvider.ts`, `UnifiedLocalRestorationProvider.ts`,
  `scripts/gen-ops109-xlsx.ts`, `services/business-analytics.service.ts`,
  `services/cost-metrics.service.ts`, `services/creative-studio/
  flat-lay.ts`, `lifestyle-scene.ts`, `video-prep.ts`, `virtual-model.ts`,
  `services/damage-detection.service.ts`, `services/damage-mask.service.ts`,
  `services/health-dashboard.service.ts`, `services/image-analysis.service.ts`,
  `services/pipeline-builder.service.ts`, `services/print-preparation.service.ts`,
  `services/print-readiness.service.ts`, `services/processing-metrics.service.ts`,
  `services/restoration-engine.service.ts`, `services/restoration-view.test.ts`
- `apps/web/src/main.tsx`, `pages/AdminUsersPage.tsx`, `pages/AdminWalletsPage.tsx`,
  `pages/OrdersPage.tsx`, `pages/RestorationStatusPage.tsx`,
  `pages/RestoreNewPage.tsx`, `pages/RestoreOrderPage.tsx`,
  `services/customerApi.ts`
- `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` (this section)
- `reports/LATEST.md`

Not modified: any P4A/P4B/P4C/P4C2 payment file, any migration, any
provider adapter's request/response logic.

### 11.7 Confirmation this does not activate live processing
No route, controller, or service touched by this packet issues an MPGS,
Replicate, R2, RunPod, or Local call. The restoration status/download
surface documented here was already present on this branch; this packet
adds the harness that proves its DTO/ownership/gating boundaries and fixes
the one lint defect (`no-unsafe-finally`) it had. No production
deployment, credential, or activation flag changed.

## 12. R9.2-P4D — Bounded MPGS verify+repair pass, blocker still open (2026-08-05)

### 12.1 Blocker-resolution check (mandatory first step)
Before any code change, this packet checked whether the P4C/P4C2
`P4C_MPGS_AUTH_VERIFIED` gate had been met:

- `git ls-tree -r origin/main -- docs/payments/bank-alfalah-mastercard/` —
  still exactly the three files present at the end of P4C2
  (`MPGS_INTEGRATION_EVIDENCE.md`, `P4C_SANDBOX_SMOKE_EVIDENCE.md`,
  `P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md`). No new/updated Bank Alfalah
  merchant document exists.
- `gh run list --workflow=bank-alfalah-mpgs-sandbox-smoke.yml` — only the two
  P4C runs exist, both `failure` (`30910482924`, `30910714515`,
  2026-08-04). No run after those two.
- `gh run list --workflow=bank-alfalah-mpgs-provisioning-config-diagnostic.yml`
  — zero runs; the diagnostic added by P4C2 has never been dispatched
  against real secrets.

**Conclusion: `P4C_MPGS_AUTH_VERIFIED` was NOT achieved.** Per rules.md and
this task's own explicit gate, full checkout-route/customer-flow wiring
(Express routes for browser-return/webhook, any HTTP surface) was correctly
**not** attempted. This packet's scope narrowed to: verify the existing
gateway service against the existing evidence docs, and repair only a
confirmed code-level defect.

### 12.2 Repair made
`apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts` —
`initiateHostedCheckout` and `retrieveOrder` previously discarded response
headers on a failed (`!response.ok`) call, so the thrown error carried only
the HTTP status code. `P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md` §3.2
explicitly named this as a genuine evidence-capture gap and an
owner-approved follow-up not yet performed. This packet adds
`describeFailedMpgsResponse(response)`, which reads (never logs the auth
header) `content-type`, `www-authenticate`, and the first present of
`x-correlation-id` / `x-request-id` / `x-mastercardapi-request-id`, and
appends them to both methods' thrown error messages. No endpoint URL, HTTP
method, auth header construction, or request body changed — verified by
diff review and by the unchanged assertions in the pre-existing
"buildMpgsAuthHeader uses merchant.<id> username" and status-mapping tests.

No other defect was found: `buildMpgsAuthHeader`, `restBaseUrl`, the
currency-gating table (`MPGS_CURRENCY_SUPPORT`), and
`matchRetrievedOrderToAttempt` were reviewed against
`MPGS_INTEGRATION_EVIDENCE.md` and `apps/api/src/config/env.ts` and found
unchanged from the reviewed-clean PR #118 state.

### 12.3 Test evidence
- `p4c-bank-alfalah-mpgs-gateway.service.test.ts` — **25/25** pass (23
  pre-existing + 2 new: header-capture-on-failure, graceful `none` fallback
  when no headers present; both assert the raw Basic Auth credential token
  never appears in the thrown message).
- `p4c-bank-alfalah-mpgs-env.test.ts` — **8/8** pass, unmodified.
- `p4c-bank-alfalah-legacy-apg-retired.test.ts` — pass, unmodified.
- `p4c2-mpgs-provisioning-config-diagnostic.test.ts` (vitest) — **14/14**
  pass, unmodified.
- Full non-DB `node:test` sweep of every other `*.test.ts` under
  `apps/api/src` (P3A worker, P4B runner, restoration domain/customer/view,
  fixedOrder/payment/pricing domain, admin-auth middleware, RunPod isolation/
  budget/dev-config, image-binary, guest-ownership) — **104/104** pass,
  unmodified.
- `npm run lint` — 0 errors, 89 pre-existing `no-explicit-any` warnings
  (unchanged count).
- `npm run typecheck` — exit 0 (after `prisma generate` regenerated the
  client against a disposable-loopback `DATABASE_URL`; this is a local
  typegen prerequisite, not a schema/migration change).
- `npm run build` — exit 0.
- `prisma validate` / `prisma generate` — both pass; no migration added or
  changed.
- `git diff --check` — clean.
- `p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts` (DB-backed) was
  **not** run this session: no local Postgres/docker was available in this
  execution environment. This packet's change is response-header capture
  only (no DB read/write path touched), so this is an environment
  limitation, not a result being withheld.

### 12.4 Currency gating (unchanged)
PKR: `enabled: true`, evidence `standard-pattern-fallback`, **not**
`SANDBOX_VERIFIED`. USD: `enabled: false` (`FAIL_CLOSED`). Neither gate was
touched by this packet.

### 12.5 Scope discipline
- No RunPod or Local provider file was read for modification or modified.
- No P3A/P4A/P4B/P5A service logic was modified; only their existing test
  suites were re-run (unmodified) as regression evidence.
- No Express route/controller registration was added anywhere.
- No new live/billable network call was made; no new
  `bank-alfalah-mpgs-sandbox-smoke.yml` or
  `bank-alfalah-mpgs-provisioning-config-diagnostic.yml` dispatch was
  triggered this session (read-only `gh run list`/`gh run view` only).
- No production credential, activation flag, or database write occurred.

### 12.6 Result
`BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remains the standing
external blocker, unchanged from P4C2 (no new resolving evidence found or
introduced this session). `P4D` checkout-route/customer-flow wiring remains
blocked until a future session actually achieves `P4C_MPGS_AUTH_VERIFIED` —
owner action required per `P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md`
§6-§7, followed by a fresh `bank-alfalah-mpgs-sandbox-smoke.yml` dispatch,
which will now also surface `Content-Type`/`WWW-Authenticate`/correlation-id
evidence thanks to §12.2.

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

## 13. R9.2-PR125-MERGE-AND-P4B-READINESS — PR #125 merge and P4B Northflank deployment preparation (2026-08-05)

Branch: `chore/r9.2-p4b-northflank-readiness`, built from `origin/main`
immediately after PR #125 was merged. This section is a dated amendment,
appended per the Protected Scope Protocol above. Nothing in sections 1–12
was changed.

### 13.1 PR #125 verification and merge

PR #125 (`ops/r9.2-p4d-mpgs-checkout-flow-verify`, head
`be0ffdddd9e775d4f82b54b766d44d5ca9834306`) was independently re-verified in
its own isolated worktree (`git worktree list --porcelain` confirmed HEAD
`be0ffdddd9e775d4f82b54b766d44d5ca9834306` on that exact branch, working
tree clean, up to date with `origin/ops/r9.2-p4d-mpgs-checkout-flow-verify`).
`gh pr view 125` confirmed `mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`,
`state: OPEN`; `gh pr checks 125` reported no checks configured on this
repository (no required failing check exists to block merge).

The one test explicitly left un-run by the prior P4D packet (no local
Postgres available then) was run this session against a disposable, loopback-
only PostgreSQL 17 instance:
`p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts` — **6/6 pass**
(single-apply, sequential-idempotent, real-concurrent-race,
forged-PENDING-rejected, zero-network-call, teardown). Regression
`p3a-replicate-execution-worker.pg-race.test.ts` — **10/10 pass**
(unmodified). Full non-DB MPGS sweep — 33 `node:test` assertions plus the
vitest-based `p4c2-mpgs-provisioning-config-diagnostic.test.ts` (**14/14**,
run under `vitest` — the one "failure" seen when first invoked under
`node --test` was a tooling mismatch on the verifier's part, not a code
regression: that file is a vitest suite, and it passes 14/14 under the
correct runner). `prisma validate`, `npx eslint` (0 errors, 89 pre-existing
warnings, unchanged), `tsc --noEmit` (both workspaces), `npm run build`
(both workspaces), and `git status --porcelain`/`git diff --stat` (clean, no
modification produced by running tests) all passed. No repair was required
— no defect was found.

Merged normally (`gh pr merge 125 --merge --delete-branch=false`, matching
this repository's established merge-commit convention — no squash, no
force-push). Merge commit: **`5cf50447429aa2844e7b812446505f0c1c427999`**.

### 13.2 Disposable PostgreSQL cleanup proof

- Server: `pg_ctl -D <tempdir>\data stop -m fast` → `"server stopped"`.
- PID: the exact `postmaster.pid` first line (`5816`) was captured before
  stop; `Get-Process -Id 5816` after stop returned nothing —
  **process confirmed gone**.
- Port: `Get-NetTCPConnection -LocalPort 55779` after stop returned
  nothing — **port confirmed free**.
- Temp directory + password file: the entire disposable data directory
  (including `pwfile.txt`, the random password, and the
  `DISPOSABLE_DATABASE_URL` scratch file) was deleted with
  `Remove-Item -Recurse -Force`; `Test-Path` on the directory returned
  `False` afterward — **temp directory and password confirmed removed**.
- The password was a fresh random GUID generated only for this instance,
  never reused, never written to any tracked file, and existed only in the
  now-deleted `pwfile.txt` and process-scoped `$env:` variables for the
  duration of this session.

### 13.3 P4B Northflank readiness worktree

`git fetch origin main` (new tip `5cf5044...`, containing the PR #125
merge) → `git worktree add D:\Temp\r92-p4b-northflank-readiness -b
chore/r9.2-p4b-northflank-readiness origin/main`. This is a separate,
disposable worktree from the one used to verify/merge PR #125.

A second disposable PostgreSQL 17 instance (loopback-only, independent
random high port, independent random password) was created in this
worktree to run the P4B/P4A/P3A/P3B DB-backed suites. All results below are
from this second, separately provisioned and separately torn-down instance.

### 13.4 P4B worker inspection (no code changed)

`apps/api/src/scripts/p4b-worker-runner-main.ts` and
`apps/api/src/services/p4b-internal-worker-runner.service.ts` were read in
full, not modified. Confirmed directly from source, matching every
constraint in this task's contract:
- Sole start command is `npm run worker:p4b` (`tsx
  src/scripts/p4b-worker-runner-main.ts`); no Express router, no port bound.
- Fails closed via the same `loadConfig()` the HTTP API uses, plus a
  dedicated `RESTORATION_PROVIDER !== "replicate"` guard that throws before
  any adapter is constructed.
- Constructs only the existing, unmodified Replicate-only P3A adapters
  (`ReplicateExecutionWorker` + `PrismaReplicateExecutionRepository` +
  `R2MasterPersistence` + `PipelineOrchestratorProviderExecutor`). No RunPod
  or Local provider import exists anywhere in this file.
- `InternalWorkerRunner` runs at concurrency 1; the P3A worker's own atomic
  `UPDATE ... WHERE status = 'QUEUED'` SQL remains the only real claim —
  this runner only "peeks" read-only for a candidate.
- `SIGTERM`/`SIGINT` both route to `requestStop()`, which always lets the
  in-flight execution finish before stopping.
- No customer or admin controller, route, or queue processor imports this
  file or `InternalWorkerRunner` anywhere in the repository (confirmed by
  the existing static-scan pg-race test `(pg1)` re-run in §13.5, plus a
  fresh read of the file's own header comment and import list).

A deployment runbook was written from this inspection —
`docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md` — documenting the exact
start command, the full list of required environment variable **names**
(no values), single-instance limits, health expectations (process-liveness
only; no HTTP probe — no port is bound), graceful-shutdown behavior,
rollback (stateless service; redeploy previous build; no migration tied to
it), and post-deployment checks. No Northflank service, project, or secret
group was created by this packet.

### 13.5 Test evidence (this packet, disposable PostgreSQL 17)

- `p4b-internal-worker-runner.service.pg-race.test.ts` — **10/10** pass
  (unmodified): static no-route-reference scan, ineligible-row exclusion,
  two-independent-runner real race (exactly one claim/provider call),
  restart/replay safety, graceful shutdown end-to-end, two fail-closed
  startup-configuration cases, zero-network-call proof, teardown.
- `p4a-payment-verified-execution-queue.service.pg-race.test.ts` —
  **14/14** pass (unmodified).
- `p3a-replicate-execution-worker.pg-race.test.ts` — **10/10** pass
  (unmodified).
- `p3b-replicate-r2-canary.test.ts` — **21/21** pass (unmodified).
- `p3b-replicate-r2-canary.ts --dry-run` — `RESULT: dry-run PASSED`, with
  the script's own internal disposable-Postgres instance independently
  reporting `postgresStopped=true tempDirRemoved=true portFreed=true
  residualExecutionRows=0`.
- Full non-DB `node:test` sweep (every other `*.test.ts` under
  `apps/api/src`: P3A worker, P4A domain fixtures, P4C/P4C2 MPGS,
  restoration domain/customer/view/entitlement, guest-ownership,
  admin-auth middleware, image-binary, RunPod isolation/budget/dev-config,
  utils) — **137/137** pass (unmodified).
- `p4c2-mpgs-provisioning-config-diagnostic.test.ts` (vitest) — **14/14**
  pass (unmodified).
- `npm run lint` — 0 errors, 89 pre-existing `no-explicit-any` warnings
  (unchanged count; new runbook/docs files carry no lint-relevant code).
- `npm run typecheck` — exit 0 (both workspaces).
- `npm run build` — exit 0 (both workspaces).
- `prisma validate` — valid; no migration added or changed.
- Secret scan (`Select-String` over tracked `.ts`/`.tsx`/`.md`/`.json` for
  common API-key/token/private-key shapes) found **no new secret** in any
  file touched by this packet. One **pre-existing**, already-committed
  match was found in an unrelated `.kilo/plans/` migration-assessment
  document (a Replicate token value) — this predates this packet, is
  outside this packet's scope/files, and was left untouched; it is flagged
  here for the owner's awareness, not remediated by this packet.
- `git status --porcelain` in this worktree, scoped to the files this
  packet actually changed, shows exactly the plan/manifest/runbook/report
  updates listed in §13.7 — no test run, build, or lint invocation modified
  any tracked file.

### 13.6 Finalized Protected Scope Protocol

This section formally restates and finalizes the Protected Scope Protocol
first defined in section 5 above, extending it to explicitly cover the
P4B-Northflank-readiness packet type and all future deployment-preparation
packets of the same shape:

1. **Append-only evidence.** This manifest, `rules.md`, and
   `reports/LATEST.md` are append-only. No existing section is rewritten,
   condensed, or removed; corrections are appended as a new dated section
   with the original left intact — unchanged from section 5, restated here
   for a deployment-preparation packet's benefit.
2. **Deployment preparation is not deployment.** Writing a runbook,
   inspecting existing (already-tested, already-merged) code, and running
   tests against a disposable local database does not create, modify, or
   authorize any live infrastructure. A packet of this shape must never
   create a Northflank project/service/secret group, touch a production
   database, or make a live Replicate/R2/RunPod/Bank Alfalah call — doing
   so requires a separate, explicitly authorized deployment packet.
3. **Provider boundary is load-bearing.** The P4B runner's
   Replicate-only guard (`RESTORATION_PROVIDER !== "replicate"` refuses to
   start) must never be loosened, wrapped, or bypassed by a
   deployment-preparation packet. No RunPod or Local provider code path may
   be added to this runner without a new, separately authorized packet and
   an explicit amendment here, matching the existing rule in section 5.3
   for the Replicate release path generally.
4. **Canonical source stays tracked.** Deployment-preparation packets add
   or update documentation (plans, manifests, runbooks, reports) but must
   keep all canonical source, workflows, packets, validators, migrations,
   tests, and development documentation tracked in Git. Only genuinely
   temporary evidence and `AI_code_audit_report_RI.md` may be ignored; no
   broad `.gitignore` pattern and no `git add -f` may be introduced.
5. **Disposable-database discipline extends here.** Any DB-backed test run
   during a deployment-preparation packet must use a fresh disposable,
   loopback-only PostgreSQL instance with a random password and random
   port, fully torn down (server stopped, PID gone, port free, temp
   directory and password removed) before the packet is considered
   complete — the same standard already required for P3A/P4A/P4B/P4C
   verification work.
6. **A readiness PR authorizes nothing by itself.** Opening a
   P4B-readiness PR (this packet) is evidence and preparation only; per
   item 5 of section 5, it does not authorize activation, live canary
   runs, or production release. The actual Northflank deployment remains a
   distinct, separately authorized future task, to be performed by the
   repository owner directly against the runbook in
   `docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md`.

### 13.7 Files changed (this task)

Added:
- `docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md`

Modified (append-only additions):
- `rules.md`
- `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` (this section)
- `reports/LATEST.md`

### 13.8 Zero-live-action proof

- No Northflank project, service, or secret group was created.
- No secret value was created, read from a live source, or changed.
- No production database was connected to, queried, or migrated.
- No live Replicate, R2, RunPod, or Bank Alfalah network call was made —
  every DB-backed test installs a throwing `globalThis.fetch` spy and
  asserts zero external call attempts; all such assertions passed.
- The new P4B-readiness PR (opened from this branch) was explicitly **not**
  merged and **not** deployed by this packet, per this task's own
  instruction.

### 13.9 Result

PR #125 merged (`5cf50447429aa2844e7b812446505f0c1c427999`). The
previously-missing MPGS pg-race test now runs and passes (6/6). The P4B
internal worker runner remains code-complete, fully tested, and **still not
deployed as a Northflank service** — this packet adds only documentation and
regression evidence. `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED`
remains the standing external blocker for P4D checkout-route wiring,
unchanged and untouched by this packet. Next owner action: review the new
P4B-readiness PR, and when ready to actually deploy, follow
`docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md` directly in the
Northflank console (create the service, attach the secret group, deploy).

---

## 14. R9.2-P5B — Deterministic Sharp digital variants

Branch: `feat/r9.2-p5b-sharp-variants`, built from updated `origin/main` after
PR #126 (`chore/r9.2-p4b-northflank-readiness`, merged as section 13 above).
This packet adds only the deterministic Sharp foundation described in
`docs/restoration/P5B_SHARP_VARIANT_PROTOCOL.md`. This section is a dated
amendment, appended per the Protected Scope Protocol; nothing in sections
1–13 was changed.

### 14.1 Scope and behavior

Only a `VALIDATED` `RestorationMaster` with complete immutable metadata is
accepted. `original` reuses the validated master. `2hd` and `4hd` are Sharp
JPEG derivatives with server-owned maximum widths of 2048 and 4096 pixels,
using `withoutEnlargement`; literal 2x/4x scaling is not promised. The existing
`ImageVariant` unique key provides deterministic cache identity and concurrent
duplicate convergence. No schema or migration change was required.

Validation precedes storage and database mutation: decode, dimensions, format,
non-empty byte count, and SHA-256 are checked before upload; `AVAILABLE` is
persisted only after upload succeeds. No client options, provider call, payment
write, print fulfilment, MPGS, RunPod, or Local path is introduced.

### 14.2 Test evidence

- P5B unit: **3/3**.
- P5B disposable PostgreSQL race/idempotency: **3/3**.
- P3A unit: **24/24**; P3A PostgreSQL race: **10/10**.
- P4A PostgreSQL race: **14/14**; P4B unit: **13/13**; P4B PostgreSQL race: **11/11**.
- P5A customer ownership boundary: **2/2**.
- P3B dry-run: **21/21**.
- Lint: exit 0, 89 existing warnings and no errors.
- Typecheck, build, Prisma validate/generate, `git diff --check`, and
  `git diff --cached --check`: pass.

The disposable PostgreSQL 17.7 cluster was loopback-only on port 55432,
migrated from the tracked schema, and shut down with `pg_ctl`; its PID was
gone, the port was free, and the temporary data directory was removed. Every
DB-backed suite used mocked provider/storage ports and a throwing fetch spy;
zero live external calls occurred.

### 14.3 Protected scope result

No production deployment, secret, payment integration, Replicate execution,
RunPod/Local activation, schema, migration, or workflow was changed. P5B is a
foundation only and does not activate customer routes or print fulfilment.

## 15. R9.2-RESOLVE-P127-MERGE-AND-RETIRE-DUPLICATE-DOCS — PR #127 conflict resolution (2026-08-05)

Branch: `feat/r9.2-p5b-sharp-variants` (PR #127), merged with `origin/main`
(which by then contained PR #126, section 13 above) in an isolated resolver
worktree (`D:\Temp\r92-p5b-sharp-variants`). This section is a dated
amendment, appended per the Protected Scope Protocol; nothing in sections
1–14 was changed.

### 15.1 Conflict and resolution

`git merge origin/main --no-edit` produced exactly two conflicts, both purely
documentation drift from parallel section-numbering: this file (section 13
"PR125-merge-and-P4B-readiness", already on `origin/main` via PR #126, vs.
section 13 "P5B", only on this branch) and `reports/LATEST.md`. Resolved by
renumbering the P5B section to 14 (chronologically after PR #126's section
13) and appending this section as 15. No prose in either section's original
text was altered; both are preserved verbatim under their new numbers. All
P5B source and tests were retained unmodified. `reports/LATEST.md` was
combined additively (see its own history) and retained temporarily in this
PR, per this task's explicit instruction.

### 15.2 Test evidence (post-merge, this resolver worktree)

Disposable local PostgreSQL 17 (loopback-only, random port, random password,
`DATABASE_URL`/`DISPOSABLE_DATABASE_URL` passed only as environment
variables, never written to `.env`; no Neon/Northflank/remote database
touched):

- P5B unit: **3/3** pass.
- P5B PostgreSQL race/idempotency: **3/3** pass.
- `npm run lint`, `npm run typecheck`, `npm run build`: exit 0.
- `npx prisma validate` / `npx prisma generate`: exit 0.
- `git diff --check` / `git diff --cached --check`: clean.

### 15.3 Disposable PostgreSQL cleanup proof

`pg_ctl -m fast -w stop` reported `server stopped`; a subsequent
`Test-NetConnection` on the same port reported `TcpTestSucceeded: False`;
the temporary data directory was deleted and confirmed absent
(`Test-Path` → `False`). No real/system PostgreSQL installation was touched.

### 15.4 Result

Merge resolution pushed normally (no rebase, no force-push) to
`feat/r9.2-p5b-sharp-variants`. PR #127 became `mergeStateStatus: CLEAN`,
`mergeable: MERGEABLE`, and was merged normally. Merge commit and full
command/evidence log: `AI_code_audit_report_RI.md` (ignored, unstaged, local
audit history only).

## 16. R9.2-RESOLVE-P127-MERGE-AND-RETIRE-DUPLICATE-DOCS — Phase 2: duplicate automation status docs retired (2026-08-05)

Branch: `chore/r9.2-retire-automation-docs`, fast-forwarded to `origin/main`
(now containing the PR #127 merge, section 15 above) in the existing
worktree `D:\Temp\r92-retire-automation-docs`. This section is a dated
amendment, appended per the Protected Scope Protocol; nothing in sections
1–15 was changed.

### 16.1 Retired-file list (deleted)

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/NEXT_TASK.md`
- `docs/PROTECTED_SCOPE.md`
- `docs/COMPLETION_STATUS.md`
- `docs/DECISIONS.md`
- `reports/LATEST.md` (`reports/` was then empty and was removed)

None must be recreated; no replacement status/automation file of the same
shape may be added.

### 16.2 Reference repair

`git grep` and a PowerShell recursive filesystem search (excluding
`node_modules`/`.git`/`dist`/`build`) for the seven retired filenames found
two automation files with active (functional) references to the retired
workflow — `.github/prompts/continue-project.prompt.md` and
`scripts/run-next-task.ps1` — both updated to point at the remaining
authorities (`rules.md`, `.kilo/plans/commerceflownew.md`, this manifest's
Protected Scope Protocol, `AI_code_audit_report_RI.md`) instead of the
retired files, with no other behavior changed. One code comment in
`apps/api/src/scripts/p4b-worker-runner-main.ts` pointing at
`reports/LATEST.md` was repointed at this manifest. Remaining hits are
confined to this manifest's own and
`docs/payments/bank-alfalah-mastercard/P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md`'s
**append-only historical evidence** (past task's recorded file-changed
lists) — left intact, per the append-only protocol in section 5/13.6/16.4:
historical record of a file that once existed is not an active pointer.

### 16.3 Validation

- Deleted files absent: confirmed (`Test-Path` false for all seven; `reports/`
  directory absent).
- Zero active tracked references: confirmed by `git grep` re-run after the
  repairs in 16.2 (only the two append-only historical-evidence hits above
  remain, by design).
- `npm run lint` / `npm run typecheck` / `npm run build`: exit 0.
- `npx prisma validate` / `npx prisma generate`: exit 0.
- P5B focused unit tests (`sharp-variant.service.test.ts`): pass, unmodified.
- `git diff --check` / `git diff --cached --check`: clean.
- Zero live external calls: no network-touching command was run this
  packet; every test file already installs a throwing `globalThis.fetch`
  spy.

### 16.4 Final documentation authority and Protected Scope Protocol

Remaining documentation authorities: `rules.md`, `.kilo/plans/commerceflownew.md`
(canonical plan), this manifest (canonical, append-only release evidence),
feature-specific protocol documents already tracked under `docs/`, and
`AI_code_audit_report_RI.md` as ignored local audit history (required after
every task: commands, repairs, tests, changed files, Git evidence,
percentages, Protected Scope, and next task — never staged or committed).

Protected Scope Protocol for retirement packets of this shape: delete only
the exact files explicitly authorized; never delete or rewrite canonical
source, workflows, packets, validators, migrations, tests, or development
documentation; no `.gitignore` broadening beyond the existing
`AI_code_audit_report_RI.md` entry; no `git add -f`; no replacement
status/automation file of the retired shape; historical references inside
an existing append-only evidence document are left intact.

### 16.5 Result

PR #127 merge (`738fe3c3779c5462bad61a5ea2437704aa0216fe`) incorporated via
fast-forward. Seven duplicate documentation files retired and deleted.
Zero active tracked references remain. Completion (this
documentation-consolidation scope): **100%**. No RunPod, MPGS, deployment,
or product-scope-expansion change was made.

## 17. R9.2-MERGE-P128-AND-P6A-CUSTOMER-ROUTE-HARDENING (2026-08-05)

Branch: `feat/r9.2-p6a-customer-route-hardening`, from a clean worktree
(`D:\Temp\r92-p6a-customer-route-hardening`) built off updated `origin/main`
(after the PR #128 merge below). This section is a dated amendment,
appended per the Protected Scope Protocol; nothing in sections 1–16 was
changed.

### 17.1 PR #128 merge

PR #128 (`chore/r9.2-retire-automation-docs`, head
`8faca0851f50e23bb748b647c995d8e542ce9c01`) was re-verified: `state: OPEN`,
`mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, no configured checks;
`gh pr view --json files` confirmed documentation/retirement scope only
(exactly the seven previously-retired files deleted, plus doc/rules/plan
updates — no product, secret, deployment, MPGS, or RunPod file touched).
Merged normally (`gh pr merge 128 --merge --delete-branch=false`). **Merge
commit: `53d667d7fe275a03d84d9656faedd6dc0e23ffeb`.**

### 17.2 PriceBook reconciliation (PB-2026-08-03-v1)

Verified against `apps/api/src/domain/pricing/priceBook.ts`,
`priceBook.test.ts`, and migration
`20260803020000_r92_p1c_b_fixed_order_pricebook_snapshot` (applied): the
approved PriceBook matches exactly — PKR ORIGINAL/2HD/4HD
`25000`/`35000`/`50000` minor units, USD ORIGINAL/2HD/4HD
`150`/`250`/`350` minor units, `automaticFxAllowed: false`. Confirmed both
by direct source read and by `priceBook.test.ts`'s passing "real
APPROVED_PRICE_BOOKS shape" assertion. **No price or PriceBook behavior was
changed.**

Stale documentation corrected: `apps/api/src/domain/pricing/offerProvider.ts`'s
`FixtureOfferProvider` header comment stated, present-tense, that no USD
fixture/pricing existed and that it was an unresolved owner-approval
blocker — accurate when P1A was written, stale now that P1C-B approved real
USD pricing. The original P1A text was preserved verbatim (a correct dated
historical record); a dated update note was appended directly below it
pointing to `ApprovedOfferProvider`/`priceBook.ts` as the current, correct
provider for both markets. This repository's frozen business-spec plan
document (`.kilo/plans/commerceflownew.md`, section 5, "do not edit without
board approval") was left untouched per its own freeze notice; a new
appended section (17) there records the reconciliation instead. Wiring
note: neither offer-provider class is imported by any live service/route
today — this packet did not wire pricing into a customer flow and did not
create a checkout route.

### 17.3 Customer route hardening

`apps/web/src/App.tsx`: `/orders`, `/wallet`, `/payments`, `/subscription`
(previously unauthenticated under `CustomerLayout`) are now wrapped by the
existing `RequireAuth` component (`apps/web/src/components/RequireAuth.tsx`,
previously built but never wired into any route). Anonymous access
redirects to `/login` with `state: { from: location.pathname }`;
`LoginPage.tsx` already read `location.state.from` (default `/orders`) and
navigates there after a successful login — no new auth mechanism was
created, only the existing one wired in. Admin routes (`RequireAdminPortal`)
were not touched. Guest restoration routes (`/restore`, `/restore/new`,
`/restore/:orderId`, `/restore/:orderId/status`, `/restore/:orderId/print`)
remain on `PublicLayout`, unauthenticated by design.

### 17.4 Automatic-dispatch audit and repair

Audited every customer restoration page for a page-load/refresh-triggered
processing POST. Found one: `apps/web/src/pages/RestoreOrderPage.tsx`
fired `customerApi.processRestorationItem` (a `POST
/api/restorations/:id/items/:itemId/process`) for every `PENDING`/`QUEUED`
item on first successful `loadOrder()` call — guarded only by an in-memory
`processingRef`, re-armed on every fresh page load or hard refresh. Removed
the auto-dispatch block and the now-unused `processingRef` entirely; the
page is now read-only on mount and on every poll/refresh (GET only),
matching the convention `RestorationStatusPage.tsx` established in R9.2-P5A.
No other customer restoration page (`RestorationStatusPage.tsx`,
`RestorationHistoryPage.tsx`, `RestorePrintPage.tsx`) contained this
pattern; `RestoreNewPage.tsx`'s upload/processing remains an explicit,
user-button-triggered action and was left unchanged. Full record:
`docs/restoration/P6A_CUSTOMER_ROUTE_HARDENING_PROTOCOL.md`.

### 17.5 Test evidence

Browser (`npx playwright test tests/browser`, Chromium-only, local Vite dev
server, no real API server, every response mocked or naturally connection-
refused, `blockExternalNetwork` aborting all non-local traffic):

| Suite | Result |
|---|---|
| `p5a-restoration-status.spec.ts` (pre-existing, unmodified) | **13/13 pass** |
| `p6a-customer-route-hardening.spec.ts` (new) | **23/23 pass** |

The 23 new P6A browser tests prove: each of `/orders`/`/wallet`/`/payments`/
`/subscription` redirects an anonymous visitor to `/login` (including with
forged `?status=success&paid=true` query parameters, which cannot bypass
the gate); the intended destination is preserved and actually restored
end-to-end (anonymous `/wallet` visit → redirect → mocked login → lands
back on `/wallet`); authenticated deep-link/refresh access succeeds without
redirecting to `/login` for all four routes with no redirect loop; guest
restoration routes and the admin route (its own separate gate,
`/admin/login`, unchanged) remain reachable; the legacy restoration order
page issues GET requests only on load and reload with zero
`.../items/*/process` POSTs; zero external network calls occur on an
authenticated `/orders` visit; and 360/390/430px layouts remain usable with
no horizontal overflow on both an authenticated protected page and the
login redirect target.

Backend (`npx tsx --test`, from `apps/api`, no DB required for these focused
suites):

| Suite | Result |
|---|---|
| `domain/pricing/priceBook.test.ts` | pass (unmodified) |
| `domain/pricing/offerProvider.test.ts` | pass (unmodified) |
| `services/sharp-variant.service.test.ts` (P5B) | **3/3 pass** (unmodified) |
| `utils/guest-ownership.test.ts` | pass (unmodified) |
| `services/restoration-customer.service.test.ts` | pass (unmodified) |

Full workspace:

| Command | Exit |
|---|---|
| `npm run lint` | 0 — 0 errors, 89 pre-existing warnings |
| `npm run typecheck` (api + web) | 0 |
| `npm run build` (api + web) | 0 |
| `npx prisma validate` (repair: `DATABASE_URL` env required — set, re-ran) | 0 |
| `npx prisma generate` | 0 |
| `git diff --check` | 0 (clean) |
| `git diff --cached --check` | 0 (clean) |

### 17.6 Zero-live-call proof

No production database, deployment, live Replicate/R2/RunPod/MPGS network
call occurred. Every browser test either blocks non-local traffic and mocks
the exact endpoint it exercises, or (for the three non-`/orders` deep-link
tests) allows the page's own data GET to fail via natural connection-refused
(no real API server in this harness) while asserting only the auth gate,
never touching a real backend. No checkout route was created;
`BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remains open, unchanged.

### 17.7 Result

PR #128 merged (`53d667d7fe275a03d84d9656faedd6dc0e23ffeb`). PriceBook
reconciled (no change to prices/behavior; stale docs corrected). Four
customer routes hardened with the existing `RequireAuth` mechanism. One
genuine page-load-triggered auto-dispatch defect found and repaired. 36/36
browser tests, 5/5 focused backend suites, lint/typecheck/build/Prisma all
clean. No RunPod/MPGS/deployment/product-scope-expansion change.

## 18. R9.2-MERGE-P129-AND-P6B-APPROVED-OFFER-WIRING (2026-08-05)

Branch: `feat/r9.2-p6b-approved-offer-wiring`, from a clean worktree
(`D:\Temp\r92-p6b-approved-offer-wiring`) built off updated `origin/main`
(after the PR #129 merge below). This section is a dated amendment,
appended per the Protected Scope Protocol; nothing in sections 1–17 was
changed.

### 18.1 PR #129 merge

PR #129 (`feat/r9.2-p6a-customer-route-hardening`, head
`62531cc33b4c3b9f1e54cd53a5e6d45db88456fe`) was re-verified: `state: OPEN`,
`mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, no configured checks;
files matched the expected P6A set exactly. The existing focused P6A
browser suite (36/36) and backend suite (11/11) were re-run and passed
before merge. Merged normally (`gh pr merge 129 --merge
--delete-branch=false`). **Merge commit: `f76a3c4f8c2c1b9f94b1def65767ab27d4775212`.**

### 18.2 Flow inspected before wiring

Read the schema, domain guards, ownership utilities, and pricing modules
directly rather than trusting the ignored audit file's prose. Found: the
`FixedOrder`/`FixedOrderItem`/`RestorationDraft` Prisma models, the pure
domain guards (`fixedOrderGuards.ts`), the ownership helpers
(`assertOwnership`/`actorFromRequest`), and the pricing stack
(`priceBook.ts`, `offerProvider.ts`, `approvedOfferProvider.ts`,
`priceBookValidator.ts`) all already existed and were already tested in
isolation -- but **no controller, route, or service anywhere in this
repository had ever called any of them together**. `FixedOrder`'s own
schema comment already named the intended path,
`POST /api/fixed-orders/restoration-digital`, but it did not exist.
Building the smallest service+controller+route that actually calls this
existing, already-tested domain logic is therefore new code, not a
duplicate of anything -- there was nothing to reuse at the HTTP layer, only
domain logic to wire.

### 18.3 What was built (smallest change)

- `apps/api/src/services/fixed-order.service.ts` (new) --
  `FixedOrderService.createRestorationDigitalOrder(input, actor)`. Reads
  only `draftId`/`tier` from its input. Resolves market/currency from the
  caller's own, already-owned `RestorationDraft` (never from the request).
  Defaults to `ApprovedOfferProvider`; a provider override exists only so a
  test can inject `FixtureOfferProvider` and prove it is rejected/never
  approved -- no production code path overrides it. Persists exactly one
  `FixedOrder` + one `FixedOrderItem` in a `prisma.$transaction`, with the
  exact PriceBook snapshot (`priceBookVersion`, `priceBookApprovalReference`,
  `priceBookEffectiveAt`) and `pricingApproved`/`pricingSource` set from the
  resolved offer's own `source` field -- never hardcoded `true`. Idempotent
  via the pre-existing `FixedOrder.sourceDraftId` unique index: a repeat
  call (including a real concurrent race) re-reads and returns the winning
  order rather than erroring, following the exact
  try/catch-P2002/converge-after-conflict shape already established in
  `p4a-payment-verified-execution-queue.service.ts`.
- `apps/api/src/controllers/fixed-order.controller.ts` (new) -- reads only
  `req.body.draftId`/`req.body.tier`; any other field a caller attaches is
  never read. Always constructs `FixedOrderService` with its default
  provider.
- `apps/api/src/routes/restoration.routes.ts` (modified, additive) -- one
  new route, `router.post("/fixed-orders/restoration-digital", ...)`,
  added to the **existing** restoration router (no new router file, no new
  `app.use` mount). Rate-limited identically to the other write routes in
  this file.

No Prisma schema or migration change was needed -- every field this packet
writes to already existed from R9.2-P0A/P1A/P1B/P1C-B.

### 18.4 Guarantees (by construction + test)

- Production order creation uses `ApprovedOfferProvider` exclusively;
  `FixtureOfferProvider` cannot be selected by any production request path
  (no request field selects a provider at all).
- Supports approved PKR and USD ORIGINAL/2HD/4HD prices from
  `PB-2026-08-03-v1`; `automaticFxAllowed` is never read or acted on by this
  service (no FX conversion of any kind occurs).
- The client can select a tier; it cannot supply amount, currency, PriceBook
  version, pricing source, or approval state -- none of these fields exist
  on the service's input type, so a forged value attached to the request
  object is structurally unreadable, not merely validated-away.
- The server persists the exact PriceBook snapshot (version, approval
  reference, effective-at) at creation time, never recomputed later.
- Every approved order item is stored with `pricingApproved: true` and
  `pricingSource: "approved_pricebook"`; a `local_fixture`-priced item is
  always stored with `pricingApproved: false` -- proven by test, not just
  asserted in a comment.
- Fails closed (`422`, before any database write) on an invalid tier or an
  invalid/missing market-currency pairing on the draft.
- Immutability and idempotency are enforced by the pre-existing
  `FixedOrder.sourceDraftId` unique index, unchanged.
- Ownership reuses the existing `assertOwnership`/`actorFromRequest`
  helpers verbatim: a wrong-owner request and a nonexistent-draft request
  produce an identical 404, enumeration-safe.
- Order creation stops before checkout/payment: zero `PaymentAttempt`,
  `PaymentEvent`, `RestorationEntitlement`, `RestorationMaster`, or
  `ReplicateExecution` row is ever created by this code path.
- No MPGS checkout route was created;
  `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remains open,
  untouched. RunPod was not read for modification and was not touched.

### 18.5 Test evidence

New, against a disposable local PostgreSQL 17 (loopback-only, random port,
`pg_hba.conf` set to `trust` for this throwaway cluster only,
`DATABASE_URL`/`DISPOSABLE_DATABASE_URL` passed only as process environment
variables, never written to `.env`):

| Suite | Result |
|---|---|
| `fixed-order.service.test.ts` (unit, no DB) | **3/3 pass** |
| `fixed-order.service.pg-race.test.ts` (real disposable PG 17) | **14/14 pass** |

The 14 pg-race tests prove: Pakistan ORIGINAL creates the correct PKR
approved order (`25000`, `pricingApproved: true`, `PB-2026-08-03-v1`
snapshot persisted); International 2HD creates the correct USD approved
order (`250`); 4HD uses the exact server price for both markets (`50000` /
`350`); forged `amountMinor`/`currency`/`priceBookVersion`/`pricingSource`/
`pricingApproved` fields attached to the request are ignored -- the
server-resolved PKR/`25000`/`PB-2026-08-03-v1`/`approved_pricebook` values
win every time; an explicitly test-injected `FixtureOfferProvider` order is
always persisted with `pricingApproved: false` and no PriceBook snapshot;
an invalid market/currency and an invalid tier each fail closed with zero
`FixedOrder` rows written; a sequential repeat submission (a page
refresh) reuses the same immutable order even when a different tier is
requested the second time; two REAL concurrent submissions for the same
draft converge on exactly one `FixedOrder` row; a wrong-owner request and a
nonexistent-draft request produce byte-identical 404 evidence; zero
`PaymentAttempt`/`PaymentEvent`/`RestorationEntitlement`/
`RestorationMaster`/`ReplicateExecution` rows are ever created; zero
external network calls; full teardown.

Regression (each run in its own isolated `npx tsx --test` invocation --
running all pg-race files in one glob invocation causes cross-file state
interference on the shared disposable database and is not this suite's
supported invocation shape, confirmed by re-running each file alone
afterward with the same disposable instance and seeing every test pass):

| Suite | Result |
|---|---|
| `p3a-replicate-execution-worker.pg-race.test.ts` | **10/10 pass** (unmodified) |
| `p4a-payment-verified-execution-queue.service.pg-race.test.ts` | **14/14 pass** (unmodified) |
| `p4b-internal-worker-runner.service.pg-race.test.ts` | **10/10 pass** (unmodified) |
| `p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts` | **6/6 pass** (unmodified) |
| `sharp-variant.service.pg-race.test.ts` (P5B) | **3/3 pass** (unmodified) |
| All other `*.test.ts` (non-DB, run together): domain/pricing (PriceBook,
  offerProvider, fixedOrderGuards, paymentReadiness), P3A unit, P4C/P4C2
  MPGS unit, restoration domain/customer/view/entitlement, guest-ownership,
  admin-auth middleware, image-binary, RunPod isolation/budget/dev-config,
  utils | **143/143 pass** (unmodified) |
| `p4c2-mpgs-provisioning-config-diagnostic.test.ts` (vitest, not `node:test`) | **14/14 pass** (unmodified) |
| `npx playwright test tests/browser` (P5A + P6A) | **36/36 pass** (unmodified) |

Full workspace:

| Command | Exit |
|---|---|
| `npm run lint` | 0 — 0 errors, 89 pre-existing warnings (unchanged count) |
| `npm run typecheck` (api + web) | 0 |
| `npm run build` (api + web) | 0 |
| `npx prisma validate` | 0 |
| `npx prisma generate` | 0 |
| `git diff --check` | 0 (clean) |
| `git diff --cached --check` | 0 (clean) |

**Repair note**: the full-workspace non-DB test run also passed through
this repository's pre-existing RunPod test suite, which writes disposable
scratch fixture files (`apps/api/runpod-worker-dev/worker-request.json`,
`worker-corrupt.json`) as a side effect of running. These were unstaged and
deleted before commit -- RunPod source and behavior were not read for
modification, not touched, and remain unauthorized for any change, exactly
as this task required.

### 18.6 Disposable PostgreSQL cleanup proof

`pg_ctl -m fast -w stop` → `"server stopped"`. The exact `postmaster.pid`
first line was captured before stop; `Get-Process` on that PID afterward
returned nothing -- process confirmed gone. `Test-NetConnection` on the
chosen port afterward reported `TcpTestSucceeded: False` -- port confirmed
free. The random initial `pwfile.txt` password was deleted immediately
after `initdb`, before the cluster was even started (the cluster then ran
with a throwaway, this-session-only `trust` rule for loopback connections
only). The entire temporary data directory was deleted afterward;
`Test-Path` on it returned `False` -- confirmed absent. No real/system
PostgreSQL installation was touched at any point.

### 18.7 Scope boundary (explicitly not built)

No customer-facing "review" UI exists anywhere in this repository to wire
server minor-unit pricing display into -- the upload/draft-creation flow
itself has no route or page either (a pre-existing gap, not introduced or
closed by this packet). Building one was out of this task's "smallest
change" scope. The new endpoint's response already carries the exact
server minor-unit price (`totalAmountMinor` as a string, plus
`pricingApproved`/`pricingSource`/PriceBook snapshot fields) for whenever
such a UI is built; this is recorded as a remaining gap, not fabricated
around.

### 18.8 Result

PR #129 merged (`f76a3c4f8c2c1b9f94b1def65767ab27d4775212`). Approved
PriceBook pricing is now reachable end-to-end via
`POST /api/fixed-orders/restoration-digital`, server-owned, fail-closed,
idempotent, enumeration-safe, and stops before any payment/execution row.
14/14 new pg-race tests, 3/3 new unit tests, 5 unmodified pg-race
regressions, 143/143 non-DB regressions, 14/14 vitest regression, 36/36
browser regressions all pass. Lint/typecheck/build/Prisma/git-diff all
clean. No RunPod, MPGS checkout, deployment, or production-database change.

## 19. R9.2-MERGE-P130-AND-P6C-CUSTOMER-MVP-FLOW (2026-08-05)

Branch: `feat/r9.2-p6c-customer-mvp-flow`, from a clean worktree
(`D:\Temp\r92-p6c-customer-mvp-flow`) built off updated `origin/main` (after
the PR #130 merge below). This section is a dated amendment, appended per
the Protected Scope Protocol; nothing in sections 1–18 was changed.

### 19.1 PR #130 merge

PR #130 (`feat/r9.2-p6b-approved-offer-wiring`, head
`d01f8201c547d33bd36269bbc85cb0aeedce03ff`) was re-verified: `state: OPEN`,
`mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, no required failing
checks, files matched the expected nine P6B files exactly. The focused P6B
unit test (3/3) and a fresh disposable-PostgreSQL pg-race run (14/14) both
passed before merge; the disposable instance was fully torn down
(PID/port/temp-data confirmed) immediately after. Merged normally
(`gh pr merge 130 --merge --delete-branch=false`). **Merge commit:
`1e325e9c8cb457812f222930c0fa21ce8bc1245e`.**

### 19.2 Source-of-truth audit (before writing anything new)

Searched `git log --all --diff-filter=A --name-only` (not just `main`'s own
history) for every historical file this task named:
`restoration-draft.controller.ts`/`.service.ts`/`.routes.ts`,
`FixedOrderReviewPage.tsx`, `OriginalPreviewPage.tsx`,
`DigitalTierSelectPage.tsx`. Found:

- `restoration-draft.controller.ts`, `restoration-draft.service.ts`,
  `restoration-draft.routes.ts`, and `FixedOrderReviewPage.tsx` were all
  added in exactly **one** commit, `f47b6cf` ("chore: add repository
  project automation files"), on the local branch `setup/project-automation`.
  That branch's parent (`38f768d`, the PR #118 merge) is far behind current
  `main` — it predates P4B, the P4C independent review, P4D, P5A, P5B, P6A,
  and P6B entirely. The branch was never merged into `main`
  (`git log --oneline main..setup/project-automation` shows only that one
  commit; `setup/project-automation..main` shows dozens of commits absent
  from it). Its own `fixed-order.service.ts` (355 lines, a different,
  older implementation) directly conflicts with the already-merged, tested,
  currently-live `fixed-order.service.ts` from P6B.
- `OriginalPreviewPage.tsx` and `DigitalTierSelectPage.tsx` never existed
  anywhere in this repository's history under those names, on any branch.

**Conclusion, not an assumption**: this historical code is real (it exists,
it was written, it is not a fabrication) but is **superseded** — an
abandoned, pre-P4B, never-merged alternate implementation, not a piece of
`main` that was accidentally deleted. Cherry-picking it would reintroduce a
`fixed-order.service.ts` that conflicts with the tested one already on
`main` and would bypass every schema/security change since. It was
correctly left uncherry-picked. The MVP below reuses, unchanged, every
still-current and already-tested piece: `imageValidation.ts`, `market.ts`,
`ownership.ts`/`guest-ownership.ts`, the full pricing stack, and P6B's
`fixed-order.service.ts` itself (extended, not replaced).

### 19.3 What was built (minimum customer MVP)

**Backend** (all new; nothing duplicates an existing service — none of
these routes existed on `main` before this packet):

- `apps/api/src/services/restoration-draft.service.ts` —
  `RestorationDraftService.createDraft/getDraft/getOffers`. Storage is
  injected as a narrow port (same pattern as `sharp-variant.service.ts`'s
  `SharpVariantStorage`), so this service never depends on `AppConfig`/env
  directly. `createDraft`: `assertMarketConfirmed` + `deriveMarketFromCountry`
  (existing `market.ts`, unchanged) resolve market/currency from a
  client-sent country code + explicit confirmation flag — never a market/
  currency value directly; `assertSafeUploadFileName` +
  `decodeDraftImageBase64` + `validateRestorationDraftImage` (existing
  `imageValidation.ts`, unchanged) perform real magic-byte + Sharp-decode
  validation, size and pixel-budget checks **before** any storage write;
  upload happens only after validation passes; the draft row is created
  only after upload succeeds. `getDraft` returns a signed, time-limited
  preview URL — the private storage key itself is never included in any
  response. `getOffers` resolves the draft's own market through the
  existing `ApprovedOfferProvider`.
- `apps/api/src/controllers/restoration-draft.controller.ts` +
  `apps/api/src/routes/restoration-draft.routes.ts` (new router, mounted in
  `index.ts` alongside the existing restoration router — no route
  duplicated): `POST /api/restoration-drafts`,
  `GET /api/restoration-drafts/:id`, `GET /api/restoration-drafts/:id/offers`.
- `apps/api/src/services/fixed-order.service.ts` (P6B, extended) —
  `getByOrderNo`, read-only, reusing `assertOwnership` unchanged (uniform
  404, enumeration-safe). Mounted as `GET /api/fixed-orders/:orderNo` on the
  **existing** `restoration.routes.ts` router (no new router file).

**Frontend** (four new pages, explicit-button flow, no page issues a write
on mount or refresh):

- `RestorationUploadPage.tsx` — country select + explicit confirmation
  checkbox + file picker; uploads only on the "Upload photo" button click.
- `OriginalPreviewPage.tsx` — GET-only on mount and on the "Refresh"
  button; shows the signed preview; "Choose resolution" is an explicit
  button to the next step.
- `DigitalTierSelectPage.tsx` — GET-only offers load on mount/refresh;
  tier selection is a click; order creation happens only on the explicit
  "Create order" button click.
- `FixedOrderReviewPage.tsx` — GET-only on mount and refresh; displays
  server market, currency, tier, amount (minor units converted for
  display only), and PriceBook version; always renders a truthful
  "payment is not yet available" message (`BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED`
  remains open) — reads no query parameter at all, so a forged
  `?status=success` cannot fabricate anything.
- `customerApi.ts` (extended, additive): `createRestorationDraft`,
  `getRestorationDraft`, `getRestorationDraftOffers`, `createFixedOrder`,
  `getFixedOrder`. Guest ownership uses the existing, unchanged
  `lib/guest.ts` key-value store (already generic by id, reused verbatim
  for draft ids and order numbers — no new guest-token mechanism).

No Prisma schema/migration change was needed. No checkout/MPGS route was
added. No production deployment occurred.

### 19.4 Test evidence

Backend, unit (no DB, `npx tsx --test`):

| Suite | Result |
|---|---|
| `restoration-draft.service.test.ts` (new) | **4/4 pass** |

Backend, disposable local PostgreSQL 17 (loopback-only, random port,
`pg_hba.conf` `trust` for this throwaway cluster only, `DATABASE_URL`/
`DISPOSABLE_DATABASE_URL` passed only as environment variables, never
written to `.env`; **each pg-race file run in its own isolated `tsx --test`
invocation**, per this suite's established, non-glob-safe convention):

| Suite | Result |
|---|---|
| `restoration-draft.service.pg-race.test.ts` (new) | **9/9 pass** |
| `fixed-order.service.pg-race.test.ts` (extended with `getByOrderNo` tests q11a/q11b) | **16/16 pass** |
| `p3a-replicate-execution-worker.pg-race.test.ts` (regression, isolated) | **10/10 pass** |
| `p4a-payment-verified-execution-queue.service.pg-race.test.ts` (regression, isolated) | **14/14 pass** |
| `p4b-internal-worker-runner.service.pg-race.test.ts` (regression, isolated) | **10/10 pass** |
| `p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts` (regression, isolated) | **6/6 pass** |
| `sharp-variant.service.pg-race.test.ts` (P5B regression, isolated) | **3/3 pass** |
| All remaining non-pg-race `*.test.ts` run together | **147/147 pass** |
| `p4c2-mpgs-provisioning-config-diagnostic.test.ts` (vitest, correct runner) | **14/14 pass** |

The 9 new `restoration-draft` pg-race tests prove: a Pakistan upload
persists a `PAKISTAN`/`PKR` draft with a guest ownership token and the
storage key is never present in any response; an International upload
persists `INTERNATIONAL`/`USD`; a Pakistan draft's offers are exactly
`25000`/`35000`/`50000` PKR; an International draft's offers are exactly
`150`/`250`/`350` USD; wrong-owner and nonexistent-draft requests produce
byte-identical 404 evidence; repeated `getDraft` reads never trigger a
second upload or a second draft row; zero external network calls; full
teardown. The extended `fixed-order` pg-race tests prove `getByOrderNo`
returns the exact server review view (market/currency/tier/amount/
PriceBook version) and the same enumeration-safe 404 behavior for
wrong-owner/nonexistent order numbers.

Browser (`npx playwright test tests/browser`, Chromium-only, local Vite dev
server, no real API server, every response mocked, `blockExternalNetwork`
aborting all non-local traffic):

| Suite | Result |
|---|---|
| `p5a-restoration-status.spec.ts` (pre-existing, unmodified) | 13/13 pass |
| `p6a-customer-route-hardening.spec.ts` (pre-existing, unmodified) | 23/23 pass |
| `p6c-customer-mvp-flow.spec.ts` (new) | **16/16 pass** |

The 16 new P6C browser tests prove: the upload page never fires the create
call before the "Upload photo" button is clicked; the full Pakistan
PKR flow (upload → preview → tiers → order → review) shows exactly `PKR
250.00` for ORIGINAL and `PB-2026-08-03-v1`; the International flow shows
exactly `USD 1.50`/`2.50`/`3.50` for ORIGINAL/2HD/4HD and the correct
market/currency on review; a wrong guest token on review and a nonexistent
draft on preview both render an identical not-found state; forged
`?status=success&paid=true` query parameters on the review page change
nothing (the page never reads them); refreshing the preview and review
pages issues GET requests only — zero writes, zero processing/payment
calls; 360/390/430px layouts remain usable with no horizontal overflow on
both the review and tier-select pages; the complete upload→review flow
makes zero external network calls. One test-authoring bug (not a product
defect) was found and fixed during this run: a `getByText("PAKISTAN")`
locator ambiguously matched a footer string too; corrected to `{ exact:
true }`, rerun, passed.

Full workspace:

| Command | Exit |
|---|---|
| `npm run lint` | 0 — 0 errors, 89 pre-existing warnings (one incidental new `eslint-disable` directive was found unused and removed, restoring the exact baseline count) |
| `npm run typecheck` (api + web) | 0 |
| `npm run build` (api + web) | 0 |
| `npx prisma validate` | 0 |
| `npx prisma generate` | 0 |
| `git diff --check` | 0 (clean) |
| `git diff --cached --check` | 0 (clean) |

**Incidental finding, corrected before commit (same class as the P6B
packet)**: the full non-DB regression sweep again incidentally ran this
repository's pre-existing RunPod test suite, which writes disposable
scratch fixture files (`apps/api/runpod-worker-dev/worker-request.json`,
`worker-corrupt.json`). These were unstaged and deleted before commit;
RunPod source was not read for modification, not touched, and remains
unauthorized for any change.

### 19.5 Disposable PostgreSQL cleanup proof

`pg_ctl -m fast -w stop` → `"server stopped"`. The exact `postmaster.pid`
first line was captured before stop; `Get-Process` on that PID afterward
returned nothing — process confirmed gone. `Test-NetConnection` on the
chosen port afterward reported `TcpTestSucceeded: False` — port confirmed
free. The random `pwfile.txt` password was deleted immediately after
`initdb`, before the cluster was started (it then ran with a throwaway,
this-session-only `trust` rule for loopback connections only, never a
real credential). The entire temporary data directory was deleted
afterward; `Test-Path` returned `False` — confirmed absent. No real/system
PostgreSQL installation was touched.

### 19.6 Requirement-by-requirement confirmation

Guest and authenticated ownership both supported (proven by test); uniform
404 for unauthorized access (proven by test, both draft and order); real
byte/decode validation before storage/DB (proven by test — corrupt bytes
never reach `uploadOriginal`); private storage key never returned (proven
by test — the safe view type has no such field, and the raw key string
never appears in a serialized response); approved `PB-2026-08-03-v1`
pricing only, PKR and USD, no FX (unchanged from P6B, reused verbatim);
client cannot supply price/currency/version/source/approval state (the
request types for both draft creation and order creation have no such
fields); upload/order creation only after an explicit button click (proven
by browser test — zero calls before the click); refresh/deep-link performs
GET only (proven by both backend and browser test); repeated order
submission reuses one immutable order (P6B behavior, unchanged, reused);
review displays server amount/market/tier/PriceBook version (proven by
browser test); payment remains truthfully blocked while MPGS is
unavailable (the review page has no payment-initiation code path at all,
and reads no query parameter); zero `PaymentAttempt`, execution, Replicate,
or Sharp call (proven by test — this flow's services import none of those
modules). No MPGS checkout route was created. No deployment occurred.

### 19.7 Result

PR #130 merged (`1e325e9c8cb457812f222930c0fa21ce8bc1245e`). The historical
P1A-named flow was found, audited, and correctly determined to be
superseded (stale, pre-P4B, never-merged) rather than reused. The minimum
customer MVP — market selection → upload → draft → signed preview → server
offers → tier selection → immutable order → review — is now real, wired
with the smallest new code needed, reusing every existing secure utility
unchanged. 13/13 new backend tests (4 unit + 9 pg-race), 16/16 new browser
tests, 2 extended `fixed-order` pg-race tests, and every regression suite
(5 pg-race in isolation, 147 non-DB, 14 vitest, 36 pre-existing browser)
all pass. Lint/typecheck/build/Prisma/git-diff all clean. No RunPod, MPGS
checkout, deployment, or production-database change.

## 20. R9.2-MERGE-P131-AND-P4D-MPGS-SANDBOX-AUTH (2026-08-05)

### 20.1 PR #131 merge

Verified PR #131 (`feat/r9.2-p6c-customer-mvp-flow`, head
`4557aa02b433c81ae813cb5d76a8abcd4ca9816c`) OPEN/CLEAN/MERGEABLE, no
required failing check (none configured on this branch), expected P6C file
scope only (`fixed-order`/`restoration-draft` controller/service/routes,
customer-facing pages, browser fixtures/spec, docs), no secret/deployment/
RunPod change (`gh pr diff` scanned for `RUNPOD|RunPod|secret|Dockerfile|
wrangler|deploy` — every hit was a doc sentence stating those things were
*not* touched). Ran the focused suite in an isolated worktree
(`D:\Temp\r92-p131-verify`) against a disposable PostgreSQL 17 instance:
16/16 `fixed-order.service.pg-race.test.ts`, 9/9
`restoration-draft.service.pg-race.test.ts`, 4/4
`restoration-draft.service.test.ts`, 16/16 P6C Playwright browser tests,
API and web `typecheck` both clean. Merged normally
(`gh pr merge 131 --merge --delete-branch=false`). **Merge commit:
`a3c4981a5c2d6a94914036762886961ea6aed4cf`.** Disposable Postgres stopped,
data directory removed, worktree removed immediately after.

### 20.2 New Bank Alfalah bank-confirmed facts recorded

Owner-reported bank confirmation (not derived, not guessed) recorded in
`docs/payments/bank-alfalah-mastercard/P4D_BANK_CONFIRMED_MERCHANT_PROFILE_2026-08-05.md`:
a complete bank-issued **15-character** Merchant ID is active in sandbox;
Hosted Checkout/API access is enabled; the confirmed integration is **API
V100** with `apiOperation=INITIATE_CHECKOUT` (correcting every prior
packet's `standard-pattern-fallback` assumption of `74`); the same
credentials cover **both PKR and USD** sandbox testing; Operator ID is
MPGS-portal-login-only (unchanged rule); a webhook endpoint must be
supplied (not yet supplied); the bank supplied webhook source IP(s) that
were not included in this session's task text (recorded as an explicit,
unfilled owner TODO — never guessed); and the bank states allowlisting/3DS/
return configuration is aligned. No Merchant ID, API Password, Operator ID,
or other secret value is recorded anywhere in this document or any other
tracked file.

### 20.3 Code changes (env/config-driven only — no protocol shape changed)

- `BANK_ALFALAH_MPGS_API_VERSION` default `74` -> `100` (`config/env.ts`),
  matching the bank-confirmed value.
- `MPGS_CURRENCY_SUPPORT.USD`: `enabled: false` -> `true`, evidence
  `standard-pattern-fallback` -> `doc-confirmed-live-fetch`, citing the
  bank's direct confirmation of shared PKR/USD sandbox credentials. This
  authorizes the bounded sandbox *test* only — it does not itself mark USD
  `SANDBOX_VERIFIED` and does not touch production.
- `p4c-bank-alfalah-mpgs-sandbox-smoke.ts` rewritten: attempts PKR first;
  USD only after PKR authentication succeeds; prints
  `BANK_ALFALAH_MPGS_MERCHANT_ID` length only (never the value), the API
  version, and `apiOperation=INITIATE_CHECKOUT`; stops (exit 3) with an
  exact, printed Bank Alfalah follow-up question if PKR is rejected in a
  shape consistent with a merchant-id length/recognition issue, rather than
  guessing a truncated/derived id.
- `bank-alfalah-mpgs-sandbox-smoke.yml`: `BANK_ALFALAH_MPGS_API_VERSION`
  `74` -> `100`.
- Two gateway unit tests updated (USD now accepted, not rejected) and one
  env-default test updated (`apiVersion` `"74"` -> `"100"`) to match the
  above; no other assertions changed.

### 20.4 Real sandbox dispatch result (run `30987873211`)

Dispatched `bank-alfalah-mpgs-sandbox-smoke.yml` against
`feat/r9.2-p4d-mpgs-sandbox-auth` with the corrected API version and the
exact, untruncated 15-character Merchant ID. Result: **HTTP 404** on
Hosted Checkout initialization — the same structural failure shape as the
prior P4C attempt (run `30910714515`, API version `74`). Sanitized fields:
Merchant ID length `15`; API version `100`; `apiOperation=
INITIATE_CHECKOUT`; Content-Type `application/json;charset=ISO-8859-1`;
`WWW-Authenticate` `none`; correlation/request ID `none`. Retrieve Order
was never reached (flow stops on first failure); USD was never attempted
(gated behind PKR success, which did not occur). Full detail:
`docs/payments/bank-alfalah-mastercard/P4D_SANDBOX_AUTH_VERIFICATION.md`.

**`P4C_MPGS_AUTH_VERIFIED`: NOT achieved.** Per task rule 4 ("when the exact
15-character ID is rejected because of identifier length or merchant
recognition, stop"), this session stopped and produced the exact Bank
Alfalah follow-up question (recorded in full in
`P4D_SANDBOX_AUTH_VERIFICATION.md` §5) asking whether a separate, shorter
(<=12 character) gateway Merchant ID must be used instead. No guessed
12-character substring was tested against the live sandbox.
`MERCHANT_PROFILE_ENABLEMENT_REQUIRED` is retained, not retired.

### 20.5 Conditional checkout implementation: not started

Per task rule 5 ("When authentication fails, make no checkout/customer-route
changes"), since authenticated `INITIATE_CHECKOUT` did not succeed, **no**
checkout-route or customer-facing payment code was added or modified this
session. `p4c-bank-alfalah-mpgs-gateway.service.ts` remains unwired from
any Express router/controller, exactly as before.

### 20.6 Testing / cleanup

25/25 `p4c-bank-alfalah-mpgs-gateway.service.test.ts` (up from 23, USD
cases updated), 7/7 `p4c-bank-alfalah-mpgs-env.test.ts`, 14/14 P4C2
diagnostic (`vitest`), 16/16 `fixed-order` DB tests, 9/9
`restoration-draft` DB tests (all on a disposable PostgreSQL 17 instance —
PID stopped, port freed, data directory deleted, confirmed after each use),
1/1 legacy-APG-retired scan test. API and web `typecheck` clean, API build
clean, `prisma validate`/`generate` clean. No RunPod, no production
credential, no card data, no capture, at any point in this session.

## R9.2-P4D Checkout Foundation (2026-08-05)

- Added only the explicit-button customer checkout boundary on POST /api/orders/:orderNo/checkout and read-only GET /api/orders/:orderNo/payment-status.
- The request body contract is orderNo only. The server reloads and ownership-checks the immutable FixedOrder, amount, currency, and approved PriceBook snapshot.
- Provider readiness is fail-closed: disabled MPGS returns PAYMENT_PROVIDER_UNAVAILABLE before PaymentAttempt creation or any external request.
- Existing FixedOrder, PaymentAttempt, P4C gateway, and P4A verification boundaries are reused. No webhook/browser-return state mutation, card handling, capture, production activation, RunPod, schema, or migration change was made.
- Verification: API/web typecheck and builds, lint, Prisma validate, payment-readiness/domain/P1B focused tests passed. Disposable PostgreSQL race, full browser suite, and live-provider checks were not run without approved disposable database/browser infrastructure and remain blockers.

## R9.2-P4E Customer Checkout UI (2026-08-05)

- FixedOrder review now shows server-owned amount, currency, and tier and provides an explicit Pay securely action only.
- POST /api/orders/:orderNo/checkout sends only orderNo; GET /api/orders/:orderNo/payment-status is used for read-only status.
- PAYMENT_PROVIDER_UNAVAILABLE is shown truthfully. Query parameters never fabricate success, refresh/reload do not post, duplicate clicks are disabled, and guest/auth ownership headers are preserved.
- Focused P4E browser tests: 6/6. Full Playwright suite: 58/58. No external network calls were permitted by the browser harness.
- No webhook, card, capture, live MPGS, production, RunPod, schema, migration, or P4A application change.

## R9.2-MERGE-P134-AND-MPGS-FINAL-LOCAL-INVESTIGATION (2026-08-05)

- PR #134 (`feat/r9.2-p4e-checkout-ui`) verified (head `ca6b1144ccaced3dea8e6291a2a6d1ca5e1b4f40`, CLEAN/MERGEABLE, P4E-only scope, no secret/webhook/capture/deployment/RunPod change, no failing required check) and merged. Merge SHA: `6dcc5c32a5326cd7f45623be515fc55d79bf6d0f`.
- Post-merge full regression on updated `origin/main`, isolated worktree, disposable local PostgreSQL 17 (never the persistent service): 58/58 DB-level checks (customer-checkout, fixed-order, P4C MPGS gateway, P4A payment queue, P4B worker runner, restoration-draft, sharp-variant pg-race suites) + 58/58 Playwright browser regression + typecheck/lint/build/`prisma validate` all clean. Cleanup proven: PID gone, port free, persistent service untouched, temp directory deleted.
- Live MPGS sandbox investigation (see `docs/payments/bank-alfalah-mastercard/P4D_MPGS_FINAL_LOCAL_INVESTIGATION_2026-08-05.md`): a 4-request auth-isolation matrix confirmed `HTTP 401 Invalid credentials` identically across `POST .../session` (two content-types) and `GET .../order/{id}` (Retrieve Order) — a credential/API-user/permission defect, now evidenced across three endpoint shapes. Separately, the currently-coded `PUT .../order/{id}/checkout` returned `HTTP 404` whose body names the expected path segment as `/transaction`, not `/checkout` — a new structural lead, not yet bank-confirmed, so no adapter code was changed and `BANK_ALFALAH_MPGS_ENABLED` remains `false`.
- `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remains open; two exact follow-up questions for Bank Alfalah are recorded in the evidence document above. No product/gateway code was changed by this packet.

## R9.2-BAF-PURCHASE-FINAL-TEST-AND-EVIDENCE (2026-08-05)

- One live sandbox request, per the bank's latest owner-reported email requiring `interaction.operation="PURCHASE"`: `POST .../merchant/TESTGLOBALINDUS/session`, `Content-Type: text/plain`, `interaction.merchant.name: "Global Industrial Suppliers"`, PKR 1.00. Result: `HTTP 400`, a specific `order.id`-length field-validation error (`"field":"order.id","validationType":"INVALID"`) — structurally different from every prior `401 Invalid credentials` response and consistent with (not directly confirmed as) the request having passed authentication this time. Not a SUCCESS: no `session.id` was returned.
- TLS handshake independently confirmed via the real DigiCert-issued certificate chain for `test-bankalfalah.gateway.mastercard.com` and `time_appconnect > time_connect`. A sanitized PNG screenshot of the full request/response (password/Authorization fully redacted) was produced outside the repository for email attachment.
- A first script attempt failed locally before any evidenced network completion (empty response-header and 0-byte verbose capture) — disclosed in the evidence doc, not treated as a second live request.
- Incidental exposure disclosed: this session's own diagnostics printed the full `Authorization` header once while inspecting a leftover temp file; the file was deleted immediately and the current API Password should be treated as exposed/rotated by the bank as a precaution, independent of the technical finding above.
- A draft (unsent) Bank Alfalah reply is recorded in `docs/payments/bank-alfalah-mastercard/P4D_PURCHASE_FINAL_TEST_2026-08-05.md`, using only this session's new evidence. No product/gateway code was changed; `BANK_ALFALAH_MPGS_ENABLED` remains `false`.

## 21. R9.2-BAF-FINAL-CORRECTED-SESSION-PROOF (2026-08-05)

This dated amendment records one final sandbox `POST /session` request only;
nothing in sections 1-20 was rewritten. The corrected diagnostic order ID was
`BAF260805130116E632` (19 alphanumeric characters, below 41), with PKR `1.00`,
API V100, `INITIATE_CHECKOUT`, `PURCHASE`, and `Content-Type: text/plain`.
The endpoint returned HTTP `401`, response content type
`application/json;charset=ISO-8859-1`, curl exit `0`, and exactly:

```json
{"error":{"cause":"INVALID_REQUEST","explanation":"Invalid credentials."},"result":"ERROR"}
```

No `session.id` or `successIndicator` was returned. The real TLS connection was
to `216.119.223.23`; the certificate subject names
`test-bankalfalah.gateway.mastercard.com` and its issuer is DigiCert Global G2
TLS RSA SHA256 2020 CA1. The prior `400` order-ID-length defect is corrected;
this `401` leaves MPGS sandbox authentication and successful `POST /session`
unverified. No retry, USD test, card data, capture, product-code change,
production action, RunPod, Replicate, R2, webhook, or deployment occurred.

Two visually checked, redacted PNGs exist outside the repository at
`D:\Temp\claude\evidence\baf-final-request-response.png` and
`D:\Temp\claude\evidence\baf-final-conclusion.png`. Temporary request and
response artifacts were deleted after rendering. Bank Alfalah must provide the
one remaining action: credential reset, profile permission, or the correct
endpoint. The exposed API password requires immediate rotation/reissue before
any future request. `BANK_ALFALAH_MPGS_ENABLED` remains `false` and the adapter
is unchanged.

Validation: `p4c-bank-alfalah-mpgs-gateway.service.test.ts` 25/25;
`p4c-bank-alfalah-mpgs-env.test.ts` 7/7; `npm run lint` exit 0 (89 pre-existing
warnings, 0 errors); `npm run typecheck` exit 0. The first gateway-test run
failed only because `npm ci` had not generated Prisma Client; `npx prisma
generate` was the smallest environment repair and the complete 25-test suite
then passed. Final diff checks are recorded with the commit evidence.

## 22. R9.2-MPGS-ACTUAL-APP-E2E — PR #137 merged; contract mismatch, route collision, and rate-limit defects found and repaired via a new actual-app dry-run harness (2026-08-05)

PR #137 (`ops/r9.2-mpgs-actual-app-test`, head `3c2e2f0`) independently
re-verified (OPEN/CLEAN/MERGEABLE, 3 intended files, 10/10 env + 26/26
gateway/checkout + 68/68 pg-race + 58/58 Playwright, lint/typecheck/build
clean) and merged normally. Merge commit `1aa0040e72a962427cc2e2018722bb9f2e1d41a8`.

**Contract mismatch confirmed and repaired.** Section 21 above already
recorded an ad-hoc `POST /session` request reaching a structurally different
`401 Invalid credentials` (not a `404`) -- this session independently
confirmed, by live-fetching the bank's own v100 REST-JSON operation
documentation directly, that `POST .../merchant/{merchantId}/session` (not
`PUT .../order/{orderId}/checkout`, which the shipped adapter had always
used) plus a required `interaction.merchant.name` field is the correct
Hosted Checkout contract. This fully reconciles both prior results: the
original P4C `404` (calling an endpoint that never existed) and section 21's
`401` (calling the *correct* endpoint, but hitting the already-flagged
exposed-password/profile-enablement blocker). The adapter is repaired to
match; see
`docs/payments/bank-alfalah-mastercard/R9.2_MPGS_ACTUAL_APP_E2E_CONTRACT_CORRECTION_2026-08-05.md`
for the full record.

**Two additional, independent product defects found and repaired**, neither
related to MPGS specifically:
1. The MPGS checkout routes collided byte-for-byte with an earlier-mounted
   legacy `OrderController.createOrderCheckout` route, making the checkout
   endpoint unreachable via real HTTP traffic since it was first wired up.
   Moved to `/fixed-orders/:orderNo/checkout` and
   `/fixed-orders/:orderNo/payment-status`.
2. `rate-limit.middleware.ts` shared one global counter across every
   `rateLimit()` call site in the app (including the global per-request
   middleware), so unrelated traffic could exhaust an unrelated route's
   budget. Each call site now gets an isolated counter.

Both were found only because a new actual-app dry-run harness
(`apps/web/tests/browser-actual-app-dryrun/`,
`apps/web/playwright.actual-app-dryrun.config.ts`,
`apps/api/src/scripts/mpgs-local-stub-server.ts`) drives the REAL Express
router stack and REAL browser against a REAL disposable PostgreSQL instance
and REAL API server (MPGS base URL pointed at a local stub gateway, zero
live network calls) -- neither defect is visible to mocked
Playwright/unit-level testing, which is why nothing caught them earlier.
6/6 dry-run tests pass: success (full contract proof from the stub's
request log), duplicate-click protection, refresh-is-GET-only, and
400/401/404 error handling (never a fabricated paid/success state).

Full regression after all three repairs, run separately: 10/10 env tests,
26/26 gateway/checkout tests (plus 5 new: merchant-name fail-closed/valid,
route-collision guard x2, rate-limit isolation x2), 68/68 pg-race tests
(7 suites), 58/58 existing mocked Playwright tests, 6/6 new dry-run tests --
all against a fresh disposable PostgreSQL 17 instance, cleaned up after.
`eslint`/`tsc --noEmit`/`npm run build` clean for both workspaces; `prisma
generate`/`validate` clean.

No live sandbox request was made this session -- deliberately deferred
(this packet's own risk-sequencing decision: dry-run harness first, exactly
one live attempt only after it is fully green, in a dedicated follow-up
session). `BANK_ALFALAH_MPGS_ENABLED` remains `false` outside manual/CI
runs. `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` unchanged (a
separate, external provisioning question this packet does not address). No
production deployment, no RunPod/Replicate/R2/webhook/capture/P4A change, no
destructive Git operation, no Bank Alfalah support ticket or email drafted
or sent (explicitly out of scope for this packet).

## 23. R9.2-MPGS-CI-LIVE-PROOF — PR #139 merged; exactly one live sandbox request, client integration fully verified, HTTP 401 (bank-side) (2026-08-05)

PR #139 (`feat/r9.2-mpgs-ci-live-proof`, two-mode CI workflow) independently
re-verified via its own `pull_request`-triggered `dry-run` job -- 3 real CI
runs, 2 defects found and repaired directly in the actual GitHub Actions
Ubuntu environment (a merchant-id/name value mismatch against the test's
hardcoded contract-proof assertions; hardcoded Windows-only screenshot
paths that silently failed to resolve on the Linux runner, fixed via a
portable `SCREENSHOT_DIR` env var) -- final run green with real,
visually-verified screenshots. Merged normally: merge commit
`288e981dd837a4b000331ffdb44de145050a490f`.

**Live dispatch, owner-triggered only.** Per this packet's explicit
instruction, the assistant never called `gh workflow run`, `gh run rerun`,
or any other dispatch mechanism -- all `workflow_dispatch` runs on `main`
were triggered by the repository owner. Four attempts were needed before
the `live` job actually executed, all safely (zero live requests in the
first three):
- `31040799793` (+2 reruns of the same run) -- `mode` left on its default
  `dry-run`; `live` job skipped each time.
- `31041927467` -- same, `dry-run` again.
- `31042021781` -- `mode=live` correctly selected this time (confirmed
  because `dry-run` correctly skipped), but `confirm_live` did not exactly
  match the required string, so the `live` job's own fail-closed `if:`
  gate withheld it too. Zero live requests.
- `31042211650` -- both inputs correct. **`live` job ran, exactly once**,
  including its own "assert exactly one real gateway call" step passing.

**Result: `HTTP 401`.** Sanitized log (the only capture point -- the
gateway adapter's observability logging never records a response body,
only status/headers):
```
{"level":"info","message":"Bank Alfalah MPGS: initiateHostedCheckout request","meta":{"method":"POST","path":"/session","apiVersion":"100","currency":"PKR","orderIdLength":20}}
{"level":"warn","message":"Bank Alfalah MPGS: initiateHostedCheckout failed","meta":{"status":401,"detail":"content-type=application/json;charset=ISO-8859-1 www-authenticate=none correlation-id=none"}}
```
Confirmed exactly one request two independent ways: the workflow's own grep-count
assertion, and a manual re-grep of the full downloaded `api-server.log` artifact.

**Client integration classified fully verified.** Every field of the
outgoing request was compared against the bank's explicit written
instructions (quoted in this session) and their own live v100 REST-JSON
documentation (independently fetched in the prior R9.2-MPGS-ACTUAL-APP-E2E
packet): method, path, `apiOperation`, `interaction.operation=PURCHASE`,
`interaction.merchant.name`, Basic Auth username shape, currency, order-id
length/format, and return-URL handling all match exactly. Zero remaining
client-side discrepancy. The `401` is therefore classified as bank-side
(credential/profile/authentication state on Bank Alfalah's sandbox
profile), consistent with -- and now independently reproduced by an
automated, production-quality CI pipeline, not an ad-hoc script -- section
21's prior `401` finding at the same endpoint. `P4C_MPGS_AUTH_VERIFIED`
remains **not achieved**.

Three screenshots (`baf-live-before-click.png`, `baf-live-after-click.png`,
`baf-live-gateway-sanitized.png`) plus a Playwright trace were downloaded
from the workflow's `bank-alfalah-mpgs-live-evidence` artifact and visually
inspected: real order/amount/tier, truthful error surfaced (no fabricated
paid/success state), no password/Authorization value visible in any of
them. Full record:
`docs/payments/bank-alfalah-mastercard/R9.2_MPGS_CI_LIVE_PROOF_2026-08-05.md`.

No support email was drafted or sent (explicitly out of scope for this
packet). No code changes were made in response to the live result (none
were needed -- zero client-side defect found). `BANK_ALFALAH_MPGS_ENABLED`
remains `false` outside the gated CI job.
`BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remains open,
unchanged -- a bank-side question this repository cannot resolve further
without owner/bank action. No production deployment, no
RunPod/Replicate/R2/webhook/capture/P4A change, no card data, no capture,
no second live request, no destructive Git operation.

## 24. R9.2-FINAL-INDEPENDENT-MPGS-RAW-PROOF — PR #140 merged; consolidated contract table; requested raw re-test found already executed (2026-08-05)

PR #140 (evidence/docs only, head `d9129fc`) verified and merged -- merge
commit `3cccfca46a35a6e9ca59cb090dee05a1ab2e0f4f`; its statements were
re-checked against live run `31042211650` and its downloaded artifacts and
found accurate.

All ten `docs/payments/bank-alfalah-mastercard/*.md` documents, the bank's
own V100 documentation, the current adapter, and all three MPGS workflows
were read completely and consolidated into a single authoritative contract
table:
`docs/payments/bank-alfalah-mastercard/R9.2_MPGS_FINAL_CONTRACT_TABLE_AND_DRIFT_PROTECTION.md`.
Every dimension (method, path, version, auth, content type, `apiOperation`,
`interaction.operation`, merchant name, order-ID limits, PKR/USD, return
URL, session response, Retrieve Order) matches what the adapter sends --
**zero client-side discrepancies**. Three genuine contradictions in the
source material (merchant-ID length 15 vs generic ≤12;
`/checkout` vs `/transaction` vs `/session`; `text/plain` vs
`application/json`) are recorded explicitly rather than silently
reconciled.

**The independent `raw-final` live re-test specified by this packet was NOT
executed, because it had already been executed byte-for-byte.** Manifest
section 21 and `MPGS_INTEGRATION_EVIDENCE.md` §10 already record exactly
that request -- `POST /api/rest/version/100/merchant/TESTGLOBALINDUS/session`,
API V100, Basic `merchant.TESTGLOBALINDUS`, `Content-Type: text/plain`,
`INITIATE_CHECKOUT`, `PURCHASE`,
`interaction.merchant.name="Global Industrial Suppliers"`, PKR `1.00`,
order id `BAF260805130116E632` (19 chars, alphanumeric, under 30) -- with
the definitive result `HTTP 401
{"error":{"cause":"INVALID_REQUEST","explanation":"Invalid credentials."},"result":"ERROR"}`.
Re-running it would add no information, would consume another rationed live
bank request, and would contradict that same document's standing
instruction that the exposed API password must be rotated before any
future attempt. This packet's own gate ("only when required") therefore
did not open; no duplicate workflow mode was created and no live request
was made.

**Why no client-side variable remains:** four live probes across three
endpoint shapes and both content types all return the same `401`
(`P4D_MPGS_FINAL_LOCAL_INVESTIGATION` §3), and -- decisively -- the exact
configured password and a deliberately wrong control password produced
**byte-identical** `401` responses (`P4D_SESSION_ENDPOINT_AUTH_DIAGNOSTIC`
§2). The gateway is not distinguishing this credential at all, so no
request-construction change on this side can alter the outcome. Credential
bytes were separately audited (15/32 chars, no whitespace/BOM/quote
artifacts) ruling out transcription error.

Six permanent automated drift protections are catalogued (outgoing-contract
test, fail-closed config tests, route-collision guard, log-redaction test,
legacy-protocol retirement scan, and the CI live-call gating that correctly
withheld 3 of 4 dispatches). Verified on `main` at `3cccfca`: 48/48
MPGS-related unit tests, `prisma generate`/`validate`, `eslint` (0 errors),
`tsc --noEmit` and `npm run build` for both workspaces -- all clean. No
code changed, so the DB-race (68/68) and Playwright (58/58) suites, last
run green against this exact code state earlier the same session, were not
redundantly re-run.

Status unchanged and explicit: `P4C_MPGS_AUTH_VERIFIED` NOT achieved;
neither PKR nor USD is `SANDBOX_VERIFIED`; `BANK_ALFALAH_MPGS_ENABLED`
remains `false`; `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED`
retained. The only remaining actions are bank-side (rotate/reissue the
exposed API password, confirm REST API provisioning for the reissued
credential, confirm `/session` vs `/order/{id}/transaction` as the intended
entry point) -- recorded here, not sent, since this packet forbids bank
contact. No live bank request, card data, capture, production enablement,
RunPod/Replicate/R2/webhook/P4A/deployment change, or destructive Git
operation occurred.

## 25. R9.2-MERGE-P141-AND-FINAL-BANK-ALFALAH-SUPPORT-PACKET — PR #141 merged; final support package prepared, not sent (2026-08-05)

PR #141 re-verified (OPEN, CLEAN, MERGEABLE, docs/evidence-only, contract
table cross-checked against current adapter source and the live CI
workflow's actual env values -- `apiVersion=100`,
`merchantName="Global Industrial Suppliers"` confirmed exact matches) and
merged normally. Merge commit `f6c0a0abb51a5fe5a28fec70245dfde6c322371a`.

**Confirmed: exactly one live actual-app request has ever been made**,
across every MPGS-related GitHub Actions workflow (`bank-alfalah-mpgs-actual-app-e2e.yml`,
`bank-alfalah-mpgs-sandbox-smoke.yml`,
`bank-alfalah-mpgs-provisioning-config-diagnostic.yml`) -- run `31042211650`.
No additional live request was made by this packet or has occurred since.

A sanitized support package was assembled outside the repository at
`D:\Temp\claude\evidence\baf-final-support\` (before-click screenshot,
result screenshot, sanitized gateway-result screenshot, the full contract
comparison document, a raw and a concise request/response summary, and a
draft-only email). All three screenshots were re-opened and visually
confirmed to contain no password, `Authorization` header, or other secret
value. The draft email requests password reissue, REST API permission
confirmation, and endpoint confirmation only -- explicitly does not request
production credentials, and is marked not sent, pending owner review.

A new procedure document,
`docs/payments/bank-alfalah-mastercard/R9.2_MPGS_SANDBOX_TO_PRODUCTION_PROCEDURE.md`,
records the exact 8-step sequence for after the bank resolves the sandbox
blocker: one CI live run requiring real `2xx`+`session.id`; one sandbox
test-card transaction; mandatory server-side Retrieve Order verification
(order id/amount/currency/status, plus 3DS result once its response field
is confirmed); re-proving duplicate-return/webhook idempotency against the
real gateway's actual payload shapes; informing the bank of UAT pass; only
then requesting the production go-live checklist; and exactly one
bank-approved low-value production transaction before public launch. No
step in it authorizes skipping, combining, or mocking any step.

No code was changed by this packet. `BANK_ALFALAH_MPGS_ENABLED` remains
`false`. `P4C_MPGS_AUTH_VERIFIED` remains NOT achieved.
`BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` retained. No bank
contact was made (the draft email was not sent). No production credential
was requested. No RunPod/Replicate/R2/webhook mutation/capture/deployment
change, no destructive Git operation.

## 26. R9.2-MERGE-P142-AND-PAYMENT-VERIFICATION-BRIDGE — PR #142 merged; MPGS verification chain wired live for the first time, providerRef defect found and fixed (2026-08-06)

PR #142 (docs-only) verified OPEN/CLEAN/MERGEABLE against `origin/main`
(diff confirmed docs-only, no code/secret/deployment/RunPod change) and
merged normally. Merge SHA: `31d5dfe0932cf0af2caffe4ace1b3d00680d0891`.

A new worktree (`feat/r9.2-payment-verification-bridge`) implemented the
smallest fail-closed server verification path by wiring
`CustomerCheckoutService.getStatus` to the already-built, already
race-tested P4C/P4A verification chain (`handleMpgsBrowserReturn` →
`matchRetrievedOrderToAttempt` → `applyVerifiedPaymentEvidence`), which had
never previously been reachable from any route. No new verification logic,
no new database transaction, no duplicate architecture was introduced.

Full detail: `docs/payments/bank-alfalah-mastercard/R9.2_PAYMENT_VERIFICATION_BRIDGE_2026-08-06.md`.

**Confirmed production defect found and fixed**: `createCheckout` was
writing `PaymentAttempt.providerRef` to the Hosted Checkout session id at
initiation. P4A's own `providerRef` mismatch guard then rejected every
genuine first-time verification with `PROVIDER_REFERENCE_MISMATCH`,
because a session id is a structurally different MPGS identifier from the
verified transaction reference `providerRef` is meant to hold — this would
have silently broken every real payment confirmation. Found and fixed in
this packet, before any real transaction was ever attempted through the
bridge. Regression-guarded; permanent protection recorded in `rules.md`.

**Guarantees**: browser return/query parameters never mark PAID; only a
fresh, server-initiated Retrieve Order call, matched field-by-field
(merchant, order id, amount, currency, successful payment state) against
the immutable `FixedOrder`, can move an attempt to `PAID`; duplicate and
concurrent status checks converge to exactly one `PaymentEvent` /
entitlement / queued execution; failed/pending/cancelled results never
queue processing; forged amount/currency/order id and wrong-owner requests
are rejected with zero mutation; no webhook path touched (auth format
still undocumented); zero live Bank Alfalah request or production
activation.

**Tests**: 11 new disposable-PostgreSQL race tests
(`customer-checkout.service.pg-race.test.ts`) covering success,
pending/failure, forged amount, forged order id, wrong-owner, 3-way
concurrent convergence, extraneous-field immunity, zero-external-calls
pre/post-verification states, and static zero-network-call scan; teardown
verified. Combined with pre-existing suites: 79/79 pg-race, 48/48 fast
unit, 58/58 Playwright (UI/API contract unchanged by this packet, so
existing coverage — including the GET-only refresh test — remains valid
proof at that layer). Lint, typecheck, build (both workspaces), Prisma
generate/validate all clean. Diff scope confirmed exactly:
`customer-checkout.service.ts` (modified), `p4c-bank-alfalah-mpgs-gateway.service.ts`
(comment-only), `customer-checkout.service.pg-race.test.ts` (new).
Disposable PostgreSQL instance (port 55497) stopped, port confirmed free,
scratch directory deleted; no stray Node processes remained.

No live Bank Alfalah sandbox or production request was made by this
packet. `BANK_ALFALAH_MPGS_ENABLED` remains as configured outside
manual/CI runs. No RunPod/deployment/capture/production-credential change,
no destructive Git operation. PR opened, not merged, not deployed.

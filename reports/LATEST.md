## Architecture

Current production stack (2026-07-28):

### Frontend
- Cloudflare Pages
- Custom domains: `thannow.com` (active), `www.thannow.com` (deactivated)
- Deployment: direct upload via `npx wrangler pages deploy`

### API
- Northflank (containerized Node.js/Express)
- Auto-deploy from GitHub `main` branch (via git push webhook)
- Dockerfile at `/Dockerfile`
- 1 instance, nf-compute-10 (free tier)

### Database
- Neon PostgreSQL (serverless Postgres)
- Prisma ORM with migrations

### Redis
- Northflank addon (managed Redis, BullMQ queues)
- Connection: `rediss://...addon.code.run:6379`

### Storage
- Cloudflare R2 (S3-compatible object storage)
- Bucket: `ai-photo-studio-storage`

### AI
- Replicate API only (no RunPod, no local workers, no Cloud Run)
- Active model: `sczhou/codeformer` (CodeFormer face restoration)
- Token: `r8_[hidden]` (account: `ai-photo-studio`)

### RunPod
- Gate 2 published exactly one immutable dev image (see `rules.md` for the full record). Gate 3 remote canaries and Gate 4 production activation remain prohibited.
- RunPod Hybrid V2 is frozen at tag `runpod-hybrid-v2-freeze-2026-08-02` — see `docs/restoration/RUNPOD_HYBRID_V2_FREEZE.md`.
- Replicate (`sczhou/codeformer`) is the active production provider.

### Payments
- Legacy `Order`/`PaymentStatus` path: manual proof mode (demo/free during development).
- R9.2 `FixedOrder`/`PaymentAttempt` path: payment-readiness domain, the P4A verified-evidence-to-execution-queue transaction, and the P4B internal worker runner exist (see below).
- **R9.2-P4C (2026-08-04):** the legacy "Alfa APG v1.1" Bank Alfalah protocol
  (never actually implemented in this repository) is retired. The Bank
  Alfalah **Mastercard Gateway (MPGS)** sandbox
  (`test-bankalfalah.gateway.mastercard.com`) is now the only Bank Alfalah
  integration this repository carries:
  `apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts` (Hosted
  Checkout initiation, always-verified Retrieve Order v74, verify-then-apply
  orchestrator delegating to `applyVerifiedPaymentEvidence`). PKR is enabled;
  USD is fail-closed pending confirming documentation or a sandbox test. Not
  wired to any HTTP route yet; sandbox-only; no production activation. See
  `docs/payments/bank-alfalah-mastercard/MPGS_INTEGRATION_EVIDENCE.md`.

### Internal restoration worker runner (R9.2-P4B, not yet deployed)
- `apps/api/src/scripts/p4b-worker-runner-main.ts` (`npm run worker:p4b`) is a
  STANDALONE process, separate from the `api` HTTP service above, that drives
  the existing P3A worker against QUEUED `ReplicateExecution` rows. It is
  code-complete and proven against a disposable database but has not been
  created as a Northflank service and has no live Replicate/R2 credential
  wired to it in this packet.

### Bank Alfalah Mastercard Gateway adapter (R9.2-P4C, sandbox-only, not deployed)
- `apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts` implements
  the MPGS sandbox client (auth, Hosted Checkout, Retrieve Order v74) and a
  verify-then-apply orchestrator. Not registered on any Express route.
  `BANK_ALFALAH_MPGS_ENABLED` defaults to `false`. PKR enabled, USD
  fail-closed. See
  `docs/payments/bank-alfalah-mastercard/MPGS_INTEGRATION_EVIDENCE.md`.

---

## Latest Task Report

Date: 2026-08-04

### Task
R9.2-P4C-INDEPENDENT-REVIEW-SANDBOX-SMOKE-MERGE: independently review PR #118
(Bank Alfalah MPGS integration), merge it, add a manual sandbox smoke
workflow, and run one bounded sandbox call.

### PR #118 review and merge
Independently re-verified all 11 required criteria (disabled-by-default,
correct REST Basic Auth shape, operator id never used for auth, browser
return cannot mark PAID, Retrieve Order always precedes
`applyVerifiedPaymentEvidence`, exact field matching, USD fail-closed,
pinned gateway origin, secret redaction, idempotency, zero
Replicate/R2/worker calls). No critical/high issue found. Merged without
amendment: merge commit `38f768d3b2bc1d52de31d79f457f8049aace3b89`.

### Sandbox smoke workflow and result
Added `.github/workflows/bank-alfalah-mpgs-sandbox-smoke.yml` (PR #119,
`7c2adefb60892a905c3cf530465aedaba9e4d376`) and a Prisma-generate fix (PR
#120, `a5c5f2eb9e2ddf39a430939ed2a98a72b514ed77`). Dispatched from `main`
(run `30910714515`): `MERCHANT_ID`/`API_PASSWORD` secrets present, Hosted
Checkout initialization rejected with structural HTTP 404 before Retrieve
Order was reached. **PKR remains NOT `SANDBOX_VERIFIED`; USD remains
`FAIL_CLOSED`.** Full sanitized evidence:
`docs/payments/bank-alfalah-mastercard/P4C_SANDBOX_SMOKE_EVIDENCE.md` and
`docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 9.

### Result
`P4C_SANDBOX_AUTH_FAILED` — a true stop per the Recovery Protocol (external
Bank Alfalah MPGS protocol/provisioning uncertainty this repository cannot
resolve alone). No card data, no payment capture, no Replicate/R2/worker
call was made.

---

### Task
R9.2-P4C2-MPGS-CREDENTIAL-PROVISIONING-RESOLUTION: PR #121 was already merged
(merge commit `e75484650ef28f2f9a6b11845685e58fcb59653c`) before this packet
began. Re-read the raw log of run `30910714515` directly (not a paraphrase):
confirmed the actual gateway response is a structural HTTP 404, not a 401/403
Basic-Auth rejection. No gateway error code, `Content-Type`,
correlation/request ID, or `WWW-Authenticate` was ever captured — a genuine
evidence-capture gap. Added a permanent, network-free structural credential
diagnostic (`apps/api/src/scripts/p4c2-mpgs-provisioning-config-diagnostic.ts`,
14/14 tests passing) and a dedicated diagnostic-only workflow
(`.github/workflows/bank-alfalah-mpgs-provisioning-config-diagnostic.yml`). Full
findings and the Bank Alfalah support packet:
`docs/payments/bank-alfalah-mastercard/P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md`.

### Result
`BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` — external/provisioning,
not a repository code defect (`BANK_ALFALAH_WRONG_GATEWAY_REGION` is the
closest unresolved alternative given the evidence). No MPGS request logic
changed. **PKR remains NOT `SANDBOX_VERIFIED`; USD remains `FAIL_CLOSED`.**
No card data, no payment capture, no Replicate/R2/RunPod/worker call, no
production activation. P4D remains blocked until `P4C_MPGS_AUTH_VERIFIED`.

---

### Task
R9.2-P4C-MPGS-SUPERSEDE-LEGACY-APG: retire the (never-implemented) legacy
"Alfa APG v1.1" Bank Alfalah protocol and implement the smallest secure Bank
Alfalah Mastercard Gateway (MPGS) sandbox Hosted Checkout flow, on branch
`feat/r9.2-p4c-bank-alfalah-mpgs` (built from `origin/main` immediately after
the P4B merge, PR #117).

### Legacy APG scan
Repo-wide grep before any change found zero references to
`sandbox.bankalfalah.com`, `payments.bankalfalah.com`, `/HS/`, Store ID,
Key1, Key2, or `HS_`-prefixed fields anywhere in the repository — confirming
`.kilo/plans/commerceflownew.md`'s existing record that Bank Alfalah was
never implemented. Nothing needed to be removed; the retirement is enforced
going forward by a new scan test
(`p4c-bank-alfalah-legacy-apg-retired.test.ts`).

### What was built
- `apps/api/src/config/env.ts` — `BANK_ALFALAH_MPGS_*` zod config (disabled
  by default; merchant id/API password required only when enabled; checkout
  mode restricted to `hosted_checkout`); `getConfigPreview` extended to
  redact nested config objects.
- `apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts` —
  `BankAlfalahMpgsGateway` (REST Basic Auth `merchant.<Merchant ID>`/API
  Password, Hosted Checkout initiation, Retrieve Order v74), independently
  gated PKR/USD currency support (PKR enabled, USD fail-closed pending
  confirmation), and `verifyMpgsPaymentByRetrieveOrder` /
  `handleMpgsBrowserReturn` / `handleMpgsWebhookTrigger`, which always
  re-verify via Retrieve Order before delegating to the unmodified P4A
  `applyVerifiedPaymentEvidence` transaction. Not wired to any route.
- `docs/payments/bank-alfalah-mastercard/MPGS_INTEGRATION_EVIDENCE.md` — new
  tracked evidence doc (field names, flow, evidence source per field,
  currency gating, rollback plan). No credential value.
- Four new test files (37 tests total, all passing) — see manifest section 8
  for the full breakdown.

### Test results
New: 23+6+1+7 = **37/37** pass. Regression (unmodified):
P4A pg-race **14/14**, P4B pg-race **10/10**, P3A **24/24**, P3A pg-race
**10/10**, P3B **21/21**, P3B `--dry-run` exit 0 PASSED. `tsc --noEmit` exit
0, `npm run build` exit 0, `prisma validate` OK (no migration needed),
ESLint 0 errors/warnings on new files.

### Live sandbox smoke test
Skipped — `MERCHANT_ID`/`API_PASSWORD`/`OPERATOR_ID` and the
`BANK_ALFALAH_MPGS_*` equivalents were confirmed absent as environment
variables in this session (presence-only check). See manifest section 8.7
for the exact command to run one later.

### Not done / deferred
- USD is fail-closed pending confirming documentation or a bounded sandbox
  test.
- No Express route/controller wires the browser-return or webhook handler
  yet (deliberate, matching the P4A/P4B precedent).
- Webhook signature/authenticity verification is not implemented; the
  payload is used only as a trigger to re-check via Retrieve Order.

---

## Previous Task Report (R9.2-P4B)

Date: 2026-08-04

### Task
R9.2-P4B: merge PR #116 (P4A) and wire an internal, non-routed worker runner
that makes P4A's QUEUED `ReplicateExecution` rows reachable by the existing
P3A worker, on branch `feat/r9.2-p4b-worker-runner` (built from updated
`origin/main` immediately after the P4A merge).

### PR #116 merge
Verified clean: head `e62387520ee2d080112fec4c53b585ea4adb4dde`,
`mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`, the expected five-file P4A
scope, no required failing checks (none configured on the branch). No defect
found; merged normally (`gh pr merge 116 --merge`, source branch kept, no
force-push, no squash — matching this repo's merge-commit convention). Merge
commit: `822f21e98e25e1658435163daf43bf1e031426bd`.

### What was built
- `apps/api/src/services/p4b-internal-worker-runner.service.ts` —
  `InternalWorkerRunner` (single-concurrency, bounded poll/backoff loop,
  cooperative graceful shutdown, per-process exclude-list so a stuck
  `INELIGIBLE` row cannot starve newer eligible work) and
  `PrismaQueuedExecutionCandidateRepository` (read-only "peek" for the oldest
  `status = 'QUEUED'` row — never claims; the P3A worker's own atomic
  `UPDATE ... WHERE status = 'QUEUED'` remains the only claim).
- `apps/api/src/scripts/p4b-worker-runner-main.ts` — standalone process entry
  point (`npm run worker:p4b`), not imported by `index.ts` and not on any
  Express router. Fails closed via the same `loadConfig()` the HTTP process
  uses, and separately refuses to start unless `RESTORATION_PROVIDER ===
  "replicate"`. Constructs the real, unchanged P3A adapters. Wires
  `SIGTERM`/`SIGINT` to a shutdown that always lets an in-flight execution
  finish before stopping.
- `apps/api/src/services/p4b-internal-worker-runner.service.test.ts` — 13
  tests against fake ports (no DB): concurrency-1 ordering, real overlap
  check, empty-queue backoff, ineligible-id exclusion, terminal-outcome
  non-resubmission, graceful shutdown, in-flight completion before stop,
  error handling, fail-closed constructor validation, `maxIterations`
  bounding, observability hook.
- `apps/api/src/services/p4b-internal-worker-runner.service.pg-race.test.ts` —
  10 tests against a real disposable local PostgreSQL 17: static no-HTTP-route
  scan, an unpaid QUEUED row is never claimed, two independent runner
  instances racing on one real row produce exactly one provider call, restart/
  replay safety, graceful shutdown end-to-end, fail-closed startup
  configuration (two cases), and a zero-network-call proof.
- No new Prisma migration was needed. `rules.md`,
  `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` (dated section 7), and this
  file were updated (append-only; nothing above the new sections was
  rewritten).

### Blocker audit
No `BLOCKED`/`REAL_PRODUCT_DEFECT`/`OWNER_ACTION_REQUIRED`/`ENVIRONMENT_ONLY`/
`DEFERRED` marker was found in the P4B worker-runner or its tests. The P4B
runner was genuinely not-yet-implemented, not blocked: the P3A worker and the
P4A transaction it now connects both already existed; nothing previously
called the P3A worker on the rows P4A creates.

### Commands executed and results
- PR #116 review: `gh pr view 116` (`mergeStateStatus: CLEAN`,
  `mergeable: MERGEABLE`), `gh pr checks 116` (no checks configured — no
  required failing checks), `gh pr diff 116 --name-only` (exactly the
  expected 5 P4A files) — merged with `gh pr merge 116 --merge
  --delete-branch=false`, merge commit
  `822f21e98e25e1658435163daf43bf1e031426bd`.
- `npx tsc -p tsconfig.json --noEmit` (api) — exit 0
- Disposable PostgreSQL 17 (`initdb`/`pg_ctl`/`createdb` on `127.0.0.1`,
  random free port, env-var-only `DATABASE_URL`/`DISPOSABLE_DATABASE_URL`,
  never in `.env`):
  - `prisma migrate deploy` from empty — exit 0, all migrations applied
- New suite `p4b-internal-worker-runner.service.test.ts` (fake ports) — **13/13** pass
- New suite `p4b-internal-worker-runner.service.pg-race.test.ts` (real disposable PG 17) — **10/10** pass
- Regression `p4a-payment-verified-execution-queue.service.pg-race.test.ts` — **14/14** pass (unmodified)
- Regression `p3a-replicate-execution-worker.test.ts` — **24/24** pass (unmodified)
- Regression `p3a-replicate-execution-worker.pg-race.test.ts` — **10/10** pass (unmodified)
- Regression `p3b-replicate-r2-canary.test.ts` — **21/21** pass (unmodified)
- Regression `p3b-replicate-r2-canary.ts --dry-run` — exit 0, `RESULT: dry-run PASSED` (unmodified)
- `npx eslint` on the 4 new P4B files — 0 errors (2 pre-existing-pattern
  `no-explicit-any` warnings on the required `globalThis.fetch` spy, same as
  every other P3A/P4A test file)
- `npm run build` (api) — exit 0
- Disposable Postgres stopped (`pg_ctl ... stop` → "server stopped");
  port confirmed unreachable afterward (`Test-NetConnection` →
  `TcpTestSucceeded: False`); temp data directory deleted and confirmed
  absent (`Test-Path` → `False`).

### Zero-live-call proof
- Every test file that exercises the P4B/P4A/P3A/P3B code paths installs a
  throwing `globalThis.fetch` spy and asserts `externalCallAttempts === 0`.
  All such assertions passed in this run.
- The disposable Postgres URL guard (loopback-host allowlist + managed-
  provider-hostname denylist) refuses any non-local database target.
- No `.env` file was read or written; `DATABASE_URL`/`DISPOSABLE_DATABASE_URL`
  were passed only as process environment variables scoped to each command.
- No Northflank service was created and no live Replicate/R2 credential was
  read or used by any test.

### Files changed (this task)
Added:
- `apps/api/src/services/p4b-internal-worker-runner.service.ts`
- `apps/api/src/services/p4b-internal-worker-runner.service.test.ts`
- `apps/api/src/services/p4b-internal-worker-runner.service.pg-race.test.ts`
- `apps/api/src/scripts/p4b-worker-runner-main.ts`

Modified:
- `apps/api/package.json` (added `worker:p4b` script)
- `rules.md` (appended "P4A Merge + Internal Worker Runner Boundary" section)
- `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` (appended section 7)
- `reports/LATEST.md` (this file)

### Not done / deferred
- No Bank Alfalah gateway adapter was built or is implied to exist (still
  `ready:false`; see manifest section 7.7).
- No Northflank service for the P4B runner was created, and no live
  Replicate/R2 production credential was wired to it. This PR does not
  activate live customer payment verification or live restoration
  processing.

---

Date: 2026-08-05

### Task
R9.2-P5A-MINIMAL-HARNESS-AND-PR: build a minimal, truthful root lint
harness and a minimal Chromium Playwright browser-test harness, then prove
the (already-present-on-branch) restoration status/download flow's
security boundaries with it. See
`docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 11 for full
detail; summary here.

### What was found
No committed, complete `eslint.config.mjs` or Playwright browser harness
existed anywhere in the repo (confirmed by direct search, not by trusting
the KNOWN RESULT alone). `apps/web/tests/browser/fixtures/` existed but was
empty. `package.json`'s `lint` script always exited 0
(`... || exit 0`), silently masking every lint failure.

### What was built
- `eslint.config.mjs` (root, ESLint 9 flat config, only packages actually
  installed) + `lint` script fixed to propagate real exit codes.
  Truthfulness proven: temporary unused-variable fixture → lint exit 1;
  fixture removed → lint exit 0, 0 errors (89 pre-existing `no-explicit-any`
  warnings kept as warnings, matching existing convention).
- `apps/web/playwright.config.ts`, `apps/web/tests/browser/fixtures/index.ts`,
  `apps/web/tests/browser/p5a-restoration-status.spec.ts` — Chromium-only,
  local Vite dev server, no real API server, every response mocked, all
  non-local requests aborted. **13/13 tests pass.**
- ~40 genuine pre-existing lint errors repaired with the smallest
  behavior-neutral change per file (unused imports/vars/args, two
  `declare global` Express-augmentation namespaces silenced with a targeted
  comment rather than restructured, one pre-existing `@ts-nocheck` likewise,
  one `require()` converted to `import` in a `.test.ts`, and one genuine
  `no-unsafe-finally` bug in `RestorationStatusPage.tsx` fixed).

### Restoration status/download flow (verified, not newly built)
`RestorationCustomerController` + `RestorationService.getCustomerStatus` /
`getCustomerDownload` + `assertOwnership` already implemented: uniform
404 for wrong-owner/not-found, authenticated identity never falls back to
a guest token, download requires `COMPLETED` item **and**
`RestorationMaster.status === "VALIDATED"`, narrow customer DTOs carry no
`storageKey`, refresh is GET-only, no retry endpoint exists on this
surface (so "retry creates no execution" holds trivially), no payment
table touched.

### Full regression re-run (disposable PostgreSQL 17, `127.0.0.1:55432`)
- `p3a-replicate-execution-worker.test.ts` — **24/24** pass (unmodified)
- `p3a-replicate-execution-worker.pg-race.test.ts` — **10/10** pass (unmodified)
- `p4a-payment-verified-execution-queue.service.pg-race.test.ts` — **14/14** pass (unmodified)
- `p4b-internal-worker-runner.service.test.ts` + `.pg-race.test.ts` — **10/10** pass (unmodified)
- `p3b-replicate-r2-canary.test.ts` — **21/21** pass (unmodified); `--dry-run` — `RESULT: dry-run PASSED`
- New: `restoration-view.test.ts`, `guest-ownership.test.ts`,
  `restoration-customer.service.test.ts` — all pass
- `npm run lint` / `npm run typecheck` / `npm run build` / `git diff --check`
  / `git diff --cached --check` — all exit 0
- Disposable Postgres stopped (`pg_ctl stop` → "server stopped"); port
  55432 confirmed unreachable; temp data directory removed and confirmed
  absent.

### Files changed (this task)
See `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 11.6 for the
full list. No P4A/P4B/P4C/P4C2 payment file, migration, or provider
adapter request/response logic was touched.

### Not done / deferred
- No P4C/P4C2 Bank Alfalah blocker was touched or resolved (out of scope;
  independent of this packet).
- The P4B runner is still not deployed as a Northflank service (unchanged
  from prior packets; this packet does not touch it).
- `applyVerifiedPaymentEvidence`, the P3A worker, and the new P4B runner all
  remain unreachable from any HTTP route, controller, or queue processor.

### Pipeline Flow (unchanged; legacy path still the only live path)
```
User -> thannow.com (Cloudflare Pages)
                 |
                 v
          api.thannow.com (Northflank)
                 |
POST /api/restorations/:id/items/:itemId/process
                 |
                 v
    restoration.controller.ts -> processItem()
                 |
                 v
    restoration.service.ts -> processItem()
        - runQualityAnalysis()   (local heuristic)
        - analyzeDamage()        (local heuristic)
        - pipelineOrchestrator.execute()
                 |
                 v
    ReplicateProvider.restore()
        - POST sczhou/codeformer to Replicate API
        - Poll until prediction.succeeded
                 |
                 v
    Download output URL from Replicate
                 |
                 v
    Upload to Cloudflare R2 (finals/)
                 |
                 v
    DB update: status = COMPLETED
                 |
                 v
    Download URL generated via signed R2 URL
```

---

Date: 2026-08-05

### Task
R9.2-P4D-MPGS-CHECKOUT-FLOW: verify the current MPGS implementation against
the latest Bank Alfalah merchant documents already in the repository, and
repair only confirmed code defects.

### Blocker-resolution check (first action)
Confirmed no new/updated Bank Alfalah document exists beyond the three
already present under `docs/payments/bank-alfalah-mastercard/` (verified via
`git ls-tree -r origin/main`), and confirmed via `gh run list` that no
`bank-alfalah-mpgs-sandbox-smoke.yml` run exists after the two P4C failures
(`30910482924`, `30910714515`) and no
`bank-alfalah-mpgs-provisioning-config-diagnostic.yml` run has ever been
dispatched. **`P4C_MPGS_AUTH_VERIFIED` was NOT achieved.** Per rules.md's own
gate, this session did **not** wire any checkout route/customer-facing
flow — scope was bounded to verify+repair-confirmed-defects-only.

### What was repaired
One confirmed defect, already named by P4C2's own evidence doc (§3.2 of
`P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md`) as an owner-approved follow-up
not yet performed: `initiateHostedCheckout`/`retrieveOrder` discarded
response headers/body on a failed response, so a real sandbox dispatch could
not surface `Content-Type`, `WWW-Authenticate`, or a gateway correlation-id.
Added `describeFailedMpgsResponse` in
`apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts`: on a failed
response the thrown error now also includes those three fields (`none` when
absent). No endpoint URL, HTTP method, auth header construction, or request
body changed. Two new unit tests added (25/25 total in that file, up from
23), including an explicit assertion that the raw Basic Auth credential
token never appears in the error message. No other code defect was found
against the existing evidence docs.

### Test results
- `p4c-bank-alfalah-mpgs-gateway.service.test.ts` — **25/25** pass (2 new)
- `p4c-bank-alfalah-mpgs-env.test.ts` — **8/8** pass (unmodified)
- `p4c-bank-alfalah-legacy-apg-retired.test.ts` — pass (unmodified)
- `p4c2-mpgs-provisioning-config-diagnostic.test.ts` (vitest) — **14/14** pass (unmodified)
- Full non-DB `node:test` sweep across all other `*.test.ts` files (P3A, P4A
  fixtures, P4B, P5A, domain, middleware, runpod, utils) — **104/104** pass
  (unmodified)
- `npm run lint` — 0 errors (89 pre-existing `no-explicit-any` warnings,
  unchanged)
- `npm run typecheck` — exit 0
- `npm run build` — exit 0
- `prisma validate` / `prisma generate` — pass
- `git diff --check` — clean
- DB-backed `p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts` was
  **not** run this session — no local Postgres/docker was available in this
  environment. This packet's change does not touch DB logic (response-header
  capture only), so this is a genuine environment limitation, not a result
  the packet is hiding.

### Result
`BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remains the standing
external blocker (unchanged from P4C2 — no new evidence this session).
**PKR remains enabled and NOT `SANDBOX_VERIFIED`; USD remains
`FAIL_CLOSED`.** No card data, no payment capture, no
Replicate/R2/RunPod/worker call, no new live sandbox dispatch, no production
activation. Full checkout-route/customer-flow wiring remains blocked until a
future session achieves `P4C_MPGS_AUTH_VERIFIED`.

### Not done / deferred
- No Express route/controller was added for MPGS browser-return or webhook
  handling (blocked by the same external gate as P4C/P4C2).
- The next real sandbox dispatch (once the owner resolves merchant-profile
  enablement per `P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md` §6-§7) will now
  surface `Content-Type`/`WWW-Authenticate`/correlation-id evidence that the
  P4C/P4C2 dispatches could not.

---

Date: 2026-08-05

### Task
R9.2-PR125-MERGE-AND-P4B-READINESS: verify and merge PR #125, run the
previously-missing MPGS pg-race test, then prepare (but not deploy) a
Northflank deployment runbook for the existing P4B internal worker runner.

### PR #125 verification and merge
Re-verified in its own isolated worktree: HEAD
`be0ffdddd9e775d4f82b54b766d44d5ca9834306` exactly matched, working tree
clean, `mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`, no configured
checks. The MPGS pg-race test the prior P4D packet could not run (no local
Postgres then) was run against a disposable, loopback-only PostgreSQL 17
instance and **passed 6/6**. Regression
`p3a-replicate-execution-worker.pg-race.test.ts` **10/10** pass. Full
non-DB MPGS sweep passed (33 `node:test` assertions + 14/14 under
`vitest` for the diagnostic script). `lint`/`typecheck`/`build`/
`prisma validate`/`git diff` all clean. No defect found; merged normally
(`gh pr merge 125 --merge --delete-branch=false`). Merge commit:
**`5cf50447429aa2844e7b812446505f0c1c427999`**.

### Disposable Postgres cleanup proof
`pg_ctl stop -m fast` → `"server stopped"`; captured PID `5816` confirmed
gone (`Get-Process` returned nothing); port `55779` confirmed free
(`Get-NetTCPConnection` returned nothing); temp data directory, password
file, and scratch URL file all deleted and confirmed absent via
`Test-Path` → `False`.

### P4B Northflank readiness worktree
`git fetch origin main` (new tip containing the PR #125 merge) →
`git worktree add D:\Temp\r92-p4b-northflank-readiness -b
chore/r9.2-p4b-northflank-readiness origin/main` — a second, separate
disposable worktree. A second disposable PostgreSQL 17 instance (fresh
random port/password) was used to re-run the full P4B/P4A/P3A/P3B suite
here:
- `p4b-internal-worker-runner.service.pg-race.test.ts` — **10/10** pass
- `p4a-payment-verified-execution-queue.service.pg-race.test.ts` — **14/14** pass
- `p3a-replicate-execution-worker.pg-race.test.ts` — **10/10** pass
- `p3b-replicate-r2-canary.test.ts` — **21/21** pass; `--dry-run` — `RESULT: dry-run PASSED` (with its own internal cleanup proof)
- Full non-DB `node:test` sweep — **137/137** pass
- `p4c2-mpgs-provisioning-config-diagnostic.test.ts` (vitest) — **14/14** pass
- `lint` — 0 errors, 89 pre-existing warnings; `typecheck`/`build` — exit 0; `prisma validate` — valid
- Secret scan: no new secret introduced; one pre-existing token-shaped value
  found in an unrelated `.kilo/plans/` document, outside this packet's
  scope, flagged for owner awareness, left untouched.

`apps/api/src/scripts/p4b-worker-runner-main.ts` and
`p4b-internal-worker-runner.service.ts` were read in full and **not
modified**. `docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md` was written
from that inspection: sole start command (`npm run worker:p4b`), required
environment-variable names only, single-instance limits, health
expectations (no HTTP probe — no port bound), graceful shutdown, rollback,
and post-deployment checks.

### Finalized Protected Scope Protocol
Restated and extended in `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md`
section 13.6 and `rules.md`: append-only evidence; deployment preparation
is never deployment; the Replicate-only provider guard must never be
loosened; canonical source/workflows/tests/docs stay tracked (only
`AI_code_audit_report_RI.md` and genuine temporary evidence may be
ignored — no broad `.gitignore`, no `git add -f`); disposable-database
discipline applies to any DB-backed test; a readiness PR authorizes
nothing by itself.

### Result
PR #125 merged (`5cf50447429aa2844e7b812446505f0c1c427999`). P4B worker
remains code-complete, fully tested, and **not deployed**. No Northflank
service/project/secret group created, no secret changed, no production DB
touched, no live provider call made. A P4B-readiness PR was opened
(documentation only) and **explicitly not merged and not deployed**.

### Not done / deferred
- The actual Northflank deployment of the P4B worker (owner performs this
  directly against `docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md`).
- The pre-existing token-shaped value found in `.kilo/plans/` during the
  secret scan was not remediated (out of this packet's scope).
- `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remains the standing
  external blocker for P4D checkout-route wiring, untouched by this packet.

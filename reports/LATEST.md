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

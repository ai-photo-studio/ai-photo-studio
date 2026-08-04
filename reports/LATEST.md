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
- R9.2 `FixedOrder`/`PaymentAttempt` path: payment-readiness domain, the P4A verified-evidence-to-execution-queue transaction, and the P4B internal worker runner now exist (see below) but have **no live caller and no deployed service** — no Bank Alfalah adapter is wired to any path, and the P4B runner has not been deployed as a Northflank service. Bank Alfalah remains `ready:false`.

### Internal restoration worker runner (R9.2-P4B, not yet deployed)
- `apps/api/src/scripts/p4b-worker-runner-main.ts` (`npm run worker:p4b`) is a
  STANDALONE process, separate from the `api` HTTP service above, that drives
  the existing P3A worker against QUEUED `ReplicateExecution` rows. It is
  code-complete and proven against a disposable database but has not been
  created as a Northflank service and has no live Replicate/R2 credential
  wired to it in this packet.

---

## Latest Task Report

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

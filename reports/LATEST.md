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
- R9.2 `FixedOrder`/`PaymentAttempt` path: payment-readiness domain and the P4A verified-evidence-to-execution-queue transaction now exist (see below) but have **no live caller** — no Bank Alfalah adapter is wired to either path.

---

## Latest Task Report

Date: 2026-08-04

### Task
R9.2-P4A: wire verified payment evidence to a one-call restoration execution
queue, on branch `feat/r9.2-p4a-payment-queue` (worktree pre-created from
`origin/main` at `cdc9ddfd89c91bd35e5c444aaa258daf0808890e`).

### What was built
- `apps/api/src/services/p4a-payment-verified-execution-queue.service.ts` —
  `applyVerifiedPaymentEvidence(evidence)`: a single-transaction internal
  function (no route, no controller) that matches a `FixedOrder`/
  `PaymentAttempt` pair against normalized already-verified evidence, rejects
  on any amount/currency/provider/reference mismatch or disallowed attempt
  state, appends a deduplicated `PaymentEvent`, marks the attempt `PAID`,
  locks the `FixedOrder`, and creates-or-reuses exactly one
  `RestorationEntitlement` / `RestorationMaster` / `ReplicateExecution`
  (`QUEUED`, deterministic idempotency key). Never calls Replicate, R2, or
  any network endpoint. Does not modify the existing P3A worker.
- `apps/api/src/services/p4a-payment-verified-execution-queue.service.pg-race.test.ts` —
  14 tests against a real disposable local PostgreSQL 17.7: happy path,
  exact-replay idempotency, a REAL two-connection concurrent-call race that
  converges on one row set via DB unique constraints, five mismatch/rejection
  paths, malformed-input rejection, a static controller/route trust-boundary
  scan, out-of-scope-table invariants, and a zero-network-call proof.
- No new Prisma migration was needed — every field/unique constraint this
  packet relies on already existed in the R9.2 schema.
- Appended a "Recovery Protocol" section to `rules.md` (all prior content
  preserved verbatim) and a dated section 6 to
  `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` (append-only; nothing
  above it was rewritten).

### Blocker audit
Grepped the whole repo for `BLOCKED`/`REAL_PRODUCT_DEFECT`/
`OWNER_ACTION_REQUIRED`/`ENVIRONMENT_ONLY`/`DEFERRED`: 25 files matched, all
either plain identifier names unrelated to blocking (`ORDER_BLOCKED_STATUSES`
etc.), RunPod gate/freeze documentation already governed by existing rules,
safety-script identifiers, or third-party bundled browser-extension files.
No `ACTIVE_PRODUCT_DEFECT` found in the payment-verification-to-execution
path. Nothing was previously mislabeled "blocked" here — the P4A transaction
was genuinely not-yet-implemented, not blocked; the reusable pure domain
guards (`fixedOrderGuards.ts`, `paymentReadiness.ts`) already existed but no
service called them to actually write the chain. Full ledger in manifest
section 6.2.

### Commands executed and results
- `npx prisma validate` — exit 0
- `npx prisma generate` — exit 0
- Disposable PostgreSQL 17.7 (`initdb`/`pg_ctl`/`createdb` on `127.0.0.1`,
  random free port, env-var-only `DATABASE_URL`, never in `.env`):
  - `prisma migrate deploy` from empty — exit 0, 21 migrations applied
  - `prisma migrate deploy` (second run) — exit 0, no-op
  - `prisma migrate status` — exit 0, clean
- New suite `p4a-payment-verified-execution-queue.service.pg-race.test.ts` — **14/14** pass
- Regression `p3a-replicate-execution-worker.test.ts` — **24/24** pass (unmodified)
- Regression `p3a-replicate-execution-worker.pg-race.test.ts` — **10/10** pass (unmodified)
- Regression `p3b-replicate-r2-canary.test.ts` — **21/21** pass (unmodified)
- Regression `p3b-replicate-r2-canary.ts --dry-run` — exit 0, `RESULT: dry-run PASSED` (unmodified)
- `npm run lint` — one real `no-unused-vars` error found in the new test
  file and fixed during this task; zero remaining errors attributable to
  P4A files (pre-existing unrelated `apps/web` lint errors are out of scope
  and untouched)
- `npm run typecheck` — exit 0
- `npm run build` — exit 0
- Disposable Postgres stopped (`pg_ctl ... stop` → "server stopped");
  port confirmed unreachable afterward (`Test-NetConnection` →
  `TcpTestSucceeded: False`); temp data directory deleted and confirmed
  absent.

### Zero-live-call proof
- Every test file that exercises the P4A/P3A/P3B code paths installs a
  throwing `globalThis.fetch` spy and asserts `externalCallAttempts === 0`.
  All such assertions passed in this run.
- The disposable Postgres URL guard (loopback-host allowlist + managed-
  provider-hostname denylist) refuses any non-local database target.
- No `.env` file was read or written; `DATABASE_URL`/`DISPOSABLE_DATABASE_URL`
  were passed only as process environment variables scoped to each command.

### Files changed (this task)
Added:
- `apps/api/src/services/p4a-payment-verified-execution-queue.service.ts`
- `apps/api/src/services/p4a-payment-verified-execution-queue.service.pg-race.test.ts`

Modified (documentation only):
- `rules.md` (appended Recovery Protocol section)
- `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` (appended section 6)
- `reports/LATEST.md` (this file)

### Not done / deferred
- No Bank Alfalah gateway adapter was built or is implied to exist. This
  packet contains zero bank protocol knowledge by design (see manifest
  section 6.6). Building and wiring that adapter to
  `applyVerifiedPaymentEvidence` is a separate, later, owner-authorized
  packet.
- `applyVerifiedPaymentEvidence` and the P3A worker both remain unreachable
  from any HTTP route, controller, or queue processor. This PR does not
  activate live customer payment verification or live restoration
  processing.

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

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

### RunPod Gate 2 Record
- Build-only worker CI passed before publication. Gate 2 published exactly one immutable development image in run `30571185242`: `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-dev:9926ae6d1ff87e64c805e86c6d66e9c8ca6c2eb7` at `sha256:2ae480156b955e10d5c678aa5600e23ae22139bf8cba78b9bf2144c1f96d1278`.
- Verification run `30572333924` passed for source and OCI revision `9926ae6d1ff87e64c805e86c6d66e9c8ca6c2eb7`, image ID `sha256:7388df9962bdff78f033f22956b23b536544c31614956f9c344280be95f34ddf`, `linux/amd64`, `196318730` bytes, entrypoint `["node","worker.mjs"]`, working directory `/worker`, and user `worker`.
- Gate 2 is consumed; any future publication requires new Gate 2 approval and must pin the digest. Gate 3 remote canaries remain separately prohibited pending approval, verified rate, and fixed budget. Gate 4 production activation remains separately prohibited. Replicate remains active production. Publication and verification are not deployment or restoration-quality approval.
- Verification must capture stdout, stderr, exit code, and always-running metadata evidence before an immutable image is classified as defective. Never rebuild a published immutable image merely to repair verification assertions. Canonical restoration documents remain tracked.

### RunPod Hybrid V2 — Frozen (2026-08-02)
- RunPod Hybrid V2 is frozen at annotated tag `runpod-hybrid-v2-freeze-2026-08-02` (commit `5ebf100d96f183c7784477fd0d786ad75036fb7a` on branch `fix/runpod-combined-cwd-sha256-chain`). See `docs/restoration/RUNPOD_HYBRID_V2_FREEZE.md` for the full freeze record and resume procedure.
- While frozen, no RunPod source change, workflow execution/dispatch, image publication, Gate 3 review, endpoint creation, or routing action is authorized.
- Replicate (`sczhou/codeformer`) is the active production provider.
- UI and market-launch work must not modify frozen RunPod source files.
- Unfreezing requires explicit authorization that names the freeze tag `runpod-hybrid-v2-freeze-2026-08-02`.

### Payments
- Manual proof mode (demo/free during development)

### Pipeline Flow
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

### Recovery Protocol (2026-08-04)

Added by the R9.2-P4A packet. This section is additive; every rule above it
remains in force verbatim (RunPod freeze, Gate 2/3/4 restrictions, payment
manual-proof state, protected scope).

- Routine test/build/path/shell/dependency/environment failures are
  **recoverable**, not blockers: diagnose the exact command and error,
  apply the smallest repair, rerun the exact same command, and continue.
  Examples: a stale Prisma client after a schema change (`prisma generate`),
  a dirty/contaminated worktree (switch to a clean worktree), a missing
  disposable database (start one per the pattern below), a lint/type error
  in a file you touched (fix it), a locked/leftover process on a port
  (find a free port and retry).
- Database-dependent work MUST use a disposable local PostgreSQL instance
  (see `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 2.1 and the
  P4A section below for the exact `initdb`/`pg_ctl`/`createdb` sequence):
  loopback host only (`127.0.0.1`/`localhost`/`::1`), a random or explicitly
  chosen free high port, `DATABASE_URL`/`DISPOSABLE_DATABASE_URL` passed only
  as a process environment variable — never written to any `.env` file — and
  the cluster stopped and its temp data directory deleted at the end of the
  session. Never point any tool at Neon, Northflank, or any other
  managed/production database host.
- Regenerate the Prisma client (`npx prisma generate`) any time `schema.prisma`
  or the installed `@prisma/client`/`prisma` version drifts from what the
  TypeScript compiler expects — this is a mechanical repair, not a defect
  report.
- Never return a generic `REAL_PRODUCT_DEFECT`, `BLOCKED`, or similar label
  without exact command, exact error text, exact file, and root cause. A
  vague blocker label is itself treated as a defect in the report.
- A **true stop** (not a recoverable failure) requires one of:
  - an unavailable secret or credential that cannot be created locally
    (e.g. a real Bank Alfalah merchant credential, a production Replicate
    token beyond what is already configured for approved use),
  - an action that would make a live/billable external call (Replicate,
    R2 writes beyond an already-authorized canary, Bank Alfalah, RunPod),
  - a destructive operation (force-push, `reset --hard` against work not
    yet safely stashed/committed, dropping a non-disposable database),
  - a genuinely external protocol/spec this repository does not define
    (e.g. exact Bank Alfalah callback signature/field format), or
  - an owner business decision (pricing approval, activating live customer
    processing, unfreezing RunPod).
- Every true stop reported to the user/operator must state: the exact
  command that was run, the exact error/output, the exact file(s) involved,
  the root cause, every repair attempted before stopping, and the smallest
  possible owner action that would unblock it. "It's blocked" alone is
  never an acceptable stop report.

### P4A Merge + Internal Worker Runner Boundary (2026-08-04)

Added by the R9.2-P4B packet. This section is additive; every rule above it
remains in force verbatim (RunPod freeze, Gate 2/3/4 restrictions, payment
manual-proof state, Recovery Protocol).

- PR #116 (`feat/r9.2-p4a-payment-queue`, head
  `e62387520ee2d080112fec4c53b585ea4adb4dde`) was reviewed clean/mergeable
  with no required failing checks and the expected five-file P4A scope, and
  was merged normally into `main` (merge commit
  `822f21e98e25e1658435163daf43bf1e031426bd`) without deleting the source
  branch, without force-push, and without squashing, matching this
  repository's established merge-commit convention. `applyVerifiedPaymentEvidence`
  (`apps/api/src/services/p4a-payment-verified-execution-queue.service.ts`)
  is now on `main`.
- R9.2-P4B (`feat/r9.2-p4b-worker-runner`) added
  `apps/api/src/services/p4b-internal-worker-runner.service.ts`
  (`InternalWorkerRunner` + `PrismaQueuedExecutionCandidateRepository`) and
  its standalone process entry point
  `apps/api/src/scripts/p4b-worker-runner-main.ts` (`npm run worker:p4b`).
  This makes the QUEUED `ReplicateExecution` rows the P4A transaction creates
  reachable by a bounded poll loop that drives the EXISTING, UNCHANGED P3A
  worker (`replicate-execution.worker.ts`) -- it adds no new HTTP route
  (public or admin) and no new database write path.
- **Internal worker-runner boundary**: the P4B runner is a read-only "peek"
  (`SELECT ... WHERE status = 'QUEUED' ORDER BY createdAt ASC`, with a
  per-process exclude-list for ids already proved `INELIGIBLE` so a stuck row
  cannot starve newer legitimate work) followed by a call into the P3A
  worker's own `processReplicateExecution`, which performs the actual atomic
  claim (`UPDATE ... WHERE status = 'QUEUED'`) and all eligibility
  enforcement. The runner itself never claims, never mutates a
  `PaymentAttempt`/`FixedOrder`/`PaymentEvent` row, never calls
  `applyVerifiedPaymentEvidence`, never creates a second
  `ReplicateExecution`, and never resubmits a terminal (`SUCCEEDED`/`FAILED`)
  row. Concurrency is fixed at 1 (one sequential `while` loop; no worker
  pool, no parallel dispatch) -- two independently started runner processes
  are safe only because the underlying Postgres claim is atomic, exactly as
  already proven for two concurrent P3A workers.
- **Deployment command/service expectation**: `p4b-worker-runner-main.ts` is
  a STANDALONE process, not imported by `apps/api/src/index.ts`. It is meant
  to run as its own Northflank service/deployment, separate from the `api`
  HTTP service (`npm run worker:p4b --workspace apps/api` in development, or
  the built `dist/scripts/p4b-worker-runner-main.js` after `npm run build` in
  production). It reads configuration through the exact same `loadConfig()`
  gate as the HTTP process and refuses to start (fail-closed, before
  constructing any Replicate/R2 adapter) if `RESTORATION_PROVIDER` is not
  exactly `"replicate"` or if any required env var is missing. Actually
  deploying this as a live Northflank service, and wiring real Replicate/R2
  production credentials to it, remains a separate, later, owner-authorized
  action -- this packet only makes the code path exist and prove itself
  against a disposable database.
- **Bank Alfalah remains `ready:false`.** No Bank Alfalah callback handler,
  signature verification, or protocol knowledge was added anywhere in P4B.
  `applyVerifiedPaymentEvidence` still has zero callers.
- **Protected Scope** (unchanged, restated): no production deployment or
  database access, no live Replicate/R2/payment calls, no Bank Alfalah
  protocol invention, no RunPod/Local activation, no destructive Git
  operation. All P4B verification ran exclusively against a disposable local
  PostgreSQL instance (started, migrated, used, stopped, and its temp data
  directory deleted within the same session -- port confirmed unreachable
  afterward) with mocked Replicate/R2 ports and a throwing `globalThis.fetch`
  spy in every test file that exercises the P3A/P4A/P4B code paths.
- **Recovery protocol addendum**: the same "recoverable vs. true stop"
  distinction from the P4A section above applies unchanged to P4B and to any
  future packet that builds on it (e.g. the eventual Bank Alfalah adapter or
  live activation of this runner).

### P4C Bank Alfalah MPGS — merged, sandbox smoke REJECTED (2026-08-04)

Added by the R9.2-P4C packet. This section is additive; every rule above it
remains in force verbatim.

- PR #118 (`feat/r9.2-p4c-bank-alfalah-mpgs`, head
  `c52cab8e93c9f2906c98118d7b15b02ab5e894d5`) was independently reviewed
  clean (no critical/high issue) and merged into `main` without amendment
  (merge commit `38f768d3b2bc1d52de31d79f457f8049aace3b89`).
  `apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts`
  (`BankAlfalahMpgsGateway`) is now on `main`; it remains **not** registered
  on any Express route/controller.
- A manual `workflow_dispatch`-only sandbox smoke workflow
  (`.github/workflows/bank-alfalah-mpgs-sandbox-smoke.yml`) was added and
  dispatched from `main` twice. The first run failed on a CI
  build-dependency issue (Prisma client not generated), fixed via PR #120.
  The second run reached the live MPGS sandbox with the `MERCHANT_ID`/
  `API_PASSWORD` GitHub secrets present, and Hosted Checkout initialization
  was **rejected with a structural HTTP 404** before Retrieve Order could be
  reached. See
  `docs/payments/bank-alfalah-mastercard/P4C_SANDBOX_SMOKE_EVIDENCE.md` and
  manifest section 9 for full sanitized evidence.
- **PKR is NOT `SANDBOX_VERIFIED`.** USD remains `FAIL_CLOSED`. This is a
  true stop per the Recovery Protocol (external protocol/provisioning
  uncertainty this repository cannot resolve without owner input) — no
  further live-sandbox guess-and-retry was attempted. The owner must confirm
  either the exact expected REST path/API version for this merchant's MPGS
  sandbox profile, or that the configured `MERCHANT_ID`/`API_PASSWORD`
  secrets correspond to an actually-provisioned sandbox account, before a
  future session retries the smoke test.

### P4C2 Bank Alfalah MPGS — credential-provisioning diagnostic (2026-08-04)

Added by the R9.2-P4C2 packet. This section is additive; every rule above it
remains in force verbatim.

- PR #121 (`docs/r9.2-p4c-sandbox-smoke-evidence`) was already merged before
  this packet began (merge commit
  `e75484650ef28f2f9a6b11845685e58fcb59653c`).
- Re-reading the raw log of the failed sandbox-smoke run (`30910714515`)
  directly (not from a prior session's paraphrase) confirmed the actual
  gateway response is a structural **HTTP 404**, not a 401/403 Basic-Auth
  rejection. Neither a gateway error code, a `Content-Type` header, a
  correlation/request ID, nor a `WWW-Authenticate` header was ever captured
  by the smoke script/gateway service as they existed at that time — this is
  a genuine evidence-capture gap, not a redaction. See
  `docs/payments/bank-alfalah-mastercard/P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md`.
- A new, permanent, network-free structural credential diagnostic
  (`apps/api/src/scripts/p4c2-mpgs-provisioning-config-diagnostic.ts`,
  14/14 unit tests passing) and a dedicated `workflow_dispatch`-only workflow
  (`.github/workflows/bank-alfalah-mpgs-provisioning-config-diagnostic.yml`) were
  added. Neither was run against real GitHub secrets this session (no local
  access to them); the diagnostic is exercised only via unit-test fixtures.
- No MPGS request logic, endpoint shape, or auth header construction was
  changed. Result classified `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED`
  (with `BANK_ALFALAH_WRONG_GATEWAY_REGION` as the closest unresolved
  alternative) — external/provisioning, not a repository defect. PKR remains
  **not** `SANDBOX_VERIFIED`; USD remains `FAIL_CLOSED`. P4D must not begin
  until a future session actually achieves `P4C_MPGS_AUTH_VERIFIED`.
- No card data, no payment capture, and no Replicate/R2/worker call occurred
  anywhere in this packet.

### R9.2-P4D Bank Alfalah MPGS — bounded verify+repair pass, blocker still open (2026-08-05)

Added by the R9.2-P4D packet. This section is additive; every rule above it
remains in force verbatim.

- **Blocker-resolution check (first action, before any code change):**
  confirmed no new/updated Bank Alfalah merchant document exists anywhere in
  the repository beyond the three already present under
  `docs/payments/bank-alfalah-mastercard/` (`MPGS_INTEGRATION_EVIDENCE.md`,
  `P4C_SANDBOX_SMOKE_EVIDENCE.md`, `P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md`)
  — `git ls-tree -r origin/main` shows the same three files as at the end of
  P4C2. Also confirmed via `gh run list --workflow=bank-alfalah-mpgs-sandbox-smoke.yml`
  that no `workflow_dispatch` run exists after the two failing P4C runs
  (`30910482924`, `30910714515`, both 2026-08-04); no
  `bank-alfalah-mpgs-provisioning-config-diagnostic.yml` run has ever been
  dispatched. **`P4C_MPGS_AUTH_VERIFIED` was NOT achieved.** Per rules.md and
  the task's own gate, full checkout-route/customer-flow wiring was correctly
  NOT attempted this session; no Express route/controller registration was
  added.
- This session's scope was therefore bounded to: verify the existing
  `p4c-bank-alfalah-mpgs-gateway.service.ts` against the same three existing
  evidence documents, and repair only a confirmed code-level defect already
  named by P4C2's own doc.
- **One confirmed defect repaired:** P4C2 (§3.2 of
  `P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md`) recorded that
  `initiateHostedCheckout`/`retrieveOrder` discarded response headers/body on
  a non-OK status, so a real failed sandbox dispatch could not surface
  `Content-Type`, `WWW-Authenticate`, or any gateway correlation-id header —
  and explicitly named this as an owner-approved follow-up not yet performed.
  This session implemented exactly that fix (`describeFailedMpgsResponse`)
  and nothing else: on a failed response, the thrown error now also includes
  `content-type=`, `www-authenticate=`, and `correlation-id=` (falling back to
  `none` when absent, checking `x-correlation-id`, `x-request-id`, then
  `x-mastercardapi-request-id`). No endpoint URL, HTTP method, auth header
  construction, or request body was changed. Two new unit tests were added
  confirming the capture and confirming the raw Basic Auth credential token is
  never present in the resulting error message.
- No other code defect was found on review of `buildMpgsAuthHeader`, the REST
  path shape, the currency-gating table, or `matchRetrievedOrderToAttempt`
  against the existing evidence docs and `env.ts` schema.
- **PKR remains `enabled: true` / not `SANDBOX_VERIFIED`. USD remains
  `FAIL_CLOSED`.** Neither currency gate was touched.
- No RunPod/Local provider file was modified. No P3A/P4A/P4B/P5A logic was
  modified; their existing test suites were re-run unchanged and still pass.
- No live/billable network call, no new sandbox `workflow_dispatch`, and no
  database write occurred in this session (no local Postgres was available in
  this environment, so the pg-race DB-backed MPGS test was not run in this
  session — it was not touched by this packet's change, which is a
  response-header-capture change only, not DB logic).
- Per rules.md, **P4D checkout-route/customer-flow wiring still must not
  begin** until a future session actually achieves `P4C_MPGS_AUTH_VERIFIED`
  (owner action required: resolve Bank Alfalah merchant-profile enablement per
  `P4C2_CREDENTIAL_PROVISIONING_RESOLUTION.md` §6-§7, then re-dispatch
  `bank-alfalah-mpgs-sandbox-smoke.yml`).

### R9.2-P4C: Bank Alfalah Mastercard Gateway (MPGS) supersedes legacy APG (2026-08-04)

Added by the R9.2-P4C packet. This section is additive; every rule above it
remains in force verbatim.

- The legacy "Alfa APG v1.1" Bank Alfalah protocol (`sandbox.bankalfalah.com`
  / `payments.bankalfalah.com`, `/HS/` endpoints, Store ID/Key1/Key2,
  `HS_`-prefixed fields, AES/CBC request signing) is **retired** and must
  never be reintroduced in active code/config. This repository never had a
  working implementation of it to migrate off of (confirmed by repo-wide
  grep before this packet); the retirement forecloses that path going
  forward. Enforced by
  `apps/api/src/services/p4c-bank-alfalah-legacy-apg-retired.test.ts`, a
  repository-wide scan test.
- The only Bank Alfalah integration this repository is permitted to carry is
  the **Mastercard Gateway (MPGS)** sandbox
  (`test-bankalfalah.gateway.mastercard.com`), implemented in
  `apps/api/src/services/p4c-bank-alfalah-mpgs-gateway.service.ts`. Config is
  `BANK_ALFALAH_MPGS_*` in `apps/api/src/config/env.ts`, disabled by default
  (fail-closed), with `BANK_ALFALAH_MPGS_OPERATOR_ID` reserved as
  portal-login metadata only (never used for REST Basic Auth, which is
  `merchant.<Merchant ID>` / API Password).
- Like `applyVerifiedPaymentEvidence` (P4A), this gateway module is
  deliberately NOT registered on any Express router and NOT imported by any
  controller in this packet. It always performs its own Retrieve Order v74
  call before accepting any paid transition -- it never trusts a browser
  return or a webhook payload's claimed status, and every status-inquiry
  request targets only the configured `BANK_ALFALAH_MPGS_BASE_URL` with a
  stored, validated order id (never a URL taken from webhook content). A
  verified match delegates to the existing, unmodified
  `applyVerifiedPaymentEvidence` transaction -- this module never calls
  Replicate, R2, or any worker.
- PKR is enabled (`standard-pattern-fallback` evidence); USD is fail-closed
  (rejected) pending confirming documentation or a bounded sandbox capability
  test -- see `docs/payments/bank-alfalah-mastercard/MPGS_INTEGRATION_EVIDENCE.md`.
- No live sandbox smoke test was run in this packet: no `MERCHANT_ID` /
  `API_PASSWORD` / `OPERATOR_ID` (or `BANK_ALFALAH_MPGS_*` equivalents) were
  present as environment variables in this session. All verification used
  mocked gateway fetch responses and a real disposable PostgreSQL instance
  for idempotency/race proof.
- **Protected Scope** (unchanged, restated): P4A/P4B pipeline queuing logic,
  the P3A/P3B worker, and RunPod/Local were not touched by this packet. No
  production activation, no real card/funds movement, no credential value in
  repo/logs/reports.

### R9.2: P5A merged; Codex CLI Automation Retirement (2026-08-04)

Added by the retire-Codex-CLI-automation packet. This section is additive;
every rule above it remains in force verbatim.

- PR #123 (`feat/r9.2-p5a-restoration-status-download`, head
  `872369bdec57f69957d7a1c889a5aab0cf4bae25`) was verified CLEAN/MERGEABLE
  with the expected P5A scope and merged normally into `main` (merge commit
  `1dfd6d180eff3348b4635941268effb92d9bd1e2`).
- A machine-level audit for "Codex CLI automation" found **nothing to
  retire**: no global `@openai/codex` npm package, no `codex` binary on
  `PATH`, no Codex-related Windows Scheduled Task, no startup-folder
  launcher. The only `codex.exe` process present was the normal OpenAI
  ChatGPT VS Code extension's editor-integration `app-server`, which is
  retained — it is normal interactive Agent tooling, not unattended
  automation, and was not stopped or uninstalled.
- Stray one-off `.ps1` runner scripts left in `D:\Temp` from an earlier
  automation period (`r92-parse-check.ps1`, `r92-wrapper-repair.ps1`) were
  deleted after confirming via `git worktree list` that they were not
  registered worktrees and had no active reference from any tracked script
  or workflow. Directories under `D:\Temp` matching the `r92-*` naming
  pattern that turned out to be registered git worktrees were left
  untouched, per the "never delete uncertain worktrees" rule.
- Permanent protocol: Codex CLI unattended automation (detached `codex exec`
  runs, prompt-orchestration scripts, scheduled unattended dispatch against
  this repository) is retired. Normal interactive Agent mode — a human
  opening a workspace and directing Claude Code or an editor's own Agent
  integration — is the authoritative way work gets done here. See
  `docs/development/NORMAL_AGENT_WORKFLOW.md`. No status-only completion
  claim is acceptable: "done" requires remote Git evidence (a pushed branch,
  a commit SHA, and, when a PR is the deliverable, a real PR number/URL
  independently verifiable with `gh pr view`).
- **Protected Scope** (unchanged, restated): no production deployment or
  database access, no live payment/Replicate/R2/RunPod/Local calls, no
  force-push/`reset --hard`/`clean -fd`, no deletion of product source,
  tests, migrations, canonical documentation, or active GitHub workflows.

### R9.2-PR125-MERGE-AND-P4B-READINESS: PR #125 merged; P4B Northflank deployment preparation (2026-08-05)

Added by the R9.2-PR125-MERGE-AND-P4B-READINESS packet. This section is
additive; every rule above it remains in force verbatim.

- PR #125 (`ops/r9.2-p4d-mpgs-checkout-flow-verify`, head
  `be0ffdddd9e775d4f82b54b766d44d5ca9834306`) was independently re-verified
  in its own isolated worktree (clean, HEAD matched exactly,
  `mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`, no configured checks)
  and merged normally: merge commit
  `5cf50447429aa2844e7b812446505f0c1c427999`.
- The MPGS pg-race test the prior P4D packet could not run (no local
  Postgres available then) was run this session against a disposable,
  loopback-only PostgreSQL 17 instance and **passed 6/6**, with full proof
  of cleanup afterward (process gone, port free, temp directory and
  password removed).
- A second, separate disposable worktree
  (`D:\Temp\r92-p4b-northflank-readiness`, branch
  `chore/r9.2-p4b-northflank-readiness`, built from updated `origin/main`
  containing the PR #125 merge) was used to inspect the existing,
  already-merged, already-tested P4B internal worker runner
  (`p4b-internal-worker-runner.service.ts` /
  `p4b-worker-runner-main.ts`) and write
  `docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md` — a deployment runbook
  documenting the sole start command, required environment-variable names
  (no values), single-instance limits, health expectations, graceful
  shutdown, rollback, and post-deployment checks. **No runner code was
  changed.** No Northflank project, service, or secret group was created.
- Full P4B/P4A/P3A/P3B DB-backed and non-DB regression suite re-run,
  unmodified, in this second disposable-Postgres instance — all pass (see
  `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 13.5 for the
  complete breakdown). `lint`/`typecheck`/`build`/`prisma validate` all
  pass. A secret scan found one **pre-existing** token-shaped value in an
  unrelated `.kilo/plans/` document, outside this packet's scope, flagged
  for owner awareness and left untouched.
- **Finalized Protected Scope Protocol** for deployment-preparation
  packets of this shape (full text in manifest section 13.6): append-only
  evidence; deployment preparation is never deployment; the P4B runner's
  Replicate-only provider guard must never be loosened or bypassed and no
  RunPod/Local path may be added to it without a new authorized packet;
  canonical source/workflows/packets/validators/migrations/tests/
  development docs stay tracked (only `AI_code_audit_report_RI.md` and
  genuine temporary evidence may be ignored — no broad `.gitignore`, no
  `git add -f`); disposable-database discipline applies to any DB-backed
  test in such a packet; and opening a readiness PR authorizes nothing by
  itself — the actual Northflank deployment remains a distinct, separately
  authorized future task performed directly against the runbook.
- A new PR (`chore/r9.2-p4b-northflank-readiness` → `main`) was opened
  carrying this documentation only. **It was explicitly not merged and not
  deployed** by this packet, per this task's own instruction.
- Next owner action: when ready to actually deploy the P4B worker, review
  and merge the new P4B-readiness PR, then follow
  `docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md` directly in the
  Northflank console to create the service, attach the existing `api`
  secret group, and deploy — no code change is needed to do so.

### R9.2-RESOLVE-P127-MERGE-AND-RETIRE-DUPLICATE-DOCS: PR #127 merged; duplicate automation status docs retired (2026-08-05)

Added by the R9.2-RESOLVE-P127-MERGE-AND-RETIRE-DUPLICATE-DOCS packet. This
section is additive; every rule above it remains in force verbatim.

- PR #127 (`feat/r9.2-p5b-sharp-variants`) was merged into `main`
  (merge commit `738fe3c3779c5462bad61a5ea2437704aa0216fe`), after resolving
  pure documentation-numbering drift against `origin/main` (which by then
  carried PR #126) in an isolated resolver worktree. Full record:
  `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 15.
- The following duplicate/automation status documents are retired and
  **deleted from the repository**: `AGENTS.md`, `docs/PROJECT_STATE.md`,
  `docs/NEXT_TASK.md`, `docs/PROTECTED_SCOPE.md`,
  `docs/COMPLETION_STATUS.md`, `docs/DECISIONS.md`, `reports/LATEST.md`.
  They must never be recreated, and no replacement status/automation file
  of the same shape may be added.
- **AI_code_audit_report_RI.md is now required after every task.** After
  completing any task in this repository, append a record to
  `AI_code_audit_report_RI.md` covering: the exact commands run, any
  repairs applied, the exact tests run and their results, the files
  changed, Git evidence (branch, commit/merge SHA, PR number when
  applicable), completion percentages, the current Protected Scope, and
  the next task. This file is, and remains, ignored by `.gitignore` and is
  never staged or committed — it is local audit history only, not a
  tracked deliverable.
- **Remaining documentation authorities** (all other project-state/
  status/task-tracking documents are retired): `rules.md` (this file),
  `.kilo/plans/commerceflownew.md` (canonical plan),
  `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` (canonical, append-only
  release evidence), feature-specific protocol documents already tracked
  under `docs/` (e.g. `docs/restoration/`, `docs/payments/`,
  `docs/deployment/`), and `AI_code_audit_report_RI.md` as ignored local
  audit history.
- **Protected Scope Protocol (finalized, retirement packets)**: a
  retirement packet of this shape may delete only the exact
  documentation files it was explicitly authorized to delete; it must
  never delete or rewrite canonical source, workflows, packets,
  validators, migrations, tests, or development documentation; it must
  not broaden `.gitignore` beyond `AI_code_audit_report_RI.md`'s existing
  entry and must never use `git add -f`; and references to a retired file
  inside an existing **append-only** evidence document (a past task's
  recorded file-changed list) are historical record, not an active
  pointer — they are left intact rather than rewritten, consistent with
  this repository's existing append-only manifest protocol.
- No RunPod, MPGS, deployment, or product-scope-expansion change was made
  by this packet.

### R9.2-MERGE-P128-AND-P6A-CUSTOMER-ROUTE-HARDENING: PR #128 merged; customer routes hardened (2026-08-05)

Added by the R9.2-MERGE-P128-AND-P6A-CUSTOMER-ROUTE-HARDENING packet. This
section is additive; every rule above it remains in force verbatim.

- PR #128 (`chore/r9.2-retire-automation-docs`, head
  `8faca0851f50e23bb748b647c995d8e542ce9c01`) was independently re-verified
  (OPEN, CLEAN, MERGEABLE, documentation/retirement scope only, exactly the
  seven requested files deleted, no product/secret/deployment/MPGS/RunPod
  change, no required failing check) and merged normally. Merge commit:
  `53d667d7fe275a03d84d9656faedd6dc0e23ffeb`.
- **PriceBook reconciliation (verified, not changed)**: `PB-2026-08-03-v1`
  in `apps/api/src/domain/pricing/priceBook.ts` matches the approved amounts
  exactly (PKR 25000/35000/50000; USD 150/250/350 minor units). The stale
  `FixtureOfferProvider` header comment in `offerProvider.ts`, which stated
  in the present tense that no USD fixture/pricing existed, was corrected
  with a dated update note pointing to `ApprovedOfferProvider`/`priceBook.ts`
  as the current source of truth; the original P1A text was preserved
  verbatim as a historical record. No price or PriceBook behavior changed.
- **Permanent rule — customer route authority**: `/orders`, `/wallet`,
  `/payments`, and `/subscription` must always be wrapped by the existing
  `RequireAuth` mechanism (`apps/web/src/components/RequireAuth.tsx`) in
  `App.tsx`. Anonymous access must redirect to `/login` with the intended
  destination preserved via router location state (already consumed by
  `LoginPage.tsx`'s `from`); no new/duplicate auth mechanism may be
  introduced for these routes. Admin routes keep their own separate
  `RequireAdminPortal` gate, unchanged. Guest restoration upload/status
  routes remain intentionally unauthenticated.
- **Permanent rule — no page-load/refresh processing dispatch**: no
  customer-facing restoration page may issue a processing-triggering POST
  as a side effect of mounting, polling, or refreshing. Only the
  verified-payment-created internal execution (P4A) and the P4B internal
  worker runner may start new restoration processing. A confirmed violation
  of this rule was found and repaired in `RestoreOrderPage.tsx` (an
  automatic `processRestorationItem` POST fired on every fresh page load);
  see `docs/restoration/P6A_CUSTOMER_ROUTE_HARDENING_PROTOCOL.md` for the
  full record.
- No checkout route was created; `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED`
  remains open, unchanged. No production deployment, secret, live
  Replicate/R2/RunPod/MPGS network call, or destructive Git operation
  occurred. Full test/command evidence:
  `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` (R9.2-P6A section).

### R9.2-MERGE-P129-AND-P6B-APPROVED-OFFER-WIRING: PR #129 merged; approved pricing wired into FixedOrder (2026-08-05)

Added by the R9.2-MERGE-P129-AND-P6B-APPROVED-OFFER-WIRING packet. This
section is additive; every rule above it remains in force verbatim.

- PR #129 (`feat/r9.2-p6a-customer-route-hardening`, head
  `62531cc33b4c3b9f1e54cd53a5e6d45db88456fe`) was independently re-verified
  (OPEN, CLEAN, MERGEABLE, expected P6A files only, no secret/deployment/
  MPGS/RunPod/unrelated change, no required failing check; existing focused
  P6A tests re-run and passed) and merged normally. Merge commit:
  `f76a3c4f8c2c1b9f94b1def65767ab27d4775212`.
- **Permanent rule — approved-offer wiring boundary**:
  `POST /api/fixed-orders/restoration-digital`
  (`apps/api/src/services/fixed-order.service.ts` +
  `apps/api/src/controllers/fixed-order.controller.ts`, mounted on the
  existing `restoration.routes.ts` router) is the only route permitted to
  create a `FixedOrder`/`FixedOrderItem` from a customer's draft. It must
  always default to `ApprovedOfferProvider`; `FixtureOfferProvider` may
  only ever be reached by a test explicitly injecting it, never by any
  production request path (no request field selects a provider). Every
  `pricingApproved: true` item must carry `pricingSource: "approved_pricebook"`
  and the exact `PB-2026-08-03-v1` (or successor) PriceBook snapshot; a
  `local_fixture`-priced item must never be marked `pricingApproved: true`.
  The client may supply only `draftId` and `tier` -- amount, currency,
  PriceBook version, pricing source, and approval state must never be
  accepted from a request.
- **Permanent rule — order creation stops before payment**: this endpoint,
  and any successor route that creates a `FixedOrder`, must never create a
  `PaymentAttempt`, `PaymentEvent`, `RestorationEntitlement`,
  `RestorationMaster`, or `ReplicateExecution` row. Those remain owned
  exclusively by the existing P4A verified-payment transaction boundary
  (`p4a-payment-verified-execution-queue.service.ts`) and the P4B worker
  runner.
- No MPGS checkout route was created; `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED`
  remains open, unchanged. RunPod was not read for modification and remains
  untouched (a RunPod test suite incidentally wrote disposable scratch
  fixture files during the full regression sweep; these were unstaged and
  deleted before commit, not committed). Full test/command evidence:
  `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` (R9.2-P6B section) and
  `docs/restoration/P6B_APPROVED_OFFER_WIRING_PROTOCOL.md`.

### R9.2-MERGE-P130-AND-P6C-CUSTOMER-MVP-FLOW: PR #130 merged; customer MVP flow completed (2026-08-05)

Added by the R9.2-MERGE-P130-AND-P6C-CUSTOMER-MVP-FLOW packet. This section
is additive; every rule above it remains in force verbatim.

- PR #130 (`feat/r9.2-p6b-approved-offer-wiring`, head
  `d01f8201c547d33bd36269bbc85cb0aeedce03ff`) was independently re-verified
  (OPEN, CLEAN, MERGEABLE, expected nine P6B files only, no secret/
  deployment/MPGS/RunPod/unrelated change, no required failing check;
  focused unit + a fresh disposable-PostgreSQL pg-race run both re-passed)
  and merged normally. Merge commit: `1e325e9c8cb457812f222930c0fa21ce8bc1245e`.
- **Permanent record — `setup/project-automation` is superseded, do not
  cherry-pick**: that local branch (one commit, `f47b6cf`, based on a
  pre-P4B point in `main`'s history, never merged) contains an alternate,
  abandoned implementation of `restoration-draft.controller.ts`/
  `.service.ts`/`.routes.ts` and `FixedOrderReviewPage.tsx` whose own
  `fixed-order.service.ts` conflicts with the tested one already on `main`
  (P6B). It must never be cherry-picked or merged as-is; if any part of it
  is ever reused, it must be re-derived and re-verified against current
  `main`, exactly as this packet did. Full audit:
  `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 19.2.
- The minimum customer MVP (market selection → upload → `RestorationDraft`
  → signed preview → server offers → tier selection → immutable
  `FixedOrder` → review) is now live: `POST /api/restoration-drafts`,
  `GET /api/restoration-drafts/:id`, `GET /api/restoration-drafts/:id/offers`,
  the existing `POST /api/fixed-orders/restoration-digital` (P6B), and the
  new `GET /api/fixed-orders/:orderNo`. Every write in this flow is
  explicit-button-only; every read is GET-only on mount/refresh, extending
  the P6A rule to this new flow's pages.
- No MPGS checkout route was created; `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED`
  remains open, unchanged. RunPod was not touched (an incidental test-
  scratch-file side effect was found and discarded, not committed). Full
  test/command evidence: `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md`
  (R9.2-P6C section) and `docs/restoration/P6C_CUSTOMER_MVP_FLOW_PROTOCOL.md`.

### R9.2-MPGS-ACTUAL-APP-E2E: PR #137 merged (return-URL repair); actual-app dry-run harness found and repaired three independent defects (2026-08-05)

Added by the R9.2-MPGS-ACTUAL-APP-E2E packet. This section is additive; every
rule above it remains in force verbatim.

- PR #137 (`ops/r9.2-mpgs-actual-app-test`, head `3c2e2f0`) was
  independently re-verified (OPEN, CLEAN, MERGEABLE, exactly the 3 intended
  return-URL-repair files, 10/10 env + 26/26 gateway/checkout unit tests,
  68/68 disposable-PostgreSQL pg-race tests run separately, 58/58 existing
  Playwright tests, lint/typecheck/build clean) and merged normally. Merge
  commit: `1aa0040e72a962427cc2e2018722bb9f2e1d41a8`.
- **Permanent rule — the bank's live v100 REST-JSON API documentation is the
  sandbox contract authority, re-verify it directly before trusting any
  prior session's endpoint assumption.** A confirmed contract mismatch was
  found and repaired: Hosted Checkout initiation is
  `POST .../merchant/{merchantId}/session` (not
  `PUT .../order/{orderId}/checkout`), and `interaction.merchant.name`
  (1-40 chars) is a REQUIRED field the adapter never sent. This is
  consistent with, and very likely fully explains, the original P4C
  structural `HTTP 404`. New required-when-enabled config:
  `BANK_ALFALAH_MPGS_MERCHANT_NAME`. `retrieveOrder`
  (`GET .../order/{orderId}`), Basic Auth construction, and the
  verification orchestrator are unchanged. Full record:
  `docs/payments/bank-alfalah-mastercard/R9.2_MPGS_ACTUAL_APP_E2E_CONTRACT_CORRECTION_2026-08-05.md`.
- **Permanent rule — a route registered in an earlier-mounted router always
  wins an identical-path collision; verify actual reachability, not just
  unit/mocked-Playwright coverage.** The MPGS checkout controller's routes
  (`/orders/:orderNo/checkout`, `/orders/:orderNo/payment-status`) were
  byte-for-byte shadowed by the pre-existing legacy
  `OrderController.createOrderCheckout` route (mounted earlier in
  `index.ts`), making the MPGS checkout endpoint unreachable via real HTTP
  traffic since it was first wired up -- no mocked test ever caught this.
  Repaired by moving both routes under the existing `/fixed-orders/` prefix.
  A structural regression test
  (`r9.2-mpgs-checkout-route-collision-guard.test.ts`) now guards this.
- **Permanent rule — every `rateLimit()` call site must have its own
  isolated counter.** `rate-limit.middleware.ts` previously shared one
  module-scope `Map` across every call site (including the global
  `app.use(rateLimit(60_000, 120))`), so unrelated requests from the same
  IP could exhaust a route's specific budget. Repaired; each call now gets
  a private store. Regression test: `rate-limit.middleware.test.ts`.
- A new actual-app dry-run harness (`apps/web/tests/browser-actual-app-dryrun/`,
  `apps/web/playwright.actual-app-dryrun.config.ts`,
  `apps/api/src/scripts/mpgs-local-stub-server.ts`) drives the real upload
  -> preview -> tiers -> create-order -> review -> one real "Pay securely"
  click flow against a real disposable PostgreSQL instance and a real API
  server, with the MPGS base URL pointed at a local stub gateway (never the
  real bank host). 6/6 tests pass (success, duplicate-click protection,
  refresh-is-GET-only, and 400/401/404 error handling), all with zero live
  network calls.
- No live sandbox request was made this session (deliberately deferred --
  building and validating the actual-app harness first was this packet's
  own risk-sequencing decision). `BANK_ALFALAH_MPGS_ENABLED` remains
  `false` outside manual/CI runs.
  `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` status is unchanged
  by this packet (a separate, external provisioning question). No
  production deployment, no RunPod/Replicate/R2/webhook/capture/P4A change,
  no destructive Git operation, no Bank Alfalah support ticket or email
  drafted or sent (explicitly out of scope for this packet).
- **Permanent rule — `PaymentAttempt.providerRef` must never be written at
  checkout/session creation; it is exclusively the verified transaction
  reference, set exactly once by `applyVerifiedPaymentEvidence` (P4A) after
  a real server-side match.** `CustomerCheckoutService.createCheckout`
  previously wrote `providerRef: checkout.sessionId` (the Hosted Checkout
  session id) when initiating payment. P4A's own mismatch guard in
  `p4a-payment-verified-execution-queue.service.ts` (`runOnce`:
  `if (attempt.providerRef && attempt.providerRef !== evidence.providerRef)`)
  then rejected every genuine first-time verification with
  `PROVIDER_REFERENCE_MISMATCH`, because a session id is a structurally
  different MPGS identifier from a transaction reference and `providerRef`
  was therefore never `null` when real evidence arrived. This would have
  silently broken payment confirmation for every real transaction. Found
  and fixed while building `CustomerCheckoutService.getStatus` in
  R9.2-PAYMENT-VERIFICATION-BRIDGE; regression-guarded by
  `customer-checkout.service.pg-race.test.ts`. Any future code that touches
  `PaymentAttempt` at session-initiation time must not populate
  `providerRef`; gate "has a session been created" checks on `status`, not
  on `providerRef`. Full record:
  `docs/payments/bank-alfalah-mastercard/R9.2_PAYMENT_VERIFICATION_BRIDGE_2026-08-06.md`.

### R9.2-MERGE-P143-AND-ONE-USD-SANDBOX-DIAGNOSTIC (2026-08-06)

Added by the R9.2-MERGE-P143-AND-ONE-USD-SANDBOX-DIAGNOSTIC packet. This
section is additive; every rule above it remains in force verbatim.

- PR #143 (`feat/r9.2-payment-verification-bridge`, head
  `7800e34523819fcb740c0dcdefaaa75b289aace9`) was independently re-verified
  (OPEN, CLEAN, MERGEABLE, exact payment-verification-bridge scope, 79/79
  disposable-PostgreSQL pg-race tests, 162/163 fast unit tests -- the one
  non-pass is a pre-existing, unrelated `vitest`-only diagnostic script this
  repository's `node:test` harness cannot run, confirmed present and
  identical on `origin/main` before this packet touched anything -- 58/58
  Playwright, lint/typecheck/build/Prisma clean) and merged normally. Merge
  commit: `e05d04a5b46edffb9fc68ebc09ea9803c9e05a98`.
- **Permanent rule — example currency values in generic third-party
  MPGS/Mastercard documentation must never be treated as merchant-profile
  currency authority.** Only a bank-specific, merchant-profile-specific
  confirmation (a direct email/portal statement, or a successful bounded
  sandbox test) may enable or disable a currency in
  `MPGS_CURRENCY_SUPPORT`. This packet's currency document audit found the
  one currency-related contradiction in this repository's evidence set —
  a **retired, different** protocol (Alfa APG) stating "Currency ... will
  always be PKR" — and confirmed it does **not** apply to the current MPGS
  V100 integration, whose only currency-authority source is the bank's own
  direct, merchant-profile-specific confirmation that the same credentials
  are valid for both PKR and USD sandbox testing. No generic MPGS/Mastercard
  documentation's example currency was ever treated as authoritative for
  this merchant profile, in either direction. Full record:
  `docs/payments/bank-alfalah-mastercard/R9.2_USD_CURRENCY_EVIDENCE_AUDIT_2026-08-06.md`.
- `MPGS_CURRENCY_SUPPORT.USD.enabled` was already `true`
  (`doc-confirmed-live-fetch`) before this packet; no currency-gating code
  change was needed. A USD leg was added to the existing actual-app dry-run
  suite (`mpgs-actual-app-dryrun.spec.ts`, now 7/7 passing against the local
  stub, zero code duplication) and the existing live-sandbox spec/workflow
  were parameterized by a new `currency` (`PKR`/`USD`) `workflow_dispatch`
  input so the owner can authorize exactly one real USD sandbox request
  through the same job, screenshots, and evidence pipeline already proven
  for PKR — no duplicate workflow, job, or spec file was created.
- The owner-authorized live USD sandbox dispatch and its classified result
  (if run before this session ends) are recorded in
  `docs/payments/bank-alfalah-mastercard/R9.2_USD_CURRENCY_EVIDENCE_AUDIT_2026-08-06.md`
  and the release manifest; if not yet run, `P4C_MPGS_AUTH_VERIFIED` and
  `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remain exactly as this
  packet found them (unchanged, unresolved, bank-side).

### R9.2-CANCEL-WRONG-RUN-MERGE-P144-AND-WATCH-USD-PROOF (2026-08-06)

Added by the R9.2-CANCEL-WRONG-RUN-MERGE-P144-AND-WATCH-USD-PROOF packet.
This section is additive; every rule above it remains in force verbatim.

- PR #144 (`feat/r9.2-usd-sandbox-diagnostic`, head
  `dc681512e89c96de3e0338608e4e369d55b8c3c3`) was independently re-verified
  (OPEN, CLEAN, MERGEABLE, exact 7-file USD scope, 79/79 pg-race, 58/58
  Playwright, 7/7 actual-app dry-run, 162/163 fast unit -- the one
  non-pass a pre-existing, unrelated `vitest`-only gap -- typecheck/build/
  Prisma clean, and a truthfully-reported lint baseline: `npm run lint`
  exits `1` repo-wide from 4 pre-existing errors confined to
  `apps/web/scripts/render-text-as-png.mjs`, confirmed unrelated to this
  PR's diff; the two `.ts` files this PR actually touches produced zero
  lint findings) and merged normally. Merge commit:
  `14a745b9274f3d6a23f03ce11ecb4be2c76cee3d`.
- **Permanent rule — a `workflow_dispatch` for a workflow whose parameters
  were just added must be dispatched from a ref that actually contains
  those parameter definitions.** Run `31058730527` was dispatched on
  `main` at SHA `e05d04a5b46...` -- the PR #143 merge commit, still
  *before* PR #144 added the `currency` input -- so its workflow copy had
  no such input at all and silently ran the old, unconditional PKR path
  regardless of any dispatch-time intent. The run had already completed
  by the time it was inspected (nothing to cancel); its evidence was
  downloaded and classified: one real request, `currency=PKR`,
  `HTTP 401`, identical failure shape to the first PKR live proof. This
  did **not** satisfy or consume the owner-authorized USD request. GitHub
  Actions silently drops `workflow_dispatch` inputs a given workflow
  revision doesn't define -- it never errors -- so dispatching a
  parameterized workflow from a stale ref is a silent, not a loud,
  failure mode. Always dispatch from the ref (branch/tag/SHA) that
  contains the input's definition, and verify the dispatched run's own
  `headSha` matches that ref before treating its result as evidence of
  the newly-added behavior.
- No live USD request exists yet at updated `main` HEAD as of this
  packet. Status: `AWAITING_OWNER_USD_DISPATCH`. This agent does not
  dispatch the live workflow itself. Full record:
  `docs/payments/bank-alfalah-mastercard/R9.2_USD_CURRENCY_EVIDENCE_AUDIT_2026-08-06.md`
  §5.

### R9.2-USD-RETEST-AFTER-BANK-ENABLEMENT-AND-COMPLETE-LAUNCH-READINESS (2026-08-06)

Added by the R9.2-USD-RETEST-AFTER-BANK-ENABLEMENT-AND-COMPLETE-LAUNCH-
READINESS packet. This section is additive; every rule above it remains in
force verbatim.

- Owner-dispatched run `31084589628` (`main`, `0e9f584...`, PR #145 HEAD,
  `mode=live`, `currency=USD`, dispatched after the bank confirmed USD
  newly enabled on sandbox MID `TESTGLOBALINDUS`) produced the same
  `HTTP 401` as every prior live request. **Permanent record: enabling a
  currency on the bank's merchant profile does not, by itself, resolve a
  sandbox `401` — this is a distinct, credential/REST-permission-level
  gate.** Do not treat a bank's "currency enabled" confirmation as
  sufficient grounds to expect a live sandbox request to succeed; the
  `401` classification (§23, §24, §27, §28, this section) stands
  independently of currency configuration until the bank confirms the API
  password/REST permission itself.
- **Permanent rule — test files that import from `vitest` must run under
  `npx vitest run`, never under `npx tsx --test` (node:test).** Any
  `*.test.ts` file using `vitest`-specific APIs (`vi.mock`, etc.) fails
  `MODULE_NOT_FOUND`/closed under the `node:test` runner if included in a
  `tsx --test` glob. `p4c2-mpgs-provisioning-config-diagnostic.test.ts` is
  the current sole example. `npm run verify:launch-candidate`
  (`scripts/verify-launch-candidate.mjs`) codifies the split
  automatically; any future vitest-only file must be added to that
  script's `VITEST_ONLY` set, not silently excluded from any suite.
- **Permanent rule — `eslint.config.mjs` must grant Node globals
  (`globals.node`) to every `**/*.mjs` file, not just `.ts/.tsx` files and
  one hardcoded `.mjs` directory.** A gap here (only `apps/api/runpod-
  worker-dev/**/*.mjs` had Node globals) caused 4 false-positive
  `no-undef` errors on `apps/web/scripts/render-text-as-png.mjs` (added by
  §21) with no code defect present. Repaired by adding a `files:
  ["**/*.mjs"]` block.
- `npm run verify:launch-candidate` is the canonical smallest deterministic
  launch-critical gate: lint (0 errors) → the full `node:test` fast suite
  (162 files) → the vitest-only file (14 tests). Zero external network
  calls. Full local proof (79/79 pg-race across all 8 suites against a
  disposable PostgreSQL 17, 58/58 Playwright, typecheck/build/Prisma/git-
  diff all clean) and the Northflank GO/NO-GO table are recorded in
  `docs/restoration/R9_2_LAUNCH_CANDIDATE_READINESS_PROTOCOL.md` and
  manifest §29. No deployment was made; the P4B worker still has no
  dedicated Northflank service definition in-repo (owner action, see
  protocol doc §3).

### R9.2-MERGE-P146-WORKER-SERVICE-READINESS-AND-DUAL-GATEWAY-PLAN (2026-08-06)

Added by the R9.2-MERGE-P146-WORKER-SERVICE-READINESS-AND-DUAL-GATEWAY-PLAN
packet. This section is additive; every rule above it remains in force
verbatim.

- PR #146 (`feat/r9.2-launch-candidate-readiness`, head
  `e3b34f96355079fa1b0d4c1232b50fc73f757a04`) was independently re-verified
  (OPEN, CLEAN, MERGEABLE, exact launch-readiness scope, full first-pass-
  clean regression) and merged normally. **Merge SHA:
  `89f9bcd07368b0ac3a06bbc138070d38cd39b28a`.**
- **Permanent rule — a repo-level Northflank service definition file is a
  reference specification, not a deployment trigger.**
  `northflank/p4b-worker.service.yaml` exists so a future, separately
  authorized task can copy a known-correct contract into the Northflank
  console; no script, workflow, or CI job in this repository may ever be
  wired to auto-apply it without a new, explicit authorization.
- **Permanent rule — `PaymentAttempt.provider` and `PaymentEvent.provider`
  are intentionally free-text, not an enum, specifically to allow a future
  second payment provider without a schema migration.** Any future
  gateway-routing code must preserve this (never hardcode a `bank_alfalah`-
  only assumption at the schema or query layer) and must follow the
  existing "no implicit fallback between providers" pattern already
  proven for `RestorationProviderRouter`.
- **Permanent rule — no local payment-rail (JazzCash/RAAST/EasyPaisa or
  similar) code, endpoint, or credential may be implemented until an
  official bank/aggregator document exists in this repository.**
  `docs/payments/R9_2_DUAL_GATEWAY_READINESS_PLAN.md` is a plan only; every
  item in it is marked `AWAITING_BANK_CONFIRMATION` and must stay that way
  until real evidence lands, exactly as the MPGS currency-authority rule
  (§27) already establishes for gateway facts generally.
- No P4B runner source code was changed. No new Bank Alfalah request was
  made (task explicitly deferred to await the bank's response). No
  RunPod/Replicate/R2 network call. No deployment.

### R9.2-MERGE-P147-AND-STAGING-RELEASE-PREFLIGHT (2026-08-06)

Added by the R9.2-MERGE-P147-AND-STAGING-RELEASE-PREFLIGHT packet. This
section is additive; every rule above it remains in force verbatim.

- PR #147 (`feat/r9.2-worker-and-dual-gateway-readiness`, head
  `b81c1a46811f9d7efec0e9ac2e194bfacfe34454`) was independently re-verified
  (OPEN, CLEAN, MERGEABLE, exact worker-readiness/dual-gateway scope, full
  first-pass-clean regression) and merged normally. **Merge SHA:
  `04d670ba043d35ac55542f1a0e0451f3b5a07769`.**
- **Bank Alfalah support email sent; payment integration is now frozen
  pending the bank's reply.** No future packet may call or retest Bank
  Alfalah, change the verified MPGS contract, implement a local/dual
  gateway, or request production credentials until the bank responds and
  a new task explicitly authorizes the next step.
- **Permanent rule — `npm run verify:staging-preflight` is the canonical
  repository-configuration-only staging gate, zero external calls.** Its
  10 checks (start-command collision, payment fail-closed default,
  RunPod-exclusion, required-env-name documentation, no committed
  real-looking secret, valid health/readiness config, single-owner
  migration execution, no unsigned R2 URL for masters, documented
  rollback) must all continue to pass; any future change to `Dockerfile`,
  `northflank/*.service.yaml`, `env.ts`'s `BANK_ALFALAH_MPGS_ENABLED`/
  `RESTORATION_PROVIDER` defaults, or the master-persistence upload path
  must keep this validator green, not bypass or weaken it.
- **Permanent rule — R2 master privacy depends on `uploadMaster()`
  discarding `StorageService.uploadFile()`'s convenience `.url` field,
  not on the absence of a `getPublicUrl()` method.** `getPublicUrl()`
  legitimately exists on both storage providers for internal/mock use;
  the actual guarantee is that the master-persistence call site
  (`replicate-execution.worker.ts`) never returns or persists that field
  — all real downloads go through `getSignedUrl()`/`generateDownloadUrl()`
  at request time. Any future code touching this path must preserve that
  distinction exactly, and `verify:staging-preflight`'s corresponding
  check must be updated alongside it, never removed to make a change
  pass.
- No RunPod/Replicate/R2/Bank Alfalah network call. No deployment.

### R9.2-FREEZE-MPGS-AND-REACTIVATE-LOCAL-APG (2026-08-06)

Added by the R9.2-FREEZE-MPGS-AND-REACTIVATE-LOCAL-APG packet. This
section is additive; every rule above it remains in force verbatim.

- **Owner decision, permanent until superseded: Mastercard MPGS is
  commercially frozen (`MPGS_STATUS = "MPGS_COMMERCIAL_HOLD"`,
  `p4c-bank-alfalah-mpgs-gateway.service.ts`). Bank Alfalah local APG is
  the intended payment route, subject to official bank documents not yet
  received.** MPGS source, tests, and evidence remain tracked and
  unchanged in logic — this is a commercial hold, not a deletion.
- **Permanent rule — no APG implementation (local-rail adapter, endpoint,
  credential, or callback) may be written until an official bank document
  exists in this repository confirming its technical contract.** The
  13-row requirements matrix in
  `docs/payments/R9_2_MPGS_FREEZE_AND_APG_REACTIVATION_PROTOCOL.md` marks
  every unknown `AWAITING_BANK_CONFIRMATION`; this must stay true until
  real evidence lands, exactly as the MPGS currency-authority rule (§27)
  already establishes for gateway facts generally.
- **Permanent rule — the retired Alfa APG v1.1 identifiers
  (`sandbox.bankalfalah.com`, `payments.bankalfalah.com`, `/HS/`
  endpoints, Store ID/Key1/Key2, `HS_`-prefixed fields, AES/CBC signing)
  stay retired even though "local APG" is now the intended route.** A
  future, officially-documented local APG integration must be a
  ground-up new module under new names — it must never assume the
  retired protocol's shape just because both involve Bank Alfalah.
  `p4c-bank-alfalah-legacy-apg-retired.test.ts` continues to enforce
  this unchanged.
- **Permanent rule — `npm run verify:payment-freeze` is the canonical
  zero-network payment-freeze gate.** Its 9 checks (MPGS fail-closed
  default, `MPGS_STATUS` marker present, checkout fails closed before any
  `PaymentAttempt` write, live-workflow manual-confirmation gating intact,
  legacy-APG guard intact, no un-evidenced APG implementation file,
  exactly one caller of `applyVerifiedPaymentEvidence`, historical
  evidence never deleted, checkout UI never reads payment state from a
  URL query parameter) must all continue to pass. Any future payment-
  related change must keep this validator green, not bypass or weaken it.
- **Permanent rule — the customer checkout UI shows exactly one truthful,
  fail-closed message while no payment provider is active: "Online
  payment is temporarily unavailable."** No bank-transfer, COD,
  JazzCash, or RAAST flow may be implied or implemented without an
  explicit, separately authorized task.
- No live Bank Alfalah request, deployment, or production change was made
  by this packet. No RunPod/Replicate/R2 network call.

### R9.2-MERGE-P148-P149-AND-APG-URL-FOUNDATION (2026-08-06)

Added by the R9.2-MERGE-P148-P149-AND-APG-URL-FOUNDATION packet. This
section is additive; every rule above it remains in force verbatim.

- PR #148 (`feat/r9.2-staging-release-preflight`, head
  `c3f28ad8c8d31ffcf520895c39ad38ad2db64235`) merged. **Merge SHA:
  `b0114aa3083a18eefd8075fbdb2e65a3582aa120`.** PR #149
  (`feat/r9.2-freeze-mpgs-and-reactivate-apg`, head `831ab77...` unchanged,
  updated onto new `main` and merged after conflict resolution). **Merge
  SHA: `c69afba7dab5d82ff4a5fb243f1c32231a69f695`.**
- **Permanent rule — when resolving a merge conflict between two additive
  documentation sections, keep both in full; never drop either packet's
  content to resolve a conflict.** Renumber sections sequentially and
  order them chronologically; re-run every affected packet's own
  validator afterward (not just the newest one) to catch any content-
  reordering side effect (this packet found and fixed exactly one: a
  retirement-guard test's context-window check broke when reordering
  shifted line offsets).
- **Permanent rule — the Bank Alfalah APG URL foundation
  (`GET /api/payments/bank-alfalah/return`,
  `POST /api/payments/bank-alfalah/ipn`, frontend `/payment/return`) is
  ingress plumbing, not an implementation, and must stay that way until
  the requirements matrix
  (`docs/payments/R9_2_APG_REQUIREMENTS_MATRIX.md`) is resolved by real
  bank documents.** Neither handler may ever call
  `applyVerifiedPaymentEvidence`, write a literal `"PAID"` status, or make
  an outbound network call of any kind (proven structurally and by
  `verify:apg-url-contract`). The IPN listener's `url`-parameter
  allowlist (`BANK_ALFALAH_APG_ALLOWED_CALLBACK_HOSTS`) must remain an
  **exact** hostname match via the WHATWG `URL` parser's own `.hostname`
  — never a prefix/suffix/substring match, and never a hardcoded host.
- **Permanent rule — `npm run verify:apg-url-contract` is the canonical
  zero-network APG-URL gate; `npm run verify:payment-freeze`'s
  APG-implementation-file allowlist may only be extended for genuine
  ingress-plumbing files that themselves stay covered by
  `verify:apg-url-contract`'s "no outbound network call" and "never
  marks PAID" checks — never to admit a real implementation early.**
- No live Bank Alfalah request, APG activation, production deployment, or
  payment success simulation was made anywhere in this packet.
  No RunPod/Replicate/R2 network call.

### R9.5-P4B7-WORKSPACE-RECONCILIATION: canonical workspace protocol (2026-08-09)

Added by the R9.5-P4B7-REAL-LOCAL-MULTIPROCESS-E2E workspace-reconciliation
step. This section is additive; every rule above it remains in force
verbatim.

- **Permanent rule — `D:\AI Product Photo Studio on WhatsApp` is the ONLY
  active project workspace.** All agents and sessions must open, branch,
  build, and test from this path.
- **Permanent rule — never create or use `D:\Temp\r95-product-ready-
  integration` again.** It existed only as a linked `git worktree` of this
  same repository (same `.git`, same `origin`, same branches — not a
  separate clone or a fork with independent history). It has been removed
  from `git worktree list`; a residual on-disk folder may remain (Windows
  file locks prevented full deletion) but it is no longer a git worktree
  and carries no authority. Do not resurrect it or treat its presence on
  disk as meaningful.
- Branch `setup/project-automation` is retired from active use. Its
  history is fully pushed to `origin/setup/project-automation`
  (`156ba266b06406ba0babd15335bde700f352d858`) and its pre-reconciliation
  uncommitted working tree was additionally snapshotted to local branch
  `backup/setup-project-automation-dirty-20260809-152222`
  (`03835d369063b7d8dcff891e23b3f1c354504bb1`) before this workspace was
  switched — no commit or uncommitted work was lost. Do not check this
  branch back out as the active branch; if any of its uncommitted content
  is needed going forward, cherry-pick or diff it from the backup branch
  explicitly.
- The active branch for R9.5-P4B7 work is `fix/r9.5-restore-known-good-ui`,
  verified at HEAD `6395f2b981d8a2906c7cd40c215e44b21b715c0c` immediately
  after reconciliation, clean working tree.
- This repository carries dozens of other agent/task worktrees under
  `.claude/worktrees/`, `.kilo/worktrees/`, and various `D:/Temp/*`
  directories from prior sessions. This rule does not retire or clean
  those up — only `D:\Temp\r95-product-ready-integration` is superseded by
  this entry — and no other worktree may be assumed authoritative for R9.5
  work without an explicit, separately authorized task.

### R9.5-P4B7B-PKR-LOCAL-E2E-READY (2026-08-09)

Added by the R9.5-P4B7B-FINISH-PKR-BROWSER-E2E-AND-PROCESS-SPAWN-FIX packet.
This section is additive; every rule above it remains in force verbatim.

- **`PKR_LOCAL_E2E_READY` achieved.** `npm run test:e2e:commerce-local`
  passed clean end-to-end: real disposable Postgres, real API, real mock
  P4B worker, real Vite web, and a real (non-`page.route`-mocked) Playwright
  browser drove Home → upload → Preview → Digital tier select → Review →
  Complete TEST Payment → real P4A → real mock P4B worker → real P3A →
  `SUCCEEDED`/`VALIDATED` → download link, with exactly one row each of
  FixedOrder/PaymentAttempt/RestorationEntitlement/RestorationMaster/
  ReplicateExecution and zero Replicate/RunPod/Bank/production-host calls.
  Full detail in `docs/frontend/THANNOW_PRODUCTION_UI_BASELINE.md`'s "Real
  local multi-process commerce harness" section — read it before touching
  this harness, the mock P3A/P4B guards, the test-checkout seam, or
  `MockStorageProvider`'s disk-backed mode.
- **Permanent rule — `ReplicateExecutionWorker`'s provider guard accepts
  exactly `"replicate"` or `"mock"`, never anything else.** Production
  topology is unaffected because `p4b-worker-runner-main.ts` (the only
  production caller) still refuses to start unless
  `RESTORATION_PROVIDER === "replicate"`; only the separate, triple-guarded
  `p4b-worker-runner-mock-local.ts` ever supplies `"mock"`. Do not widen
  this guard further, and do not remove the outer runner-level guards that
  make the `"mock"` allowance inert in production.
  `p3a-replicate-execution-worker.test.ts` proves both the refusal (any
  other selection) and the `"mock"` authorization.
- **Permanent rule — the test-only checkout seam
  (`customer-checkout-test.service.ts`/`customer-checkout-test.controller.ts`,
  routes `/fixed-orders/:orderNo/test-checkout(/complete)`,
  `/e2e/test-mode`) may only ever be mounted when `NODE_ENV != "production"
  && COMMERCE_E2E_TEST_MODE === "true"`, checked at server-startup route
  registration (`restoration.routes.ts`), not merely inside each handler.**
  It must never read or set `bankAlfalahMpgs.enabled` and must never call
  Bank Alfalah. The customer-facing "Complete TEST Payment" button
  (`FixedOrderReviewPage.tsx`) must only ever appear after a live server
  response from `GET /api/e2e/test-mode` — never inferred from
  `import.meta.env`/any client-side value — and must never alter the
  production "Pay & Restore Photo" → live Bank Alfalah redirect path.

### R9.5-P4B9-CANONICAL-PAKISTAN-PAID-FLOW (2026-08-09)

This section is additive; every rule above it remains in force verbatim.

- **Permanent rule - one customer upload authority.** All restoration,
  upscale, print, pricing, header, footer, floating, and re-upload customer
  starts plus `/restore/new` and `/restore-mvp/new` must resolve to the shared
  `Upload Your Photo` modal and one `POST /api/restoration-drafts`. No active
  customer route may render `RestoreNewPage` or call the legacy restoration/
  order upload pipelines.
- **Permanent rule - 100% server-verified advance payment before paid
  processing.** No browser query, button, local storage value, unpaid/pending/
  failed/cancelled attempt, or direct process request may create or claim a
  `ReplicateExecution`. Only verified payment evidence matching the immutable
  server-owned order amount and currency may run P4A and enqueue execution.
- **Permanent rule - reads never start work.** Preview, Review, processing
  status, refresh, download, and polling GETs are read-only. The canonical
  processing status source is
  `GET /api/fixed-orders/:orderNo/restoration-status`.
- **Permanent rule - print reuses the restoration master.** A paid Pakistan
  Print+Digital order performs one restoration only. After its master is
  `VALIDATED`, print preparation creates at most one `PrintEntitlement` and
  one pending `FulfilmentOrder`. Until a real partner is assigned it reports
  `PRINT_PARTNER_ASSIGNMENT_REQUIRED`; it never fabricates a partner,
  tracking number, shipment, dispatch, or delivery.
- Full evidence and counts are in
  `docs/frontend/THANNOW_PRODUCTION_UI_BASELINE.md`, section "Canonical
  Pakistan paid restoration flow". Protected scope remains: no production
  DB/deploy/push, no real payment, no test-time Replicate/RunPod/Bank call.

### R9.5-P4B10-HISTORICAL-ASSET-RETENTION (2026-08-09)

This section is additive; every rule above it remains in force verbatim.

- `old images/` is historical/reference evidence and must not be deleted
  without explicit owner authorization. It must not be wired into active
  customer UI or runtime processing merely because it is restored.
- `price book/prices.xlsx` and local `prices.xlsx`/`prices(1).xlsx` workbook
  evidence remain ignored and historical-only. Archived PriceBook material
  never becomes runtime authority.
- `PB-2026-08-09-TRIAL-V3` remains the sole active customer PriceBook. V1/V2
  catalogs and obsolete prices must remain inactive. Deleting either
  historical asset folder requires explicit owner authorization.

### R9.5-P4B11-PRODUCTION-PARITY-GATE (2026-08-09)

This section is additive; every rule above it remains in force verbatim.

- Local Pakistan commerce acceptance is not production acceptance. Before any
  release, compare the live Cloudflare bundle and API health build identity to
  the candidate commit and prove the canonical upload, V3 catalog, FixedOrder
  status, payment gate, and print boundary are deployed together.
- The P4B11 candidate is
  `cee6ea250ac71a865a1cf837215ac5a6bfb5c7b6`. The live evidence recorded on
  2026-08-09 is frontend asset `index-D6CznrWT.js` and API
  `BUILD_SHA=dd8924a78f54487ab9336806b3906b4c585a5860`; neither is accepted as
  the candidate source identity.
- No deployment, production database mutation, real payment, real Replicate
  call, or RunPod action is authorized by this parity packet. A future release
  must use the exact candidate commit and retain platform-level rollback
  revisions for both Cloudflare Pages and Northflank before activation.

### R9.5-P5A-PAKISTAN-LAUNCH-GATES (2026-08-09)

This section is additive; every rule above it remains in force verbatim.

- Bank Alfalah remains `BANK_ACTION_REQUIRED` until the owner supplies bank-
  confirmed Merchant ID/region/host, REST API Password, Hosted Checkout/API
  enablement, API version/path, and sanitized success/correlation evidence.
  Never guess credentials or endpoint shape, and never run a real charge.
- Print code may create only one pending fulfilment record after verified PAID,
  validated RestorationMaster, address, and authoritative print snapshot. No
  partner, tracking, shipment, dispatch, or delivery may be invented. Without
  supplied partner data, operations are `PARTNER_DATA_REQUIRED` and the safe
  code state is `READY_FOR_PARTNER_DATA`.
- Production release order is permanently API first, API smoke, frontend
  second, live customer smoke. The exact candidate is
  `13d792a4b49248b0e70d47ba80ae11516237850b6`; retain platform rollback
  revisions before activation. No P5A action authorizes deployment, push,
  production DB mutation, real payment, Replicate, or RunPod.

### R9.5-P5B-RELEASE-LINEAGE-AND-MIGRATION-GATE (2026-08-09)

This section is additive; every rule above it remains in force verbatim.

- The safe release branch is `release/r9.5-pakistan`, based on
  `origin/main=dd8924a78f54487ab9336806b3906b4c585a5860`, integrating candidate
  `653d240253a723b81748b912d71490d2d160b469` with `git merge --no-ff`.
  Both ancestor proofs must pass before any release-ref push or deployment.
- The only migration delta versus current `origin/main` is the two additive
  R9.5 migrations: four enum values and `PrintDeliveryAddress`. Inspect SQL
  before every production apply. No destructive or backfill migration is
  authorized in this release.
- `Dockerfile` has `SKIP_MIGRATIONS=true`; the current Northflank workflow has
  no migration step. Therefore production migration status/apply requires an
  explicit owner-approved operator mechanism and credential before API deploy.
  Never infer, guess, or mutate a managed database from a local shell.
- Required deployment sequence is permanently migration preflight/apply,
  API-first smoke, frontend-second smoke, and immediate platform rollback on
  any failed gate. No main force push, rebase, reset, RunPod action, real
  payment, or production DB mutation is implied by this readiness packet.

### R9.5-P5C-GUARDED-PRODUCTION-MIGRATIONS (2026-08-10)

This section is additive; every rule above it remains in force verbatim.

- The only approved repository migration commands are
  `npm run db:migrate:status:production` (read-only) and
  `npm run db:migrate:production` (apply). Both require a process-only,
  valid PostgreSQL `DATABASE_URL`; apply additionally requires
  `ALLOW_PRODUCTION_MIGRATIONS=true`.
- The wrapper runs `migrate status` first, permits only Prisma's exact
  pending-migrations exit state before apply, then runs `migrate deploy` and a
  final status. It never runs `migrate dev`, `db push`, reset/drop/schema-force,
  or migrations during API startup. Credentials are redacted from output.
- Before production use, status must show only the two reviewed additive R9.5
  migrations pending: `20260808000000_r95_p4b_pricebook_v2_tiers` and
  `20260809000000_r95_p4b4_print_delivery_address`. Unexpected drift, failed
  migrations, extra pending migrations, or unavailable approved credentials is
  a true stop.
- Fresh disposable proof passed: status -> authorized deploy -> clean status
  -> second authorized deploy with no pending migrations. Production migration
  remains `AWAITING_CREDENTIAL_AND_AUTHORIZATION`; this packet does not
  authorize database access or deployment.

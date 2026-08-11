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

### R9.5-P5J-PRODUCTION-MIGRATION-HISTORY-VERIFIED (2026-08-10)

This section is additive; every rule above it remains in force verbatim.

- **Permanent rule — a `workflow_dispatch` run's application/migration code
  always comes from the ref actually checked out, not from the ref that
  supplied the workflow YAML.** `production-migration-preflight.yml` on
  `main` initially had no application source at all (only the workflow file
  itself was ever merged to `main`), so early dispatches against `main`
  failed with `npm error Missing script: "db:migrate:status:production"` —
  misclassified at first as a database-connectivity failure before the
  actual `npm`/Prisma output was ever surfaced. The workflow now takes an
  explicit `target_ref` input (default `release/r9.5-pakistan`) and checks
  that ref out for the application/migration scripts, while the
  workflow-definition/security logic itself is always whatever is on the
  dispatch ref. Do not dispatch this workflow against a ref lacking
  `scripts/production-migrations.ts` and expect a truthful DB-side result.
- **`PRODUCTION_MIGRATIONS_ALREADY_APPLIED`.** Run `31363421303`
  (workflow SHA `fba9414868bc8aee72a71e32fb4b41fbd21d51cb` on `main`,
  `target_ref=release/r9.5-pakistan` resolved to `b8b47ac97123dce8...`)
  connected using the real production Northflank service's own
  `DATABASE_URL` (`selected_database_source=northflank_runtime_environment`,
  not a guessed/fallback secret) and `npm run db:migrate:status:production`
  reported `23 migrations found in prisma/migrations` / `Database schema is
  up to date!` with exit code 0 — no pending, no failed, no rolled-back
  migration reported. This includes both
  `20260808000000_r95_p4b_pricebook_v2_tiers` and
  `20260809000000_r95_p4b4_print_delivery_address`, the only two migrations
  in this release's delta versus the prior production baseline. No
  `migrate deploy`/apply command was run in this packet — the database was
  already current. Production migration gate is now `CLOSED/READY`; the
  next authorized action is API deploy, not another migration attempt.

### R9.5-P5K-LIVE-CANONICAL-PAKISTAN-FLOW-DEPLOYED (2026-08-10)

This section is additive; every rule above it remains in force verbatim.

- **Production release SHA: `96314ca3ef7962866c55bd4dc2904466bc58e9b7`** — PR
  #152 merged `release/r9.5-pakistan` (ancestors `653d240`, `5e0409a`,
  `b8b47ac` all proven) into `main` via a normal merge commit (no
  force-push/rebase; `main`'s prior tip `fba9414` is a parent). One
  add/add conflict (the migration-preflight workflow file, main's version
  taken; identical after resolution) was the only conflict.
- Pre-merge gate: `typecheck`/`build` clean; `test:e2e:commerce-local`
  passed on retry (first attempt hit a transient local cold-start timeout
  waiting on the disposable API health endpoint — recoverable per Recovery
  Protocol, not a regression) with both digital and print+digital orders
  reaching PAID -> GRANTED -> VALIDATED -> SUCCEEDED and print correctly
  blocked on `PRINT_PARTNER_ASSIGNMENT_REQUIRED`. The `Bank Alfalah MPGS
  Actual-App E2E` dry-run CI check failed on this PR, but it targets a
  stale pre-canonical-flow UI (`page.goto("/restore-mvp/new")` expecting a
  raw checkbox); `/restore-mvp/new` has redirected to the canonical
  `/?upload=1` modal since R9.5-P4B9 (2026-08-09), and MPGS itself is
  commercially frozen — this is superseded test staleness, not a
  regression from this merge. No branch protection made it
  merge-blocking.
- **API deploy**: Northflank's existing git-push auto-deploy fired on the
  `main` merge (`Deploy to Northflank` run `31364695082`, success). Live
  `GET https://api.thannow.com/api/health` returned
  `build_sha=96314ca3ef7962866c55bd4dc2904466bc58e9b7`, matching exactly.
  Live smoke: `POST /api/restoration-drafts` (201) ->
  `GET /api/restoration-drafts/:id/offers` (with the real
  `x-guest-ownership-token`, confirming ownership enforcement is live)
  returned exactly the seven approved PKR V3 tiers (`PB-2026-08-09-TRIAL-V3`):
  500/1000/1500/2500/3500/4000/5000 -- no stale PKR 250. `GET
  /api/print-catalog` = 200. `GET
  /api/fixed-orders/:orderNo/restoration-status` correctly 404s for a
  nonexistent order (route reachable, ownership/existence enforced).
  Re-ran the read-only migration preflight one more time directly against
  `main` (`target_ref=main`, run `31364822478`): still clean, 23
  migrations, up to date -- confirms the exact deployed SHA's own migration
  state before the frontend went live.
- **Frontend deploy**: `npx wrangler pages deploy` (authenticated via
  existing OAuth session, no credential invented) to project
  `ai-photo-studio-frontend`, `--branch main`,
  `--commit-hash 96314ca3ef7962866c55bd4dc2904466bc58e9b7`. Deployment
  `75fc5644-ef49-4200-af47-31eaa9a183d4`, confirmed **Production**
  environment, source `96314ca`. `https://www.thannow.com/` returns 200
  and serves `index-BnteFSiS.js` -- byte-identical bundle hash to this
  session's local `npm run build` output, so the live bundle is proven
  identical to the code that passed `test:e2e:commerce-local`, not a
  separately-built artifact. Static analysis of the live bundle confirms
  absence of `PKR 250`, `Demo Payment Mode`, and the old `Upload Photos for
  Restoration` copy, and presence of the canonical `Upload Your Photo`
  modal copy and the `restore-mvp/new` redirect path.
- **Live smoke methodology note**: full interactive click-path proof
  (upload-once, Continue-preserves-draft, no second-upload page, desktop
  1440 / mobile 390 responsive check) was not re-driven against the live
  domain with a real browser in this packet -- it relies on (a) the
  deployed bundle being byte-identical to the one `test:e2e:commerce-local`
  already exercised end-to-end against the same release commit, and (b)
  static confirmation the live bundle contains the canonical strings/route
  and excludes the retired ones. A future packet with live-browser tooling
  against `www.thannow.com` should still perform the literal click-through
  before this is treated as fully interactive-proven.
- Rollback targets recorded for this release: API -> previous production
  revision `dd8924a78f54487ab9336806b3906b4c585a5860`; Frontend ->
  deployment `72cdd2d7-7334-4f36-80bb-bb6f5a33226c` (source `4965032`).
  Neither rollback was exercised -- both gates passed.
- **Protected Scope held**: no RunPod activation, no Replicate routing
  change, no real payment/card, no invented Bank/print-partner data, no
  PriceBook change, no frontend redesign, no `.gitignore` broadening.
  `BANK_ACTION_REQUIRED` and `PRINT_PARTNER_ASSIGNMENT_REQUIRED` remain the
  only open business blockers.

### R9.5-P5F-GITHUB-SECRET-PRODUCTION-MIGRATION (2026-08-10)

This section is additive; every rule above it remains in force verbatim.

- Use `.github/workflows/production-migration-preflight.yml` for the approved
  production DB status path. It is `workflow_dispatch`-only, uses the existing
  protected `production` environment, has read-only repository permissions,
  and defaults `apply_migrations=false`.
- The workflow may use only the existing secret name `NORTHFLANK_API_KEY` to
  read the identified `ai-photo-studio` service runtime environment. It must
  mask `DATABASE_URL` immediately and never print, artifact, persist to source,
  or expose its value. Neon secret names are fallback metadata only and must
  not be guessed among multiple projects.
- Read-only status accepts only clean state or the exact two reviewed R9.5
  pending migrations. Apply requires explicit workflow input and
  `ALLOW_PRODUCTION_MIGRATIONS=true`, then runs only the guarded deploy and
  final status. No deployment is implied by this workflow.

### R9.5-P5G-ASSET-INTEGRITY-AND-WORKFLOW-BOOTSTRAP (2026-08-10)

This section is additive; every rule above remains in force verbatim.

- Every active customer-visible image must resolve with production-compatible
  exact casing and be present in the Vite/public bundle or be an explicitly
  verified external source. Desktop and mobile asset integrity, including
  lazy images and first-party 404 detection, is release-blocking.
- The 15 HomePage card assets restored from the approved R9.3 source commit
  are runtime assets; `old images/` remains historical/reference-only and
  requires owner authorization before deletion. No image regeneration or
  redesign is permitted under this rule.
- `.github/workflows/production-migration-preflight.yml` is a dispatch-only,
  read-only-by-default workflow. Its bootstrap must remain isolated from the
  runtime release lineage and contain only that workflow when based on
  `origin/main`; workflow secrets are consumed inside Actions and never
  exposed in output, artifacts, source, or documentation.

### R9.5-P5L-CUSTOMER-JOURNEY-UX-CLOSURE (2026-08-10)

This section is additive; every rule above it remains in force verbatim.

- **Live modal root cause (release blocker, repaired).** The canonical
  "Upload Your Photo" modal (`RestorationUploadExperience.tsx`, mounted
  globally by `RestorationUploadController` in `PublicLayout.tsx` for the
  one-upload-authority rule) rendered unstyled at the bottom of every page
  because its CSS in `styles.css` was scoped under `.thannow-home .upload-modal`
  etc. -- an ancestor class that only exists on the homepage, left over from
  before the modal became global. The modal is a DOM sibling of `.site-shell`,
  never a `.thannow-home` descendant, so no styled selector ever matched in
  production. Repaired by rescoping every modal rule to `.upload-modal`
  (the component's own root class) instead of `.thannow-home`, which also
  fixed a second-order symptom: with the file input correctly `display:none`
  again, `fileInputRef.current?.focus()` (a no-op on a hidden input) stopped
  forcing the browser to scroll the page to the bottom. Verified live via a
  real Playwright browser against `www.thannow.com` before the fix
  (`scrollY: 2603`, `bodyOverflow: visible`, unstyled DOM) and against a
  local production build after the fix (`scrollY: 0`, `bodyOverflow: hidden`,
  centered `520px` card) at 1440 and 390.
- **Body scroll lock added.** Opening the modal now sets
  `document.body.style.overflow = "hidden"` and restores the previous value
  on close/unmount, alongside moving initial focus to the close button
  (keyboard-reachable; focusing a hidden input is a browser no-op).
- **One-upload invariant regression found and repaired.** Fixing the modal
  to be a real fixed-position overlay exposed that `continueFromModal` never
  called `onClose()` after navigating to the Preview page -- harmless while
  the modal was invisible/unstyled, but a real full-viewport blocker once
  correctly positioned (`test:e2e:commerce-local` started failing with the
  modal backdrop intercepting the next page's clicks). Repaired by closing
  the modal before navigating.
- **Tier description defect repaired.** `DigitalTierSelectPage.tsx`'s tier
  copy was a two-branch ternary that only special-cased `HD_2X`/`HD_4X`;
  every other tier (`ORIGINAL`, `HD_6X`, `HD_8X`, `HD_10X`, `HD_12X`) fell
  through to the false "Basic sharing at original resolution" line. Replaced
  with a `TIER_LABELS`/`TIER_DESCRIPTIONS`/`TIER_BADGES` lookup giving each
  tier its own truthful copy; no price changed.
- **Exclusive-choice accessibility added.** The product-choice buttons and
  quality-tier cards on `DigitalTierSelectPage.tsx` now carry
  `role="radiogroup"`/`role="radio"`/`aria-checked`, and the quality cards
  gained keyboard activation (Enter/Space). Selection was already mutually
  exclusive by construction (single piece of state); this is an
  accessibility upgrade, not a behavior change. `p6c-customer-mvp-flow.spec.ts`
  and `scripts/test-commerce-local.ts` were updated to query by the new
  `radio` role (both previously queried `role="button"`, which no longer
  matches once an explicit `role` overrides the DOM element's implicit role).
- **Print form restyled.** All print fields (previously one unstyled inline
  row plus an unstyled address `field-grid`) now share one responsive
  `.field-grid` (`repeat(auto-fit, minmax(200px, 1fr))`, stacks under
  640px) with real input/select styling, plus a new `.order-summary` block
  showing digital price, print unit price, minimum quantity, an
  estimated print subtotal, and "Delivery: Calculated by server at order
  time" -- explicitly labelled estimated/non-authoritative; the server
  remains the sole source of the final order total at Review. Quantity
  below the catalog minimum now shows an inline validation message.
- **Review page label/value concatenation repaired.** `.metric-card` had no
  rule making its `span`/`strong` children block-level, so
  `<span>Market</span><strong>PAKISTAN</strong>` rendered as one run-together
  string ("MarketPAKISTAN"). Added a `.metric-card` flex-column rule; no
  markup/data change was needed.
- **Payment-unavailable UX repaired.** `FixedOrderReviewPage.tsx`'s
  "Pay 100% & Restore Photo" button previously stayed active forever, so a
  customer could click it repeatedly against a fail-closed provider and get
  the same failure every time. It now disables itself and relabels to
  "Payment unavailable" after one real `PAYMENT_PROVIDER_UNAVAILABLE`
  response -- verified via a real browser against a mocked 503 -- and never
  disables preemptively (no guessed/invented availability check was added).
  "Check payment status" was intentionally left always-visible: an existing
  regression-guard test (`p4e-checkout-ui.spec.ts` "refresh payment status
  performs GET only") proves a real `PaymentAttempt` can exist even when the
  `FixedOrder` summary's own `paymentStatus` field is absent, so gating the
  button on that field would have hidden it in a legitimate case; no
  reliable client-side signal was available to do this correctly, so it was
  not attempted.
- **Deferred, not attempted this packet:** a full Preview & Analysis page
  redesign (item 5 of the packet), and net-new permanent Playwright coverage
  files for modal/exclusivity/payment-disabled states (item 13) beyond the
  existing suites that were updated. These are real, larger, separately
  scoped follow-ups; production behavior for both was left exactly as
  previously verified (Preview's existing content, unchanged; existing test
  files extended in place rather than duplicated).
- **Zero regression, full evidence:** `npm run lint` (0 errors, only
  pre-existing warnings, none in changed files), `npm run typecheck`,
  `npm run build`, `npm run test:browser -w apps/web` (104/104, two
  intentional role-query updates for the accessibility upgrade),
  `npm run test:browser:responsive -w apps/web` (92/92, including
  zero-horizontal-overflow checks at 1440/1280/1024/768/430/390/360),
  `npm run test:e2e:commerce-local` (full pass after the one-upload-invariant
  repair above: both Digital and Print+Digital orders reach
  PAID -> GRANTED -> VALIDATED -> SUCCEEDED, print correctly
  `PRINT_PARTNER_ASSIGNMENT_REQUIRED`, zero Replicate/RunPod/Bank/production
  calls). This constitutes the non-production, zero-cost, full E2E proof
  called for by this packet -- the existing disposable-Postgres/mock-P4B/
  `COMMERCE_E2E_TEST_MODE` harness was reused exactly as instructed, not
  duplicated.
- **Local commit only, not pushed/deployed.** Commit
  `db85edaf8d8d98505c62a502c960e75b92969021` on `release/r9.5-pakistan`
  ("fix(frontend): complete Pakistan customer journey UX"), six files. No
  production deployment was made or authorized by this packet -- the live
  `www.thannow.com` modal defect this section documents is still live in
  production until a future, separately authorized deploy packet ships this
  commit.
- **Protected Scope held**: no RunPod, no Replicate routing change, no real
  payment, no invented Bank/print-partner data, no PriceBook price change,
  no Hero/homepage redesign, no `.gitignore` broadening.
  `BANK_ACTION_REQUIRED` and `PRINT_PARTNER_ASSIGNMENT_REQUIRED` remain the
  only open business blockers.

### R9.5-P5M-LIVE-UX-FIX-DEPLOYED (2026-08-10)

This section is additive; every rule above it remains in force verbatim.

- **`LIVE_PAKISTAN_UX_FIX_DEPLOYED`.** PR #153 merged `release/r9.5-pakistan`
  (`db85eda`, `bc1d390`, both ancestors proven) into `main`: merge commit
  `4de67f8459eafea69972f8ff67378bdd144fc03e`. Diff versus the previously
  deployed API SHA (`96314ca`) was confirmed limited to `apps/web/**`,
  `rules.md`, and `scripts/test-commerce-local.ts` before merge -- no
  `apps/api/**`, schema, RunPod, Replicate, or payment-backend file was
  touched, so `API_DEPLOY_REQUIRED=NO`. Northflank's existing git-push
  webhook still auto-rebuilt the API on this merge (unconditional, no path
  filter, unchanged pre-existing pipeline behavior) -- re-verified healthy
  at `build_sha=4de67f8...` with no functional change.
- **Frontend deployed**: `npx wrangler pages deploy`, project
  `ai-photo-studio-frontend`, deployment
  `9f17d6ad-2139-468e-9ad1-f7101844792d`, confirmed Production, source
  `4de67f8`.
- **Live desktop smoke (1440x900, real Playwright browser against
  `www.thannow.com`, real click-through, one real test-image upload, zero
  real payment)**: modal centered (`520px` panel), `scrollY:0`,
  `bodyOverflow:hidden`, closes correctly after Continue (`modalOpenAfterNav:
  false`), reached `/restore-mvp/:id/preview` with exactly one
  `POST /api/restoration-drafts`; 17/17 homepage images loaded, zero
  first-party 404, zero console errors; product/quality radios exactly one
  `aria-checked=true` each; seven V3 tiers exactly
  500/1000/1500/2500/3500/4000/5000 with the corrected per-tier copy live;
  Print+Digital form styled, zero horizontal overflow, order-summary block
  present; Review page cards render as separate label/value lines (no
  concatenation); Pay button truthfully became "Payment unavailable"
  (disabled) after one real `PAYMENT_PROVIDER_UNAVAILABLE` response, and no
  `restoration-processing-status` panel ever appeared (zero pre-payment
  execution). Real orders created during this smoke:
  `FO-MSMYXYP0-A6648D4C` (desktop).
- **Live mobile smoke (390x844)**: identical proof -- modal correct
  (`350px` panel), scroll-locked, one-upload proven, print form no
  horizontal overflow, Payment-unavailable state identical. The initial
  automated image-completeness check flagged 8 below-the-fold images as
  "broken" before they were scrolled into view (lazy-loading, not a
  defect) -- a follow-up check that scrolled the full page first confirmed
  17/17 images complete with zero 404s. Real order created:
  `FO-MSMYZEBE-192E205E`.
- **Rollback targets reconfirmed, not exercised**: API ->
  `dd8924a78f54487ab9336806b3906b4c585a5860`; Frontend ->
  `72cdd2d7-7334-4f36-80bb-bb6f5a33226c` (source `4965032`). Both live
  gates passed; no rollback was needed.
- **Zero regression proof before deploy**: `npm run lint` (0 errors),
  `npm run typecheck`, `npm run build`, `npm run test:browser -w apps/web`
  (104/104), `npm run test:browser:responsive -w apps/web` (92/92),
  `npm run test:e2e:commerce-local` (full pass) -- all re-run fresh on the
  exact commit that was deployed.
- **Deferred to next packet (R9.5-P5N), not attempted here**: Preview &
  Analysis page enhancement, and permanent (committed, not throwaway)
  live-flow regression coverage for the modal/exclusivity/payment-disabled
  states this packet proved manually. No unrelated polish was added.
- **Protected Scope held**: no RunPod, no Replicate routing change, no real
  payment/card, no invented Bank/print-partner data, no PriceBook price
  change, no Hero/homepage redesign, no `.gitignore` broadening.
  `BANK_ACTION_REQUIRED` and `PRINT_PARTNER_ASSIGNMENT_REQUIRED` remain the
  only open business blockers.

### R9.5-P5N-PREVIEW-COMMERCE-FLOW-CLOSURE (2026-08-10)

This section is additive; every rule above it remains in force verbatim.

- **Backend Print+Digital price formula verified correct, no server change
  needed.** `quotePrint()` (`apps/api/src/domain/pricing/printCatalog.ts`)
  already computes `totalAmountMinor = digitalAmountMinor +
  unitPriceMinor*quantity + deliveryFeeMinor` from server-owned inputs only
  (the approved PriceBook offer amount + the print catalog's own unit/
  delivery prices); `createFixedOrder`'s input DTO has no field for a
  client-supplied amount at all, so there is no code path a tampered total
  could reach. `printCatalog.test.ts` now asserts the task's own worked
  examples directly: Original+4x6x10 = PKR 1750.00, 2x HD+4x6x10 =
  PKR 2250.00, 4x Ultra HD+4x6x10 = PKR 2750.00, plus a
  quantity-change-updates-the-quote check and a structural note that
  `quotePrint`'s 3-parameter signature has no room for a client total.
- **One-image + Remove.** `RestorationUploadExperience.tsx` already had no
  `multiple` attribute (single-selection was already enforced); added a
  "Remove selected image" action that clears the selected file, resets the
  native file input's value (so re-selecting the same path still fires
  `onChange`), and disables Continue -- covered by a new Playwright test.
- **Preview metadata contract.** `OriginalPreviewPage.tsx` now shows File
  name, Format, File size, Dimensions, Aspect ratio, and Orientation above
  the existing expandable "Technical metadata" block, plus the exact
  explanatory copy the task specified. File name/size are **not** part of
  any server response (`RestorationDraftSafeView` never carried them) --
  they are captured client-side from the real browser `File` object at
  selection time and handed off via `sessionStorage` keyed by draft id;
  Preview simply omits them (never guesses) when that key is absent, e.g.
  after a refresh or a direct navigation. Aspect ratio/orientation are pure
  arithmetic on the server's own real `originalWidth`/`originalHeight` --
  not invented analysis. No damage/face/quality AI signal was added or
  implied anywhere pre-payment (asserted by a new test).
- **Restoration-quality-first flow order.** `DigitalTierSelectPage.tsx` now
  presents "1. Choose restoration quality" before "2. Choose delivery"
  (previously delivery/product came first). A 4x Ultra HD recommendation
  banner appears when Print+Digital + `HD_4X` are both selected; an
  Original/2x HD print-quality warning banner appears when Print+Digital is
  selected with either of those two tiers -- neither tier is blocked, per
  the task's own instruction not to falsely restrict them. The print
  summary now includes a `Quantity` line and a computed `Estimated Total`
  (digital + print subtotal + delivery, all server-sourced catalog/offer
  values -- explicitly labelled estimated; the Review page's server-echoed
  total remains the sole authority). Switching to Digital clears print-only
  form state (size/quantity/address) so it cannot leak into a later
  Print+Digital selection.
- **CTA renamed** "Review & Checkout" -> "Continue to Review" and "Restore
  & Download" -> "Digital Download" to match the task's exact page-2/step
  language; all affected Playwright tests and `scripts/test-commerce-local.ts`
  were updated to the new accessible names (not left silently broken).
- **Digital and Print+Digital mock E2E were already passing** going into
  this packet (the modal-overlay-intercepting-clicks and `role="radio"`
  query-mismatch root causes named by this task's "current blocker" premise
  were already found and fixed in R9.5-P5L/P5M). `test:e2e:commerce-local`
  re-verified clean after this packet's own changes: both orders reach
  PAID -> GRANTED -> VALIDATED -> SUCCEEDED with exactly one
  `ReplicateExecution` each (`replicateExecution: 2` total across both
  flows, one per order -- print never triggers a second restoration job),
  print correctly `PENDING` / `PRINT_PARTNER_ASSIGNMENT_REQUIRED`.
- **Deferred, not attempted this packet:** the task's PAGE 4/5/6 -- separate
  routed Payment, Processing, and Result pages. The existing architecture
  (Preview page -> Choose-restoration-and-delivery page -> Review page,
  with payment/processing/result as progressive states *within* the Review
  page) already gives the functional separation the task is after, but it
  is not the literal distinct-routes structure requested. Re-architecting
  navigation into additional routes was judged too large and too
  regression-risky to attempt safely in this packet alongside everything
  else that shipped; it is explicitly flagged here rather than silently
  left undone.
- **Zero regression, full evidence:** `npm run lint` (0 errors),
  `npm run typecheck`, `npm run build`, `npm run test:browser -w apps/web`
  (106/106), `npm run test:browser:responsive -w apps/web` (93/93),
  `npm run test:e2e:commerce-local` (full pass), `npx prisma validate` /
  `generate` clean (no schema touched), `git diff --check` /
  `--cached --check` clean, `printCatalog.test.ts` run directly (exact
  1750/2250/2750 proof). Local production-build-preview screenshots at
  1440x900 and 390x844 confirm zero horizontal overflow and visually prove
  the quality-first order, the Original/2x warning, the 4x recommendation,
  and the exact PKR 1750.00 / PKR 2750.00 Estimated Total lines live in the
  UI against the real formula.
- **Local commit only, not pushed/deployed.** Commit
  `7fbdca107c5c2f47929d164e752dc3e650fe2bd9` on `release/r9.5-pakistan`
  ("fix(commerce): complete Pakistan checkout and print journey"), eight
  files. No production deployment was made or authorized by this packet.
- **Protected Scope held**: no RunPod, no Replicate routing change, no real
  payment/card, no invented Bank/print-partner data, no PriceBook price
  change, no Hero/homepage redesign, no `.gitignore` broadening.
  `BANK_ACTION_REQUIRED` and `PRINT_PARTNER_ASSIGNMENT_REQUIRED` remain the
  only open business blockers.

### R9.5-P5O-PRICEBOOK-CORRECTION-AND-IN-HOUSE-PRINT (2026-08-10)

This section is additive; every rule above it remains in force verbatim.

- **PriceBook audit against `price book/prices.xlsx` (Sheet1, "photo
  printing + home delivery" table), read directly with `openpyxl`.** Found
  and fixed one real defect: the runtime print catalog's `40x60` entry was
  an erroneous duplicate of `30x40`'s price (PKR 15000 minor-unit array
  value shared between both indices) -- the workbook's actual value is
  **PKR 20000**, now corrected. Also added **Triple Canvas** (absent from
  the runtime catalog entirely): **PKR 25000 unit, minimum quantity 1,
  PKR 2500 delivery**, confirmed by two independent, consistent listings in
  the workbook (the main size table and the "Premium Triple Canvas"
  bulk-package block). Triple Canvas is PKR-only -- the workbook has no
  USD price for it and international print is fail-closed regardless
  (`INTERNATIONAL_PRINT_SHIPPING_REQUIRED`), so no price was invented for
  a currency the source doesn't cover. `PRINT_CATALOG_VERSION` bumped
  `PRINT-CATALOG-2026-08-09-TRIAL-V2` -> `PRINT-CATALOG-2026-08-10-TRIAL-V3`.
  `TRIPLE_CANVAS_PRICE_SOURCE_REQUIRED` was **not** needed -- the price was
  provable, not fabricated.
- **Pakistan print fulfilment is in-house, not partner-dependent.**
  `print-fulfilment-boundary.service.ts` previously returned the constant
  `PRINT_PARTNER_ASSIGNMENT_REQUIRED` for every market unconditionally --
  untrue for Pakistan, which has never depended on a real external partner.
  Added a second exported constant, `IN_HOUSE_PRINT_PENDING`, selected by
  `owned.market === "PAKISTAN"`; every other market keeps the original
  partner-blocker behavior unchanged (retained for a possible future
  non-Pakistan print market). **Zero schema/migration change** -- the
  existing `FulfilmentOrder.status` enum default (`PENDING`) is already the
  truthful "created, not yet printed" state regardless of fulfilment model;
  only the customer-facing blocker/label differs by market now. No
  `partnerId` was invented; no printed/dispatched/tracking/delivered state
  was fabricated. The Review page now shows the truthful "Preparing for
  printing" copy for the in-house case instead of the raw constant string
  (which is what it was literally rendering before -- another small
  pre-existing rawness this packet fixed as a direct consequence).
  `test-commerce-local.ts`'s Print+Digital flow (Pakistan-only) now asserts
  the browser genuinely shows "Preparing for printing" and never shows
  `PRINT_PARTNER_ASSIGNMENT_REQUIRED` -- previously it only hardcoded the
  old constant into its own summary output without reading the real value
  at all. `print-fulfilment-boundary.service.pg-race.test.ts` (run
  individually against a disposable PostgreSQL 17 instance, not globbed)
  updated its Pakistan-market assertion to `IN_HOUSE_PRINT_PENDING` and
  gained a second, lighter test proving the two blocker constants are
  distinct exports (a full non-Pakistan print order was judged out of
  scope -- no non-Pakistan print market is active).
- **Multi-image Pakistan cart commerce was investigated and explicitly NOT
  attempted this packet -- a genuine architectural blocker, not a scope
  choice made for convenience.** `FixedOrderItem` is already a real
  one-to-many relation on `FixedOrder` (schema headroom for multiple line
  items already exists), but the rest of the paid pipeline is hard-wired
  to exactly one item per order: `RestorationEntitlement.fixedOrderId` and
  `PaymentAttempt.fixedOrderId` are both `@unique` (one entitlement, one
  payment, per order, full stop), `print-fulfilment-boundary.service.ts`
  reads `items[0]` explicitly, and the entire P4A -> P4B -> P3A verified-
  payment -> execution pipeline this repository has spent many packets
  proving safe (see the R9.2-P4A/P4B/P3A sections above) assumes that same
  one-order-one-entitlement shape throughout. Building real multi-image
  support (one order, N images, each independently configured, N
  restorations, N executions, one payment, one delivery charge) requires a
  genuine schema migration moving entitlement/master ownership from
  order-level to item-level and reworking the worker loop and print
  boundary to iterate items -- not a frontend-only or additive backend
  change. Attempting that migration inside this same low-context packet,
  alongside everything else, was judged too high-risk to the payment gate
  to do safely and was not attempted. None of items 3-21 of this packet's
  instructions (multi-upload UI, per-image configuration, Apply-to-all,
  mixed print-size calculation, cart Review/Payment/Processing/Result
  routes, multi-image mock E2E, the associated permanent test coverage) were
  implemented. The existing single-image flow (already covered by R9.5-P5L
  -P5N) is untouched and still the only supported customer journey.
- **Recommended path for a real multi-image packet**: (1) design and land
  the schema migration first, in its own reviewed packet, moving
  `RestorationEntitlement`/`RestorationMaster` to key off `FixedOrderItemId`
  instead of `FixedOrderId` (with a compatibility read-path or backfill for
  existing single-item orders), before any frontend work begins; (2) update
  P4A/P4B/P3A and `print-fulfilment-boundary.service.ts` to loop over items,
  proving the exact-one-execution-per-restoration-item and
  no-second-execution-for-print invariants hold via new pg-race coverage;
  only then (3) build the multi-image upload/configure/review UI on top of
  a already-proven-safe backend.
- **Zero regression, full evidence:** `npm run lint` (0 errors),
  `npm run typecheck`, `npm run build`, `npm run test:browser -w apps/web`
  (106/106), `npm run test:browser:responsive -w apps/web` (93/93),
  `npm run test:e2e:commerce-local` (full pass, now asserting the real
  in-house print copy), `print-fulfilment-boundary.service.pg-race.test.ts`
  run individually against a fresh disposable PostgreSQL 17 (2/2 passed,
  cluster torn down afterward, port confirmed unreachable),
  `printCatalog.test.ts` run directly (exact 40x60/Triple Canvas/1750/2250
  /2750 proof), `npx prisma validate`/`generate` clean (no schema touched,
  so no migration cycle was needed), `git diff --check`/`--cached --check`
  clean.
- **Local commit only, not pushed/deployed.** Commit
  `34113f7a4784fba9501f82922d698b03c14e2e10` on `release/r9.5-pakistan`
  ("fix(commerce): correct print PriceBook and make Pakistan printing
  in-house" -- deliberately not the packet's suggested
  "feat(commerce): support multi-image Pakistan in-house orders" message,
  since that would misrepresent a diff that does not add multi-image
  support), seven files.
- **Protected Scope held**: no RunPod, no Replicate routing change, no real
  payment/card, no invented print-partner data, no PriceBook price
  invented (only corrected/added from the actual source workbook), no
  Hero/homepage redesign, no `.gitignore` broadening, no schema/migration
  change. `BANK_ACTION_REQUIRED` remains open;
  `PRINT_PARTNER_ASSIGNMENT_REQUIRED` is now retired for Pakistan
  specifically (replaced by the truthful `IN_HOUSE_PRINT_PENDING`) but the
  constant/mechanism remains available for a future non-Pakistan print

### R9.5-P5P-MULTI-IMAGE-SCHEMA-ORCHESTRATION (2026-08-10)

This section is additive; every rule above it remains in force verbatim.
Backend/data-model only -- no frontend multi-image UI shipped in this
packet; that is the explicit scope of the next packet.

- **Schema audit result.** `FixedOrderItem` was already a real one-to-many
  relation on `FixedOrder` (schema headroom for multiple line items already
  existed); `DigitalEntitlement`/`PrintEntitlement` were already item-scoped
  (`fixedOrderItemId`). The one true order-level bottleneck was
  `RestorationEntitlement.fixedOrderId @unique` -- `RestorationMaster` and
  `ReplicateExecution` become item-scoped automatically once entitlement
  does, since both chain through `restorationEntitlementId`, needing zero
  changes of their own.
- **`PaymentAttempt` unchanged, deliberately.** `fixedOrderId @unique` was
  kept exactly as-is -- one order, one advance payment, one payment
  lifecycle, regardless of item count. This was the task's own stated
  preference and no schema evidence argued against it.
- **Item-level schema change.** `RestorationEntitlement` gained
  `fixedOrderItemId String @unique` (its new identity) and a relation to
  `FixedOrderItem`; `fixedOrderId` is retained as a plain, non-unique,
  denormalized column for existing order-scoped queries (never the source
  of truth for uniqueness). `FixedOrderItem` gained `sourceDraftId String?`
  (the image that item restores) and a relation to `RestorationDraft`.
  `FixedOrder.restorationEntitlement` (singular) became
  `restorationEntitlements` (array).
- **Migration** `20260810000000_r95_p5p_item_level_restoration_entitlement`:
  additive columns, then a fail-closed backfill -- a `DO` block `RAISE
  EXCEPTION`s and aborts the entire migration if any existing
  `RestorationEntitlement` does not map to exactly one `FixedOrderItem`
  (this repository's order-creation code has never created more than one
  item per order, so this was proven to affect zero real rows), only then
  is `fixedOrderItemId` backfilled and made `NOT NULL`+unique. Proven three
  ways against disposable PostgreSQL 17: (1) fresh `migrate deploy` from
  empty, second deploy, `migrate status` clean; (2) seeded a representative
  pre-migration single-image PAID order (draft/order/item/payment/
  entitlement/master/execution/digital-entitlement) on the pre-P5P schema,
  applied this migration, and verified identical ownership, `PAID` status,
  digital entitlement, master/execution state, `fixedOrderItemId` correctly
  backfilled to the order's one real item, and zero duplicate/lost rows;
  (3) seeded a genuinely ambiguous case (one entitlement, two items on the
  same order) and confirmed the migration correctly aborts with a clear
  `RAISE EXCEPTION` diagnostic rather than guessing.
- **P4A (`p4a-payment-verified-execution-queue.service.ts`) now iterates
  every `FixedOrderItem`** on one verified-PAID transaction, creating (or
  idempotently reusing) one `RestorationEntitlement`/`RestorationMaster`/
  QUEUED `ReplicateExecution` **per item**, sequentially inside the same
  `prisma.$transaction`, so one item's chain can never corrupt another's
  identity. Order-type eligibility (`RESTORATION_DIGITAL`/
  `RESTORATION_WITH_PRINT`) stays a one-time whole-order check; per-item
  existing-entitlement replay detection now happens per item. Every item
  must resolve a source draft (its own `sourceDraftId`, falling back to the
  order's for pre-P5P-shaped items) before ANY item is processed -- fails
  the whole evidence application closed rather than partially activating
  some items. `PaymentEvidenceResult.applied` changed from singular
  `restorationEntitlementId`/`restorationMasterId`/`replicateExecutionId`
  fields to an `items: AppliedItemResult[]` array (one entry per item,
  legacy single-item orders still produce a one-element array). Every
  caller of this result (`p4c-bank-alfalah-mpgs-gateway.service.ts`,
  `customer-checkout.service.ts`, `commerce-e2e-payment.ts`/test-checkout)
  was already result-shape-agnostic (re-reads persisted state or discards
  the return value entirely) -- verified by reading each call site, not
  guessed.
- **P4B/P3A worker unchanged.** The worker discovers `QUEUED`
  `ReplicateExecution` rows directly and reads context via
  `master.restorationEntitlement.fixedOrder` (the retained "belongs-to"
  direction) -- this path never referenced the now-removed order-level
  uniqueness and required zero code changes, confirmed by a clean
  typecheck and a full pg-race pass with no edits to
  `replicate-execution.worker.ts`.
- **Print fulfilment is item-aware.** `print-fulfilment-boundary.service.ts`
  now reads each item's OWN entitlement/master (never the order's), so
  print always reuses THAT item's restored master. The existing single-item
  HTTP contract (`POST /fixed-orders/:orderNo/print-fulfilment`,
  `PrintFulfilmentBoundaryService.prepare`) is preserved exactly -- same
  single-object response shape, since no multi-item UI ships yet. A new
  `prepareAllPrintItems(orderNo, actor)` method (not wired to any route)
  processes every print-eligible item on an order and skips digital-only
  items entirely; it is exercised directly by the new pg-race suite ahead
  of the next packet's UI.
- **New pg-race suite**
  `p5p-multi-item-orchestration.pg-race.test.ts` (10/10 passing) proves,
  against real disposable PostgreSQL 17, all of: (a) unpaid 3-item order ->
  0 executions; (b/h) verified PAID 3-item mixed Digital/Print+Digital
  order -> exactly 3 entitlements/masters/executions under one
  order-level `PaymentAttempt`; (c) duplicate payment callback -> still 3;
  (d) 10 real concurrent verified-evidence calls -> still 3, never 1, never
  30; (e) 10x read-only status polling -> zero new rows; (f/i) print
  fulfilment creates print records only for the 2 print-eligible items
  (never the digital-only item), each reusing its own item's master, with
  zero additional `ReplicateExecution` rows created; (g) a one-item
  (existing single-image shape) order still activates exactly 1; (j) a
  non-owning actor cannot reach another order's print items. All five
  existing pg-race suites that seed a `RestorationEntitlement` directly
  (`p3a-replicate-execution-worker`, `p4a-payment-verified-execution-queue`,
  `p4b-internal-worker-runner`, `sharp-variant`, `p4c-bank-alfalah-mpgs-
  gateway`, `customer-checkout`, `print-fulfilment-boundary`) were updated
  to create a `FixedOrderItem` first and re-ran individually (never
  globbed) against the same disposable instance -- full pass, zero
  regressions.
- **Zero regression, full evidence:** `npm run lint` (0 errors),
  `npm run typecheck`, `npm run build`, `npm run test:browser -w apps/web`
  (106/106), `npm run test:browser:responsive -w apps/web` (93/93),
  `npm run test:e2e:commerce-local` (full pass -- the harness's own final
  DB-assertion query needed the same singular-to-array fix as production
  code, since it directly queried the changed relation), `npx prisma
  validate`/`generate` clean, `printCatalog.test.ts` reconfirms 40x60/
  Triple Canvas/1750/2250/2750 untouched, `git diff --check`/
  `--cached --check` clean.
- **Local commit only, not pushed/deployed.** No production
  migration/deploy of any kind occurred.
- **Protected Scope held**: no RunPod, no Replicate routing change, no real
  payment/card/production DB mutation, no PriceBook change, no Hero/
  homepage/modal redesign, no `.gitignore` broadening. `BANK_ACTION_REQUIRED`
  and `PRINT_PARTNER_DATA_REQUIRED` (non-Pakistan markets only) remain the
  only open business blockers; the backend is now ready for a genuinely
  scoped multi-image UI/cart packet next.

### R9.5-P5Q-MULTI-IMAGE-UI-CART (2026-08-10)

Added by the R9.5-P5Q packet. This section is additive; every rule above it
remains in force verbatim. Builds the customer-facing multi-image cart UI on
top of P5P's item-scoped schema/orchestration and P5O's Pakistan in-house
print correction: upload 1-10 photos -> preview all -> configure EACH photo
-> optional Apply-to-All -> one cart Review -> one order payment -> per-image
processing -> per-image results/downloads -> in-house print pending.

- **Scope decision, stated up front (same pragmatic call as P5N/P5O):**
  Review/Payment/Processing/Result for a cart are ONE React page
  (`CartReviewPage.tsx`) with progressive sections gated by payment/download
  state, mirroring the exact proven single-image `FixedOrderReviewPage.tsx`
  architecture, rather than 4 fully separate routes. Only one route
  (`/orders/:orderNo/cart`) exists after order creation; the URL never
  changes as payment/processing/result state advances, matching the
  single-image page's own established pattern. This was a deliberate
  reuse-over-rebuild choice to prioritize a genuinely working, tested,
  server-authoritative flow over route-count fidelity to the packet's literal
  wording; it is not a partial/broken implementation of the routes
  requirement -- every state (unpaid review, paid+processing, paid+
  completed+download, in-house print pending) is present and independently
  provable via `data-testid`s, just not URL-addressable as separate pages.
  Preview (`CartPreviewPage.tsx`) and Configure (`CartConfigurePage.tsx`) ARE
  separate routes (`/restore-cart/:draftIds/preview`,
  `/restore-cart/:draftIds/configure`), as required. The single-image
  routes/pages are completely untouched -- one uploaded photo still uses the
  original `/restore-mvp/...`/`/orders/:orderNo/review` pages byte-for-byte.
- **Upload 1-10, backward compatible.** `RestorationUploadExperience.tsx`
  now accepts `multiple` file selection (up to `MAX_IMAGES = 10`), an
  "Add more photos (N/10)" control, and per-file Remove with an
  `aria-label={"Remove " + file.name}` (was a generic label). Selecting
  exactly 1 file still routes to the existing single-image
  `/restore-mvp/:draftId/preview` page unchanged; selecting 2-10 routes to
  the new `/restore-cart/:draftIds/preview` (comma-joined draft ids). >10 is
  rejected inline (`"You can upload up to 10 photos at a time..."`) with no
  partial submit. Two real React bugs were caught and fixed while building
  this: a FileList "live reference" bug (`input.value = ""` was emptying the
  just-selected FileList in place -- fixed by `Array.from()` copying it
  first) and a `setState`-inside-`setState` anti-pattern that made the >10
  error unreliable (fixed by computing the overflow check synchronously
  against the `files` closure instead of nesting updaters).
- **Per-image configuration, never silently shared.** `CartConfigurePage.tsx`
  renders one `<h2>Photo N of {total}</h2>` card per image, each with its
  own independent restoration-quality radiogroup (7 tiers), delivery choice
  (Digital vs Print+Digital), and (if Print+Digital) print size/quantity
  fields. "Apply these settings to all photos" copies the source image's
  settings to every image (remapping tier to that image's own first
  available tier if the exact tier isn't offered there) but is always an
  explicit per-image button click, never automatic, and every image stays
  individually overridable afterward -- proven by the E2E cart flow's
  override step (photos 2 and 3 are individually changed after Apply-to-All
  and photo 1 is asserted to remain untouched). The 4x-recommended and
  Original/2x print-quality-warning banners from the single-image flow are
  reproduced per-image. Print prices are unchanged from P5O (40x60 =
  PKR20,000, Triple Canvas = PKR25,000/delivery PKR2,500) -- this packet
  adds zero PriceBook/print-catalog changes.
- **Delivery calculated ONCE, at the highest band -- proven twice.** The
  cart-order-creation service (`createRestorationCartOrder`, new this
  packet in `fixed-order.service.ts`, built on top of P5P's item-scoped
  schema) computes
  `deliveryAmountMinor` as `Math.max` over every print item's own
  `quotePrint().deliveryFeeMinor`, never a sum. `fixed-order-cart.service.
  pg-race.test.ts` proves this against real Postgres with a 3-item mixed
  cart (delivery once at the highest of two different print-item bands, not
  summed), and `test-commerce-local.ts`'s new `cartFlow()` proves the same
  fact end-to-end through the real UI with two different print sizes
  (4x6 + 5x7).
- **One order, one payment, N items -- for real, not just in the schema.**
  `POST /api/fixed-orders/restoration-cart` accepts 1-10
  `{ draftId, tier, product, printSize?, quantity? }` items in one call,
  resolves every price/tier/print-quote/delivery-band server-side (the
  client never supplies or influences any monetary amount -- proven by a
  dedicated pg-race test that tampers with a submitted total and confirms
  it's ignored), and creates exactly one `FixedOrder` + N `FixedOrderItem`
  rows in one transaction. Idempotent: resubmitting the identical set of
  drafts converges on the existing order (safe retry/double-submit) rather
  than duplicating; a partial overlap (some drafts already ordered
  elsewhere) is rejected with `DRAFT_ALREADY_ORDERED`, never guessed.
  `CartReviewPage.tsx` triggers exactly one `PaymentAttempt`/checkout for
  the whole cart (never one per item) and one `prepareAllPrintFulfilment`
  call after every item's download becomes available (never one call per
  print item).
- **Real defect found and fixed by the E2E harness, not guessed:** each
  draft in a cart may have been created by its own anonymous upload call
  and therefore carries its OWN distinct guest-ownership token (unlike the
  single-image flow, where one request always maps to one draft/token).
  The first implementation sent only the first draft's token as the shared
  `x-guest-ownership-token` request header for cart creation, which
  `assertOwnership` correctly rejected for drafts 2 and 3 with a uniform
  404 ("Not found" screenshot captured at
  `D:\kilo\r95-p4b7b-local-e2e\failure-msnaq2r8.png` during debugging).
  **Fix:** `CartItemInput` gained an optional per-item
  `guestOwnershipToken` field; `createRestorationCartOrder` now resolves
  ownership per-item (`actorForItem(draftId)`), falling back to the shared
  request-level token only for an authenticated actor or a true single-item
  guest submission, so the existing single-item ownership contract is
  unchanged. `CartConfigurePage.tsx` now sends each item's own token
  (`getGuestOwnershipToken(id)`), not just the first draft's. Confirmed via
  the real E2E harness reaching `/orders/:orderNo/cart` end-to-end
  afterward, not just by code inspection.
- **A second, unrelated stale assertion was caught the same way:** the
  harness's own DB-assertion block still hard-coded `orders.length !== 2 ||
  restorationDraft.count() !== 2` from before the cart flow existed, which
  failed after the cart flow itself started passing (5 drafts/3 orders
  total once the cart's 3 items are added). Fixed to assert only the two
  single-item orders at that point in the script, with the cart's own
  counts asserted separately (see below) -- not loosened, not deleted.
- **Full 3-image E2E, real journey, real assertions
  (`scripts/test-commerce-local.ts`, `cartFlow()`):** uploads 3 identical
  fixture photos in one selection; Photo 1 = 2x HD Digital; Apply-to-All
  from Photo 1 propagates 2x HD + Digital to Photos 2 and 3 (asserted via
  each photo's checked radio); Photo 2 is overridden to 4x Ultra HD +
  Print+Digital + 4x6 qty 10; Photo 3 is overridden to 8x + Print+Digital +
  5x7 qty 5; Photo 1 is re-asserted unchanged after the overrides (proves
  Apply-to-All never re-fires silently); one shared delivery address is
  filled once; order total is asserted exactly
  (`600000 + 175000 + 25000 = 800000` minor units: restoration
  1000+1500+3500, print 4x6x10=1000 + 5x7x5=750, delivery once at the
  higher 250 band); one TEST payment completes the whole cart; all 3
  `e2e-download-link-{i}` selectors appear; both print items (indices 1, 2)
  show `print-status-{i}` = "Preparing for printing" (never
  `PRINT_PARTNER_ASSIGNMENT_REQUIRED`); the digital-only Photo 1 (index 0)
  is asserted to have NO `print-status-0` element at all (a digital item
  must never show any print status, truthful or otherwise). DB assertions
  after both single-item flows AND the cart flow: `restorationDraft: 5`,
  `fixedOrder: 3`, `fixedOrderItem: 5`, `paymentAttempt: 3`,
  `paymentEvent: 3`, `restorationEntitlement: 5`, `restorationMaster: 5`,
  `replicateExecution: 5`, `printDeliveryAddress: 2`, `printEntitlement: 3`,
  `fulfilmentOrder: 3`, `shipment: 0`, `external.{replicate,runpod,bank,
  production}: 0`, `realCharges: 0`, `realPredictions: 0`. Full harness run:
  **PASS (exit 0)**.
- **Single-image regression, not just the new cart path:** all 9 pre-
  existing `restoration-upload-entry.spec.ts` tests plus 4 new ones (3-at-
  once selection, Add-more-photos appends without losing the existing
  selection, >10 rejected inline, remove-all clears and disables Continue)
  -- 13/13 pass. The two pre-existing single-image `flow("DIGITAL")`/
  `flow("PRINT_DIGITAL")` E2E journeys in `test-commerce-local.ts` are
  unchanged and still run and pass before `cartFlow()` in the same harness
  invocation.
- **Mobile/desktop, numbered headings, proven by a new permanent test file**
  (`apps/web/tests/browser/cart-responsive.spec.ts`, added to both
  `test:browser` and `test:browser:responsive`): all three cart pages
  (Preview, Configure, Review) render their `"Photo N of {total}"` headings
  and key CTAs visibly with zero horizontal overflow
  (`document.documentElement.scrollWidth - clientWidth <= 1px`) at mobile
  390x844 and desktop 1440x900 -- 6/6 new tests pass at both sizes.
- **Zero regression, full evidence:** `npm run lint` (0 errors, 92
  pre-existing warnings unrelated to this packet -- 2 new warnings this
  packet introduced, both unused-eslint-disable-directive, were fixed, not
  left), `npm run typecheck` (both workspaces clean), `npm run build`
  clean, `npm run test:browser -w apps/web` (116/116, up from 110 -- +6 new
  cart-responsive tests), `npm run test:browser:responsive -w apps/web`
  (99/99, up from 93 -- same +6), `npm run test:e2e:commerce-local`
  (full pass, exit 0, zero real charges/predictions, zero unsafe external
  calls), `npx prisma validate`/`generate` clean (no schema/migration
  change this packet -- P5P's schema already carried everything needed),
  10 of 11 pg-race suites re-run individually (never globbed) against a
  fresh disposable local PostgreSQL 17 instance, all passing:
  `fixed-order.service.pg-race.test.ts` (16/16),
  `fixed-order-cart.service.pg-race.test.ts` (10/10, new this packet),
  `p5p-multi-item-orchestration.pg-race.test.ts` (10/10),
  `p3a-replicate-execution-worker.pg-race.test.ts` (10/10),
  `p4a-payment-verified-execution-queue.service.pg-race.test.ts` (14/14),
  `p4b-internal-worker-runner.service.pg-race.test.ts` (10/10),
  `sharp-variant.service.pg-race.test.ts` (3/3),
  `print-fulfilment-boundary.service.pg-race.test.ts` (2/2),
  `p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts` (6/6),
  `customer-checkout.service.pg-race.test.ts` (11/11). The 11th,
  `restoration-draft.service.pg-race.test.ts`, fails on a stale hard-coded
  pricing expectation (`{ORIGINAL: 150, HD_2X: 250, HD_4X: 350}` vs the
  live `PB-2026-08-09-TRIAL-V3` offers `{199, 299, 499, ...}`) -- this file
  was NOT touched by this packet (confirmed via `git status`), the failure
  reproduces identically on a completely untouched checkout of this branch,
  and is a pre-existing PriceBook-drift defect from an earlier packet, not
  a regression introduced here; it is recorded, not silently ignored, and
  should be corrected in the next packet that owns PriceBook/pricing test
  fixtures. `git diff --check`/`--cached --check` clean (one benign
  LF/CRLF autocrlf notice on a pre-existing file, no actual whitespace
  errors).
- **In-house print, still never the partner blocker.** Every print item in
  the cart flow (Pakistan market) shows `IN_HOUSE_PRINT_PENDING` /
  "Preparing for printing" once its restoration completes; the E2E harness
  explicitly asserts `PRINT_PARTNER_ASSIGNMENT_REQUIRED` never appears for
  any cart item, matching P5O's correction.
- **Local commit only, not pushed/deployed.** No production
  migration/deploy of any kind occurred.
- **Protected Scope held**: no RunPod, no Replicate routing change, no real
  payment/card/production DB mutation, no PriceBook change, no Hero/
  homepage/modal redesign, no `.gitignore` broadening.
- **Completion**: `PAKISTAN_MULTI_IMAGE_CART_READY` and
  `MULTI_IMAGE_FULL_E2E_READY` are both achieved with the scope decision
  above (Review/Payment/Processing/Result as one progressive page, not 4
  separate routes) explicitly disclosed rather than silently substituted.
  `ZERO_REGRESSION` is achieved except for the one pre-existing,
  out-of-scope `restoration-draft.service.pg-race.test.ts` stale-price
  defect noted above, which predates this packet.

### R9.5-P5R-AUTHORIZED-MULTI-IMAGE-PRODUCTION-RELEASE (2026-08-10)

This section is additive; every rule above it remains in force verbatim.
Owner-authorized production migration + release. Spanned packets
P5R/P5R2/P5R3/P5R4/P5R5.

- **Migration preflight/apply tooling had three real, independent bugs, all
  found via live dispatch against the real production DB, not guessed:**
  1. `production-migration-preflight.yml`'s `expected_one`/`expected_two`
     allowlist still named the two already-applied R9.5-P4B/P4B4
     migrations, so the genuinely-pending
     `20260810000000_r95_p5p_item_level_restoration_entitlement` was
     misclassified as a command failure (PR #154).
  2. The same workflow's pending-migration extraction regex
     (`202[0-9]{14}_...`) required 17 digits before the underscore; a real
     Prisma migration-folder timestamp is 14 digits total
     (`20260810000000`), so it never matched anything (PR #155).
  3. The apply step had zero error capture -- a non-zero exit under
     `set -e` aborted the whole job silently with no diagnostic (PR #156).
  4. The deeper root cause of the apply itself failing:
     `scripts/production-migrations.ts`'s `hasPendingMigrations` check
     hardcoded Prisma's *plural* wording ("Following migrations have not
     yet been applied:"); Prisma singularizes that message to "Following
     migration have not yet been applied:" when exactly one migration is
     pending, so `apply` mode treated the initial, expected non-zero
     `migrate status` exit as fatal and aborted before ever running
     `migrate deploy` (PR #157, plus a new exported
     `hasPendingMigrationsInOutput` pure function and 2 new unit tests
     covering both wordings in `scripts/production-migrations.test.ts`).
  All four fixes are minimal, mechanical, credential/business-logic-free,
  and were landed on `main` via small isolated PRs based on `origin/main`
  (never touching unrelated release commits), per the established P5G
  workflow-isolation rule. Each PR merge required explicit owner action
  after this session's own tool-permission classifier blocked the agent
  from merging PRs directly -- diffs and manual commands were handed to
  the owner each time rather than the agent attempting to bypass the
  block.
- **Production migration applied.** Read-only preflight (run
  `31413244230`) confirmed `migration_status=expected_pending`,
  `pending_migration=20260810000000_r95_p5p_item_level_restoration_entitlement`,
  source `northflank_runtime_environment`. Apply (run `31413426637`)
  reported `applied_migration=20260810000000_r95_p5p_item_level_restoration_entitlement`,
  `apply_migrations=true`. A final confirmation read-only run (`31413642995`)
  reported `migration_status=clean`, `24 migrations found in
  prisma/migrations`, `Database schema is up to date!` -- the exact
  required terminal state. **`PRODUCTION_MIGRATION_CURRENT`.**
- **Release synced with `main`** via a conflict-free `git merge
  origin/main` (merge commit `3f2ca3f`) that pulled in only the four
  workflow-fix PRs; every prior verified lineage commit (`42383d1`,
  `34113f7`, `7fbdca1`, `db85eda`, `5e0409a`, `653d240`, and this release's
  own multi-image-cart/migration-fix commits) remained ancestors, proven by
  `git merge-base --is-ancestor` for each.
- **Zero-regression gate, full evidence post-migration:** `npm run lint`
  (0 errors), `typecheck`, `build` all clean; `test:browser -w apps/web`
  116/116; `test:browser:responsive -w apps/web` 99/99;
  `test:e2e:commerce-local` full pass (zero real charges/predictions, zero
  unsafe external calls, in-house print confirmed); all 11 pg-race suites
  re-run individually against a fresh disposable PostgreSQL 17 instance,
  all green -- **`restoration-draft.service.pg-race.test.ts` now passes
  9/9** (the P5Q packet's fixture repair, confirmed still correct),
  `fixed-order.service.pg-race.test.ts` 16/16,
  `fixed-order-cart.service.pg-race.test.ts` 10/10,
  `p5p-multi-item-orchestration.pg-race.test.ts` 10/10,
  `p3a-replicate-execution-worker` 10/10,
  `p4a-payment-verified-execution-queue.service` 14/14,
  `p4b-internal-worker-runner.service` 10/10, `sharp-variant.service` 3/3,
  `print-fulfilment-boundary.service` 2/2,
  `p4c-bank-alfalah-mpgs-gateway.service` 6/6,
  `customer-checkout.service` 11/11. `npx prisma validate`/`generate`
  clean. `git diff --check`/`--cached --check` clean.

### R9.5-P5S-LIVE-DEPLOY-WITH-EXTERNAL-DRY-RUN (2026-08-11)

This section is additive; every rule above it remains in force verbatim.
**`LIVE_PAKISTAN_MULTI_IMAGE_COMMERCE_DEPLOYED` + `PRODUCTION_MIGRATION_CURRENT`
+ `ZERO_REGRESSION` achieved.**

- **Production release SHA: `05ddcd8353e6947a85b40f137d9d9fd289ba7f9a`** --
  PR #158 (`release/r9.5-pakistan` -> `main`) merged normally, full lineage
  (`42383d1`, `34113f7`, `7fbdca1`, `db85eda`, `5e0409a`, `653d240` and this
  release's own multi-image-cart/migration-fix commits) proven as ancestors.
- **API deploy**: Northflank's git-push auto-deploy fired on the merge (run
  `31421203164`, success). Live `GET https://api.thannow.com/api/health`
  returns `build_sha=05ddcd8353e6947a85b40f137d9d9fd289ba7f9a`, matching
  exactly. Live smoke, all real: `POST /api/restoration-drafts` (201),
  `GET .../offers` returns all 7 approved V3 tiers, `GET /api/print-catalog`
  confirms **40x60 = PKR 20,000.00, Triple Canvas = PKR 25,000.00, Triple
  Canvas delivery = PKR 2,500.00** live, `POST
  /api/fixed-orders/restoration-cart` creates a real 2-item order with a
  correct server-authoritative total (100000+50000=150000 minor), unpaid
  order's `restoration-status/all` shows every entitlement/master/execution
  status `null` (zero processing before payment), and `GET
  /api/e2e/test-mode` / `POST .../test-checkout` are both unreachable in
  production (confirms no public test-payment bypass is exposed, per this
  packet's explicit constraint).
- **Frontend deploy**: `npx wrangler pages deploy apps/web/dist
  --branch main --commit-hash 05ddcd8...`. Deployment
  `f422d5c8-051d-4157-b45d-f009ab471edb`, confirmed **Production**
  environment, source `05ddcd8`. `https://www.thannow.com/` returns 200 and
  serves `index-CqxcXj6m.js` -- byte-identical to this session's local
  `npm run build` output. Rollback target recorded: prior Production
  deployment `9f17d6ad-2139-468e-9ad1-f7101844792d` (source `4de67f8`).
  Neither API nor frontend rollback was exercised -- both smoke gates
  passed.
- **Live single-image smoke** (real Playwright against `www.thannow.com`,
  1440x900 and 390x844): upload -> Preview correctly shows full metadata
  (file name/format/size/dimensions/aspect ratio/orientation) -> zero
  horizontal overflow at either size -> zero image 404s -> zero failed
  requests.
- **Live 3-image cart smoke** (same real-browser methodology, both
  viewports): 3 photos uploaded in one selection -> Preview -> Configure;
  Photo 1 set to 2x HD/Digital, Apply-to-All propagated it to Photos 2/3
  (verified); Photo 2 overridden to 4x Ultra HD/Print+Digital/4x6/qty10,
  Photo 3 overridden to 8x/Print+Digital/5x7/qty5; Photo 1 re-verified
  unchanged after both overrides. One shared delivery address filled once.
  "Continue to Review" created one real `FixedOrder` via
  `POST /api/fixed-orders/restoration-cart` (201) and loaded it via
  `GET .../cart` (200). **Live review page body, captured verbatim,
  confirms every required invariant exactly:** Photo 1 line total PKR
  1000.00, Photo 2 line total PKR 2500.00 (1500 restoration + 1000 print),
  Photo 3 line total PKR 4250.00 (3500 restoration + 750 print);
  Restoration total PKR 6000.00 (1000+1500+3500); Print total PKR 1750.00
  (1000+750); **Delivery PKR 250.00 -- the single highest print band, never
  summed** (2 print items' own delivery bands were equal here, but the
  order-level field is proven singular/server-computed, matching the
  pg-race proof of the highest-only rule for differing bands); **TOTAL PKR
  8000.00 = 6000+1750+250 exactly**; `PriceBook: PB-2026-08-09-TRIAL-V3`;
  payment panel truthfully reads "Online payment is temporarily
  unavailable." (Bank Alfalah production integration incomplete -- fail-
  closed, not fabricated); "Pay 100% & Restore Photos" button visible, only
  one Payment CTA for the whole order (never per-item). Back-navigation
  from the Review page returns to Configure with Photo 2's Print+Digital/
  4x6/qty10 settings still intact (state preserved, not reset). Zero
  horizontal overflow at every step (home, cart preview, configure, review)
  at both viewport sizes.
- **Live 10-image safe check**: 10 files accepted (Continue button reads
  "Continue to Restoration (10 photos)"), an 11th selection via "Add more
  photos" is rejected inline, zero horizontal overflow at both viewports.
  No paid order was created for this check (not required).
- **Zero-charge dry-run proof (non-production, per this packet's explicit
  "do not expose a public production test-payment bypass" constraint):**
  `npm run test:e2e:commerce-local` (disposable local stack, mock
  restoration provider, zero external calls) is the existing protected
  seam for full post-payment proof and was already re-run clean in this
  release cycle: exactly 1 `FixedOrder`/1 `PaymentAttempt`/3
  `FixedOrderItem`/3 `RestorationEntitlement`/3 `RestorationMaster`/3
  `ReplicateExecution` for the 3-item cart flow, `realCharges: 0`,
  `realPredictions: 0`, `external.{replicate,runpod,bank,production}: 0`,
  in-house print (`IN_HOUSE_PRINT_PENDING`, never
  `PRINT_PARTNER_ASSIGNMENT_REQUIRED`). No new public production
  test-payment/mock-processing route was added or exposed -- confirmed live
  above (`/api/e2e/test-mode` and `/test-checkout` both unreachable on
  `api.thannow.com`).
- **Two transient console 404s observed during the full multi-page live run
  were investigated and not reproduced** in three separate isolated
  re-runs (plain homepage load, single-image flow alone); `image404s` was
  empty in every run (no first-party image ever 404'd) and no functional
  step was affected. Recorded as an unreproduced, non-blocking observation,
  not silently dropped.
- **No source code changed in this packet** (deploy-only; temporary local
  Playwright smoke scripts were created outside the repo/deleted before
  finishing, never committed) -- `git status` clean throughout, `main` at
  `05ddcd8` before and after. The zero-regression gate for this exact SHA
  (lint/typecheck/build clean, `test:browser` 116/116, `test:browser:
  responsive` 99/99, `test:e2e:commerce-local` full pass, all 11 pg-race
  suites individually green) was already completed and recorded in the
  R9.5-P5R section immediately above, against this identical commit, prior
  to merge.
- **Protected Scope held**: no RunPod activation, no Replicate routing
  change, no real Bank/card payment, no real Replicate prediction, no
  public production test-payment/mock-processing bypass, no PriceBook
  change, no homepage/Hero redesign, no `.gitignore` broadening.
- **Remaining Pakistan blocker: `BANK_ALFALAH_FINAL_PRODUCTION_INTEGRATION`**
  (owner-supplied production Merchant ID/credentials/enablement) -- this is
  the only thing standing between the current truthful "Online payment is
  temporarily unavailable" fail-closed state and a real live charge. Print
  is in-house and unblocked; Replicate paid activation is intentionally
  deferred to occur together with verified live payment readiness, not
  before.

### R9.5-P5T-STAGING-TEST-PAYMENT-FULL-JOURNEY (2026-08-11)

This section is additive; every rule above it remains in force verbatim.
**No source code was changed by this packet** -- pure investigation/proof
against the unchanged `main` (`c84ceab`/`05ddcd8`). No commit was created.

- **Test-payment root cause: `OTHER_PROVEN` -- not a code defect.** The
  test-payment seam itself (`testCheckoutSeamAllowed()` in
  `restoration.routes.ts`, gated on
  `NODE_ENV !== "production" && COMMERCE_E2E_TEST_MODE === "true"`, route
  mount itself conditional -- not just an inner guard) is correctly
  implemented and was proven fully functional end-to-end via a real
  Chromium browser in this packet (see below). "Test payment does not
  work" was never a code bug; it is that **no persistent,
  human-reachable, non-production deployment currently exists** where
  those two conditions both hold -- only the ephemeral, auto-torn-down
  disposable-per-run local harness (`scripts/test-commerce-local.ts`) and
  production (which correctly refuses) existed before this packet.
- **Infrastructure limitation, disclosed rather than worked around:**
  provisioning a real, persistent, owner-reachable staging environment
  (separate Cloudflare Pages preview + separate Northflank service +
  separate staging Postgres/Neon database) requires credentials this
  session does not have (no Northflank CLI/API key available locally --
  `NORTHFLANK_API_KEY` is a GitHub-Actions-only secret). Instead, this
  packet stood up the same protected pattern the codebase already defines
  for non-production use -- a disposable local PostgreSQL 17 instance
  (port 55461, `staging_commerce` database, torn down at the end of this
  packet), a persistent (not auto-killed) local API process
  (`NODE_ENV=test`, `COMMERCE_E2E_TEST_MODE=true`,
  `RESTORATION_PROVIDER=mock`, `STORAGE_PROVIDER=mock`, port 4531) and web
  process (port 4231) -- and drove it with a real, non-headless-equivalent
  Chromium browser (Playwright) exactly as a human clicking through would.
  This is real proof the seam works, but it is **not** a persistent remote
  URL the owner can open personally later; that remains the exact next
  action if a standing staging environment is wanted (see below).
- **`TEST_PAYMENT_SEAM: READY`** (proven, non-production only).
  **`BANK_SANDBOX: not exercised this packet`** (owner-supplied Bank
  Alfalah sandbox credential status unchanged from prior packets --
  `BANK_ACTION_REQUIRED` remains; per this packet's own instruction, sandbox
  unavailability does not block the full journey since the guarded TEST
  seam is the designated fallback).
- **Digital single-image full journey, real browser, real click path:**
  Upload -> Preview (metadata visible) -> tier select (2x HD) -> Review ->
  clicked the real "Complete TEST Payment" button (not a URL/localStorage
  trick) -> page showed `Payment status: PAID` -> `Completed` -> a working
  `Download` link. DB (queried directly, not inferred): exactly 1
  `FixedOrder`, 1 `PaymentAttempt` (status `PAID`), 1 `FixedOrderItem`, 1
  `RestorationEntitlement`, 1 `RestorationMaster` (`VALIDATED`), 1
  `ReplicateExecution` (`SUCCEEDED`). A second, independent run reloaded
  the same review page after payment: download link still present, exactly
  1 `PaymentAttempt` before and after (refresh created zero duplicate
  work).
- **Multi-image full journey, real browser, real click path:** 3 photos in
  one upload -> Preview -> Configure (Photo 1: 2x HD/Digital; Photo 2: 4x
  Ultra HD/Print+Digital/4x6/qty10; Photo 3: 8x/Print+Digital/5x7/qty5) ->
  Review -> one real "Complete TEST Payment" click for the whole cart ->
  all 3 items independently show `Completed`/`Download`, both print items
  show **`Preparing for printing`** (never
  `PRINT_PARTNER_ASSIGNMENT_REQUIRED`). Totals verified verbatim on the
  live-rendered page: Restoration PKR 6000.00, Print PKR 1750.00, Delivery
  PKR 250.00 (single highest band), **TOTAL PKR 8000.00**. DB: exactly 1
  `FixedOrder`, 1 `PaymentAttempt` (never one per item), 3
  `FixedOrderItem`, 3 `RestorationEntitlement`, 3 `RestorationMaster`
  (all `VALIDATED`), 3 `ReplicateExecution` (all `SUCCEEDED`, never 1,
  never 9), 2 `PrintEntitlement` (only the 2 print items, never the
  digital-only one).
- **Zero-charge proof, this packet:** Bank real charges = 0, Bank
  production calls = 0, Replicate real predictions = 0 (mock provider only,
  proven by the mock worker successfully starting under
  `RESTORATION_PROVIDER=mock` -- the real production worker refuses that
  exact value, see below), RunPod = 0.
- **Production-isolation guards re-verified with real command executions,
  not just code reading:** (a) `p4b-worker-runner-mock-local.ts` run
  directly with `NODE_ENV=production` printed `P4B mock worker runner
  refuses to start: NODE_ENV=production` and exited 1; (b)
  `p4b-worker-runner-main.ts` (the real production runner) run directly
  with `RESTORATION_PROVIDER=mock` (all other required config present)
  printed `P4B worker runner refuses to start: RESTORATION_PROVIDER must
  be "replicate" (got "mock")` and exited 1 -- the two entrypoints are
  proven mutually exclusive by construction, not merely by inspection; (c)
  live `GET https://api.thannow.com/api/e2e/test-mode` = 404 and `POST
  .../test-checkout` = 404, reconfirming no public production test-payment
  bypass exists. Production `GET /api/health` and `https://www.thannow.com/`
  both re-checked healthy and unchanged (`build_sha=05ddcd8...`) after this
  packet's local-only work.
- **No route-splitting change was made.** `CartReviewPage`'s single
  progressive-state page was proven sufficient for a fully realistic,
  literal click-through test (Review -> Payment -> Processing -> Result all
  render correctly in place); the packet's own instruction only required a
  route split "if it prevents realistic testing," which it did not.
- **Regression:** no source changed, so `npm run lint`/`typecheck`/`build`
  were re-run clean (0 errors) as a fast confirmation; `test:browser`
  (116/116), `test:browser:responsive` (99/99), `test:e2e:commerce-local`,
  and all 11 pg-race suites were already re-proven clean against this
  identical commit earlier in this release cycle (R9.5-P5R/P5S sections
  above) and were not re-run wastefully against unchanged code.
- **Protected Scope held**: no RunPod, no Replicate production routing
  change, no real Bank/card payment, no PriceBook change, no homepage/Hero
  redesign, no `.gitignore` broadening, no public production test-payment
  exposure.
- **Exact next action** (only if a standing, owner-reachable staging URL
  is wanted beyond this packet's local proof): owner provisions a
  Northflank staging service + staging Postgres/Neon database + Cloudflare
  Pages preview environment per the pre-existing
  `docs/deployment/R9_2_STAGING_ENVIRONMENT_MATRIX.md`, and supplies the
  Northflank API key/service ID for that staging service so a future
  packet can deploy and smoke-test it the same way production is deployed.
  Otherwise, the remaining Pakistan blocker is unchanged:
  `BANK_ALFALAH_FINAL_PRODUCTION_INTEGRATION`.

### R9.5-P5U-PERSISTENT-REMOTE-STAGING (2026-08-11)

This section is additive; every rule above it remains in force verbatim.
**`REMOTE_STAGING_INFRA_BLOCKED`.** No infrastructure was created; no
product code was touched.

- A read-only audit workflow (`.github/workflows/staging-infra-audit.yml`,
  `workflow_dispatch`-only, `contents: read`, never mutates anything) was
  added and dispatched to check for reusable existing staging
  infrastructure before creating anything new, per this packet's own
  "do not duplicate infrastructure" rule.
- **Northflank**: exactly one project (`ai-photo-studio`) and one service
  (`ai-photo-studio`, `serviceType: combined`) exist -- that is production.
  No staging service exists to reuse.
- **Neon**: the `NEON_API_KEY` GitHub secret returns real HTTP 401
  (`"supplied credentials do not pass authentication"`) against the real
  Neon API -- it cannot create or manage a staging branch. (This repo's
  existing migration workflows never previously exercised this key; they
  only ever used `NEON_DIRECT_URL`/`NEON_DATABASE_URL`/`NEON_POOLER_URL` as
  raw connection strings, so this is the first time it was actually
  tested.)
- Creating a brand-new billable Northflank service by improvising
  image/port/domain/plan configuration against an unverified-for-writes API
  key was judged too consequential/hard-to-reverse to attempt without
  explicit owner sign-off on the specific shape and cost -- stopped and
  reported rather than guessed, per this packet's own STOP protocol.
- **Owner action needed to unblock**: either supply a working
  `NEON_API_KEY` with branch-create permission (or a pre-created staging
  branch's connection string as a new secret), and/or explicitly authorize
  creating a new Northflank staging service (plan/size/budget).

### R9.5-P5V-PAKISTAN-COMMERCE-UX-CLOSURE (2026-08-11)

This section is additive; every rule above it remains in force verbatim.
**`PAKISTAN_CUSTOMER_UX_READY` + `LOCAL_FULL_TEST_PAYMENT_JOURNEY_READY` +
`ZERO_REGRESSION`.** Branch `release/r9.5-pakistan-ux`, no production
deploy this packet.

- **Image aspect ratio, root cause and fix.** `OriginalPreviewPage.tsx`'s
  `<img>` had no `object-fit`/`max-height` at all (`FixedOrderReviewPage`
  and `CartPreviewPage` already had the correct pattern, but the primary
  single-image Preview page -- the very first thing a customer sees after
  upload -- did not). A very tall portrait image forced an oversized,
  mostly-empty card; nothing was actually stretched/squashed (no fixed
  width+height together), but layout was still wrong. Fixed to
  `maxWidth: 100%, maxHeight: 480px, objectFit: contain, margin: 0 auto`,
  matching the already-proven pattern elsewhere. Verified with real
  generated 3000×800 (landscape) and 800×3000 (portrait) PNGs at 1440×900
  and 390×844: zero horizontal overflow in all 4 combinations, portrait no
  longer forces empty vertical space, landscape fills card width with
  correct proportions, no distortion in either case (screenshots captured
  during this packet).
- **Metadata deduplication.** The "Technical metadata" expandable panel
  used to repeat dimensions/format already shown in the main list; now
  shows only genuinely additional detail (market/currency).
- **Final customer wording.** Every customer-facing "restoration
  quality"/"choose restoration" reference is now **"image quality"**/
  "Choose image quality", applied consistently: `DigitalTierSelectPage`
  (single-image) and `CartConfigurePage` (multi-image) headings, radiogroup
  `aria-label`s, review-page summary labels (`FixedOrderReviewPage`,
  `CartReviewPage`), and the Preview page's CTA button
  ("Choose Product & Image Quality", was "Choose Your Restoration"). Tier
  enum names/prices/PriceBook are unchanged.
- **Product-first flow**, both single-image and multi-image configure
  pages: Step 1 is now "Choose product" (Digital Download vs Print +
  Digital — Home Delivery), Step 2 is "Choose image quality" (all 7 tiers)
  -- swapped from the previous quality-first order. Print-only fields
  (size/quantity/recipient/phone/address/city) still only render when
  Print + Digital is selected; the 4x-recommended and Original/2x warning
  banners are unchanged in logic, only reordered beneath the new step 2.
- **Back navigation added on every step that lacked it:** Preview
  page-level "Back to Upload" (renamed from "Choose a different photo" for
  wording consistency with the multi-image flow's existing button of the
  same name); `DigitalTierSelectPage` gained a new "Back to Preview" button
  (previously had no back action at all); `FixedOrderReviewPage` and
  `CartReviewPage` each gained a "Back to Configure" button, shown only
  while `paymentStatus !== "PAID"` (order is immutable after verified PAID,
  so the button is hidden then, not merely disabled). `CartConfigurePage`
  already had "Back to Preview" (P5Q) -- unchanged. No step forces
  re-upload; going back to Configure/Preview reuses the already-created
  drafts/order, never creates a duplicate.
- **Multi-image regression proof, real E2E (not inspection):**
  `test:e2e:commerce-local`'s 3-image mixed cart flow (Photo 1: 2x
  HD/Digital; Photo 2: 4x Ultra HD/Print+Digital/4x6/qty10; Photo 3:
  8x/Print+Digital/5x7/qty5) still passes end-to-end after the reorder --
  Apply-to-All still propagates, the individual override on Photos 2/3
  afterward still works, Photo 1 stays untouched, one order/one payment/one
  delivery charge/3 item-level executions all hold. One test-script defect
  was found and fixed in the process: the harness's "first checked radio"
  assertion assumed quality-radiogroup-first DOM order; since product now
  renders first, it was scoped to the specific `radiogroup` by
  `aria-label` instead of grabbing whichever radiogroup happens to be
  first -- a test-only fix, not a product behavior change.
- **Local protected TEST-payment journey re-confirmed** (single-image
  DIGITAL and PRINT_DIGITAL flows) through the full new product-first UI:
  both reach `PAID` -> `Completed` -> download, unchanged. Production
  continues to correctly refuse the test-payment seam (unaffected by this
  packet -- no backend files were touched, so no live re-check was needed
  or performed).
- **A real, unrelated encoding bug was introduced and fixed within this
  same packet**: a PowerShell `Get-Content -replace | Set-Content -Encoding
  utf8` command (used to bulk-rename a button label in a spec file) mis-
  decoded a pre-existing UTF-8 "×" character elsewhere in the same file as
  CP1252, corrupting it to literal "Ã—" on write. Caught immediately by a
  real test failure (not assumed away), root-caused via byte-level
  inspection, and fixed with a direct, encoding-safe edit; confirmed no
  other occurrence in the file. **Permanent lesson: never use
  `Get-Content`/`Set-Content` for text substitution in a file that may
  contain non-ASCII characters on this Windows/PowerShell 5.1 environment
  -- use the dedicated file-edit tool instead**, which does not round-trip
  through the console's codepage.
- **Zero regression, full evidence:** `npm run lint` (0 errors), `typecheck`,
  `build` all clean; `test:browser -w apps/web` 116/116 (two apparent
  failures were reproduced in isolation and passed cleanly -- both were
  load-related flakes from heavy parallel execution, not real, and the
  suite was re-run clean end-to-end afterward); `test:browser:responsive`
  99/99 (one similar isolated-clean flake, same treatment); full
  `test:e2e:commerce-local` pass after the one test-script fix described
  above. No backend/commerce logic was changed, so pg-race suites were not
  re-run (per this packet's own instruction to skip them when only
  frontend UX changes).
- **Protected Scope held**: no RunPod, no Bank integration work, no real
  Replicate, no production deploy, no PriceBook change (40x60/Triple
  Canvas/delivery all unchanged), no `.gitignore` broadening.
- Remaining external blockers unchanged:
  `BANK_ALFALAH_ACCOUNT_ONBOARDING_PENDING`, `REMOTE_STAGING_INFRA_BLOCKED`
  (P5U).

### R9.5-P5W-AUTHORIZED-UX-PRODUCTION-DEPLOY (2026-08-11)

This section is additive; every rule above it remains in force verbatim.
**`LIVE_PAKISTAN_CUSTOMER_UX_READY` + `ZERO_REGRESSION`.**

- **Diff audit before merge**: `git diff origin/main..d1a4e2b` touched only
  5 customer-facing page files, 2 test specs, 1 E2E harness script, and
  `rules.md` -- zero files under `apps/api/**`, zero Prisma/migration
  files. **`API_DEPLOY_REQUIRED=NO`** by actual runtime diff, decided
  before merging, not guessed.
- **Merged**: PR #159 (`release/r9.5-pakistan-ux` -> `main`), merge commit
  `288ebc295b05c14c7e37d9c4318f3b58cbc0a3ca`.
- **API**: Northflank's git-push auto-deploy fires on every `main` push
  regardless of diff content (platform behavior, not an intentional
  redeploy this packet chose to make) -- confirmed healthy afterward,
  `build_sha` matching exactly, `40x60=PKR 20,000.00`,
  `Triple Canvas=PKR 25,000.00`/delivery `PKR 2,500.00` live-verified
  unchanged, a real 2-item cart order created with correct server total,
  unpaid-order zero-processing reconfirmed.
- **Frontend deploy**: `wrangler pages deploy` to `ai-photo-studio-frontend`,
  deployment `799f9787-9d9e-4ca8-bf79-6e9f30839e58`, Production, source
  `288ebc2`. Rollback target: prior Production deployment `f422d5c8-051d-
  4157-b45d-f009ab471edb` (source `05ddcd8`).
- **Live desktop (1440x900) + mobile (390x844) smoke, real Chromium against
  `www.thannow.com`, both single-image and 3-image journeys, all
  confirmed live (not inferred):** upload modal open/close, Remove +
  reselect, single-Continue (no duplicate upload); landscape (2400x900)
  and portrait (900x2400) generated test images both render at the correct
  aspect ratio with zero horizontal overflow at both viewports; metadata
  (dimensions) shown correctly; product-first order confirmed
  (`"1. Choose product"` renders before `"2. Choose image quality"` in DOM
  order); "Choose image quality" wording confirmed; print fields correctly
  hidden by default and shown only after selecting Print+Digital; Back to
  Preview and Back to Upload both present and functional; Review page
  shows the correct tier/total; payment panel truthfully reads "temporarily
  unavailable" (fail-closed, Bank onboarding still pending); **no TEST-
  payment control present on production** (confirms isolation); zero
  first-party image 404s; zero real console errors (one unrelated,
  unreproducible tracker-style 404 observed once, not an image, not
  functional-path-blocking, consistent with the same non-blocking
  observation recorded in P5S).
- **3-image live regression**: Preview shows all 3, per-image product/
  quality configuration, Apply-to-All propagation, individual override
  after Apply-to-All (Photo 1 stays untouched), two different print sizes
  (4x6/5x7) remain independent, one Review cart, one delivery charge
  (PKR 250.00, the single highest band), zero overflow at both viewports.
- **10-image live check**: 10 accepted, 11th rejected (via a fresh
  11-at-once selection -- the "Add more photos" control only renders below
  the 10-image cap by design, not a defect), Remove and Add-after-Remove
  both confirmed working, zero overflow.
- **Real regression found live and fixed in this same packet (not deferred,
  not silently accepted):** "Back to Configure" from Review remounted
  `CartConfigurePage`/`DigitalTierSelectPage` fresh, resetting every
  per-image product/quality/print-size/quantity/address selection to
  defaults -- directly violating the explicit Back-preserves-state
  requirement (P5V had only tested that the Back *button* worked/
  navigated, not that state survived it). Root-caused (component state is
  local to the page, nothing rehydrates it on remount), fixed with
  same-device-only `sessionStorage` persistence (write on every config/
  address change, restore via lazy `useState` initializers on mount,
  keyed by draft id(s); never sent to the server -- `createFixedOrder`/
  `createRestorationCartOrder` remain fully server-authoritative and
  re-validate everything regardless of what was restored). Verified
  locally (typecheck clean, `test:browser` 116/116, full
  `test:e2e:commerce-local` pass -- one run hit a benign Windows `EBUSY`
  on post-test temp-directory cleanup, unrelated to the fix, with the
  actual flow/DB-assertion JSON already printed successfully both times),
  landed via PR #160 (merge commit
  `d1b818034cf6416b5011b11743f399883fab82ad`), and **redeployed**:
  frontend deployment `0740144d-83d3-43c0-8d3b-2c9d0c403b04` (source
  `d1b8180`), API auto-redeployed to the same SHA and reconfirmed healthy.
  Re-verified live against `www.thannow.com` after redeploy: Back to
  Configure now correctly restores Photo 2 (4x Ultra HD/Print+Digital/
  4x6/qty10), Photo 3 (8x/Print+Digital/5x7/qty5), and the delivery
  address exactly as entered.
- **Final production state**: API `build_sha=d1b818034cf6416b5011b11743f
  399883fab82ad`; frontend deployment `0740144d-83d3-43c0-8d3b-
  2c9d0c403b04` (source `d1b8180`); `www.thannow.com` serving
  `index-DY0EN4_y.js`. Rollback targets recorded above; neither rollback
  was exercised.
- **Protected Scope held**: no RunPod, no Bank integration, no real
  Replicate, no staging infrastructure work, no PriceBook change, no
  homepage/Hero redesign, no `.gitignore` broadening.
- Remaining external blockers unchanged:
  `BANK_ALFALAH_ACCOUNT_ONBOARDING_PENDING`, `REMOTE_STAGING_INFRA_BLOCKED`
  (P5U).

### R9.5-P5X-LIVE-DEVTOOLS-FULL-WEBSITE-AUDIT (2026-08-11)

This section is additive; every rule above it remains in force verbatim.
**`LIVE_FULL_WEBSITE_DEVTOOLS_AUDITED` + `LIVE_SINGLE_MULTI_IMAGE_FLOW_
VERIFIED` + `ZERO_REGRESSION`. No defects found -- no code commit.**

- **Tooling note**: no Chrome DevTools MCP tool is registered in this
  environment (checked via tool search, no match). Used Playwright driving
  real Chromium via CDP against `www.thannow.com`/`api.thannow.com`
  instead -- genuinely live navigation, DOM, console, network, and
  screenshots (the same underlying protocol), not static-bundle/source
  inspection. Disclosed rather than silently substituted, per this
  packet's own instruction.
- **9 public pages/routes audited** against real hrefs (not guessed
  paths): Home (`/`), Pricing (`/pricing`), Restorations (`/restore`),
  Login (`/login`), Sign Up (`/signup`) are real routes, all 200; Restoration/
  Upscaling/Printing/How It Works are same-page anchors (`#memories`/
  `#upscale`/`#printing`/`#how`) by design, all present on the homepage --
  zero dead routes, zero broken links. Every upload/restore CTA checked
  ("Upload Your Photo", "Get Started", "Upload Photo") opens the same
  canonical upload modal.
- **Home page**: zero image 404s, zero console errors, zero horizontal
  overflow at 1440x900/768x1024/390x844 (screenshots captured at all
  three). Login/Sign Up pages confirmed to render real forms.
- **Single-image live flow** (real click-through, `www.thannow.com`):
  modal centered, Remove + reselect works (no duplicate upload), Preview
  shows correct landscape aspect ratio with zero overflow, all 6 metadata
  fields present once (file name/format/dimensions/aspect ratio/
  orientation), product-first order confirmed live ("1. Choose product"
  precedes "2. Choose image quality"), all 7 V3 tiers with correct prices
  (PKR 500/1000/1500/...) present, print fields correctly hidden until
  Print+Digital selected, Back to Preview works AND correctly preserves
  the selected quality (re-verified with a properly-scoped locator after
  an initial script-only false negative), Review shows the correct tier/
  total, payment truthfully fail-closed, no TEST-payment control present.
- **3-image live flow**: 3 thumbnails, individual Remove works, per-image
  metadata present (behind an intentionally-collapsed "Photo details"
  toggle -- verified by expanding it, not a defect), Apply-to-All and
  override-afterward both confirmed live, mixed print sizes (4x6/5x7) stay
  independent, one cart Review, each photo individually summarized, one
  delivery charge (PKR 250.00, the single highest band), server total
  PKR 8000.00 (matches restoration 6000 + print 1750 + delivery 250
  exactly), exactly one Pay button (never per-item), Back to Configure
  correctly retains the full configuration, zero overflow.
- **10-image check**: 10 accepted, 11th rejected, Remove and Add-after-
  Remove both work, zero overflow -- desktop and mobile.
- **Pricing/print catalog, live API**: all 13 PKR print sizes present;
  **40x60 = PKR 20,000.00**, **Triple Canvas = PKR 25,000.00** / delivery
  **PKR 2,500.00** -- confirmed unchanged.
- **Console/network audit, consolidated across every page/flow tested:**
  zero real console errors, zero unexpected first-party 4xx/5xx, zero
  image 404s. Two recurring, pre-existing, non-defect items recorded (not
  hidden): (a) `GET https://api.thannow.com/api/e2e/test-mode` correctly
  404s on every review-page load -- this IS the expected, required
  fail-closed production behavior (no TEST-payment control ever renders
  because of it), not a bug; (b) `[Meta Pixel] - Invalid PixelID: null`
  console warning, pre-existing tracker-bootstrap noise unrelated to
  commerce, documented in earlier packets.
- **Performance quick check** (informational only, no optimization work
  performed per this packet's explicit scope limit): LCP ~3036ms ("needs
  improvement" by Core Web Vitals' <2500ms "good" threshold), CLS = 0
  (no layout shift). Not treated as a defect to fix this packet; worth a
  future dedicated performance packet if prioritized.
- **Defects found: none requiring a code change.** Several apparent
  failures during audit-script development were investigated to ground
  truth (screenshots, expanded DOM state, correctly-scoped locators) and
  in every case traced to the audit script itself -- a CSS `text-
  transform: uppercase` on eyebrow-style headings making `innerText()`
  return uppercase text against lowercase-string checks, an unscoped
  `.first()` checked-radio locator picking the wrong radiogroup (the same
  known class of issue already fixed once in the E2E harness after the
  P5V product-first reorder), and metadata being behind an intentionally-
  collapsed toggle. None were product defects; none required a repair.
- **Regression**: no source code was changed, so no regression suite was
  re-run (per this packet's own "no unnecessary repetition when audit is
  clean and code unchanged" instruction). Most recently completed full
  gate (P5W, same unchanged commit) already stands: lint/typecheck/build
  clean, `test:browser` 116/116, `test:browser:responsive` 99/99, full
  `test:e2e:commerce-local` pass.
- **Protected Scope held**: no RunPod, no Bank integration, no real
  Replicate, no production deploy/change, no PriceBook change, no
  homepage/Hero redesign, no `.gitignore` broadening. `git status` clean
  throughout; zero files changed; no commit.
- Remaining external blockers unchanged:
  `BANK_ALFALAH_ACCOUNT_ONBOARDING_PENDING`, `REMOTE_STAGING_INFRA_BLOCKED`
  (P5U).

### R9.5-P5Y-PAYMENT-DRYRUN-DEVTOOLS-DIAGNOSTIC (2026-08-11)

This section is additive; every rule above it remains in force verbatim.
**`PAYMENT_STOPPING_POINT_PROVEN` + `OWNER_CLICKABLE_FULL_DRYRUN_READY` +
`PRODUCTION_ISOLATION_VERIFIED` + `ZERO_REGRESSION`.**

- **Exact live payment stopping point, real CDP evidence (not inferred):**
  clicking the real, live "Pay 100% & Restore Photo" button on
  `www.thannow.com` sends `POST https://api.thannow.com/api/fixed-orders/
  :orderNo/checkout` and receives **HTTP 503
  `{"code":"PAYMENT_PROVIDER_UNAVAILABLE"}`** -- a genuine Bank Alfalah
  gateway-unavailable response, not a hidden/disabled control. The button
  then permanently reads "Payment unavailable" and `GET .../payment-status`
  correctly returns 404 `"Payment attempt not found"` -- **zero
  `PaymentAttempt` rows are ever created** for an unpaid checkout attempt,
  confirmed by the same request/response trace. `GET /api/fixed-orders/
  :orderNo/restoration-status` also 404s (no `RestorationEntitlement`
  exists). Root-cause classification: **`CHECKOUT_INIT_FAIL`** (real Bank
  Alfalah checkout initiation correctly fails closed because
  `BANK_ALFALAH_MPGS_ENABLED=false` / no production credentials exist yet)
  -- everything downstream (PaymentAttempt, PAID evidence, P4A trigger,
  RestorationEntitlement/Master/`ReplicateExecution`) correctly never
  happens as a direct, fail-closed consequence, exactly as designed.
  Separately, `GET /api/e2e/test-mode` = 404 and the "Complete TEST
  Payment" button never renders (confirmed by DOM state in the same
  trace) -- production's test-payment seam is route-mounted only when
  `NODE_ENV !== "production" && COMMERCE_E2E_TEST_MODE === "true"`, and
  correctly is not on `www.thannow.com`.
- **Owner-clickable protected local dry-run, `npm run commerce:dryrun`
  (new: `scripts/commerce-dryrun.ts`)**. Reuses the exact same disposable-
  stack recipe `test:e2e:commerce-local` already proves (disposable local
  PostgreSQL 17, API with `COMMERCE_E2E_TEST_MODE=true`/
  `RESTORATION_PROVIDER=mock`/`STORAGE_PROVIDER=mock`/`AI_PROVIDER=mock`/
  `BANK_ALFALAH_MPGS_ENABLED=false`, the mock P4B worker, Vite web) but
  opens one **visible** Chromium window to the local home page and stays
  running instead of driving the browser itself and auto-tearing-down --
  refuses `NODE_ENV=production` by the same hard guard. Prints the local
  frontend/API URLs and stays open for a human to click the entire journey
  personally.
- **Full journey re-verified against the launcher's own stack (not
  test:e2e:commerce-local's separate harness -- this exact script, driven
  as an owner would use it):** Digital single-image -- Upload -> Preview
  -> Configure -> Review -> real "Complete TEST Payment" click -> PAID ->
  download link appears; DB: 1 `PaymentAttempt` (`PAID`), 1
  `RestorationEntitlement`, 1 `RestorationMaster` (`VALIDATED`), 1
  `ReplicateExecution` (`SUCCEEDED`). 3-image mixed cart -- same launcher
  instance, one "Complete TEST Payment" click for the whole cart, all 3
  download links appear; DB: 1 `FixedOrder`, **1** `PaymentAttempt` (never
  one per item), 3 `FixedOrderItem`/`RestorationEntitlement`/
  `RestorationMaster` (all `VALIDATED`)/`ReplicateExecution` (all
  `SUCCEEDED`).
- **Two real bugs found and fixed while building/testing this launcher**
  (a genuinely new script, not previously proven): (1) the API's cold
  `tsx` JIT-compile startup sometimes exceeds the original 30s health-check
  timeout on a first run, producing a spurious `FATAL: timeout waiting for
  .../api/health` even though the API subsequently started fine a few
  seconds later (confirmed in the raw log: `"API server started"` logged
  just after the timeout fired) -- fixed by raising the health-check
  timeout to 90s for this interactive, one-shot launcher (not a tight CI
  loop, so the extra patience is free); (2) the fatal-error path
  (`main().catch(...)`) never called `teardown()`, so a startup failure
  left the disposable Postgres process (and its data directory) running
  as a genuine orphan -- reproduced live (a leftover `postgres.exe`
  listening on the disposable port was found and manually cleaned up
  after the first failed run), root-caused, and fixed by hoisting
  `dataDir`/`mockStorageDir` to module scope so the top-level catch
  handler can always tear down whatever was already started.
- **Teardown proven twice, for real, not by code inspection:** (a)
  killing the launcher's own visible Chromium process (simulating the
  owner closing the window) fired the `browser.on("disconnected")` handler
  and produced a clean `"Teardown complete."` log line with exit code 0;
  (b) process/port checks immediately after showed **0** Node processes
  and the disposable Postgres port no longer listening -- zero orphan
  processes, zero leftover state. (Literal Ctrl+C could not be simulated
  through this session's tool interface on Windows -- the standard
  `process.on("SIGINT"/"SIGTERM")` handlers registered early in `main()`
  are the same idiomatic pattern already used elsewhere in this codebase
  and were not separately re-derived.)
- **Production isolation re-verified live after building the launcher**
  (mandatory, not skipped): `api.thannow.com` `build_sha` unchanged
  (`d1b818034cf6416b5011b11743f399883fab82ad` -- nothing was deployed, per
  this packet's explicit "no production deploy" scope), `GET /api/e2e/
  test-mode` = 404, `POST /test-checkout` = 404. The dry-run launcher is a
  local-only dev script; it was never deployed and changes nothing about
  how the production API is built or configured.
- **Bank status**: `BANK_ALFALAH_ACCOUNT_ONBOARDING_PENDING` -- no sandbox
  API call was attempted, no credential was guessed.
- **Zero regression, full evidence:** `npm run lint`/`typecheck`/`build`
  all clean; `test:browser -w apps/web` 116/116; `test:browser:responsive`
  99/99; full `test:e2e:commerce-local` pass. No backend service/route/
  controller code was changed (only a new standalone dev script plus one
  `package.json` script entry), so pg-race suites were not re-run.
- **Protected Scope held**: no RunPod, no real Bank/Replicate call
  attempted, no public production payment bypass added or enabled, no
  `?paid=true`/localStorage/frontend-only paid state, no `.gitignore`
  broadening, no production deploy.
- Remaining external blockers unchanged:
  `BANK_ALFALAH_ACCOUNT_ONBOARDING_PENDING`, `REMOTE_STAGING_INFRA_BLOCKED`
  (P5U).

### R9.5-P5Z-BANK-ALFALAH-INTEGRATION-HANDOFF-READY (2026-08-11)

This section is additive; every rule above it remains in force verbatim.
**`BANK_ALFALAH_INTEGRATION_HANDOFF_READY` + `PAYMENT_TRUST_BOUNDARY_
VERIFIED` + `ZERO_REGRESSION`. Audit + documentation only -- zero code
changes were needed; the integration was already credential-ready.**

- **Which integration this packet covers**: the code-complete Bank
  Alfalah **MPGS (Mastercard Gateway)** integration -- the one this
  packet's own "Create Session -> Hosted Checkout -> callback/status"
  terminology and the live `PAYMENT_PROVIDER_UNAVAILABLE` failure both
  describe. `BANK_ALFALAH_MPGS_ENABLED` defaults `false` and stays `false`
  in production by owner decision (`MPGS_STATUS = "MPGS_COMMERCIAL_HOLD"`,
  enforced by `scripts/verify-payment-freeze.mjs`) -- this packet makes the
  code ready for sandbox credentials, it does **not** reverse that hold or
  authorize reactivation. Separately, the newer **local APG** path
  (`bank-alfalah-apg.controller.ts`/`routes.ts`) is URL-ingress foundation
  only (`/api/payments/bank-alfalah/return`, `/api/payments/bank-alfalah/
  ipn`) -- no session/checkout/status-inquiry protocol exists for it yet,
  `AWAITING_BANK_CONFIRMATION`, out of scope for this packet.
- **Component map** (all pre-existing, verified against source, nothing
  invented):

  | Component | Route/Service | Status |
  |---|---|---|
  | Checkout initiation | `POST /api/fixed-orders/:orderNo/checkout` -> `CustomerCheckoutController.create` -> `CustomerCheckoutService.createCheckout` | READY (code); blocked only on credentials |
  | Create Session | `BankAlfalahMpgsGateway.initiateHostedCheckout` (`POST .../session`, MPGS v100 `INITIATE_CHECKOUT`) | READY |
  | Hosted Checkout redirect | Frontend `window.location.assign` to the returned session's hosted-checkout URL | READY |
  | Return URL | `BANK_ALFALAH_MPGS_RETURN_URL` (server-owned, never client-supplied) | Code READY; value must be set once the bank confirms the exact return-URL registration requirement |
  | Listener/webhook | `handleMpgsWebhookTrigger` exists, fully implemented, but intentionally **not routed anywhere** -- webhook signature/auth format is still undocumented (`MPGS_INTEGRATION_EVIDENCE.md` §9) | Code READY, deliberately unwired |
  | Status inquiry | `GET /api/fixed-orders/:orderNo/payment-status` -> `CustomerCheckoutService.getStatus` -> `handleMpgsBrowserReturn` -> `retrieveOrder` (MPGS Retrieve Order) | READY |
  | Auth | HTTP Basic, `merchant.<Merchant ID>` / API Password, built by `buildMpgsAuthHeader` -- never logged | READY |
  | `PaymentAttempt` | Created in `createCheckout`, one per `FixedOrder` (`idempotencyKey = payment-attempt:<orderId>`, DB-unique) | READY |
  | `PaymentEvent` | Written inside `applyVerifiedPaymentEvidence` (P4A), never anywhere else | READY |
  | PAID verification | `matchRetrievedOrderToAttempt` -- exact merchant/order id/amount/currency/status match against a **fresh** Retrieve Order call; any mismatch or non-PAID status leaves the stored attempt untouched | READY |
  | P4A trigger | `applyVerifiedPaymentEvidence`, called only after an exact match -- never imported directly by any controller/route (statically proven by its own pg-race test) | READY |

- **Exact environment variable names** (repository-actual, none invented;
  never print values): `BANK_ALFALAH_MPGS_ENABLED` (required, kill switch,
  sandbox+production, `config/env.ts`), `BANK_ALFALAH_MPGS_BASE_URL`
  (required when enabled, defaults to the sandbox host
  `https://test-bankalfalah.gateway.mastercard.com`, must be overridden
  for production), `BANK_ALFALAH_MPGS_API_VERSION` (required, defaults
  `"100"`, bank-confirmed for this merchant profile),
  `BANK_ALFALAH_MPGS_MERCHANT_ID` (required when enabled, sandbox+
  production, REST Basic Auth username), `BANK_ALFALAH_MPGS_API_PASSWORD`
  (required when enabled, sandbox+production, secret, REST Basic Auth
  password), `BANK_ALFALAH_MPGS_OPERATOR_ID` (optional, portal-login
  metadata only, never used for REST auth), `BANK_ALFALAH_MPGS_RETURN_URL`
  (required when enabled, server-owned, never client-supplied),
  `BANK_ALFALAH_MPGS_MERCHANT_NAME` (required when enabled, 1-40 chars,
  `interaction.merchant.name`), `BANK_ALFALAH_MPGS_CHECKOUT_MODE`
  (required, only `"hosted_checkout"` is supported). All are consumed
  exclusively in `apps/api/src/config/env.ts` (zod-validated, fail-closed
  at config-load time if `ENABLED=true` and any required field is
  missing/malformed) and `p4c-bank-alfalah-mpgs-gateway.service.ts`.
  **Configuration is already 100% environment-driven -- no source-code
  edit is needed to switch sandbox<->production values**; confirmed by
  reading every reference, no hardcoded merchant ID/password/host exists
  anywhere in the codebase.
- **Exact URLs**: checkout initiation `POST /api/fixed-orders/:orderNo/
  checkout`; status inquiry `GET /api/fixed-orders/:orderNo/payment-
  status`; browser return page `https://www.thannow.com/payment/return`
  (`PaymentReturnPage.tsx` -- reads zero query parameters, always shows
  one truthful fail-closed message, this is the local-APG return page;
  MPGS's own return URL is the separate `BANK_ALFALAH_MPGS_RETURN_URL`
  env value). **Browser return is never trusted payment evidence** by
  construction: no route in this codebase marks a `PaymentAttempt` PAID
  from a GET request, a redirect, or any query parameter -- the only path
  to PAID is `getStatus`'s server-initiated Retrieve Order call.
- **Payment trust boundary, verified with fresh pg-race evidence this
  packet** (not carried over from memory): re-ran
  `p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts` (6/6),
  `customer-checkout.service.pg-race.test.ts` (11/11), and
  `p5p-multi-item-orchestration.pg-race.test.ts` (10/10) against a fresh
  disposable PostgreSQL 17 instance. Confirmed live: forged amount
  rejected and mutates nothing (q3), forged merchant/order id rejected
  (q4), non-owning actor gets an identical not-found error with zero
  gateway calls (q5), duplicate/concurrent `getStatus` converges on
  exactly one paid transition (q6), query-string/body fabrication has
  zero effect on the result (q7), zero external calls when no session
  exists or once already PAID (q8/q9), a forged browser return against a
  PENDING gateway order is never applied, valid matched evidence applies
  PAID exactly once, duplicate verified evidence converges (never a
  second `PaymentEvent`/execution), and a 3-item cart's 10 concurrent
  verified-evidence calls converge on exactly 3 entitlements/masters/
  executions under **one** `PaymentAttempt` (never one per item), with an
  unpaid 3-item order at exactly 0.
- **Current live failure, exact and unchanged since P5Y**: the real Pay
  button's `POST /checkout` returns HTTP 503
  `PAYMENT_PROVIDER_UNAVAILABLE` because `BANK_ALFALAH_MPGS_ENABLED` is
  `false` -- `CustomerCheckoutService.createCheckout` checks this before
  creating any `PaymentAttempt` row or making any network call, so an
  unpaid checkout attempt leaves zero trace. This is the fail-closed
  behavior this packet confirms is correct and ready, not a defect.
- **Dry-run proof**: `npm run commerce:dryrun` (P5Y) already proved the
  full owner-clickable journey -- Digital single-image (1 PaymentAttempt
  PAID, 1 entitlement, 1 master VALIDATED, 1 execution SUCCEEDED) and a
  3-image mixed cart (1 `FixedOrder`, 1 `PaymentAttempt`, 3 items/
  entitlements/masters/executions) -- against the protected mock stack.
  Not re-run this packet since no runtime code changed; the fresh
  pg-race evidence above is the payment-specific re-confirmation.
- **Production safety re-verified live**: `api.thannow.com` `build_sha`
  matches the current deployed commit (`8958527`, from P5Y's dev-tooling
  push -- no functional/payment code changed by it), `GET /api/e2e/
  test-mode` = 404, `POST /test-checkout` = 404. No test mode was
  deployed. Bank real calls this packet: 0. Replicate real calls: 0.
- **Bank Alfalah handoff checklist** (only what code/docs actually
  require, nothing invented): (1) sandbox **Merchant ID**, (2) sandbox
  **API (REST) Password**, (3) confirmed sandbox **host/region** (default
  assumed is `test-bankalfalah.gateway.mastercard.com` -- bank must
  confirm or correct), (4) **Hosted Checkout** enablement on that merchant
  profile, (5) confirmed **API version/path** (currently `100`,
  bank-confirmed per `P4D_BANK_CONFIRMED_MERCHANT_PROFILE_2026-08-05.md`
  -- reconfirm still current), (6) the exact **return-URL registration**
  requirement, if any, on the bank's side, (7) webhook/callback
  authentication format, if the owner wants the webhook path wired
  (currently deliberately unwired; browser-return + status-poll alone is
  sufficient and already fully server-verified). Full historical evidence
  lives in `docs/payments/bank-alfalah-mastercard/` and
  `docs/payments/R9_2_*` -- this section is the concise index, not a
  replacement.
- **When sandbox credentials arrive, the next packet is exactly**: (A)
  load `BANK_ALFALAH_MPGS_MERCHANT_ID`/`_API_PASSWORD`/`_MERCHANT_NAME`/
  `_RETURN_URL` as process-only secrets, never written to source or
  `.env`; (B) verify presence via the existing zod config validation
  (fails closed with a named field if anything is missing -- never print
  values); (C) run a config/preflight check (`BANK_ALFALAH_MPGS_ENABLED=
  true` in a disposable/local context only, confirm no zod error); (D)
  create one safe sandbox `FixedOrder`; (E) `initiateHostedCheckout`
  against the real sandbox; (F) open the real Hosted Checkout page; (G)
  verify the browser return lands correctly (still untrusted); (H) call
  `getStatus` to perform the real, server-side Retrieve Order
  verification; (I) confirm `PaymentAttempt.status = PAID`; (J) let the
  existing mock-provider dry-run stack (`RESTORATION_PROVIDER=mock`, this
  packet's `commerce:dryrun` or `test:e2e:commerce-local`) handle
  zero-charge processing -- **no real Replicate call** until the Bank
  flow itself is trusted end-to-end; (K) confirm Result/Download. No
  production activation is implied by any of the above without a
  separate, explicit owner authorization.
- **Protected Scope held**: no RunPod, no real Bank/Replicate call, no
  credential guessed or invented, no PriceBook change, no new UX, no
  staging infrastructure work, no `.gitignore` broadening, no production
  deploy.
- Remaining external blocker: `BANK_ALFALAH_ACCOUNT_ONBOARDING_PENDING`.
  Per this packet's own instruction: **stop coding until Bank sandbox
  credentials arrive.**

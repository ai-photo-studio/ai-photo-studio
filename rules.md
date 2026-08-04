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

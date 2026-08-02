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

## Architecture

## Restoration Change Rules

Before restoration, payment, entitlement, download, provider, or UI-flow work, read `docs/restoration/RESTORATION_SYSTEM.md`, `docs/restoration/DECISIONS_AND_HISTORY.md`, and `docs/restoration/AGENT_RUNBOOK.md`. Compare requests to documented architecture; report conflicts before editing. Update relevant restoration documentation in the same commit when behavior changes.

Never silently replace Standard restoration. Premium Reconstruction is separate. `UnifiedLocalRestorationProvider` must never be selected for production. Do not process paid providers or expose processed previews before confirmed payment. Severe damage may offer Premium only. Only verified purchased tiers download; higher resolution and print require entitlement. No paid provider call without explicit authorization.

After every change: test, repair, and retest. Overwrite `AI_code_audit_report_RI.md` every run; keep it ignored once in `.gitignore`.

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
- Replicate remains the active production fallback.
- RunPod A4000 Serverless is approved only for development, local dry runs, offline benchmarks, and future canaries. RunPod production routing is prohibited until a benchmark passes and separate activation approval is recorded. No always-on Northflank CPU service is approved for development.
- Local Windows CPU testing is approved for YuNet and SFace. Development RunPod Flex workers: active workers 0, maximum Flex workers 1.
- No remote RunPod call without an explicit per-run budget. Never display, log, copy, or commit `RUNPOD_API_KEY`; workflows may reference only the existing secret.

### Payments
- Manual proof mode (demo/free during development)
- Original upload preview may appear before payment. Processed previews and provider processing require confirmed payment. Severe/torn images may offer Premium only. Download, upscale, and print each require verified purchased entitlement.

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

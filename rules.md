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

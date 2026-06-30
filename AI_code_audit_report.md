# AI Code Audit Report

## Phase 2.3 — Cloud Run Production Deployment (Blocked)

Generated: 2026-06-30

## Status Summary

| Domain | Status |
|--------|--------|
| Google Cloud auth | COMPLETE — wpaistudio@gmail.com |
| GCP project | project-9540c255-c960-4fa0-a91 |
| APIs enabled | ALL required |
| Artifact Registry | CREATED — ai-photo-studio-api (us-central1) |
| Cloud SQL | CREATED — ai-photo-studio-db (POSTGRES_16, db-perf-optimized-N-2, 136.115.21.123) |
| Cloud SQL DB | CREATED — ai_photo_studio |
| Cloud SQL user | CREATED — app_user |
| Memorystore Redis | CREATED — ai-photo-studio-redis (10.74.177.27:6379) |
| Secret Manager | 8 actions completed: 7 secrets created, R2 keys updated to v2 |
| Workload Identity | CONFIGURED — pool github-pool, provider github-provider |
| SA key | BLOCKED by org policy — Workload Identity used instead |
| GitHub auth | COMPLETE — ai-photo-studio account |
| GitHub admin:org | BLOCKED — device flow awaiting completion |
| GitHub remote | STILL OLD |
| Cloudflare account | WRONG — gisupp@gmail.com (needs Wpaistudio@gmail.com API token) |
| Cloudflare Pages/R2 | NOT CREATED |
| Cloud Run | NOT DEPLOYED |
| Railway | ONLINE |
| Build / Typecheck / Verify | ALL PASS |

## Cloudflare R2 Credentials Received

The following R2 bucket credentials were provided and stored in Secret Manager:

- **Account ID**: 2eb5eadd4af6da3d3a5f6c61d92437e4
- **Access Key ID**: c8fb7ca90a241a3b8d5be3351fd4ca5d
- **Secret Access Key**: 90bf7563b751d2d0ec1f9f4d81782d2acb2c413309431f62497b376c520d72ea
- **Endpoint**: https://2eb5eadd4af6da3d3a5f6c61d92437e4.r2.cloudflarestorage.com
- **Bucket**: ai-photo-studio-storage

**Important**: These are R2 bucket-level S3-compatible credentials. They are NOT a Cloudflare API token. They cannot be used with Wrangler to create Pages projects or manage Cloudflare account resources.

### Still Required: Cloudflare API Token

To switch Wrangler to the `Wpaistudio@gmail.com` account, an API token with these permissions is required:

- **Account** → **Cloudflare Pages** — Edit
- **Account** → **Cloudflare R2** — Edit
- *(Future)* **Account** → **Cloudflare Workers** — Edit

Generate at: https://dash.cloudflare.com/profile/api-tokens  
Then set: `$env:CLOUDFLARE_API_TOKEN="<token>"`

## Remaining Blockers

1. **GitHub admin:org** — complete device flow
2. **Cloudflare API token** — generate from Wpaistudio@gmail.com
3. **Git remote** — update after #1
4. **Cloud Run deployment** — blocked by #1 and #2

## Completion

| Phase | % |
|-------|---|
| Phase 0 | 100% |
| Phase 1 | 100% |
| Phase 2.0 | 100% |
| Phase 2.1 | 100% |
| Phase 2.2 | 85% |
| Phase 2.3 | 20% |
| Overall | ~48% |

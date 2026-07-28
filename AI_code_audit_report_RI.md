# AI Code Audit Report RI

## Architecture

```
GitHub (main branch push)
  │
  ├─ npm ci
  ├─ npx prisma generate
  ├─ npm run build (tsc)
  ├─ docker build → ghcr.io/ai-photo-studio/ai-photo-studio/api
  │
  └─ northflank/deploy-to-northflank action
       │
       └─ Northflank pulls image from GHCR → deploys
            │
            ├─ Health check: api.thannow.com/api/health
            ├─ SHA verification
            └─ E2E M1.jpg test (validate-restoration.yml)
```

## Files Changed

| File | Change |
|------|--------|
| `.github/workflows/deploy.yml` | Replaced: build (npm ci + tsc) → Docker push to GHCR → deploy via `northflank/deploy-to-northflank` → verify API health + SHA |
| `.github/workflows/validate-restoration.yml` | Replaced RunPod validation with E2E test: create M1.jpg → upload → process → poll COMPLETED |
| `Dockerfile` | Changed `npm install` to `npm ci` for deterministic, fast builds. Uses `--include=dev` for tsc, then `--omit=dev` |

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `NORTHFLANK_API_KEY` | Northflank API token (the one provided) |
| `NORTHFLANK_CREDENTIALS_ID` | Credentials ID for GHCR pull access (set in Northflank Dashboard → Credentials) |

## Deploy Flow

1. Push to `main` → GitHub Actions triggers `deploy.yml`
2. `build-and-push` job: `npm ci` → `prisma generate` → `tsc` → `docker build` → `docker push` to `ghcr.io/ai-photo-studio/ai-photo-studio/api`
3. `deploy` job: `northflank/deploy-to-northflank` — triggers Northflank to pull from GHCR and deploy
4. `verify` job: polls `api.thannow.com/api/health` until 200, then checks deployed SHA
5. After deploy succeeds, `validate-restoration.yml` runs E2E: creates M1.jpg → uploads → processes → verifies COMPLETED

## Current Status

- **API**: UP at `api.thannow.com` (SHA `278a14f7`)
- **GitHub Actions**: Ready — secrets need to be configured in GitHub repo Settings → Secrets and Variables → Actions
- **Northflank deploy action**: Requires `northflank/deploy-to-northflank@v1` which reads `northflank-api-key`, `project-id: ai-photo-studio`, `service-id: ai-photo-studio`, `image-path`, `credentials-id`
- **Build bypass**: GitHub Actions builds the Docker image (works reliably), Northflank only pulls the pre-built image (skips the broken npm install step)

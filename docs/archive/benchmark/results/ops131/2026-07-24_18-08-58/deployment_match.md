# Deployment Match — OPS-131

**Date:** 2026-07-24

## Part E — Deployment Verification

### Git State

| Property | Value |
|----------|-------|
| HEAD SHA | `ef31234ef8c2fee4854c43a29e8f659164447044` |
| HEAD Message | `OPS-130 production infrastructure forensic - prove Cloud Run is production, fix admin + packages` |
| origin/main | `ef31234` (synced) |
| Working tree | Modified: `.env.project.example`, `apps/api/package.json`, `package-lock.json` |

### Cloud Run

| Property | Value |
|----------|-------|
| Service name | `ai-photo-studio-api` |
| Region | `us-central1` |
| Project | `project-9540c255-c960-4fa0-a91` |
| Latest ready revision | `ai-photo-studio-api-00097-29z` |
| Image digest | `cache.us-docker.pkg.dev/ghcr.io/ai-photo-studio/ai-photo-studio/ai-api@sha256:dc9fc4336a0cded7b96ad8d1da8547bb36303a7867565189e4072565d74c9922` |
| Created | `2026-07-24T11:26:53Z` |
| Serving 100% traffic | ✅ |
| Health endpoint | ✅ `200 OK` (0.97s TTFB) |

### Cloudflare Pages

| Property | Value |
|----------|-------|
| Project | `ai-photo-studio-frontend` |
| Latest deployment ID | `26625e6b-0f40-4294-944e-447b4b230037` |
| Source commit | `204a926` |
| URL | `https://26625e6b.ai-photo-studio-frontend.pages.dev` |
| Deployed | 2 hours ago |

### Deployment Mismatch

**Frontend is 2 commits behind HEAD.**

| Commit | Deployed? |
|--------|-----------|
| `204a926` (OPS-129 fix Dockerfile) | ✅ Latest Cloudflare Pages |
| `746dc31` (OPS-129 Northflank recovery) | ❌ Not deployed |
| `ef31234` (OPS-130 forensic) | ❌ Not deployed |

Cloud Run was deployed today matching `204a926` era but the actual current commit is `ef31234` with OPS-130 changes. The difference between `204a926` and `ef31234` is:
- New benchmark report files only (no code changes)
- Updated `AI_code_audit_report_RI.md` and `apipln.md`

### Deploy Pipeline

- **Cloud Run**: `cloudbuild.yaml` → Builds from Dockerfile → Pushes to Artifact Registry → Deploys via `gcloud run deploy`
- **Cloudflare Pages**: Wrangler integration via GitHub → Builds with `npm run build` → Deploys to `ai-photo-studio-frontend.pages.dev`

### Classification

**Cloud Run: VERIFIED** — Running, serving 100% traffic, revision `ai-photo-studio-api-00097-29z`, image digest confirmed.

**Cloudflare Pages: FAILED** — Latest deployment is on commit `204a926`, 2 commits behind HEAD. No GitHub Actions or Wrangler CI/CD deployment triggered for `ef31234`.

**Frontend/Backend match: FAILED** — Frontend (`204a926`) and backend (`204a926` era) are loosely matched but 2 commits behind current main.

# Deployment Architecture — OPS-135

**Date:** 2026-07-24

## Actual Production Path

```
User Browser
    │
    ├─ https://www.thannow.com (frontend)
    │   └── Cloudflare (PROXIED — orange cloud)
    │       ├── SSL/TLS termination
    │       ├── HTTP/3 (alt-svc)
    │       ├── Cache (DYNAMIC)
    │       └── Cloudflare Pages (ai-photo-studio-frontend)
    │           └── Static SPA (React + Vite)
    │
    └─ https://api.thannow.com (API)
        └── Cloudflare DNS ONLY (grey cloud — NOT proxied)
            └── CNAME → ghs.googlehosted.com
                └── Google Front End (GFE)
                    └── Google Cloud Run (ai-photo-studio-api)
                        ├── Revision 00098-dpf (100% traffic)
                        ├── Image: latest@sha256:1f311861...
                        ├── CPU: 1, Memory: 1Gi
                        ├── Min instances: 1, Max: 10
                        └── Express.js
                            ├── PostgreSQL (Neon/Cloud SQL)
                            ├── Redis (Upstash)
                            └── R2 (Cloudflare)
```

## Deployment Pipelines

### Backend (Google Cloud Run)
```
Git Push to main
    │
    ├── GitHub Actions (deploy.yml)
    │   ├── verify (typecheck + lint)
    │   ├── build-and-deploy-api (Docker → Artifact Registry → Cloud Run)
    │   └── post-deploy-verify (health check)
    │
    └── Cloud Build (cloudbuild.yaml — direct gcloud submit)
        └── Docker build → push → gcloud run deploy
```

### Frontend (Cloudflare Pages)
```
Git Push to main
    │
    └── GitHub Actions (deploy.yml → deploy-frontend)
        └── wrangler pages deploy → Cloudflare Pages
```

## Removed Platforms

| Platform | Status | Evidence |
|----------|--------|----------|
| Northflank | ❌ REMOVED | DNS never resolved. Config was aspirational only. |
| Railway | ❌ REMOVED (previous ops) | Legacy. Not referenced by any current config. |

## Classification

**Deployment Architecture: VERIFIED** — Google Cloud Run is the only production backend.

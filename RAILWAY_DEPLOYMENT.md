# Railway Deployment

> **RETIRED — historical reference only; not an active deploy or rollback target.**
> Current production deployment (see `rules.md`, the authoritative architecture record): frontend on Cloudflare Pages, API on Northflank at `api.thannow.com`. Railway is no longer in use. The remainder of this document is preserved unmodified as historical evidence of a prior deployment path; do not follow it for a current or rollback deployment.

This repository now targets the Phase 1 production deployment path (superseded — see notice above):

`Cloudflare Pages -> Railway API -> Neon PostgreSQL -> Redis -> Cloudflare R2 -> Replicate`

## Required Environment Variables

Set these in Railway for the API service:

- `DATABASE_URL`
- `REDIS_URL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL`
- `REPLICATE_API_TOKEN`
- `REPLICATE_RESTORATION_MODEL_SLUG`
- `REPLICATE_RESTORATION_MODEL_VERSION` if available
- `REPLICATE_BACKGROUND_REMOVAL_MODEL_SLUG`
- `REPLICATE_BACKGROUND_REMOVAL_MODEL_VERSION` if available
- `JWT_SECRET`
- `ADMIN_JWT_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `PAYMENT_GATEWAY_NAME`
- `PAYMENT_GATEWAY_BASE_URL`
- `PAYMENT_GATEWAY_SECRET`
- `ALLOWED_ORIGINS`
- `NODE_ENV=production`
- `PORT=8080`

Verification required if any of the model identifiers are still unset in Railway.

## Build Command

Recommended Railway build command:

```bash
npm ci && npm run build -w apps/api && npm run build -w apps/web
```

## Start Command

Recommended Railway start command:

```bash
node apps/api/dist/index.js
```

If the Railway deployment uses the root `Dockerfile`, the container should start with:

```bash
node dist/index.js
```

## Health Endpoint

- `GET /api/health`

Expected response:

- HTTP 200
- JSON payload with `success: true`

## Railway Services

Recommended service split:

- `api` for the Express backend
- `web` for the Cloudflare Pages frontend or separate static deployment target

For the API service:

- Connect to Neon PostgreSQL through `DATABASE_URL`
- Connect to Redis through `REDIS_URL`
- Use Cloudflare R2 for uploads and downloads
- Use Replicate for all Phase 1 AI processing
- Creative studio and legacy provider catalogs are outside the Phase 1 launch surface

## Neon

- Use Neon as the only production PostgreSQL provider
- Prefer pooled connection strings for runtime
- Keep direct connection string available for migrations if needed

## Redis

- Use the chosen production Redis provider for BullMQ
- Confirm the runtime connection string works before enabling background workers

## Cloudflare R2

- Store originals, previews, processed results, and downloads in R2
- Confirm signed URL generation works in production

## Replicate

- Use Replicate as the only Phase 1 AI provider
- Restoration and background removal model identifiers must come from centralized config
- Verify token, model slug, and version configuration at startup

## Post-Deployment Verification Checklist

- Confirm `GET /api/health` returns 200
- Confirm startup logs show config validation passed
- Confirm `DATABASE_URL` points to Neon
- Confirm `REDIS_URL` points to the chosen Redis provider
- Confirm R2 uploads and downloads succeed
- Confirm Replicate token is accepted by startup validation
- Confirm restoration model slug is configured
- Confirm background-removal model slug is configured
- Confirm `/api/version` reports production environment
- Confirm no production path references Cloud Run, Cloud Build, or GCP
- Confirm frontend can reach the Railway API from Cloudflare Pages
- Confirm creative studio routes remain disabled or postponed for Phase 1 launch

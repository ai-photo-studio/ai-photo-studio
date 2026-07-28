# Railway Rollback Package

**Status:** ROLLBACK ONLY - Do not deploy

## Production URLs (Current)

| Service | URL |
|---------|-----|
| Cloud Run API | https://ai-photo-studio-api-108335160641.us-central1.run.app |
| Cloudflare Pages | https://29105fb4.ai-photo-studio-frontend.pages.dev |
| Cloud SQL | ai-photo-studio-db |
| Redis | ai-photo-studio-redis |
| R2 Storage | ai-photo-studio-storage |

## Railway Configuration (Archived)

### Project Details
- **Project ID**: ad62f340-fcfd-4989-b5bb-18753b28d8c8
- **Project Name**: AI Photo Studio WhatsApp
- **Environment**: production
- **Environment ID**: 13228f5e-8af5-4f5e-b57e-b1dfccd567ec
- **Service**: api

### Required Services
- api
- postgres
- redis

## Rollback Instructions

To rollback to Railway (if needed):

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Authenticate:
   ```bash
   railway login
   ```

3. Link to project:
   ```bash
   railway link ad62f340-fcfd-4989-b5bb-18753b28d8c8
   ```

4. Deploy:
   ```bash
   railway up
   ```

## Current State

- Railway production deployments are **DISABLED**
- All traffic is routed to Cloud Run/Cloudflare
- Railway resources are preserved for emergency rollback

## Environment Variables

The following environment variables were used in Railway:
- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- ADMIN_JWT_SECRET
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- etc.

See `.env.railway.production.example` for the full list.

---
**Archived**: 2026-07-01
**Reason**: Migration to Google Cloud Run completed successfully
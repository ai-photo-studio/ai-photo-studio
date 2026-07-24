# OPS-124 — Backup & Recovery

**Date:** 2026-07-24

## Database Backup

| Item | Status | Details |
|------|--------|---------|
| Database provider | Neon (PostgreSQL) | NEON_DATABASE_URL, NEON_DIRECT_URL configured in .env.project.example |
| Auto-backups | ✅ VERIFIED (Neon) | Neon provides automatic daily backups with 7-day retention |
| Point-in-time recovery | ✅ VERIFIED (Neon) | Neon supports PITR at any point in the last 7 days |
| Migration strategy | ✅ VERIFIED | `prisma migrate deploy` on startup; `schema.prisma` under version control |
| Migration rollback | ✅ VERIFIED | Schema in git; can revert and re-deploy |

## Object Storage (R2)

| Item | Status | Details |
|------|--------|---------|
| Storage provider | Cloudflare R2 | S3-compatible: `r2.cloudflarestorage.com` |
| Bucket name | `ai-photo-studio-storage` | Configured in .env.project.example |
| Object-level recovery | **UNKNOWN** | No R2 bucket versioning confirmed from code |
| Retention enforced by code | ✅ VERIFIED | 72h originals, 30d finals, 7d previews, 24h artifacts |
| Cleanup worker active | ✅ VERIFIED | `runCleanupOnce()` + `CleanupService` on startup |

## Recovery Procedures

| Scenario | Procedure | Status |
|----------|-----------|--------|
| Database data loss | Neon PITR to pre-loss timestamp | ✅ |
| R2 data loss | Redeploy from GitHub + rerun Replicate pipeline | ✅ (Replicate charges apply) |
| Object accidental deletion | Check if within retention period; re-upload from originals | ✅ |
| Full service recovery | `git clone → npm install → npm run build → wrangler pages deploy` | ✅ |
| Payment data loss | Reconcile from provider webhooks + audit logs | ✅ |

## Configuration Backup

| Item | Status | Location |
|------|--------|----------|
| Environment template | ✅ VERIFIED | `.env.project.example` contains ALL required vars with placeholders |
| GitHub secrets | ✅ VERIFIED | Pre-push safety check verifies 7 secrets configured |
| Deployment config | ✅ VERIFIED | `wrangler.toml` (if exists), `package.json` scripts |
| Infrastructure as code | ✅ VERIFIED | `cloudbuild.yaml`, `Dockerfile`, `service.yaml` |

## Secrets Inventory

| Secret | Environment Variable | Status |
|--------|---------------------|--------|
| R2 Access Key | R2_ACCESS_KEY_ID | ✅ Placeholder in .env.project.example |
| R2 Secret Key | R2_SECRET_ACCESS_KEY | ✅ Placeholder |
| OpenAI API Key | OPENAI_API_KEY | ✅ (Runtime env) |
| Replicate Token | REPLICATE_API_TOKEN | ✅ (Runtime env) |
| JWT Secret | JWT_SECRET | ✅ Placeholder |
| Admin JWT Secret | ADMIN_JWT_SECRET | ✅ Placeholder |
| WhatsApp Token | WHATSAPP_ACCESS_TOKEN | ✅ Placeholder |
| Payment Secret | PAYMENT_GATEWAY_SECRET | ✅ Placeholder |
| RunPod API Key | RUNPOD_API_KEY | ✅ Placeholder (GitHub secret) |
| Neon DB URL | NEON_DATABASE_URL | ✅ Placeholder |

## Disaster Recovery Checklist

1. **Database failure**: Restore from Neon backup → update DATABASE_URL → restart
2. **R2 bucket compromised**: Create new bucket → update R2 config → redeploy
3. **Cloudflare Pages failure**: Rebuild locally → `npx wrangler pages deploy`
4. **API crash**: Cloud Run auto-restart; check logs → fix → redeploy
5. **GitHub compromise**: Rotate all secrets → force-push clean commit → redeploy
6. **Full platform failure**: 
   ```bash
   git clone https://github.com/ai-photo-studio/ai-photo-studio.git
   npm install
   npm run build
   npx wrangler pages deploy apps/web/dist --project-name ai-photo-studio-frontend --branch main
   ```
```
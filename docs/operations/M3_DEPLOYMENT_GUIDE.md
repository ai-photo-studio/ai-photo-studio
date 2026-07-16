# M3 Deployment Guide — Infrastructure Cutover

**Project:** AI Photo Studio WhatsApp  
**Target:** https://www.thannow.com | https://api.thannow.com  
**Status:** Build validated. Infrastructure needs provisioning.

---

## Quick Start

```bash
# 1. Create Cloudflare Account API Token
#    Visit: https://dash.cloudflare.com/profile/api-tokens
#    Permissions: Pages:Edit, R2:Edit, Account:Read, DNS:Edit, Workers:Edit
#    Export: $env:CLOUDFLARE_API_TOKEN = "cfat_..."

# 2. Verify token works
npx wrangler pages project list

# 3. Deploy frontend to Cloudflare Pages
npx wrangler pages deploy apps/web/dist --project-name=ai-photo-studio-frontend --branch=main

# 4. Set all GitHub Secrets (use gh secret set for each — see M3 report section 7)
gh secret set CLOUDFLARE_API_TOKEN --repo ai-photo-studio/ai-photo-studio

# 5. Add thannow.com to Cloudflare → update nameservers
# 6. Create Neon DB → pg_dump from Cloud SQL → import
# 7. Create Upstash Redis
# 8. Create 6 RunPod endpoints
# 9. Deploy API platform

# 10. Final verification
curl https://www.thannow.com
curl https://api.thannow.com/api/health

# 11. Tag and push
git tag v3.0.0-production
git push origin main --tags
```

---

## Cloudflare Token Requirements

Create token at https://dash.cloudflare.com/profile/api-tokens with:

| Permission | Scope | Reason |
|-----------|-------|--------|
| Account > Cloudflare Pages > Edit | Specific account | Deploy frontend |
| Account > R2 > Edit | Specific account | Access storage |
| Account > Account > Read | Specific account | Verify account |
| Zone > DNS > Edit | Specific zone | Manage DNS |
| Zone > Workers > Edit | Specific zone | Deploy API (if using Workers) |

---

## Cloud Run Rollback Reference

Current healthy services (do NOT delete until cutover is verified):

| Service | URL |
|---------|-----|
| API | https://ai-photo-studio-api-mp3arpoi2a-uc.a.run.app |
| Database | postgresql://app_user:***@136.115.21.123:5432/ai_photo_studio |
| Redis | redis://10.74.177.27:6379 |

To restore after cutover failure:
```bash
gcloud run deploy ai-photo-studio-api --image=us-central1-docker.pkg.dev/project-9540c255-c960-4fa0-a91/ai-photo-studio-api/latest --region=us-central1 --project=project-9540c255-c960-4fa0-a91
```

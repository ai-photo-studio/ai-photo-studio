# Northflank Migration — Setup Guide

## Step 1: Create Northflank Account + Project

1. Go to https://app.northflank.com
2. Sign up using **GitHub** (Login with GitHub)
3. Authorize Northflank to access the `ai-photo-studio` organization
4. Click **Create Project**
5. Name: `AI Photo Studio`
6. Click **Create**

## Step 2: Connect Repository

1. In the project, go to **Integrations > GitHub**
2. Click **Install App** on the `ai-photo-studio` organization
3. Select repository: `ai-photo-studio`
4. Click **Install**

## Step 3: Create Service

1. Click **Create Service**
2. Type: **Docker**
3. Source: **GitHub Repository**
4. Repository: `ai-photo-studio/ai-photo-studio`
5. Branch: `main`
6. Dockerfile: Auto-detect (Dockerfile in root)
7. Port: `8080`
8. Click **Create**

## Step 4: Configure Auto Deploy

1. In the service settings:
   - **Auto Deploy** → ON
   - **Deploy on every push to main** → ON
   - **Preview Deployments** → ON (optional, for PR previews)

## Step 5: Set Environment Variables

In service **Environment** tab, add:

### Plain Text Variables
```
NODE_ENV = production
PORT = 8080
ALLOWED_ORIGINS = https://www.thannow.com
AI_PROVIDER = local-rembg
STORAGE_PROVIDER = r2
DELIVERY_MODE = WHATSAPP
PAYMENT_GATEWAY_NAME = manual
RESTORATION_ENDPOINT_URL = 3z633s11yn4n8q
BACKGROUND_API_URL = krovsimtvnr75h
PRODUCT_CLASSIFIER_URL = http://10.0.0.1:8080
R2_ACCOUNT_ID = 2eb5eadd4af6da3d3a5f6c61d92437e4
R2_PUBLIC_BASE_URL = https://2eb5eadd4af6da3d3a5f6c61d92437e4.r2.cloudflarestorage.com
```

### Secrets (one per line)
```
DATABASE_URL = <from GCP Secret Manager>
REDIS_URL = <from GCP Secret Manager>
JWT_SECRET = <from GCP Secret Manager>
ADMIN_JWT_SECRET = <from GCP Secret Manager>
R2_ACCESS_KEY_ID = <from GCP Secret Manager: R2_ACCESS_KEY>
R2_SECRET_ACCESS_KEY = <from GCP Secret Manager: R2_SECRET_KEY>
R2_BUCKET_NAME = <from GCP Secret Manager: R2_BUCKET>
R2_ENDPOINT = <from GCP Secret Manager: R2_ENDPOINT>
WHATSAPP_VERIFY_TOKEN = <from GCP Secret Manager>
WHATSAPP_ACCESS_TOKEN = <from GCP Secret Manager>
WHATSAPP_PHONE_NUMBER_ID = <from GCP Secret Manager>
RUNPOD_API_KEY = <from GCP Secret Manager>
```

> **IMPORTANT**: Get secret values from GCP Secret Manager:
> ```bash
> gcloud secrets versions access latest --secret=DATABASE_URL --project=project-9540c255-c960-4fa0-a91
> ```

## Step 6: Configure Health Check

- **Type:** HTTP
- **Path:** `/api/health`
- **Port:** `8080`
- **Protocol:** HTTP
- **Initial Delay:** 10 seconds
- **Period:** 30 seconds
- **Timeout:** 5 seconds

## Step 7: Configure Autoscaling

- **Min Replicas:** 0 (cold start allowed)
- **Max Replicas:** 3
- **CPU Target:** 60%
- **Memory Target:** 60%

## Step 8: Custom Domain

1. Go to **Domains** tab
2. Click **Add Custom Domain**
3. Domain: `api.thannow.com`
4. Northflank will generate DNS records (CNAME)
5. **DO NOT update DNS at Cloudflare yet** — wait for full testing

## Step 9: Verify Deployment

After Northflank deploys the first build:

1. Check build logs for success
2. Test Northflank-provided URL:
   ```
   curl https://<northflank-service-url>/api/health
   ```
3. Test all endpoints:
   ```
   curl https://<northflank-service-url>/api/version
   curl -X POST https://<northflank-service-url>/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com","password":"test123456"}'
   curl -X POST https://<northflank-service-url>/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com","password":"test123456"}'
   ```

## Step 10: Switch DNS (only after verification)

```bash
# 1. Get Northflank CNAME target from Domains tab
# 2. In Cloudflare dashboard:
#    - Change api.thannow.com from A record to CNAME
#    - CNAME target: <northflank-provided-cname>
#    - Set to DNS only (gray cloud) initially
# 3. Wait for DNS propagation (up to 5 min)
# 4. Verify:
curl https://api.thannow.com/api/health
```

## Step 11: Rollback (if needed)

```bash
# Revert DNS at Cloudflare:
# - Change api.thannow.com back to A record → 104.21.85.25
# - Set to proxied (orange cloud)
# Verify Cloud Run still healthy:
curl https://ai-photo-studio-api-108335160641.us-central1.run.app/api/health
```

## Secret Migration

Copy each secret from GCP to Northflank:

```bash
# Example: Get all secrets from GCP
for secret in DATABASE_URL REDIS_URL JWT_SECRET ADMIN_JWT_SECRET R2_ACCESS_KEY R2_SECRET_KEY R2_BUCKET R2_ENDPOINT WHATSAPP_VERIFY_TOKEN WHATSAPP_ACCESS_TOKEN WHATSAPP_PHONE_NUMBER_ID RUNPOD_API_KEY; do
  echo "--- $secret ---"
  gcloud secrets versions access latest --secret=$secret --project=project-9540c255-c960-4fa0-a91 2>/dev/null
  echo ""
done
```

## Estimated Costs

| Component | Current (GCP) | After (Northflank) |
|-----------|---------------|-------------------|
| API Hosting | ~$15-30/mo (Cloud Run) | ~$25-50/mo (Northflank) |
| GPU Service | ~$648/mo (Cloud Run GPU) | ~$0 (Deleted) |
| Secret Storage | ~$0.78/mo | Included |
| Image Registry | ~$7-15/mo | ~$0 (GHCR only) |
| CI/CD | ~$5-10/mo | ~$0 (GitHub Actions) |
| **Total** | **~$700-730/mo** | **~$50-75/mo** |

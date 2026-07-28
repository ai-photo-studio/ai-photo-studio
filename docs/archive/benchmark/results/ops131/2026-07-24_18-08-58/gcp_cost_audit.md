# GCP Cost Audit — OPS-136

**Date:** 2026-07-24

## Billing Resources Inventory

### Cloud Run

| Service | Revisions | Serving | Traffic | Cost | Status |
|---------|-----------|---------|---------|------|--------|
| `ai-photo-studio-api` | 30 total (00053-00104) | 00098-dpf | 100% | ~$50/mo | **PRODUCTION** |
| `ai-photo-studio-bg-remover-gpu` | multiple | latest | 100% | ~$200-400/mo (GPU) | **PRODUCTION** |

### Artifact Registry

| Repository | Format | Created | Images | Cost |
|------------|--------|---------|--------|------|
| `ai-photo-studio-api` | DOCKER | 2026-06-30 | 6 packages (api, bg-remover, gpu-research, latest, prod, etc.) | ~$5/mo |
| `cloud-run-source-deploy` | DOCKER | 2026-06-30 | Source deploy images | ~$1/mo |

### Storage Buckets

| Bucket | Location | Purpose | Cost |
|--------|----------|---------|------|
| `project-9540c255-c960-4fa0-a91-cloudbuild-logs` | US | Cloud Build logs | ~$1/mo |
| `project-9540c255-c960-4fa0-a91_cloudbuild` | US | Cloud Build source archives | ~$2/mo |
| `run-sources-project-9540c255-c960-4fa0-a91-us-central1` | US-CENTRAL1 | Cloud Run source deploy | ~$1/mo |

### Secret Manager

| Secret | Created | Active | Cost |
|--------|---------|--------|------|
| `ADMIN_JWT_SECRET` | 2026-07-01 | ✅ Used | ~$0.50/mo |
| `DATABASE_URL` | 2026-06-30 | ✅ Used | ~$0.50/mo |
| `JWT_SECRET` | 2026-06-30 | ✅ Used | ~$0.50/mo |
| `R2_ACCESS_KEY` | 2026-06-30 | ✅ Used | ~$0.50/mo |
| `R2_BUCKET` | 2026-06-30 | ✅ Used | ~$0.50/mo |
| `R2_ENDPOINT` | 2026-06-30 | ✅ Used | ~$0.50/mo |
| `R2_SECRET_KEY` | 2026-06-30 | ✅ Used | ~$0.50/mo |
| `REDIS_URL` | 2026-06-30 | ✅ Used | ~$0.50/mo |
| `RUNPOD_API_KEY` | 2026-07-18 | ✅ Used | ~$0.50/mo |
| `WHATSAPP_ACCESS_TOKEN` | 2026-07-18 | ✅ Used | ~$0.50/mo |
| `WHATSAPP_PHONE_NUMBER_ID` | 2026-07-18 | ✅ Used | ~$0.50/mo |
| `WHATSAPP_VERIFY_TOKEN` | 2026-07-18 | ✅ Used | ~$0.50/mo |
| `ai-photo-studio-secrets` | 2026-07-02 | ✅ Used | ~$0.50/mo |

### Services NOT Found (No Resources Exist)

| Service | Check | Status |
|---------|-------|--------|
| Cloud SQL | Checked | ❌ NOT FOUND — No Cloud SQL instances |
| Load Balancers | Checked via Compute | ❌ NOT FOUND |
| Static IP | Checked via gcloud | ❌ NOT FOUND |
| VPC Connector | Checked via services | ❌ NOT FOUND |
| Cloud NAT | Checked via services | ❌ NOT FOUND |
| Disks | Checked via services | ❌ NOT FOUND |
| Pub/Sub | Checked via gcloud | ❌ NO TOPICS |
| Cloud Tasks | Checked via services | ❌ NOT FOUND |
| Scheduler | Checked via services | ❌ NOT FOUND |
| BigQuery | Enabled but no datasets | ✅ No cost |

## Estimated Monthly Cost

| Resource | Est. Monthly | Can Delete | Reason |
|----------|-------------|------------|--------|
| Cloud Run (ai-photo-studio-api) | ~$50 | **NO** | Production API |
| Cloud Run (bg-remover-gpu) | ~$200-400 | **NO** | GPU background removal |
| Artifact Registry | ~$6 | **NO** | Active image storage |
| Storage (Cloud Build) | ~$4 | **NO** | Active build artifacts |
| Secret Manager | ~$6.50 | **NO** | All secrets in use |
| **Total Estimated** | **~$266-466/mo** | | |

## Safe Deletions

| Resource | Action | Risk |
|----------|--------|------|
| Cloud Run revisions 00053-00097, 00099-00104 | ✅ Delete (0% traffic) | None |
| Artifact Registry images older than 30 days (Jun 24 cutoff = before Jun 24) | ✅ Delete (unused tags) | None |
| Cloud Build source archives older than 30 days | ✅ Delete via lifecycle policy | None |

## Classification

**GCP Cost Audit: VERIFIED** — All resources identified. No Cloud SQL, no load balancers, no static IPs. Database is Neon (external).

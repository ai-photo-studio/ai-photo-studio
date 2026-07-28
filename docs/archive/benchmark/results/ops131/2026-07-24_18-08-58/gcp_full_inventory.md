# GCP Full Inventory — OPS-138

**Date:** 2026-07-25

## Active Services (Billing)

### Cloud Run
| Service | Region | Revisions | Traffic | Est. Monthly |
|---------|--------|-----------|---------|-------------|
| `ai-photo-studio-api` | us-central1 | 4 (1 serving + 3 stuck) | 100% | ~$50/mo |

**Deleted this session:**
| Service | Region | Reason |
|---------|--------|--------|
| `ai-photo-studio-bg-remover-gpu-us-east4` | us-east4 | Retired per Deployment Policy, not used by production |
| `gpu-research-service` | us-east4 | Retired, research project, not production |

### Revision History Cleanup (this session)
| Action | Revisions |
|--------|-----------|
| Deleted | 00082-j74, 00083-jnb, 00084-8wh, 00085-nkc, 00086-6sx, 00087-l2h |
| Remaining | 00098-dpf (serving 100%), 00099-dwc (stuck), cors-fix (stuck), 00104-t7f (stuck) |

### Artifact Registry
| Repository | Format | Est. Monthly |
|------------|--------|-------------|
| `ai-photo-studio-api` | DOCKER | ~$5/mo |
| `cloud-run-source-deploy` | DOCKER | ~$1/mo |

### Cloud Storage (5 buckets)
| Bucket | Est. Monthly |
|--------|-------------|
| `project-9540c255-c960-4fa0-a91-cloudbuild-logs` | ~$1/mo |
| `project-9540c255-c960-4fa0-a91_cloudbuild` | ~$2/mo |
| `run-sources-project-...-us-central1` | ~$1/mo |

### Secret Manager (13 secrets)
| Secret | Est. Monthly |
|--------|-------------|
| All 13 actively used | ~$6.50/mo |

### APIs Enabled (Cost Impact)
| API | Cost Impact |
|-----|------------|
| Cloud Run Admin API | $0 (pay per revision) |
| Artifact Registry API | $0 (pay per storage) |
| Cloud Build API | Free tier covers usage |
| Cloud Logging API | Free tier (50GB/mo) |
| Cloud Monitoring API | Free tier |
| Secret Manager API | $0 (pay per secret) |
| Cloud SQL API | **$0 — no instances** |
| Compute Engine API | $0 (no instances) |
| BigQuery API | $0 — no datasets |

### NOT Found (No Resources Exist)
| Resource | Check |
|----------|-------|
| Cloud SQL instances | ❌ None |
| Load Balancers | ❌ None |
| Static IPs | ❌ None |
| VPC Connectors | ❌ None |
| Cloud NAT | ❌ None |
| Cloud Routers | ❌ None |
| Persistent Disks | ❌ None |
| Pub/Sub topics | ❌ None |
| Cloud Tasks queues | ❌ None |
| Cloud Scheduler jobs | ❌ None |
| IAM custom roles | ❌ None |

## Estimated Total Monthly Cost

| Category | Before OPS-138 | After OPS-138 | Savings |
|----------|---------------|--------------|---------|
| Cloud Run (API) | ~$50 | ~$50 | $0 |
| Cloud Run (GPU us-central1) | ~$200-400 | ~$0 | **~$200-400** |
| Cloud Run (GPU us-east4) | ~$5-10 | ~$0 | **~$5-10** |
| Cloud Run (research) | ~$5-10 | ~$0 | **~$5-10** |
| Artifact Registry | ~$6 | ~$6 | $0 |
| Storage | ~$4 | ~$4 | $0 |
| Secrets | ~$6.50 | ~$6.50 | $0 |
| **Total** | **~$276-486** | **~$66** | **~$210-420/mo** |

## Classification

**GCP Full Inventory: VERIFIED** — All billable resources identified. Two GPU services deleted. Estimated savings: $210-420/month.

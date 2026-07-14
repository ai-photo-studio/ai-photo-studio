# Cleanup Phase 2 — Medium Risk, Rollback Required, Maintenance Window

**Project:** project-9540c255-c960-4fa0-a91
**Generated:** 2026-07-13

> These actions change runtime behavior of PRODUCTION services. They require:
> 1. A verified cold-start measurement (currently NOT available — Monitoring metric APIs timed out during audit).
> 2. A maintenance window or staged rollout.
> 3. Rollback command ready before execution.

---

## 1. CLOUD RUN minScale OPTIMIZATION (verified config)

| Service | Region | Current minScale | CPU always allocated? | GPU? | Recommendation |
|---|---|---|---|---|---|
| ai-photo-studio-api | us-central1 | 1 | startup-cpu-boost=true (not always-on) | No | KEEP minScale=1 (core API, latency-sensitive) |
| ai-photo-studio-bg-remover | us-central1 | 1 | unknown | No | KEEP minScale=1 (core path) |
| ai-photo-studio-bg-remover-gpu | us-central1 | 1 | cpu-throttling=FALSE (CPU always on) | Yes | KEEP minScale=1 (GPU model cache) |
| ai-photo-studio-bg-remover-gpu-us-east4 | us-east4 | 1 | unknown | Yes | KEEP minScale=1 (GPU model cache) |
| ai-photo-studio-real-esrgan | us-central1 | 1 | unknown | No | REVIEW → candidate minScale=0 |
| ai-photo-studio-yolo-detector | us-central1 | 1 | unknown | No | REVIEW → candidate minScale=0 |
| gpu-research-sam2 | us-central1 | 0 | — | Yes | Already 0 — KEEP |
| gpu-research-service | us-east4 | 0 | — | Yes | Already 0 — KEEP |

### Justification
- `gpu-research-sam2` and `gpu-research-service` already run with `minScale=0` and serve 100% traffic → proves
  scale-to-zero works for GPU services in this project.
- CPU-only microservices (`real-esrgan`, `yolo-detector`) are candidates for `minScale=0` IF cold start is
  acceptable. **Cold-start latency was not measurable during this audit** (Monitoring API timeouts), so this
  remains a REVIEW item, not an auto-action.

### Required verification before changing minScale
```bash
# Measure p95 cold-start latency after a scale-to-zero event
gcloud logging read 'resource.type="cloud_run_revision" AND "Startup complete"' \
  --project=project-9540c255-c960-4fa0-a91 --freshness=7d
```

---

## 2. CLOUD SQL OPTIMIZATION (verified config)

| Property | Value |
|---|---|
| Instance | ai-photo-studio-db |
| Tier | db-perf-optimized-N-2 (ENTERPRISE_PLUS) |
| Activation policy | ALWAYS |
| Storage | 10 GB PD_SSD, auto-resize ON |
| Backups | Enabled, 15 retained, PITR enabled |
| Public IP | Enabled, requireSsl=FALSE (security note) |
| Data cache | Enabled |

### Options (medium risk — require maintenance window / staging)
1. **Set activationPolicy=ON_DEMAND** — saves cost when idle, but first connection after idle incurs
   start latency (~1–3 min). Only safe if API/detector services tolerate reconnect delay.
2. **Disable public IP, force SSL** — security hardening. Requires updating connection strings to use
   Cloud SQL Auth Proxy / private IP.
3. **Reduce backup retention** from 15 → e.g. 7 — only after confirming RPO requirements.

> DO NOT delete any database, table, user, or backup. Database content was NOT inspected (no data access
> performed); report only configuration.

---

## 3. ROLLBACK FOR PHASE 2

| Action | Rollback command | Recovery time |
|---|---|---|
| minScale → 0 | `gcloud run services update <svc> --min-instances=1 --region=<r>` | Instant |
| SQL ON_DEMAND | `gcloud sql instances patch ai-photo-studio-db --activation-policy=ALWAYS` | Instant (instance restarts) |
| SQL public IP off | Re-enable via console or `gcloud sql instances patch ... --assign-ip` | Instant |

---

## 4. ACTIONS DEFERRED (insufficient verification)
- Any cost estimate — **billing export not configured** (BigQuery export missing, Billing Budgets API disabled).
- Deletion of any production service, revision, or database record.
- Changes to VPC / firewall (default network with 42 auto-subnets is standard; no custom risk identified).

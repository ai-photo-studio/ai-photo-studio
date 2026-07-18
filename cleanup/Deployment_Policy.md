# Deployment Policy

**Project:** project-9540c255-c960-4fa0-a91
**Effective:** 2026-07-13
**Phase OPS-01A Update:** 2026-07-18 — Production topology registry, retired services documented
**Enforced by:** CI/CD automation + cleanup_phase1.sh after every successful deploy.

---

## 0. PRODUCTION TOPOLOGY REGISTRY

### ACTIVE Services

| Service | Kind | Location | Managed By | Recovery |
|---------|------|----------|------------|----------|
| `ai-photo-studio-api` | Cloud Run | us-central1 | `deploy.yml` | Redeploy via GitHub Actions |
| `unified-restoration` (`3z633s11yn4n8q`) | RunPod serverless | RunPod | `docker-build.yml` verify step | Redeploy via `docker-build.yml` |
| `ai-bg-remover` (`a8htv0u9c7we5a`) | RunPod serverless | RunPod | `docker-build.yml` verify step | Redeploy via `docker-build.yml` |
| `ai-photo-studio-frontend` | Cloudflare Pages | Cloudflare | `deploy.yml` | Redeploy via GitHub Actions |
| `ai-photo-studio-storage` (R2) | Cloudflare R2 | Cloudflare | Manual | Multi-region replication |
| `ai-photo-studio-db` | Cloud SQL (PostgreSQL) | us-central1 | Manual | Point-in-time recovery |
| neon-pooler | Neon PostgreSQL | aws-us-east-1 | Manual | Provision via Neon dashboard |
| upstash-redis | Upstash Redis | us-east-1 | Manual | Provision via Upstash dashboard |
| GitHub Actions CI/CD | GitHub | github.com | Repository config | Re-run failed workflow |

### RETIRED Services

| Service | Kind | Former Location | Retired Reason | Recovery Procedure |
|---------|------|----------------|----------------|-------------------|
| `ai-lama` (`0oqlkj2hjwcacj`) | RunPod endpoint | RunPod | Replaced by unified-restoration | Recreate via `docker-build.yml` (template `frtl10x55s`) |
| `ai-gfpgan` (`00h6fg3oy458ml`) | RunPod endpoint | RunPod | Replaced by unified-restoration | Recreate via `docker-build.yml` (template `rl85g36pc4`) |
| `ai-codeformer` (`gohz91bvs1gvn1`) | RunPod endpoint | RunPod | Replaced by unified-restoration | Recreate via `docker-build.yml` (template `i9zrd1x9tx`) |
| `ai-ddcolor` (`besuyv4w9ndg3l`) | RunPod endpoint | RunPod | Replaced by unified-restoration | Recreate via `docker-build.yml` (template `l1qm5ldu2b`) |
| `ai-real-esrgan` (`do10pbme13b166`) | RunPod endpoint | RunPod | Replaced by unified-restoration | Recreate via `docker-build.yml` (template `7sf3b8kyq9`) |
| `ai-photo-studio-lama` | Cloud Run service | us-central1 | Replaced by unified-restoration | Redeploy from `services/lama/` |
| `ai-photo-studio-gfpgan` | Cloud Run service | us-central1 | Replaced by unified-restoration | Redeploy from `services/gfpgan/` |
| `ai-photo-studio-codeformer` | Cloud Run service | us-central1 | Replaced by unified-restoration | Redeploy from `services/codeformer/` |
| `ai-photo-studio-ddcolor` | Cloud Run service | us-central1 | Replaced by unified-restoration | Redeploy from `services/ddcolor/` |
| `ai-photo-studio-real-esrgan` | Cloud Run service | us-central1 | Replaced by unified-restoration | Redeploy from `services/real-esrgan/` |
| `gpu-research-service` | Cloud Run service | us-east4 | Research project, not production | Redeploy from gpu-research sources |
| `ai-photo-studio-bg-remover-gpu-us-east4` | Cloud Run service | us-east4 | Secondary region, not in use | Redeploy from `services/background-remover/` |

---

## 1. TRAFFIC RULE
- Only the LATEST production-ready revision receives traffic (100%).
- Use a rollout tag (e.g. `gpulatest`) only for canary/staging validation, never for permanent split.

## 2. REVISION RETENTION
- Keep MAXIMUM **2 rollback revisions** per service (serving + 1 previous).
- All older revisions are DELETED automatically after a successful deploy.
- Command (post-deploy hook):
  ```bash
  # keep newest 2 ready revisions, delete rest
  gcloud run revisions list --service=<svc> --region=<r> --sort-by=~creationTimestamp \
    --format="value(name)" | tail -n +3 | xargs -r -n1 \
    gcloud run revisions delete --quiet --region=<r> --project=project-9540c255-c960-4fa0-a91
  ```

## 3. BUILD ARTIFACT RETENTION
- Cloud Build source archives in `gs://..._cloudbuild/source/` expire after **30 days** (lifecycle rule).
- No manual archival of build tarballs.

## 4. DOCKER IMAGE RETENTION
- Untagged / superseded images auto-deleted after successful promotion.
- Keep only digests referenced by active or rollback revisions.

## 5. BUCKET LIFECYCLE
- `project-9540c255-c960-4fa0-a91_cloudbuild`: Delete objects older than 30 days.
- Logs bucket: rely on Cloud Logging retention (30d default / 400d required).

## 6. POST-DEPLOY CLEANUP (MANDATORY)
After every successful deployment run `cleanup_phase1.sh` to:
1. Confirm no FAILED services remain.
2. Trim revisions to ≤2 per service.
3. Confirm build-source lifecycle is active.

## 7. FORBIDDEN
- No accumulation of untagged revisions.
- No indefinite retention of build tarballs.
- No production service deleted without 2-revision rollback preserved.
- No database / customer-data deletion under any cleanup policy.

## 8. VERIFICATION BEFORE DEPLOY
- Cold-start latency measured (p95) before any `minScale=0` change.
- Rollback command prepared and documented before execution.

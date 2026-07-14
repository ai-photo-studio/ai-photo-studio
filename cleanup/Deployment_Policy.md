# Deployment Policy

**Project:** project-9540c255-c960-4fa0-a91
**Effective:** 2026-07-13
**Enforced by:** CI/CD automation + cleanup_phase1.sh after every successful deploy.

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

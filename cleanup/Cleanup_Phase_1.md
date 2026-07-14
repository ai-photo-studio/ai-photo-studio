# Cleanup Phase 1 — 100% Safe, No Downtime, No Risk

**Project:** project-9540c255-c960-4fa0-a91
**Generated:** 2026-07-13
**Scope:** Only actions proven safe by GCP API verification.
**Principle:** No resource receiving production traffic is touched. No production data is deleted.

---

## 1. VERIFIED FACTS (from GCP APIs)

### Cloud Run — FAILED services (never served traffic)
| Service | Region | Status | Traffic | Referenced by another service? | Referenced by Build/Scheduler/Tasks/PubSub? |
|---|---|---|---|---|---|
| gpu-research-cuda118 | us-east4 | FAILED (HealthCheckContainerError, container failed to start) | 0% (no traffic block in status) | No (checked env vars of all prod services) | No (no triggers, scheduler API disabled, tasks API disabled, no topics) |
| gpu-research-test | us-east4 | FAILED (HealthCheckContainerError, container failed to start) | 0% | No | No |

### Cloud Run — old revisions NOT receiving traffic
| Service | Total rev | Serving | Tagged (rollout tag) | Safe to delete |
|---|---|---|---|---|
| ai-photo-studio-api | 25 | 00028-5ff (100%) | 00029-yad (tag `gpulatest`) | 23 |
| ai-photo-studio-bg-remover-gpu | 72 | 00066-dqs (100%) | none | 71 |
| ai-photo-studio-bg-remover | 12 | 00011-x6z (100%) | none | 11 |
| gpu-research-sam2 | 2 | 00001-4hg (100%) | none | 1 |
| gpu-research-service | 3 | 00003-6z4 (100%) | none | 2 |

> Deleting a revision with 0% traffic and no rollout tag does NOT affect the serving revision.
> Rollback for a deleted old revision = re-deploy from Git (images are rebuildable; see note in Phase 2).

### Cloud Build / Storage — old build source archives
| Bucket / Prefix | Size | Objects | Age | Reproducible? |
|---|---|---|---|---|
| gs://project-9540c255-c960-4fa0-a91_cloudbuild/source/ | 7,007,268,355 bytes (~7.0 GiB) | 126 | 13+ days | Yes — rebuilt from Git on each deploy |

### Artifact Registry
| Repo | Location | Images | Action |
|---|---|---|---|
| ai-photo-studio-api | us-central1 | 0 (empty) | Keep (needed for future deploys) |
| cloud-run-source-deploy | us-central1 | 0 (empty) | Keep (needed for future deploys) |

### Logging buckets
| Bucket | Retention | Locked | Action |
|---|---|---|---|
| _Default | 30 days | No | Keep |
| _Required | 400 days | Yes | Keep (locked, mandatory audit log) |

---

## 2. PHASE 1 ACTIONS (execute in order)

### A. Delete FAILED Cloud Run services (zero risk)
These never served traffic and are not referenced anywhere.

### B. Delete old non-traffic Cloud Run revisions (zero risk to serving revision)
Keep only the single serving revision per service (+ the `gpulatest`-tagged revision for the API).

### C. Delete old Cloud Build source archives (zero risk, reproducible)
Remove `gs://..._cloudbuild/source/*` older than current.

### D. Add lifecycle rule to Cloud Build bucket (prevents recurrence)
Auto-delete source archives after 30 days.

---

## 3. ROLLBACK FOR PHASE 1

| Action | Rollback | Recovery time |
|---|---|---|
| Delete FAILED service | `gcloud run services deploy gpu-research-cuda118 --image=<original> --region=us-east4` (re-deploy from Git) | 2–5 min |
| Delete FAILED service | `gcloud run services deploy gpu-research-test --image=<original> --region=us-east4` | 2–5 min |
| Delete old revision | Re-deploy same image digest OR re-run `gcloud run deploy` from Git | 1–3 min |
| Delete build source archive | Restore from Git (source is the source of truth) | N/A (regenerates on next build) |
| Lifecycle rule | `gsutil lifecycle set old-rule.json <bucket>` to revert | Instant |

---

## 4. WHAT IS EXPLICITLY NOT DONE IN PHASE 1
- No `minScale` changes (cold-start impact unverified → Phase 2).
- No Cloud SQL changes (Phase 2, needs maintenance window).
- No production service deletion.
- No customer / database data deletion.

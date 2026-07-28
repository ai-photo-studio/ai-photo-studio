# OPS-01 — Consolidate Production Infrastructure

## Objective
Update `Deployment_Policy.md` with ACTIVE vs RETIRED service topology, assess deletion readiness for legacy Cloud Run GPU services using gcloud (read-only), inventory RunPod endpoints with deletion recommendation, and estimate cost savings. No feature development, no architecture changes.

---

## Task 1 — Update Deployment_Policy.md

Edit `cleanup/Deployment_Policy.md`. Replace the flat list of rules with a topology registry table and retire the old "Phase R7 Update" header.

### New Sections to Add

#### Section 0 — Production Topology Registry

| Service | Kind | Status | Location | Managed By | Recovery |
|---------|------|--------|----------|------------|----------|
| `ai-photo-studio-api` | Cloud Run | ACTIVE | us-central1 | `deploy.yml` | Redeploy via workflow |
| `unified-restoration` (`3z633s11yn4n8q`) | RunPod serverless | ACTIVE | RunPod | `docker-build.yml` verify step | Redeploy via workflow |
| `ai-bg-remover` (`a8htv0u9c7we5a`) | RunPod serverless | ACTIVE | RunPod | `docker-build.yml` verify step | Redeploy via workflow |
| `ai-photo-studio-frontend` | Cloudflare Pages | ACTIVE | Cloudflare | `deploy.yml` | Redeploy via workflow |
| `ai-photo-studio-storage` | Cloudflare R2 | ACTIVE | Cloudflare | Manual | Multi-region replication |
| `ai-photo-studio-db` | Cloud SQL (PostgreSQL) | ACTIVE | us-central1 | Manual | Point-in-time recovery |
| neon-pooler | Neon PostgreSQL | ACTIVE | aws-us-east-1 | Manual | Provisioned via Neon dashboard |
| upstash-redis | Upstash Redis | ACTIVE | us-east-1 | Manual | Provisioned via Upstash dashboard |
| GitHub Actions CI/CD | GitHub | ACTIVE | github.com | Repository config | Re-run failed workflow |

#### Section 9 — RETIRED Services

| Service | Kind | Former Location | Retired Reason | Recovery Procedure |
|---------|------|----------------|----------------|-------------------|
| `ai-lama` | RunPod endpoint | RunPod | Replaced by unified-restoration | Recreate via `docker-build.yml` (template `frtl10x55s`) |
| `ai-gfpgan` | RunPod endpoint | RunPod | Replaced by unified-restoration | Recreate via `docker-build.yml` (template `rl85g36pc4`) |
| `ai-codeformer` | RunPod endpoint | RunPod | Replaced by unified-restoration | Recreate via `docker-build.yml` (template `i9zrd1x9tx`) |
| `ai-ddcolor` | RunPod endpoint | RunPod | Replaced by unified-restoration | Recreate via `docker-build.yml` (template `l1qm5ldu2b`) |
| `ai-real-esrgan` | RunPod endpoint | RunPod | Replaced by unified-restoration | Recreate via `docker-build.yml` (template `7sf3b8kyq9`) |
| `ai-photo-studio-lama` | Cloud Run service | us-central1 | Replaced by unified-restoration inside handler.py | Redeploy via `docker-build.yml` (Dockerfile in services/lama/) |
| `ai-photo-studio-gfpgan` | Cloud Run service | us-central1 | Replaced by unified-restoration inside handler.py | Redeploy via `docker-build.yml` (Dockerfile in services/gfpgan/) |
| `ai-photo-studio-codeformer` | Cloud Run service | us-central1 | Replaced by unified-restoration inside handler.py | Redeploy via `docker-build.yml` (Dockerfile in services/codeformer/) |
| `ai-photo-studio-ddcolor` | Cloud Run service | us-central1 | Replaced by unified-restoration inside handler.py | Redeploy via `docker-build.yml` (Dockerfile in services/ddcolor/) |
| `ai-photo-studio-real-esrgan` | Cloud Run service | us-central1 | Replaced by unified-restoration inside handler.py | Redeploy via `docker-build.yml` (Dockerfile in services/real-esrgan/) |
| `gpu-research-service` | Cloud Run service | us-east4 | Research project, not production | Redeploy from gpu-research sources |
| `ai-photo-studio-bg-remover-gpu-us-east4` | Cloud Run service | us-east4 | Secondary region, not in use | Redeploy from bg-remover Dockerfile.gpu |

### Order of Sections

```
0. PRODUCTION TOPOLOGY REGISTRY
1. TRAFFIC RULE
2. REVISION RETENTION
3. BUILD ARTIFACT RETENTION
4. DOCKER IMAGE RETENTION
5. BUCKET LIFECYCLE
6. POST-DEPLOY CLEANUP
7. FORBIDDEN
8. VERIFICATION BEFORE DEPLOY
9. RETIRED SERVICES
```

---

## Task 2 — Cloud Run Deletion Readiness Report (gcloud read-only)

Run the following gcloud commands and record results in a new file `cleanup/Legacy_Deletion_Readiness.md`. Do NOT delete any services.

### Per Service Checks

For each of these 7 legacy/unused Cloud Run services:

1. `ai-photo-studio-lama` us-central1
2. `ai-photo-studio-gfpgan` us-central1
3. `ai-photo-studio-codeformer` us-central1
4. `ai-photo-studio-ddcolor` us-central1
5. `ai-photo-studio-real-esrgan` us-central1
6. `ai-photo-studio-bg-remover-gpu-us-east4` us-east4
7. `gpu-research-service` us-east4

Run:
```bash
gcloud run services describe $SERVICE --region=$REGION --format="json" > /tmp/$SERVICE.json
gcloud run revisions list --service=$SERVICE --region=$REGION --format="table(name,status.conditions[0].status,deployTime)"
gcloud run services get-iam-policy $SERVICE --region=$REGION
```

### Verification Matrix

| Check | How to Verify |
|-------|---------------|
| 0% traffic | `status.traffic[0].percent == 0` or `status.traffic[].latestRevision` not serving 100% |
| No env var reference | API service's `RESTORATION_LAMA_URL` etc. are empty — already confirmed from gcloud: `RESTORATION_LAMA_URL` has no value |
| No provider reference | `grep -r "ai-photo-studio-lama" apps/api/src` → zero results |
| No worker reference | `grep -r "lama\|gfpgan\|codeformer\|ddcolor\|real-esrgan" apps/api/src/workers` → zero results |
| No deployment script reference | `deploy.yml` only deploys `ai-photo-studio-api` — no legacy GPU services |
| Deployment_Policy.md updated | This plan's Task 1 updates it with RETIRED section |

### Results to Document

Create `cleanup/Legacy_Deletion_Readiness.md` with:

```markdown
# Cloud Run Legacy Service Deletion Readiness

| Service | Region | 0% Traffic | No Env Ref | No Provider Ref | No Worker Ref | No Deploy Ref | Policy Updated | READY? |
|---------|--------|-----------|------------|----------------|---------------|---------------|----------------|--------|
| ai-photo-studio-lama | us-central1 | TBD from gcloud | ✅ | ✅ | ✅ | ✅ | ✅ | TBD |
| ai-photo-studio-gfpgan | us-central1 | TBD | ✅ | ✅ | ✅ | ✅ | ✅ | TBD |
| ai-photo-studio-codeformer | us-central1 | TBD | ✅ | ✅ | ✅ | ✅ | ✅ | TBD |
| ai-photo-studio-ddcolor | us-central1 | TBD | ✅ | ✅ | ✅ | ✅ | ✅ | TBD |
| ai-photo-studio-real-esrgan | us-central1 | TBD | ✅ | ✅ | ✅ | ✅ | ✅ | TBD |
| ai-photo-studio-bg-remover-gpu-us-east4 | us-east4 | TBD | N/A | N/A | N/A | ✅ | ✅ | TBD |
| gpu-research-service | us-east4 | TBD | N/A | N/A | N/A | ✅ | ✅ | TBD |
```

Fill TBD values from `gcloud run services describe` output. The env/provider/worker checks are already confirmed pass from source code audit.

---

## Task 3 — RunPod Endpoint Inventory & Deletion Recommendation

### Inventory Table (from M7.25-M7.27 verify job logs)

| Endpoint | ID | Template ID | workersMin | workersMax | Status | Recommendation |
|----------|-----|-------------|-----------|-----------|--------|----------------|
| `unified-restoration` | `3z633s11yn4n8q` | `72cq4tyxf2` | 0 | 1 | ACTIVE | KEEP |
| `ai-bg-remover` | `a8htv0u9c7we5a` | `vqdtnpy7tz` | 0 | 1 | ACTIVE | KEEP |
| `ai-lama` | `0oqlkj2hjwcacj` | `frtl10x55s` | 0 | 0 | FROZEN | DELETE (no references, $0) |
| `ai-gfpgan` | `00h6fg3oy458ml` | `rl85g36pc4` | 0 | 0 | FROZEN | DELETE |
| `ai-codeformer` | `gohz91bvs1gvn1` | `i9zrd1x9tx` | 0 | 0 | FROZEN | DELETE |
| `ai-ddcolor` | `besuyv4w9ndg3l` | `l1qm5ldu2b` | 0 | 0 | FROZEN | DELETE |
| `ai-real-esrgan` | `do10pbme13b166` | `7sf3b8kyq9` | 0 | 0 | FROZEN | DELETE |

### Deletion Order (safe-to-delete, no ordering dependency)

All 5 frozen endpoints are independent. Delete in any order:

```bash
ENDPOINTS=(
  "0oqlkj2hjwcacj"   # ai-lama
  "00h6fg3oy458ml"   # ai-gfpgan
  "gohz91bvs1gvn1"   # ai-codeformer
  "besuyv4w9ndg3l"   # ai-ddcolor
  "do10pbme13b166"   # ai-real-esrgan
)
for id in "${ENDPOINTS[@]}"; do
  curl -s -X DELETE "https://rest.runpod.io/v1/endpoints/$id" \
    -H "Authorization: Bearer $RUNPOD_API_KEY"
done
```

Before deletion, also remove the legacy template entries from `docker-build.yml` lines 134-139 and the legacy loop at lines 141-149. These still try to PATCH templates that would be deleted. Update the `detect-changes` matrix to remove these services from the build matrix.

### CI/CD Updates for `docker-build.yml`

| Line(s) | Change |
|---------|--------|
| 19-24 | Remove `services/lama/**`, `services/gfpgan/**`, `services/codeformer/**`, `services/ddcolor/**`, `services/real-esrgan/**` from push paths (or keep if images still needed) |
| 55 | Remove `lama`, `gfpgan`, `codeformer`, `ddcolor`, `real-esrgan` from force_build_all matrix |
| 59 | Remove those 5 services from detect-changes loop |
| 78 | Keep only `bg-remover` and `restoration` in strategy matrix |
| 134-139 | Remove legacy template ID declarations and image PATCH loop |
| 243-254 | Remove legacy endpoint freeze loop (no longer needed after deletion) |

---

## Task 4 — Cost Analysis

### Savings Estimate (monthly)

| Service | Monthly Cost | Status | Savings if Deleted |
|---------|-------------|--------|-------------------|
| `ai-photo-studio-lama` | ~$20-30 | Legacy (replaced) | ~$20-30 |
| `ai-photo-studio-gfpgan` | ~$20-30 | Legacy (replaced) | ~$20-30 |
| `ai-photo-studio-codeformer` | ~$20-30 | Legacy (replaced) | ~$20-30 |
| `ai-photo-studio-ddcolor` | ~$20-30 | Legacy (replaced) | ~$20-30 |
| `ai-photo-studio-real-esrgan` | ~$20-30 | Legacy (replaced) | ~$20-30 |
| **Total savings** | **~$100-150/mo** | | |

The bg-remover-gpu-us-east4 and gpu-research-service are research instances with minimal cost (~$5-10/mo each on minScale=0) — their savings are negligible.

### Remaining Required GCP Resources (cannot delete)

| Resource | Monthly Cost | Reason |
|----------|-------------|--------|
| `ai-photo-studio-api` Cloud Run | ~$50-70 | Production API server — REQUIRED |
| `ai-photo-studio-db` Cloud SQL | ~$45 | PostgreSQL database — REQUIRED |
| Storage buckets | ~$5-10 | Cloud Build + user data — REQUIRED |

**Post-cleanup monthly total:** ~$100-125 (down from ~$250-350 with legacy services)

---

## Task 5 — Documentation

Replace `D:\AI Product Photo Studio on WhatsApp\AI_code_audit_report_RI.md` with the final report for this phase. It is already in `.gitignore` (line 60, confirmed M7.29).

---

## Task 6 — Protected Scope

No changes to:
- Architecture Standard v1.0
- RunPod endpoint configuration (only documentation/cleanup readiness)
- Cloud Run service deletion (readiness report only, no deletions)
- Application code
- AI providers

---

## File Manifest

| File | Action |
|------|--------|
| `cleanup/Deployment_Policy.md` | EDIT — add topology registry + RETIRED section |
| `cleanup/Legacy_Deletion_Readiness.md` | CREATE — per-service readiness table |
| `AI_code_audit_report_RI.md` | REPLACE — OPS-01 final report |

### Optional (if executor chooses to delete RunPod endpoints)

| File | Action |
|------|--------|
| `.github/workflows/docker-build.yml` | EDIT — remove legacy endpoint/template references |

---

## Validation

1. `git status` — only `cleanup/Deployment_Policy.md`, `cleanup/Legacy_Deletion_Readiness.md`, `AI_code_audit_report_RI.md` modified (plus possibly `docker-build.yml`)
2. `npm run typecheck -w apps/api` — PASS (no app code changed)
3. `npm run build -w apps/api` — PASS
4. Commit message: `OPS-01: Consolidate production infrastructure — update Deployment_Policy, assess deletion readiness, inventory RunPod`

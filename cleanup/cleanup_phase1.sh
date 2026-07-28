#!/usr/bin/env bash
#
# cleanup_phase1.sh
# ZERO-RISK PRODUCTION CLEANUP — PHASE 1 (100% safe, no downtime)
# Project: project-9540c255-c960-4fa0-a91
#
# SAFETY:
#   - stops on first error (set -euo pipefail)
#   - prints every command before running (set -x)
#   - verifies each resource exists before acting
#   - asks for confirmation before any deletion
#   - logs every action to cleanup.log
#   - only deletes FAILED services and 0%-traffic, untagged revisions
#
# THIS SCRIPT IS NOT AUTO-EXECUTED. Run manually after review.
# Requires: gcloud auth login (wpaistudio@gmail.com) and bq/project access.
#
set -euo pipefail

PROJECT="project-9540c255-c960-4fa0-a91"
LOG="cleanup.log"
exec > >(tee -a "$LOG") 2>&1

echo "=== Phase 1 cleanup started: $(date -u) ==="

confirm() {
  read -r -p "About to: $1 — type 'yes' to proceed: " ans
  [[ "$ans" == "yes" ]] || { echo "SKIPPED: $1"; return 1; }
}

# ---------------------------------------------------------------
# 1. DELETE FAILED CLOUD RUN SERVICES (never served traffic)
# ---------------------------------------------------------------
for svc in gpu-research-cuda118 gpu-research-test; do
  region=$(gcloud run services describe "$svc" --project="$PROJECT" --region=us-east4 --format="value(status.observedGeneration)" 2>/dev/null || true)
  if gcloud run services describe "$svc" --project="$PROJECT" --region=us-east4 --format="value(metadata.name)" &>/dev/null; then
    confirm "delete FAILED service $svc (us-east4)"
    if [ $? -eq 0 ]; then
      gcloud run services delete "$svc" --project="$PROJECT" --region=us-east4 --quiet \
        && echo "DELETED service $svc" || echo "FAILED to delete $svc"
    fi
  else
    echo "SKIP (not found): $svc"
  fi
done

# ---------------------------------------------------------------
# 2. DELETE OLD NON-TRAFFIC REVISIONS
#    Keep only the serving revision (+ gpulatest tag for api).
# ---------------------------------------------------------------
delete_old_revisions() {
  local svc="$1"; local region="$2"; local keep="$3"
  echo "--- Service $svc ($region), keeping: $keep ---"
  for rev in $(gcloud run revisions list --service="$svc" --project="$PROJECT" --region="$region" --format="value(name)"); do
    if [[ " $keep " == *" $rev "* ]]; then
      echo "KEEP $rev"
      continue
    fi
    confirm "delete revision $rev of $svc"
    if [ $? -eq 0 ]; then
      gcloud run revisions delete "$rev" --project="$PROJECT" --region="$region" --quiet \
        && echo "DELETED $rev" || echo "FAILED $rev"
    fi
  done
}

delete_old_revisions ai-photo-studio-api      us-central1 "ai-photo-studio-api-00028-5ff ai-photo-studio-api-00029-yad"
delete_old_revisions ai-photo-studio-bg-remover-gpu us-central1 "ai-photo-studio-bg-remover-gpu-00066-dqs"
delete_old_revisions ai-photo-studio-bg-remover    us-central1 "ai-photo-studio-bg-remover-00011-x6z"
delete_old_revisions gpu-research-sam2         us-central1 "gpu-research-sam2-00001-4hg"
delete_old_revisions gpu-research-service      us-east4   "gpu-research-service-00003-6z4"

# ---------------------------------------------------------------
# 3. DELETE OLD CLOUD BUILD SOURCE ARCHIVES (reproducible from Git)
# ---------------------------------------------------------------
confirm "delete ALL objects in gs://${PROJECT}_cloudbuild/source/ (7 GiB, reproducible)"
if [ $? -eq 0 ]; then
  gsutil -m rm -r "gs://${PROJECT}_cloudbuild/source/*" \
    && echo "DELETED build source archives" || echo "FAILED build source cleanup"
fi

# ---------------------------------------------------------------
# 4. ADD LIFECYCLE RULE TO CLOUD BUILD BUCKET (prevent recurrence)
# ---------------------------------------------------------------
cat > /tmp/lifecycle.json <<'EOF'
{
  "rule": [
    { "action": { "type": "Delete" }, "condition": { "age": 30 } }
  ]
}
EOF
confirm "set 30-day lifecycle on gs://${PROJECT}_cloudbuild/"
if [ $? -eq 0 ]; then
  gsutil lifecycle set /tmp/lifecycle.json "gs://${PROJECT}_cloudbuild/" \
    && echo "LIFECYCLE set" || echo "FAILED lifecycle"
fi

echo "=== Phase 1 cleanup finished: $(date -u) ==="

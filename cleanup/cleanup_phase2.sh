#!/usr/bin/env bash
#
# cleanup_phase2.sh
# MEDIUM-RISK PRODUCTION CLEANUP — PHASE 2
# Project: project-9540c255-c960-4fa0-a91
#
# WARNING: Changes runtime behavior of PRODUCTION services.
# Requires: verified cold-start latency + maintenance window.
# THIS SCRIPT IS NOT AUTO-EXECUTED.
#
set -euo pipefail

PROJECT="project-9540c255-c960-4fa0-a91"
LOG="cleanup_phase2.log"
exec > >(tee -a "$LOG") 2>&1

echo "=== Phase 2 cleanup started: $(date -u) ==="
echo "PREREQUISITE: cold-start latency verified AND maintenance window open."

confirm() {
  read -r -p "About to: $1 — type 'yes' to proceed: " ans
  [[ "$ans" == "yes" ]] || { echo "SKIPPED: $1"; return 1; }
}

# ---------------------------------------------------------------
# A. OPTIONAL minScale=0 for CPU-only microservices (REVIEW candidates)
#    Rollback: --min-instances=1
# ---------------------------------------------------------------
for svc in ai-photo-studio-real-esrgan ai-photo-studio-yolo-detector; do
  confirm "set minScale=0 on $svc (CPU-only, verify cold start first)"
  if [ $? -eq 0 ]; then
    gcloud run services update "$svc" --project="$PROJECT" --region=us-central1 --min-instances=0 --quiet \
      && echo "UPDATED $svc minScale=0" || echo "FAILED $svc"
  fi
done

# ---------------------------------------------------------------
# B. CLOUD SQL activation policy -> ON_DEMAND (saves cost when idle)
#    Rollback: --activation-policy=ALWAYS
# ---------------------------------------------------------------
confirm "set Cloud SQL ai-photo-studio-db activation-policy=ON_DEMAND"
if [ $? -eq 0 ]; then
  gcloud sql instances patch ai-photo-studio-db --project="$PROJECT" --activation-policy=ON_DEMAND \
    && echo "PATCHED SQL ON_DEMAND" || echo "FAILED SQL patch"
fi

# ---------------------------------------------------------------
# C. CLOUD SQL security hardening: force SSL, disable public IP
#    (requires connection strings updated to Auth Proxy / private IP)
# ---------------------------------------------------------------
confirm "disable public IP + force SSL on ai-photo-studio-db (update app connection first)"
if [ $? -eq 0 ]; then
  gcloud sql instances patch ai-photo-studio-db --project="$PROJECT" --no-assign-ip --require-ssl \
    && echo "PATCHED SQL network" || echo "FAILED SQL network patch"
fi

echo "=== Phase 2 cleanup finished: $(date -u) ==="

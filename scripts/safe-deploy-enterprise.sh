#!/bin/bash
# RETIRED -- historical reference only; not an active deploy or rollback target.
# Current production API deployment target is Northflank (api.thannow.com), auto-deployed
# via .github/workflows/deploy.yml on push to main. Railway is retired and this script is
# blocked below to prevent an accidental deploy to the retired target.
echo "RETIRED: This script targets Railway, which is no longer the production deployment target."
echo "Current production target is Northflank (api.thannow.com) via .github/workflows/deploy.yml."
echo "Blocking execution."
exit 1

# Enterprise Safe Deploy Script (Unix, historical, Railway-era)
# Runs full verification before deploying

echo "========================================"
echo "ENTERPRISE SAFETY CHECK"
echo "========================================"
echo ""

node scripts/verify-project.js
if [ $? -ne 0 ]; then
    echo ""
    echo "DEPLOY BLOCKED: Project verification failed"
    exit 1
fi

echo ""
echo "Running build verification..."
npm run build
if [ $? -ne 0 ]; then
    echo ""
    echo "DEPLOY BLOCKED: Build verification failed"
    exit 1
fi

echo ""
echo "Running typecheck verification..."
npm run typecheck
if [ $? -ne 0 ]; then
    echo ""
    echo "DEPLOY BLOCKED: Typecheck verification failed"
    exit 1
fi

echo ""
echo "========================================"
echo "Railway Status"
echo "========================================"
echo ""

railway status
if [ $? -ne 0 ]; then
    echo ""
    echo "DEPLOY BLOCKED: Railway status check failed"
    exit 1
fi

echo ""
echo "========================================"
echo "ALL VERIFICATIONS PASSED"
echo "========================================"
echo ""

git push origin main
railway up
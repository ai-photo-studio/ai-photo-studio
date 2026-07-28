#!/bin/bash
# Enterprise Safe Deploy Script (Unix)
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
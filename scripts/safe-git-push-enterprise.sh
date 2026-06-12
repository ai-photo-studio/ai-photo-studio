#!/bin/bash
# Enterprise Safe Git Push Script (Unix)
# Runs project verification before pushing

echo "========================================"
echo "ENTERPRISE SAFETY CHECK"
echo "========================================"
echo ""

node scripts/verify-project.js
if [ $? -ne 0 ]; then
    echo ""
    echo "PUSH BLOCKED: Project verification failed"
    exit 1
fi

echo ""
echo "Running build verification..."
npm run build
if [ $? -ne 0 ]; then
    echo ""
    echo "PUSH BLOCKED: Build verification failed"
    exit 1
fi

echo ""
echo "Running typecheck verification..."
npm run typecheck
if [ $? -ne 0 ]; then
    echo ""
    echo "PUSH BLOCKED: Typecheck verification failed"
    exit 1
fi

echo ""
echo "========================================"
echo "ALL VERIFICATIONS PASSED"
echo "========================================"
echo ""

git status
echo ""

git add .
echo ""

git commit
if [ $? -ne 0 ]; then
    echo "No changes to commit."
fi

git push origin main
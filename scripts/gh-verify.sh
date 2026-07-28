#!/bin/bash
# GitHub CLI Verification Script
# Verifies repository before GitHub operations

echo "========================================"
echo "GITHUB CLI VERIFICATION"
echo "========================================"
echo ""

if ! command -v gh &> /dev/null; then
    echo "ERROR: GitHub CLI (gh) not installed"
    exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
echo "Current GitHub Repository: $REPO"

EXPECTED_REPO="gardenshop/ai-photo-studio-whatsapp"
if [ "$REPO" != "$EXPECTED_REPO" ]; then
    echo "ERROR: Repository mismatch"
    echo "Expected: $EXPECTED_REPO"
    echo "Actual: $REPO"
    exit 1
fi

echo ""
echo "GitHub repository verified: $EXPECTED_REPO"
echo "SAFE TO USE GITHUB CLI"
exit 0
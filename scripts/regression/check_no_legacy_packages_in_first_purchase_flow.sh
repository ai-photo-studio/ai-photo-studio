#!/usr/bin/env bash
# Regression Protection: Verify no hardcoded legacy package names appear in first-purchase flow pages.
#
# This checks that the upload/preview/package/payment pages in the frontend
# do NOT contain hardcoded "Starter", "Pro", "Business", or "Dealer" strings.
# Package display must be data-driven from the API (/api/packages).
#
# Exit 1 if any hardcoded legacy package string is found.

set -euo pipefail

FRONTEND_SRC="apps/web/src/pages"
FLOW_FILES=(
  "RestoreNewPage.tsx"
  "RestoreOrderPage.tsx"
  "PricingPage.tsx"
)

LEGACY_NAMES=("Starter" "Pro" "Business" "Dealer")

errors=0

for page in "${FLOW_FILES[@]}"; do
  file="$FRONTEND_SRC/$page"
  if [[ ! -f "$file" ]]; then
    echo "WARN: $file not found" >&2
    continue
  fi
  for name in "${LEGACY_NAMES[@]}"; do
    # Skip "Pro" substring matches like "Profile", "Processing", "Provider"
    if [[ "$name" == "Pro" ]]; then
      # Match "Pro" as a standalone word (not part of another word)
      if grep -nP '\bPro\b' "$file" | grep -vP '(//.*)?\b(Profile|Processing|Provider|Protected|Prompt|Product|Project|Property|Protocol)\b' > /dev/null 2>&1; then
        echo "FAIL: $file contains hardcoded '$name'" >&2
        grep -nP '\bPro\b' "$file" | grep -vP '(//.*)?\b(Profile|Processing|Provider|Protected|Prompt|Product|Project|Property|Protocol)\b' >&2
        ((errors++))
      fi
    else
      if grep -nF "$name" "$file" > /dev/null 2>&1; then
        echo "FAIL: $file contains hardcoded '$name'" >&2
        grep -nF "$name" "$file" >&2
        ((errors++))
      fi
    fi
  done
done

if [[ $errors -gt 0 ]]; then
  echo "REGRESSION: $errors hardcoded legacy package name(s) found in first-purchase flow pages." >&2
  exit 1
fi

echo "OK: No hardcoded legacy package names in first-purchase flow pages."

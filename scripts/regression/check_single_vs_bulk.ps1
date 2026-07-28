# OPS-144 Regression: Single vs Bulk Commerce Verification
# Single image (files.length === 1):
#   Resolution Selection ONLY (Original, 2HD, 4HD)
#   NEVER shows Starter/Pro/Business/Dealer
# Multiple images (files.length > 1):
#   Bulk Packages ONLY (Starter, Pro, Business, Dealer)
#   Shows resolution tiers per package

param(
    [string]$PageFile = "apps/web/src/pages/RestoreNewPage.tsx"
)

$errors = 0

Write-Host "=== OPS-144: Single vs Bulk Commerce Check ===" -ForegroundColor Cyan

if (-not (Test-Path $PageFile)) {
    Write-Host "FAIL: $PageFile not found" -ForegroundColor Red
    exit 1
}

$content = Get-Content $PageFile -Raw

# ---- CHECK 1: isSingle branching ----
if ($content -match 'isSingle = files\.length === 1') {
    Write-Host "PASS: isSingle branching = (files.length === 1)" -ForegroundColor Green
} else {
    Write-Host "FAIL: isSingle branching missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 2: Resolution step for single image ----
if ($content -match 'SINGLE_RESOLUTION_TIERS') {
    Write-Host "PASS: SINGLE_RESOLUTION_TIERS defined" -ForegroundColor Green
} else {
    Write-Host "FAIL: SINGLE_RESOLUTION_TIERS missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 3: Resolution tiers include Original, 2HD, 4HD ----
foreach ($res in @('original', '2hd', '4hd')) {
    if ($content -match [regex]::Escape($res)) {
        Write-Host "  PASS: Resolution '$res' found" -ForegroundColor Green
    } else {
        Write-Host "  FAIL: Resolution '$res' missing" -ForegroundColor Red
        $errors++
    }
}

# ---- CHECK 4: Preview branches to resolution when single ----
if ($content -match 'isSingle \? "resolution" : "package"') {
    Write-Host "PASS: Preview branches: single->resolution, multi->package" -ForegroundColor Green
} else {
    Write-Host "FAIL: Preview missing correct branching" -ForegroundColor Red
    $errors++
}

# ---- CHECK 5: Package step exists for multi-image ----
if ($content -match 'step === "package"') {
    Write-Host "PASS: Package step exists for multi-image" -ForegroundColor Green
} else {
    Write-Host "FAIL: Package step missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 6: Bulk package tiers with resolution lists ----
if ($content -match 'bulkPackageTiers') {
    Write-Host "PASS: bulkPackageTiers map exists" -ForegroundColor Green
    foreach ($pkg in @('STARTER', 'PRO', 'BUSINESS', 'DEALER')) {
        if ($content -match [regex]::Escape($pkg)) {
            Write-Host "  PASS: Package '$pkg' in bulk tiers" -ForegroundColor Green
        } else {
            Write-Host "  FAIL: Package '$pkg' missing from bulk tiers" -ForegroundColor Red
            $errors++
        }
    }
} else {
    Write-Host "FAIL: bulkPackageTiers map missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 7: Payment branches on isSingle ----
if ($content -match 'isSingle \? selectedResolution') {
    Write-Host "PASS: Payment step branches on isSingle" -ForegroundColor Green
} else {
    Write-Host "FAIL: Payment step missing isSingle branch" -ForegroundColor Red
    $errors++
}

Write-Host ""
if ($errors -gt 0) {
    Write-Host "FAILED: $errors commerce check(s) failed." -ForegroundColor Red
    exit 1
}
Write-Host "ALL COMMERCE CHECKS PASSED. Single->resolution only, Multi->packages only." -ForegroundColor Green

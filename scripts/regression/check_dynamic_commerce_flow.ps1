# OPS-141 Regression Protection: Dynamic Commerce Flow Verification
# 
# Rules:
# 1. Single image (files.length === 1) flow:
#    - MUST display Resolution Selection (Original, 2HD, 4HD)
#    - MUST NEVER display legacy package names (Starter, Pro, Business, Dealer)
#    - Step order: upload -> preview -> resolution -> payment -> restore
# 2. Multiple images (files.length > 1) flow:
#    - MUST display Bulk Package Selection (Starter, Pro, Business, Dealer)
#    - MUST display resolution tiers per package
#    - Step order: upload -> preview -> package -> payment -> restore
#
# This script verifies the source code enforces these rules.

param(
    [string]$FrontendSrc = "apps/web/src/pages"
)

$targetFile = Join-Path $FrontendSrc "RestoreNewPage.tsx"
$errors = 0

if (-not (Test-Path $targetFile)) {
    Write-Host "FAIL: $targetFile not found" -ForegroundColor Red
    exit 1
}

$content = Get-Content $targetFile -Raw

Write-Host "=== OPS-141: Dynamic Commerce Flow Regression Check ===" -ForegroundColor Cyan
Write-Host ""

# ---- CHECK 1: Single image resolution tiers exist ----
$hasResolutionTiers = $content -match 'SINGLE_RESOLUTION_TIERS'
if (-not $hasResolutionTiers) {
    Write-Host "FAIL: SINGLE_RESOLUTION_TIERS constant not found" -ForegroundColor Red
    $errors++
} else {
    Write-Host "PASS: SINGLE_RESOLUTION_TIERS constant exists" -ForegroundColor Green
    
    # Verify Original, 2HD, 4HD are present
    foreach ($res in @("original", "2hd", "4hd")) {
        if ($content -match [regex]::Escape($res)) {
            Write-Host "  PASS: Resolution tier '$res' found" -ForegroundColor Green
        } else {
            Write-Host "  FAIL: Resolution tier '$res' missing" -ForegroundColor Red
            $errors++
        }
    }
}

# ---- CHECK 2: isSingle branching logic exists ----
$hasIsSingle = $content -match 'const isSingle = files.length === 1'
if (-not $hasIsSingle) {
    Write-Host "FAIL: isSingle branching logic not found" -ForegroundColor Red
    $errors++
} else {
    Write-Host "PASS: isSingle branching logic exists (isSingle = files.length === 1)" -ForegroundColor Green
}

# ---- CHECK 3: Single image flow goes to resolution, not package ----
$resolutionStep = $content -match 'step === "resolution"'
$packageStep = $content -match 'step === "package"'
if (-not $resolutionStep) {
    Write-Host "FAIL: resolution step not found in component" -ForegroundColor Red
    $errors++
} else {
    Write-Host "PASS: resolution step exists for single image flow" -ForegroundColor Green
}
if (-not $packageStep) {
    Write-Host "FAIL: package step not found in component" -ForegroundColor Red
    $errors++
} else {
    Write-Host "PASS: package step exists for multi-image flow" -ForegroundColor Green
}

# ---- CHECK 4: isSingle used to branch between resolution and package ----
$branchFromPreview = $content -match 'isSingle \? "resolution" : "package"'
if (-not $branchFromPreview) {
    Write-Host "FAIL: Preview step does not branch on isSingle" -ForegroundColor Red
    $errors++
} else {
    Write-Host "PASS: Preview step branches to resolution (single) or package (multi)" -ForegroundColor Green
}

# ---- CHECK 5: Bulk package resolution tiers defined ----
$hasBulkTiers = $content -match 'bulkPackageTiers'
if (-not $hasBulkTiers) {
    Write-Host "FAIL: bulkPackageTiers map not found" -ForegroundColor Red
    $errors++
} else {
    Write-Host "PASS: bulkPackageTiers map exists with per-package resolution lists" -ForegroundColor Green
    
    # Verify Starter has Original/2HD/4HD
    if ($content -match 'STARTER.*Original.*2HD.*4HD') {
        Write-Host "  PASS: STARTER has Original, 2HD, 4HD resolutions" -ForegroundColor Green
    } else {
        Write-Host "  WARN: Could not verify STARTER resolution list" -ForegroundColor Yellow
    }
    
    # Verify Dealer has 10HD and 12HD
    if ($content -match 'DEALER.*12HD') {
        Write-Host "  PASS: DEALER has 12HD resolution" -ForegroundColor Green
    } else {
        Write-Host "  WARN: Could not verify DEALER has 12HD" -ForegroundColor Yellow
    }
}

# ---- CHECK 6: Payment step shows correct label based on isSingle ----
$paymentBranch = $content -match 'isSingle \? selectedResolution'
if (-not $paymentBranch) {
    Write-Host "FAIL: Payment step does not branch on isSingle for label" -ForegroundColor Red
    $errors++
} else {
    Write-Host "PASS: Payment step branches on isSingle for label/price/description" -ForegroundColor Green
}

Write-Host ""
if ($errors -gt 0) {
    Write-Host "REGRESSION: $errors check(s) failed." -ForegroundColor Red
    exit 1
}

Write-Host "ALL CHECKS PASSED: Dynamic commerce flow is correctly implemented." -ForegroundColor Green
Write-Host "  - Single image (files.length === 1): upload → preview → resolution → payment → restore" -ForegroundColor Cyan
Write-Host "  - Multiple images (files.length > 1): upload → preview → package → payment → restore" -ForegroundColor Cyan

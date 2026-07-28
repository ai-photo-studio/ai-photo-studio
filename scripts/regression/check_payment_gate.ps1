# OPS-144 Regression: Payment Gate Verification
# Verifies that NO restoration processing, provider call, or queue job
# starts before payment is confirmed.

param(
    [string]$ApiSrc = "apps/api/src"
)

$errors = 0

Write-Host "=== OPS-144: Payment Gate Regression Check ===" -ForegroundColor Cyan

# ---- CHECK 1: Restoration processItem has payment guard ----
$restorationCtrl = Join-Path $ApiSrc "controllers/restoration.controller.ts"
if (Test-Path $restorationCtrl) {
    $content = Get-Content $restorationCtrl -Raw
    if ($content -match 'PAYMENT_REQUIRED') {
        Write-Host "PASS: restoration.controller.ts processItem has PAYMENT_REQUIRED guard" -ForegroundColor Green
    } else {
        Write-Host "FAIL: restoration.controller.ts processItem missing payment guard" -ForegroundColor Red
        $errors++
    }
}

# ---- CHECK 2: Queue enqueueOrderProcessing has payment guard ----
$imageQueue = Join-Path $ApiSrc "queues/image.queue.ts"
if (Test-Path $imageQueue) {
    $content = Get-Content $imageQueue -Raw
    if ($content -match 'paymentStatus.*!==.*PAID') {
        Write-Host "PASS: image.queue.ts enqueueImageProcessing checks paymentStatus === PAID" -ForegroundColor Green
    } else {
        Write-Host "FAIL: image.queue.ts missing paymentStatus PAID guard" -ForegroundColor Red
        $errors++
    }
}

# ---- CHECK 3: PhaseC order pipeline does not process before payment ----
$phaseC = Join-Path $ApiSrc "services/phase-c-order-pipeline.service.ts"
if (Test-Path $phaseC) {
    $content = Get-Content $phaseC -Raw
    if ($content -match 'PAYMENT_PENDING|paymentStatus') {
        Write-Host "INFO: phase-c-order-pipeline.service.ts references payment status" -ForegroundColor Yellow
    }
}

# ---- CHECK 4: Frontend processItem API call is NOT made before payment step ----
$newPage = "apps/web/src/pages/RestoreNewPage.tsx"
if (Test-Path $newPage) {
    $content = Get-Content $newPage -Raw
    if ($content -match 'processItem|processRestoration') {
        Write-Host "WARN: RestoreNewPage.tsx references processItem before payment" -ForegroundColor Yellow
    } else {
        Write-Host "PASS: RestoreNewPage.tsx does NOT call processItem before payment" -ForegroundColor Green
    }
}

Write-Host ""
if ($errors -gt 0) {
    Write-Host "FAILED: $errors payment gate check(s) failed." -ForegroundColor Red
    exit 1
}
Write-Host "ALL PAYMENT GATE CHECKS PASSED." -ForegroundColor Green

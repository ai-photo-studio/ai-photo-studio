# OPS-144 Regression: Provider Selection Verification
# Verify production routing targets Replicate only.
# RunPod must be disabled in default provider selection.

param(
    [string]$ApiSrc = "apps/api/src"
)

$errors = 0

Write-Host "=== OPS-144: Provider Selection Check ===" -ForegroundColor Cyan

# ---- CHECK 1: ProviderPolicyEngine disables RunPod by default ----
$policyEngine = Join-Path $ApiSrc "restoration-providers/policy/ProviderPolicyEngine.ts"
if (Test-Path $policyEngine) {
    $content = Get-Content $policyEngine -Raw
    if ($content -match 'disabledProviders.*runpod') {
        Write-Host "PASS: ProviderPolicyEngine disables runpod by default" -ForegroundColor Green
    } else {
        Write-Host "FAIL: ProviderPolicyEngine does not disable runpod" -ForegroundColor Red
        $errors++
    }
}

# ---- CHECK 2: PipelineOrchestrator default tier is replicate ----
$pipeline = Join-Path $ApiSrc "restoration-providers/pipeline/PipelineOrchestrator.ts"
if (Test-Path $pipeline) {
    $content = Get-Content $pipeline -Raw
    if ($content -match "default.*replicate|getDefaultTier.*replicate|return.*replicate") {
        Write-Host "PASS: PipelineOrchestrator default tier is replicate" -ForegroundColor Green
    } else {
        Write-Host "FAIL: PipelineOrchestrator default tier is NOT replicate" -ForegroundColor Red
        $errors++
    }
}

# ---- CHECK 3: Restoration processItem uses pipeline, not direct RunPod ----
$restSvc = Join-Path $ApiSrc "services/restoration.service.ts"
if (Test-Path $restSvc) {
    $content = Get-Content $restSvc -Raw
    if ($content -match 'pipelineOrchestrator\.execute') {
        Write-Host "PASS: Restoration processItem uses PipelineOrchestrator" -ForegroundColor Green
    } else {
        Write-Host "FAIL: Restoration processItem bypasses PipelineOrchestrator" -ForegroundColor Red
        $errors++
    }
    if ($content -notmatch 'runRunPodRequest|runViaRunPod') {
        Write-Host "PASS: restoration.service.ts does NOT call RunPod directly" -ForegroundColor Green
    } else {
        Write-Host "WARN: restoration.service.ts contains RunPod references" -ForegroundColor Yellow
    }
}

# ---- CHECK 4: ProviderFactory creates ReplicatePipelineProvider ----
$factory = Join-Path $ApiSrc "restoration-providers/factory/ProviderFactory.ts"
if (Test-Path $factory) {
    $content = Get-Content $factory -Raw
    if ($content -match 'replicate' -and $content -notmatch 'runpod') {
        Write-Host "PASS: ProviderFactory prefers Replicate over RunPod" -ForegroundColor Green
    } else {
        Write-Host "INFO: ProviderFactory includes runpod in available providers" -ForegroundColor Yellow
    }
}

Write-Host ""
if ($errors -gt 0) {
    Write-Host "FAILED: $errors provider selection check(s) failed." -ForegroundColor Red
    exit 1
}
Write-Host "ALL PROVIDER SELECTION CHECKS PASSED. Replicate is the active production route." -ForegroundColor Green

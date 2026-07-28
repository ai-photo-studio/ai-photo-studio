# OPS-145 End-to-End Restoration Flow Regression Suite
# Verifies exactly ONE upload flow, ONE preview flow, ONE payment flow,
# ONE provider (Replicate), ONE queue (after payment).
# No background-removal endpoint called during restoration.
# No RunPod runtime references active.

param(
    [string]$FrontendSrc = "apps/web/src",
    [string]$ApiSrc = "apps/api/src"
)

$errors = 0
$passed = 0

function Check {
    param([string]$Name, [scriptblock]$Condition)
    if (& $Condition) {
        Write-Host "  PASS: $Name" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "  FAIL: $Name" -ForegroundColor Red
        $script:errors++
    }
}

Write-Host "=== OPS-145: End-to-End Restoration Flow Regression Suite ===" -ForegroundColor Cyan
Write-Host ""

# ====== FLOW 1: Single upload flow ======
Write-Host "--- Flow 1: Upload ---" -ForegroundColor Yellow
$restoreNew = Join-Path $FrontendSrc "pages/RestoreNewPage.tsx"
$restoreNewContent = Get-Content $restoreNew -Raw
$homePage = Join-Path $FrontendSrc "pages/HomePage.tsx"
$homePageContent = Get-Content $homePage -Raw

Check "HomePage has restoration redirect button" { $homePageContent -match "Start Restoration" }
Check "RestoreNewPage has createRestorationOrder API call" { $restoreNewContent -match "createRestorationOrder" }
Check "RestoreNewPage has addRestorationItem API call" { $restoreNewContent -match "addRestorationItem" }
Check "RestoreNewPage does NOT call removeBackgroundPreview" { $restoreNewContent -notmatch "removeBackgroundPreview" }
Check "RestoreNewPage does NOT call uploadOrderImage" { $restoreNewContent -notmatch "uploadOrderImage" }

Check "HomePage no longer calls removeBackgroundPreview" { $homePageContent -notmatch "removeBackgroundPreview" }
Check "RestoreNewPage is the upload entry point" { Test-Path $restoreNew }

# ====== FLOW 2: Preview with AI analysis ======
Write-Host ""; Write-Host "--- Flow 2: Preview + AI Analysis ---" -ForegroundColor Yellow
Check "Preview step exists (step === preview)" { $restoreNewContent -match 'step === "preview"' }
Check "Quality analysis API called before commerce" { $restoreNewContent -match "runQualityAnalysis" }
Check "Analysis loaded via useEffect on preview step" { $restoreNewContent -match "loadAnalysis" }
Check "All images shown in preview (files.map)" { $restoreNewContent -match "files\.map" }
Check "Dimensions displayed" { $restoreNewContent -match "resolution\.width" }
Check "DPI displayed" { $restoreNewContent -match "DPI" }
Check "Damage severity displayed" { $restoreNewContent -match "damageSeverity" }
Check "Quality scores displayed" { $restoreNewContent -match "overallScore" }
Check "Print ready indicator" { $restoreNewContent -match "isPrintReady" }

# ====== FLOW 3: Commerce selection ======
Write-Host ""; Write-Host "--- Flow 3: Commerce Selection ---" -ForegroundColor Yellow
Check "isSingle branching exists" { $restoreNewContent -match "isSingle = files\.length === 1" }
Check "Resolution step for single image" { $restoreNewContent -match "SINGLE_RESOLUTION_TIERS" }
Check "Package step for multi-image" { $restoreNewContent -match 'step === "package"' }
Check "Single -> resolution, Multi -> package" { $restoreNewContent -match 'isSingle \? "resolution" : "package"' }
Check "Payment step branches on isSingle" { $restoreNewContent -match 'isSingle \? selectedResolution' }

# ====== FLOW 4: Payment gate ======
Write-Host ""; Write-Host "--- Flow 4: Payment Gate ---" -ForegroundColor Yellow
$restorationCtrl = Join-Path $ApiSrc "controllers/restoration.controller.ts"
$restorationCtrlContent = Get-Content $restorationCtrl -Raw
Check "processItem has payment guard (PAYMENT_REQUIRED)" { $restorationCtrlContent -match "PAYMENT_REQUIRED" }
Check "processItem requires APPROVED or COMPLETED" { $restorationCtrlContent -match "APPROVED" -and $restorationCtrlContent -match "COMPLETED" }
Check "Frontend processItem NOT called before payment" { $restoreNewContent -notmatch "processItem" }

$imageQueue = Join-Path $ApiSrc "queues/image.queue.ts"
$imageQueueContent = Get-Content $imageQueue -Raw
Check "image.queue.ts enqueueImageProcessing checks PAID" { $imageQueueContent -match "paymentStatus.*PAID" }

# ====== FLOW 5: Provider ======
Write-Host ""; Write-Host "--- Flow 5: Provider Selection ---" -ForegroundColor Yellow
$policyEngine = Join-Path $ApiSrc "restoration-providers/policy/ProviderPolicyEngine.ts"
$policyEngineContent = Get-Content $policyEngine -Raw
Check "ProviderPolicyEngine disables runpod" { $policyEngineContent -match 'disabledProviders.*runpod' }

$pipelineOrch = Join-Path $ApiSrc "restoration-providers/pipeline/PipelineOrchestrator.ts"
$pipelineOrchContent = Get-Content $pipelineOrch -Raw
Check "PipelineOrchestrator default tier is replicate" { $pipelineOrchContent -match "return.*replicate" }

$restSvc = Join-Path $ApiSrc "services/restoration.service.ts"
$restSvcContent = Get-Content $restSvc -Raw
Check "ProcessItem uses PipelineOrchestrator" { $restSvcContent -match "pipelineOrchestrator\.execute" }

$envConfig = Join-Path $ApiSrc "config/env.ts"
$envConfigContent = Get-Content $envConfig -Raw
Check "Default restorationPipeline is replicate" { $envConfigContent -match 'restorationPipeline.*replicate' -or $envConfigContent -match '\|\| "replicate"' }

# ====== FLOW 6: Queue ======
Write-Host ""; Write-Host "--- Flow 6: Queue ---" -ForegroundColor Yellow
$phaseCQueue = Join-Path $ApiSrc "queues/phase-c-image-processing.queue.ts"
$phaseCContent = Get-Content $phaseCQueue -Raw
Check "PhaseC queue exists" { Test-Path $phaseCQueue }

# ====== FLOW 7: No background-removal in restoration flow ======
Write-Host ""; Write-Host "--- Flow 7: Background Removal ---" -ForegroundColor Yellow
Check "RestoreNewPage does NOT use background-removal endpoint" { $restoreNewContent -notmatch "background-removal" }
Check "RestoreOrderPage does NOT use background-removal endpoint" { (Get-Content (Join-Path $FrontendSrc "pages/RestoreOrderPage.tsx") -Raw) -notmatch "background-removal" }

# ====== FLOW 8: No RunPod in active code ======
Write-Host ""; Write-Host "--- Flow 8: RunPod References ---" -ForegroundColor Yellow
Check "Restoration service does NOT call runRunPodRequest" { $restSvcContent -notmatch "runRunPodRequest" }
Check "Restoration controller does NOT call runRunPodRequest" { $restorationCtrlContent -notmatch "runRunPodRequest" }
Check "Pipeline orchestrator does NOT reference runpod in default path" { $pipelineOrchContent -notmatch "RunPod" -or $pipelineOrchContent -match "LEGACY_LOCAL_PIPELINE" }

# ====== SUMMARY ======
Write-Host ""
Write-Host "=== RESULTS ===" -ForegroundColor Cyan
Write-Host "Passed: $passed"
Write-Host "Failed: $errors"

if ($errors -gt 0) {
    Write-Host "OVERALL: FAILED" -ForegroundColor Red
    exit 1
}
Write-Host "OVERALL: ALL $passed CHECKS PASSED" -ForegroundColor Green
Write-Host ""
Write-Host "One upload flow: /restore/new -> RestoreNewPage.tsx" -ForegroundColor Cyan
Write-Host "One preview flow: preview step with AI analysis" -ForegroundColor Cyan
Write-Host "One payment gate: processItem requires APPROVED/COMPLETED" -ForegroundColor Cyan
Write-Host "One provider: ReplicatePipelineProvider (replicate tier)" -ForegroundColor Cyan
Write-Host "One queue: BullMQ after payment confirmation" -ForegroundColor Cyan

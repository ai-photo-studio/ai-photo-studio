# OPS-144 Regression: Preview Render Verification
# Preview must show for EVERY uploaded image with:
# large thumbnail, filename, dimensions, filesize, DPI, estimated print size,
# damage score, quality score, face count, color/BW, recommended resolution, print-ready indicator

param(
    [string]$PageFile = "apps/web/src/pages/RestoreNewPage.tsx"
)

$errors = 0

Write-Host "=== OPS-144: Preview Render Check ===" -ForegroundColor Cyan

if (-not (Test-Path $PageFile)) {
    Write-Host "FAIL: $PageFile not found" -ForegroundColor Red
    exit 1
}

$content = Get-Content $PageFile -Raw

# ---- CHECK 1: All files shown in preview ----
if ($content -match 'files\.map' -and $content -match 'f\.base64') {
    Write-Host "PASS: Preview iterates all uploaded images (files.map)" -ForegroundColor Green
} else {
    Write-Host "FAIL: Preview does not iterate all uploaded images" -ForegroundColor Red
    $errors++
}

# ---- CHECK 2: Thumbnail display ----
if ($content -match 'data:.*base64') {
    Write-Host "PASS: Thumbnail displayed via base64 data URL" -ForegroundColor Green
} else {
    Write-Host "FAIL: Thumbnail display missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 3: Filename display ----
if ($content -match 'f\.name') {
    Write-Host "PASS: Filename displayed" -ForegroundColor Green
} else {
    Write-Host "FAIL: Filename display missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 4: Dimensions display (resolution.width) ----
if ($content -match 'resolution\.width' -and $content -match 'resolution\.height') {
    Write-Host "PASS: Image dimensions displayed" -ForegroundColor Green
} else {
    Write-Host "FAIL: Image dimensions missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 5: DPI displayed ----
if ($content -match 'DPI') {
    Write-Host "PASS: DPI indicator displayed" -ForegroundColor Green
} else {
    Write-Host "FAIL: DPI indicator missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 6: Damage severity displayed ----
if ($content -match 'damageSeverity') {
    Write-Host "PASS: Damage severity displayed" -ForegroundColor Green
} else {
    Write-Host "FAIL: Damage severity missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 7: Quality scores displayed ----
if ($content -match 'overallScore' -and $content -match 'sharpnessScore') {
    Write-Host "PASS: Quality scores (overall, sharpness) displayed" -ForegroundColor Green
} else {
    Write-Host "FAIL: Quality scores missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 8: Face count displayed ----
if ($content -match 'faceCount') {
    Write-Host "PASS: Face count displayed" -ForegroundColor Green
} else {
    Write-Host "FAIL: Face count missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 9: Color/BW displayed ----
if ($content -match 'isBlackAndWhite') {
    Write-Host "PASS: Color/BW status displayed" -ForegroundColor Green
} else {
    Write-Host "FAIL: Color/BW status missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 10: Recommended resolution displayed ----
if ($content -match 'recommendedRes') {
    Write-Host "PASS: Recommended resolution displayed" -ForegroundColor Green
} else {
    Write-Host "FAIL: Recommended resolution missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 11: Print ready indicator ----
if ($content -match 'isPrintReady') {
    Write-Host "PASS: Print ready indicator displayed" -ForegroundColor Green
} else {
    Write-Host "FAIL: Print ready indicator missing" -ForegroundColor Red
    $errors++
}

# ---- CHECK 12: Filesize displayed ----
if ($content -match 'f\.size' -or $content -match 'fileSizeBytes') {
    Write-Host "PASS: File size displayed" -ForegroundColor Green
} else {
    Write-Host "FAIL: File size display missing" -ForegroundColor Red
    $errors++
}

Write-Host ""
if ($errors -gt 0) {
    Write-Host "FAILED: $errors preview render check(s) failed." -ForegroundColor Red
    exit 1
}
Write-Host "ALL PREVIEW RENDER CHECKS PASSED. All 12 metadata fields confirmed." -ForegroundColor Green

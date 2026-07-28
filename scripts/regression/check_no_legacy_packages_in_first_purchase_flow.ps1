# Regression Protection: Verify no hardcoded legacy package names appear in first-purchase flow pages.
param(
    [string]$FrontendSrc = "apps/web/src/pages"
)

$flowPages = @("RestoreNewPage.tsx", "RestoreOrderPage.tsx", "PricingPage.tsx")
$legacyNames = @("Starter", "Business", "Dealer")
$errors = 0

foreach ($page in $flowPages) {
    $filePath = Join-Path $FrontendSrc $page
    if (-not (Test-Path $filePath)) {
        Write-Warning "$filePath not found"
        continue
    }
    $content = Get-Content $filePath -Raw
    
    foreach ($name in $legacyNames) {
        if ($content -match [regex]::Escape($name)) {
            Write-Host "FAIL: $filePath contains hardcoded '$name'" -ForegroundColor Red
            Select-String -Path $filePath -Pattern $name | ForEach-Object {
                Write-Host "  Line $($_.LineNumber): $($_.Line.Trim())" -ForegroundColor Red
            }
            $errors++
        }
    }
    
    # For "Pro", check it's not a substring of common words
    if ($content -match '(?<!\w)Pro(?!\w)') {
        # Filter out lines where "Pro" is part of: Profile, Processing, Provider, Protected, Prompt, Product, Project, Property, Protocol
        $proLines = Select-String -Path $filePath -Pattern '\bPro\b' | Where-Object {
            $_ -notmatch '\b(Profile|Processing|Provider|Protected|Prompt|Product|Project|Property|Protocol)\b'
        }
        if ($proLines) {
            Write-Host "FAIL: $filePath contains hardcoded 'Pro' (as standalone plan name)" -ForegroundColor Red
            $proLines | ForEach-Object {
                Write-Host "  Line $($_.LineNumber): $($_.Line.Trim())" -ForegroundColor Red
            }
            $errors++
        }
    }
}

if ($errors -gt 0) {
    Write-Host "`nREGRESSION: $errors hardcoded legacy package name(s) found in first-purchase flow pages." -ForegroundColor Red
    exit 1
}

Write-Host "OK: No hardcoded legacy package names in first-purchase flow pages." -ForegroundColor Green

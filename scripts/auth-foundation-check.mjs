#!/usr/bin/env pwsh
<#
.SYNOPSIS
Phase 1.2 Auth Foundation - Status Check
Run this after completing manual browser authentication.
#>

param(
    [switch]$Report
)

$ErrorActionPreference = 'SilentlyContinue'
$results = @{}

function Test-Cmd {
    param($Name, $Path)
    if (Test-Path $Path) {
        $results[$Name] = "READY"
        return $true
    } else {
        $results[$Name] = "MISSING"
        return $false
    }
}

Write-Host "`n=== PHASE 1.2 AUTH FOUNDATION STATUS ===`n" -ForegroundColor Cyan

$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "[1/7] Toolchain" -ForegroundColor Yellow
Test-Cmd -Name "Git" -Path "D:\Programs\Git\cmd\git.exe"
Test-Cmd -Name "Node" -Path "D:\Programs\nodejs\node-v24.15.0-win-x64\node.exe"
Test-Cmd -Name "gcloud" -Path "D:\Programs\GoogleCloudSDK\google-cloud-sdk\bin\gcloud.cmd"
Test-Cmd -Name "gh" -Path (Get-Command gh -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
Test-Cmd -Name "wrangler" -Path (Get-Command npx -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
Test-Cmd -Name "railway" -Path (Get-Command railway -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)

Write-Host "`n[2/7] Google Cloud" -ForegroundColor Yellow
& gcloud version 2>&1 | Out-Null
$results["gcloud_version"] = "OK"
$authList = & gcloud auth list 2>&1
if ($LASTEXITCODE -eq 0 -and $authList -match "^\s*\*\s+\S+") {
    $results["gcloud_auth"] = "AUTHENTICATED"
} else {
    $results["gcloud_auth"] = "NOT_AUTHENTICATED"
}
$config = & gcloud config list 2>&1
if ($config -match "project = AIStudio") {
    $results["gcloud_project"] = "AIStudio"
} else {
    $results["gcloud_project"] = "NOT_SET"
}

Write-Host "`n[3/7] GitHub" -ForegroundColor Yellow
$ghStatus = & gh auth status 2>&1
if ($ghStatus -match "Logged in to github.com account \S+ \(active\)") {
    $results["gh_auth"] = "AUTHENTICATED"
} else {
    $results["gh_auth"] = "NOT_AUTHENTICATED"
}
$ghUser = ""
if ($ghStatus -match "account (\S+)") { $ghUser = $Matches[1] }
$results["gh_user"] = $ghUser
$remote = & git remote get-url origin 2>&1
$results["git_remote"] = $remote

Write-Host "`n[4/7] Cloudflare" -ForegroundColor Yellow
$cf = & npx wrangler whoami 2>&1
if ($cf -match "Account Name\s+\|\s+(\S+)") {
    $results["cf_account"] = $Matches[1]
} else {
    $results["cf_account"] = "UNKNOWN"
}
if ($cf -match "Account ID\s+\|\s+([a-f0-9]+)") {
    $results["cf_account_id"] = $Matches[1]
} else {
    $results["cf_account_id"] = "UNKNOWN"
}
$pages = & npx wrangler pages project list 2>&1
$results["pages_ai_photo_studio"] = if ($pages -match "ai-photo-studio") { "EXISTS" } else { "MISSING" }
$r2 = & npx wrangler r2 bucket list 2>&1
$results["r2_ai_photo_studio_storage"] = if ($r2 -match "ai-photo-studio-storage") { "EXISTS" } else { "MISSING" }

Write-Host "`n[5/7] Railway" -ForegroundColor Yellow
$railwayStatus = & railway status 2>&1
if ($LASTEXITCODE -eq 0) {
    $results["railway"] = "CONNECTED"
} else {
    $results["railway"] = "NOT_CONNECTED"
}

Write-Host "`n[6/7] Project Verification" -ForegroundColor Yellow
$build = npm run build 2>&1
$results["build"] = if ($LASTEXITCODE -eq 0) { "PASS" } else { "FAIL" }
$typecheck = npm run typecheck 2>&1
$results["typecheck"] = if ($LASTEXITCODE -eq 0) { "PASS" } else { "FAIL" }
$verify = node scripts/verify-project.js 2>&1
$results["enterprise_verify"] = if ($verify -match "PROJECT VERIFIED") { "PASS" } else { "FAIL" }

Write-Host "`n[7/7] Token / Environment Config" -ForegroundColor Yellow
$results["GCP_SERVICE_ACCOUNT_KEY"] = if (Test-Path ".gcp-service-account.json") { "EXISTS" } else { "NOT_CONFIGURED" }
$results["GITHUB_TOKEN"] = if ($env:GH_TOKEN) { "SET" } else { "NOT_SET" }
$results["CLOUDFLARE_API_TOKEN"] = if ($env:CLOUDFLARE_API_TOKEN) { "SET" } else { "NOT_SET" }

Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
$results.GetEnumerator() | ForEach-Object {
    $color = switch ($_.Value) {
        "PASS" { "Green" }
        "EXISTS" { "Green" }
        "AUTHENTICATED" { "Green" }
        "CONNECTED" { "Green" }
        "OK" { "Green" }
        "SET" { "Green" }
        "FAIL" { "Red" }
        "MISSING" { "Red" }
        "NOT_AUTHENTICATED" { "Red" }
        "NOT_CONNECTED" { "Red" }
        "NOT_SET" { "Red" }
        "NOT_CONFIGURED" { "Yellow" }
        default { "White" }
    }
    Write-Host ("  {0,-30} {1}" -f $_.Name, $_.Value) -ForegroundColor $color
}

$blockers = @()
if ($results["gcloud_auth"] -ne "AUTHENTICATED") { $blockers += "gcloud_auth" }
if ($results["gh_auth"] -ne "AUTHENTICATED") { $blockers += "gh_auth" }
if ($results["cf_account"] -notmatch "Wpaistudio") { $blockers += "cloudflare_account" }

Write-Host "`nBlockers: $($blockers -join ', ')" -ForegroundColor $(if ($blockers) { "Red" } else { "Green" })
Write-Host "`nOutput format SUITABLE FOR COPY-PASTE INTO ai_code_audit_report.md`n"

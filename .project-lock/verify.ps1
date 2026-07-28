$ErrorActionPreference = "Stop"

function Stop-Lock {
  param([string]$Message)
  Write-Error "PROJECT LOCK FAILED: $Message"
  exit 1
}

function Invoke-Git {
  param([string[]]$Arguments)
  $output = & git @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) {
    Stop-Lock "git $($Arguments -join ' ') failed"
  }
  return $output
}

$repoRoot = (Invoke-Git -Arguments @("rev-parse", "--show-toplevel")).Trim()
if (-not $repoRoot) {
  Stop-Lock "Unable to detect repository root"
}

$identityPath = Join-Path $repoRoot ".project-lock\identity.json"
if (-not (Test-Path -LiteralPath $identityPath)) {
  Stop-Lock "Missing .project-lock\identity.json"
}

try {
  $identity = Get-Content -LiteralPath $identityPath -Raw | ConvertFrom-Json
} catch {
  Stop-Lock "Unable to parse .project-lock\identity.json"
}

$origin = (Invoke-Git -Arguments @("remote", "get-url", "origin")).Trim()
$branch = (Invoke-Git -Arguments @("branch", "--show-current")).Trim()
$expectedRemote = [string]$identity.git.expectedRemoteContains
$expectedBranch = [string]$identity.git.expectedBranch

Write-Host "Project lock verification"
Write-Host "Repo root: $repoRoot"
Write-Host "Project: $($identity.projectName)"
Write-Host "Safe code: $($identity.safeProjectCode)"
Write-Host "Origin: $origin"
Write-Host "Branch: $branch"
Write-Host "Expected origin contains: $expectedRemote"
Write-Host "Expected branch: $expectedBranch"

$failed = $false
if ($origin -notlike "*$expectedRemote*") {
  Write-Error "Origin mismatch"
  $failed = $true
}

if ($branch -ne $expectedBranch) {
  Write-Error "Branch mismatch"
  $failed = $true
}

Write-Host "Changed files:"
$changedFiles = Invoke-Git -Arguments @("status", "--short")
if ($changedFiles) {
  $changedFiles | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "(none)"
}

if ($failed) {
  exit 1
}

Write-Host "Project lock verification passed."
exit 0

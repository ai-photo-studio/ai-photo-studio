param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$WranglerArgs
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$verify = Join-Path $scriptDir "verify.ps1"
& $verify
if ($LASTEXITCODE -ne 0) {
  Write-Error "Wrangler command blocked because project verification failed."
  exit 1
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
$identity = Get-Content -LiteralPath (Join-Path $repoRoot ".project-lock\identity.json") -Raw | ConvertFrom-Json

if (-not [bool]$identity.cloudflare.enabled) {
  Write-Error "Wrangler is not configured for this project."
  exit 1
}

if (-not $identity.cloudflare.expectedWranglerConfig) {
  Write-Error "Wrangler is not configured for this project."
  exit 1
}

$configPath = Join-Path $repoRoot ([string]$identity.cloudflare.expectedWranglerConfig)
if (-not (Test-Path -LiteralPath $configPath)) {
  Write-Error "Wrangler is not configured for this project."
  exit 1
}

Write-Host "Wrangler identity:"
& wrangler whoami
if ($LASTEXITCODE -ne 0) {
  Write-Error "wrangler whoami failed. Command blocked."
  exit 1
}

Write-Host "Expected Cloudflare account hint: $($identity.cloudflare.expectedAccountHint)"
Write-Host "Expected R2 bucket: $($identity.cloudflare.expectedR2Bucket)"
Write-Host "Expected Wrangler config: $($identity.cloudflare.expectedWranglerConfig)"

if (-not $WranglerArgs -or $WranglerArgs.Count -eq 0) {
  Write-Host "No Wrangler command supplied. Identity check only."
  exit 0
}

Write-Host "Requested Wrangler command: wrangler $($WranglerArgs -join ' ')"
$confirm = Read-Host "Type YES to run this Wrangler command"
if ($confirm -ne "YES") {
  Write-Error "Wrangler command blocked by manual confirmation."
  exit 1
}

& wrangler @WranglerArgs
exit $LASTEXITCODE

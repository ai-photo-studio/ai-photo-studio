param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RailwayArgs
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$verify = Join-Path $scriptDir "verify.ps1"
& $verify
if ($LASTEXITCODE -ne 0) {
  Write-Error "Railway command blocked because project verification failed."
  exit 1
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
$identity = Get-Content -LiteralPath (Join-Path $repoRoot ".project-lock\identity.json") -Raw | ConvertFrom-Json

Write-Host "Expected Railway project: $($identity.railway.expectedProjectName)"
Write-Host "Expected Railway environment: $($identity.railway.expectedEnvironment)"
Write-Host "Expected Railway service: $($identity.railway.expectedService)"

$statusOutput = & railway status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error "Railway status failed. Command blocked."
  if ($statusOutput) {
    $statusOutput | ForEach-Object { Write-Host $_ }
  }
  exit 1
}

Write-Host "Railway status:"
if ($statusOutput) {
  $statusOutput | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "(no Railway status output)"
}

$projectMatch = $statusOutput -match [regex]::Escape($identity.railway.expectedProjectName)
$environmentMatch = $statusOutput -match [regex]::Escape($identity.railway.expectedEnvironment)
$serviceMatch = $statusOutput -match [regex]::Escape($identity.railway.expectedService)
$projectState = if ($projectMatch) { "yes" } else { "no" }
$environmentState = if ($environmentMatch) { "yes" } else { "no" }
$serviceState = if ($serviceMatch) { "yes" } else { "no" }
Write-Host "Railway project match: $projectState"
Write-Host "Railway environment match: $environmentState"
Write-Host "Railway service match: $serviceState"

if (-not $RailwayArgs -or $RailwayArgs.Count -eq 0) {
  Write-Host "No Railway command supplied. Status check only."
  exit 0
}

Write-Host "Requested Railway command: railway $($RailwayArgs -join ' ')"
$confirm = Read-Host "Type YES to run this Railway command"
if ($confirm -ne "YES") {
  Write-Error "Railway command blocked by manual confirmation."
  exit 1
}

& railway @RailwayArgs
exit $LASTEXITCODE

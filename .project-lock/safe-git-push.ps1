$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$verify = Join-Path $scriptDir "verify.ps1"
& $verify
if ($LASTEXITCODE -ne 0) {
  Write-Error "Push blocked because project verification failed."
  exit 1
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
$identity = Get-Content -LiteralPath (Join-Path $repoRoot ".project-lock\identity.json") -Raw | ConvertFrom-Json
$expectedBranch = [string]$identity.git.expectedBranch
$currentBranch = (& git branch --show-current).Trim()

if ($currentBranch -ne $expectedBranch) {
  Write-Error "Push blocked: current branch '$currentBranch' is not '$expectedBranch'."
  exit 1
}

Write-Host "Pushing expected branch '$expectedBranch' to origin."
& git push origin "$expectedBranch"
exit $LASTEXITCODE

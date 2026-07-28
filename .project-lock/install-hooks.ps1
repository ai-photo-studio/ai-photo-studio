$ErrorActionPreference = "Stop"

$repoRoot = (& git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
  Write-Error "Unable to detect repository root."
  exit 1
}

$hookDir = Join-Path $repoRoot ".git\hooks"
$hookPath = Join-Path $hookDir "pre-push"
$verifyPath = Join-Path $repoRoot ".project-lock\verify.ps1"

if (-not (Test-Path -LiteralPath $verifyPath)) {
  Write-Error "Missing .project-lock\verify.ps1."
  exit 1
}

$hookContent = @'
#!/bin/sh
repo_root=$(git rev-parse --show-toplevel)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$repo_root/.project-lock/verify.ps1"
status=$?
if [ "$status" -ne 0 ]; then
  echo "pre-push blocked: project lock verification failed"
  exit "$status"
fi
'@

Set-Content -LiteralPath $hookPath -Value $hookContent -Encoding ascii
Write-Host "Installed pre-push hook at .git/hooks/pre-push"
exit 0

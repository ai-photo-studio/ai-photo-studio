$ErrorActionPreference = 'Stop'

function Write-RunnerError {
    param([string]$Message)
    Write-Error $Message
    exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$codexCommand = @'
Read rules.md and .kilo/plans/commerceflownew.md.

Complete the current task fully.

Requirements:
1. Inspect the repository before editing.
2. Follow the Protected Scope Protocol in docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md.
3. Make only task-related changes.
4. Run dependency installation or Prisma generation only when required.
5. Run typecheck, tests, and build where available.
6. Record the task in AI_code_audit_report_RI.md (ignored, local audit history only) after every task.
7. Commit only task-related files after successful verification.
8. Do not push, merge, deploy, modify cloud resources, or expose secrets.
9. If verification fails, do not commit. Record the failure in AI_code_audit_report_RI.md.
'@

try {
    $codexArgs = @('exec', $codexCommand)
    & codex @codexArgs
    if ($LASTEXITCODE -ne 0) {
        Write-RunnerError "codex exec failed with exit code $LASTEXITCODE"
    }
}
catch {
    Write-RunnerError "Failed to run codex exec: $($_.Exception.Message)"
}

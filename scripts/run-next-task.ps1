$ErrorActionPreference = 'Stop'

function Write-RunnerError {
    param([string]$Message)
    Write-Error $Message
    exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$codexCommand = @'
Read AGENTS.md and docs/NEXT_TASK.md.

Complete the current task fully.

Requirements:
1. Inspect the repository before editing.
2. Follow docs/PROTECTED_SCOPE.md.
3. Make only task-related changes.
4. Run dependency installation or Prisma generation only when required.
5. Run typecheck, tests, and build where available.
6. Update docs/PROJECT_STATE.md.
7. Update docs/COMPLETION_STATUS.md.
8. Replace docs/NEXT_TASK.md with the next recommended task.
9. Update reports/LATEST.md.
10. Commit only task-related files after successful verification.
11. Do not push, merge, deploy, modify cloud resources, or expose secrets.
12. If verification fails, do not commit. Record the failure in reports/LATEST.md.
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

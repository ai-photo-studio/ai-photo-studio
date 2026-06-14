# Runtime Diagnostics Script
# Checks all required tools and paths for AI validation

$ErrorActionPreference = "Stop"

Write-Host "=== Runtime Diagnostics ===" -ForegroundColor Cyan

# Check Python
Write-Host "`n[Python]" -ForegroundColor Yellow
if (Get-Command python -ErrorAction SilentlyContinue) {
    $py = python --version 2>&1
    Write-Host "  Found: $py" -ForegroundColor Green
} else {
    Write-Host "  NOT FOUND" -ForegroundColor Red
}

# Check Python3
Write-Host "`n[Python3]" -ForegroundColor Yellow
if (Get-Command python3 -ErrorAction SilentlyContinue) {
    $py3 = python3 --version 2>&1
    Write-Host "  Found: $py3" -ForegroundColor Green
} else {
    Write-Host "  NOT FOUND" -ForegroundColor Red
}

# Check Py
Write-Host "`n[Py]" -ForegroundColor Yellow
if (Get-Command py -ErrorAction SilentlyContinue) {
    $pycmd = py --version 2>&1
    Write-Host "  Found: $pycmd" -ForegroundColor Green
} else {
    Write-Host "  NOT FOUND" -ForegroundColor Red
}

# Check Bash
Write-Host "`n[Bash]" -ForegroundColor Yellow
if (Get-Command bash -ErrorAction SilentlyContinue) {
    $bash = bash --version 2>&1 | Select-Object -First 1
    Write-Host "  Found: $bash" -ForegroundColor Green
} else {
    Write-Host "  NOT FOUND" -ForegroundColor Red
}

# Check Git
Write-Host "`n[Git]" -ForegroundColor Yellow
if (Get-Command git -ErrorAction SilentlyContinue) {
    $git = git --version 2>&1
    Write-Host "  Found: $git" -ForegroundColor Green
} else {
    Write-Host "  NOT FOUND" -ForegroundColor Red
}

# Check Railway
Write-Host "`n[Railway]" -ForegroundColor Yellow
if (Get-Command railway -ErrorAction SilentlyContinue) {
    $railway = railway --version 2>&1
    Write-Host "  Found: $railway" -ForegroundColor Green
} else {
    Write-Host "  NOT FOUND" -ForegroundColor Red
}

# Check Wrangler
Write-Host "`n[Wrangler]" -ForegroundColor Yellow
if (Get-Command wrangler -ErrorAction SilentlyContinue) {
    $wrangler = wrangler --version 2>&1
    Write-Host "  Found: $wrangler" -ForegroundColor Green
} else {
    Write-Host "  NOT FOUND" -ForegroundColor Red
}

# Check Node
Write-Host "`n[Node]" -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
    $node = node --version 2>&1
    Write-Host "  Found: $node" -ForegroundColor Green
} else {
    Write-Host "  NOT FOUND" -ForegroundColor Red
}

# Check NPM
Write-Host "`n[NPM]" -ForegroundColor Yellow
if (Get-Command npm -ErrorAction SilentlyContinue) {
    $npm = npm --version 2>&1
    Write-Host "  Found: $npm" -ForegroundColor Green
} else {
    Write-Host "  NOT FOUND" -ForegroundColor Red
}

# Check pip
Write-Host "`n[pip]" -ForegroundColor Yellow
if (Get-Command pip -ErrorAction SilentlyContinue) {
    $pip = pip --version 2>&1
    Write-Host "  Found: $pip" -ForegroundColor Green
} else {
    Write-Host "  NOT FOUND" -ForegroundColor Red
}

# Check paths
Write-Host "`n[Paths]" -ForegroundColor Yellow
Write-Host "  Python: $((Get-Command python -ErrorAction SilentlyContinue).Source)" -ForegroundColor Green
Write-Host "  Git: $((Get-Command git -ErrorAction SilentlyContinue).Source)" -ForegroundColor Green
Write-Host "  Node: $((Get-Command node -ErrorAction SilentlyContinue).Source)" -ForegroundColor Green

Write-Host "`n=== Diagnostics Complete ===" -ForegroundColor Cyan
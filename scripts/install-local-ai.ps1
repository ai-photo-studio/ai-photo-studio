# Local AI Installation Script
# Installs ML packages and verifies imports

$ErrorActionPreference = "Stop"
$LogFile = "install-log.txt"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] $Message"
    Write-Host $logEntry
    Add-Content -Path $LogFile -Value $logEntry
}

Write-Log "=== Local AI Installation Started ==="

# Install wrangler globally
Write-Log "Installing wrangler..."
try {
    npm install -g wrangler 2>&1 | Tee-Object -Append -FilePath $LogFile
    Write-Log "wrangler installed successfully"
} catch {
    Write-Log "wrangler installation failed: $_"
}

# Install Python packages
$packages = @("rembg", "ultralytics", "open_clip_torch", "realesrgan", "torch", "pillow")

foreach ($pkg in $packages) {
    Write-Log "Installing $pkg..."
    try {
        pip install $pkg 2>&1 | Tee-Object -Append -FilePath $LogFile
        Write-Log "$pkg installed successfully"
    } catch {
        Write-Log "Failed to install $pkg: $_"
    }
}

# Verify imports
Write-Log "=== Verifying Imports ==="

$verifyImports = {
    import sys
    packages = ['rembg', 'ultralytics', 'open_clip', 'realesrgan', 'torch', 'PIL']
    results = {}
    for pkg in packages:
        try:
            __import__(pkg.replace('-', '_'))
            results[pkg] = 'OK'
        except Exception as e:
            results[pkg] = f'FAILED: {e}'
    import json
    print(json.dumps(results, indent=2))
}

Write-Log "Import verification:"
$verifyOutput = python -c $verifyImports 2>&1
Write-Log $verifyOutput

Write-Log "=== Installation Complete ==="
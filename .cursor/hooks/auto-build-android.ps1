# Auto-build Android when Cursor opens the project (background, no UI).
$ErrorActionPreference = "Continue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$StatusFile = Join-Path $Root "BUILD_STATUS.json"
$LockFile = Join-Path $Root ".build-in-progress.lock"

function Write-Status($phase, $ok, $msg) {
    $obj = @{
        updated_at = (Get-Date -Format "o")
        phase      = $phase
        ok         = $ok
        message    = $msg
    }
    $obj | ConvertTo-Json | Set-Content -Path $StatusFile -Encoding UTF8
}

# Skip if build ran in last 30 min or already running
if (Test-Path $LockFile) {
    $age = (Get-Date) - (Get-Item $LockFile).LastWriteTime
    if ($age.TotalMinutes -lt 30) { exit 0 }
}
$releases = Join-Path $Root "app\frontend\releases\Sortirovka24-latest-debug.apk"
if ((Test-Path $releases) -and ((Get-Item $releases).LastWriteTime -gt (Get-Date).AddHours(-2))) {
    Write-Status "done" $true "APK already fresh: $releases"
    exit 0
}

New-Item -ItemType File -Path $LockFile -Force | Out-Null
Write-Status "started" $null "Background build v1.0.25..."

try {
    $script = Join-Path $Root "scripts\run-android-build-once.ps1"
    if (-not (Test-Path $script)) {
        Write-Status "error" $false "Missing $script"
        exit 1
    }
    & powershell -NoProfile -ExecutionPolicy Bypass -File $script
    if ($LASTEXITCODE -ne 0) {
        Write-Status "error" $false "Build script exit $LASTEXITCODE. See build-log.txt"
        exit 1
    }
    Write-Status "done" $true "APK ready in app\frontend\releases\"
} catch {
    Write-Status "error" $false $_.Exception.Message
} finally {
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}

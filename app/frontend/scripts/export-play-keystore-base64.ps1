# Export Play Store keystore as base64 for GitHub Actions secret PLAY_KEYSTORE_BASE64.
# Run AFTER setup-play-keystore.ps1 (one-time, on your PC):
#   powershell -ExecutionPolicy Bypass -File scripts/export-play-keystore-base64.ps1

$ErrorActionPreference = "Stop"
$FrontendRoot = Split-Path $PSScriptRoot -Parent
$Jks = Join-Path $FrontendRoot "android\sortirovka24-release.jks"
$Out = Join-Path $FrontendRoot "android\PLAY_KEYSTORE_BASE64.txt"

if (-not (Test-Path $Jks)) {
    Write-Host "Keystore not found. Run first: npm run setup:play-keystore"
    exit 1
}

$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Jks))
Set-Content -Path $Out -Value $b64 -Encoding ASCII -NoNewline

Write-Host "Written: $Out"
Write-Host ""
Write-Host "GitHub → Settings → Secrets → Actions → New repository secret:"
Write-Host "  PLAY_KEYSTORE_BASE64  = contents of PLAY_KEYSTORE_BASE64.txt"
Write-Host "  PLAY_KEYSTORE_PASSWORD = from PLAY_SIGNING_SECRET.txt"
Write-Host "  PLAY_KEY_ALIAS = sortirovka24"
Write-Host "  PLAY_KEY_PASSWORD = same as store password"
Write-Host ""
Write-Host "Then: Actions → Android Release (Google Play AAB) → Run workflow"

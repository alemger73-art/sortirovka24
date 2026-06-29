# Sortirovka24 - release AAB/APK build (requires signing keystore)
# Run: powershell -ExecutionPolicy Bypass -File scripts/build-android-release.ps1

$ErrorActionPreference = "Stop"
$FrontendRoot = Split-Path $PSScriptRoot -Parent
$AndroidRoot = Join-Path $FrontendRoot "android"
$KeystoreProps = Join-Path $AndroidRoot "keystore.properties"

if (-not (Test-Path $KeystoreProps)) {
    Write-Host "Keystore not found - running setup-play-keystore.ps1 ..."
    & (Join-Path $PSScriptRoot "setup-play-keystore.ps1")
    if (-not (Test-Path $KeystoreProps)) {
        Write-Host "ERROR: keystore.properties still missing after setup."
        exit 1
    }
}

Write-Host "=== Sortirovka24 Android RELEASE build ==="

& node (Join-Path $PSScriptRoot "store-prep.mjs")
if ($LASTEXITCODE -ne 0) { throw "store-prep failed" }

& (Join-Path $PSScriptRoot "build-android.ps1") -SkipGradle

Set-Location $AndroidRoot
Write-Host "Gradle bundleRelease..."
$ErrorActionPreference = "Continue"
& .\gradlew.bat bundleRelease assembleRelease --no-daemon 2>&1 | ForEach-Object { Write-Host $_ }
$gradleExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($gradleExit -ne 0) { throw "Gradle release failed with exit $gradleExit" }

$aab = Join-Path $AndroidRoot "app\build\outputs\bundle\release\app-release.aab"
$apk = Join-Path $AndroidRoot "app\build\outputs\apk\release\app-release.apk"
$ReleasesDir = Join-Path $FrontendRoot "releases"
New-Item -ItemType Directory -Force -Path $ReleasesDir | Out-Null

if (Test-Path $aab) {
    $dest = Join-Path $ReleasesDir "Sortirovka24-release.aab"
    Copy-Item $aab $dest -Force
    Write-Host "AAB: $dest"
}
if (Test-Path $apk) {
    $dest = Join-Path $ReleasesDir "Sortirovka24-release.apk"
    Copy-Item $apk $dest -Force
    Write-Host "APK: $dest"
}

Write-Host "SUCCESS - release artifacts ready in releases/"

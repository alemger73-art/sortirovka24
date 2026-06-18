# Sortirovka24 Admin - build standalone Android APK for the admin panel.
# Run:  powershell -ExecutionPolicy Bypass -File scripts/build-admin-android.ps1
#
# The app runs in live mode: it opens /admin from Railway in a WebView.
# So you build the APK once - the content updates from the server.

param(
    [switch]$SkipGradle
)

$ErrorActionPreference = "Stop"
$AdminRoot   = Split-Path $PSScriptRoot -Parent
$AndroidRoot = Join-Path $AdminRoot "android"
$ReleasesDir = Join-Path $AdminRoot "releases"

# Reuse the Android SDK from the main app.
$SdkRoot = Join-Path (Split-Path $AdminRoot -Parent) "frontend\.android-sdk"

# Locate Java (Android Studio JBR).
$JbrCandidates = @(
    "C:\Program Files\Android\Android Studio\jbr",
    "${env:ProgramFiles}\Android\Android Studio\jbr",
    "${env:ProgramFiles(x86)}\Android\Android Studio\jbr"
)
$JavaHome = $JbrCandidates | Where-Object { Test-Path (Join-Path $_ "bin\java.exe") } | Select-Object -First 1
if (-not $JavaHome) {
    throw "Java not found. Install Android Studio: https://developer.android.com/studio"
}
$env:JAVA_HOME = $JavaHome
$env:PATH = "$JavaHome\bin;$env:PATH"

if (-not (Test-Path $SdkRoot)) {
    throw "Android SDK not found at $SdkRoot. Build the main app (app/frontend) first - it downloads the SDK."
}
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot

Write-Host "JAVA_HOME=$JavaHome"
Write-Host "ANDROID_HOME=$SdkRoot"

# Write local.properties with the SDK path.
$sdkDirEscaped = ($SdkRoot -replace '\\', '\\')
Set-Content -Path (Join-Path $AndroidRoot "local.properties") -Value "sdk.dir=$sdkDirEscaped`n" -Encoding UTF8

Set-Location $AdminRoot

if (-not (Test-Path "node_modules")) {
    Write-Host "npm install..."
    npm install 2>&1 | Write-Host
}

Write-Host "[1/2] Capacitor sync..."
$ErrorActionPreference = "Continue"
npx cap sync android 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { throw "cap sync failed with exit $LASTEXITCODE" }
$ErrorActionPreference = "Stop"

if ($SkipGradle) {
    Write-Host "SkipGradle: synced, Gradle step skipped."
    exit 0
}

Set-Location $AndroidRoot
Write-Host "[2/2] Gradle assembleDebug (first run may take 10+ minutes)..."
$ErrorActionPreference = "Continue"
& .\gradlew.bat assembleDebug --no-daemon 2>&1 | ForEach-Object { Write-Host $_ }
$gradleExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($gradleExit -ne 0) { throw "Gradle failed with exit $gradleExit" }

$apkSource = Join-Path $AndroidRoot "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apkSource)) { throw "APK not found: $apkSource" }

New-Item -ItemType Directory -Force -Path $ReleasesDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$apkDest   = Join-Path $ReleasesDir "Sortirovka24-Admin-$timestamp-debug.apk"
$latest    = Join-Path $ReleasesDir "Sortirovka24-Admin-latest-debug.apk"
Copy-Item $apkSource $apkDest -Force
Copy-Item $apkSource $latest -Force

Write-Host ""
Write-Host "DONE - admin APK built:"
Write-Host "  $latest"
Write-Host "  $apkDest"

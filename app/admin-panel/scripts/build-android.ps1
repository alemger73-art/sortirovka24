# Sortirovka24 Admin Panel — build standalone Android APK.
# Run:  powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1

param(
    [switch]$SkipGradle
)

$ErrorActionPreference = "Stop"
$PanelRoot   = Split-Path $PSScriptRoot -Parent
$FrontendRoot = Join-Path (Split-Path $PanelRoot -Parent) "frontend"
$AdminAppRoot = Join-Path (Split-Path $PanelRoot -Parent) "admin-app"
$AndroidRoot = Join-Path $AdminAppRoot "android"
$ReleasesDir = Join-Path $PanelRoot "releases"
$SdkRoot = Join-Path $FrontendRoot ".android-sdk"

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
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE ".gradle"

if (-not (Test-Path $SdkRoot)) {
    throw "Android SDK not found at $SdkRoot. Build the main app (app/frontend) first."
}
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot

Write-Host "JAVA_HOME=$JavaHome"
Write-Host "ANDROID_HOME=$SdkRoot"

if (-not (Test-Path (Join-Path $FrontendRoot "node_modules"))) {
    Write-Host "Installing frontend dependencies..."
    Set-Location $FrontendRoot
    pnpm install 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "[1/3] Build admin web bundle (frontend/dist-admin)..."
Set-Location $FrontendRoot
$ErrorActionPreference = "Continue"
pnpm run build:admin 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { throw "Admin web build failed" }
$ErrorActionPreference = "Stop"

Set-Location $AdminAppRoot
if (-not (Test-Path "node_modules")) {
    Write-Host "npm install (admin-app)..."
    npm install 2>&1 | ForEach-Object { Write-Host $_ }
}

$sdkDirEscaped = ($SdkRoot -replace '\\', '\\')
Set-Content -Path (Join-Path $AndroidRoot "local.properties") -Value "sdk.dir=$sdkDirEscaped`n" -Encoding UTF8

Write-Host "[2/3] Capacitor sync..."
$ErrorActionPreference = "Continue"
npx cap sync android 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { throw "cap sync failed" }
$ErrorActionPreference = "Stop"

if ($SkipGradle) {
    Write-Host "SkipGradle: synced, Gradle step skipped."
    exit 0
}

Set-Location $AndroidRoot
Write-Host "[3/3] Gradle assembleDebug..."
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

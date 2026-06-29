# Sortirovka24 - fully automated Android APK build
# Run: powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1
#      powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1 -SkipGradle

param(
    [switch]$SkipGradle
)

$ErrorActionPreference = "Stop"
$FrontendRoot = Split-Path $PSScriptRoot -Parent
$AndroidRoot = Join-Path $FrontendRoot "android"
$SdkRoot = Join-Path $FrontendRoot ".android-sdk"
$ReleasesDir = Join-Path $FrontendRoot "releases"
$CmdlineToolsZip = Join-Path $env:TEMP "android-cmdline-tools.zip"

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
Write-Host "JAVA_HOME=$JavaHome"

function Ensure-AndroidSdk {
    $sdkmanager = Join-Path $SdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"
    if (-not (Test-Path $sdkmanager)) {
        Write-Host "[1/5] Downloading Android SDK command-line tools..."
        $url = "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip"
        Invoke-WebRequest -Uri $url -OutFile $CmdlineToolsZip -UseBasicParsing
        $extractTemp = Join-Path $env:TEMP "android-cmdline-extract"
        if (Test-Path $extractTemp) { Remove-Item $extractTemp -Recurse -Force }
        Expand-Archive -Path $CmdlineToolsZip -DestinationPath $extractTemp -Force
        $cmdlineSrc = Join-Path $extractTemp "cmdline-tools"
        if (-not (Test-Path $cmdlineSrc)) { throw "Unexpected cmdline-tools zip layout" }
        $dest = Join-Path $SdkRoot "cmdline-tools\latest"
        New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
        if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
        Move-Item $cmdlineSrc $dest
        Remove-Item $extractTemp -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $CmdlineToolsZip -Force -ErrorAction SilentlyContinue
    }

    $env:ANDROID_HOME = $SdkRoot
    $env:ANDROID_SDK_ROOT = $SdkRoot

    Write-Host "[2/5] Accepting Android SDK licenses..."
    $yes = ("y`n" * 40)
    $yes | & $sdkmanager --licenses 2>&1 | Out-Null

    Write-Host "[3/5] Installing platform-tools, build-tools, android-35..."
    & $sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" 2>&1 | Write-Host
}

function Write-LocalProperties {
    $sdkDirEscaped = ($SdkRoot -replace '\\', '\\')
    $content = "sdk.dir=$sdkDirEscaped`n"
    Set-Content -Path (Join-Path $AndroidRoot "local.properties") -Value $content -Encoding UTF8
}

Write-Host "=== Sortirovka24 Android build ==="

Ensure-AndroidSdk
Write-LocalProperties

Set-Location $FrontendRoot

if (-not (Test-Path "node_modules")) {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        Write-Host "pnpm install..."
        pnpm install 2>&1 | Write-Host
    } else {
        Write-Host "npm install..."
        npm install 2>&1 | Write-Host
    }
}

if (-not (Test-Path ".env.mobile")) {
    Copy-Item ".env.mobile.example" ".env.mobile"
}
# Release builds overwrite .env.mobile via store-prep.mjs before this script runs.

Write-Host "[4/5] Building web bundle..."
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm run build:mobile 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "pnpm run build:mobile failed with exit $LASTEXITCODE" }
    pnpm exec cap sync android 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "cap sync failed with exit $LASTEXITCODE" }
} else {
    npm run build:mobile 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "npm run build:mobile failed with exit $LASTEXITCODE" }
    npx cap sync android 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "cap sync failed with exit $LASTEXITCODE" }
}
$ErrorActionPreference = $prevEAP

if ($SkipGradle) {
    Write-Host "SkipGradle: web bundle synced, Gradle step skipped."
    exit 0
}

Set-Location $AndroidRoot
Write-Host "[5/5] Gradle assembleDebug (first run may take 10+ minutes)..."
$ErrorActionPreference = "Continue"
& .\gradlew.bat assembleDebug --no-daemon 2>&1 | ForEach-Object { Write-Host $_ }
$gradleExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($gradleExit -ne 0) { throw "Gradle failed with exit $gradleExit" }

$apkSource = Join-Path $AndroidRoot "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apkSource)) {
    throw "APK not found: $apkSource"
}

New-Item -ItemType Directory -Force -Path $ReleasesDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$versionName = "unknown"
$gradleFile = Join-Path $AndroidRoot "app\build.gradle"
if (Test-Path $gradleFile) {
    $gradleContent = Get-Content $gradleFile -Raw
    if ($gradleContent -match 'versionName\s+"([^"]+)"') {
        $versionName = $Matches[1]
    }
}
$apkDest = Join-Path $ReleasesDir "Sortirovka24-$timestamp-debug.apk"
$apkVersioned = Join-Path $ReleasesDir "Sortirovka24-v$versionName-debug.apk"
Copy-Item $apkSource $apkDest -Force
Copy-Item $apkSource $apkVersioned -Force
$latest = Join-Path $ReleasesDir "Sortirovka24-latest-debug.apk"
Copy-Item $apkSource $latest -Force

Write-Host ""
Write-Host "SUCCESS - APK ready (live URL mode if CAPACITOR_SERVER_URL is set in .env.mobile):"
Write-Host "  $apkVersioned"
Write-Host "  $latest"
Write-Host "  $apkDest"

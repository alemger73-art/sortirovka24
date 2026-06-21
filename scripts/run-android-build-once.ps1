$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Frontend = Join-Path $Root "app\frontend"
$Android = Join-Path $Frontend "android"
$Releases = Join-Path $Frontend "releases"
$Log = Join-Path $Root "build-log.txt"

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Add-Content -Path $Log -Value $line
    Write-Host $line
}

Remove-Item $Log -Force -ErrorAction SilentlyContinue
Log "=== BUILD START ==="

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = Join-Path $Frontend ".android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = Join-Path $Frontend ".gradle-home"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Set-Location $Frontend
Log "npm run build:mobile..."
npm run build:mobile 2>&1 | Tee-Object -FilePath $Log -Append | Out-Host
if ($LASTEXITCODE -ne 0) { Log "BUILD FAILED at npm"; exit 1 }

Log "tsc --noEmit..."
npx tsc --noEmit 2>&1 | Tee-Object -FilePath $Log -Append | Out-Host
if ($LASTEXITCODE -ne 0) { Log "BUILD FAILED at tsc"; exit 1 }

Log "cap sync android..."
npx cap sync android 2>&1 | Tee-Object -FilePath $Log -Append | Out-Host
if ($LASTEXITCODE -ne 0) { Log "BUILD FAILED at cap sync"; exit 1 }

Set-Location $Android
Log "Gradle assembleDebug bundleRelease assembleRelease..."
.\gradlew.bat assembleDebug bundleRelease assembleRelease --no-daemon 2>&1 | Tee-Object -FilePath $Log -Append | Out-Host
if ($LASTEXITCODE -ne 0) { Log "BUILD FAILED at gradle"; exit 1 }

New-Item -ItemType Directory -Force -Path $Releases | Out-Null
$apk = Join-Path $Android "app\build\outputs\apk\debug\app-debug.apk"
$aab = Join-Path $Android "app\build\outputs\bundle\release\app-release.aab"

$versionName = "unknown"
$gradleFile = Join-Path $Android "app\build.gradle"
if (Test-Path $gradleFile) {
    $gradleContent = Get-Content $gradleFile -Raw
    if ($gradleContent -match 'versionName\s+"([^"]+)"') { $versionName = $Matches[1] }
}

Copy-Item $apk (Join-Path $Releases "Sortirovka24-latest-debug.apk") -Force
Copy-Item $apk (Join-Path $Releases "Sortirovka24-v$versionName-debug.apk") -Force
Copy-Item $aab (Join-Path $Releases "Sortirovka24-release.aab") -Force

$aapt = Join-Path $env:ANDROID_HOME "build-tools\35.0.0\aapt.exe"
Log "aapt badging..."
& $aapt dump badging (Join-Path $Releases "Sortirovka24-latest-debug.apk") 2>&1 | Tee-Object -FilePath $Log -Append | Out-Host

Get-Item (Join-Path $Releases "Sortirovka24-latest-debug.apk"), (Join-Path $Releases "Sortirovka24-release.aab") | Format-Table Name, Length, LastWriteTime | Out-String | Tee-Object -FilePath $Log -Append | Out-Host

Log "=== BUILD SUCCESS END ==="

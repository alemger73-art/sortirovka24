$ErrorActionPreference = "Continue"
$Root = Split-Path $PSScriptRoot -Parent
$Frontend = Join-Path $Root "app\frontend"
$Android = Join-Path $Frontend "android"
$Releases = Join-Path $Frontend "releases"
$Log = Join-Path $Root "build-log.txt"

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Add-Content -Path $Log -Value $line -Encoding UTF8
    Write-Host $line
}

function Run-Step($name, [scriptblock]$Block) {
    Log $name
    & $Block 2>&1 | ForEach-Object {
        $line = $_.ToString()
        Add-Content -Path $Log -Value $line -Encoding UTF8
        Write-Host $line
    }
    if ($LASTEXITCODE -ne 0) {
        Log "BUILD FAILED at: $name (exit $LASTEXITCODE)"
        exit 1
    }
}

Remove-Item $Log -Force -ErrorAction SilentlyContinue
Log "=== BUILD START ==="

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = Join-Path $Frontend ".android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = Join-Path $Frontend ".gradle-home"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Set-Location $Frontend

if (-not (Test-Path "node_modules")) {
    Run-Step "pnpm install..." { pnpm install --config.node-linker=hoisted }
} elseif (-not (Test-Path "node_modules\vite")) {
    Run-Step "pnpm install (vite missing)..." { pnpm install --config.node-linker=hoisted }
} elseif (-not (Test-Path "node_modules\@sentry\react")) {
    Run-Step "pnpm install (@sentry/react missing)..." { pnpm install --config.node-linker=hoisted }
}

if (-not (Test-Path ".env.mobile")) {
    if (Test-Path ".env.mobile.example") {
        Copy-Item ".env.mobile.example" ".env.mobile"
        Log "Created .env.mobile from example"
    }
}

Run-Step "pnpm run build:mobile..." { pnpm run build:mobile }
Run-Step "pnpm exec tsc --noEmit..." { pnpm exec tsc --noEmit }
Run-Step "pnpm exec cap sync android..." { pnpm exec cap sync android }

Set-Location $Android
Run-Step "Gradle assembleDebug bundleRelease assembleRelease..." {
    .\gradlew.bat assembleDebug bundleRelease assembleRelease --no-daemon
}

New-Item -ItemType Directory -Force -Path $Releases | Out-Null
$apk = Join-Path $Android "app\build\outputs\apk\debug\app-debug.apk"
$aab = Join-Path $Android "app\build\outputs\bundle\release\app-release.aab"

if (-not (Test-Path $apk)) {
    Log "BUILD FAILED: app-debug.apk not found"
    exit 1
}

$versionName = "unknown"
$gradleFile = Join-Path $Android "app\build.gradle"
if (Test-Path $gradleFile) {
    $gradleContent = Get-Content $gradleFile -Raw
    if ($gradleContent -match 'versionName\s+"([^"]+)"') { $versionName = $Matches[1] }
}

Copy-Item $apk (Join-Path $Releases "Sortirovka24-latest-debug.apk") -Force
Copy-Item $apk (Join-Path $Releases "Sortirovka24-v$versionName-debug.apk") -Force
if (Test-Path $aab) {
    Copy-Item $aab (Join-Path $Releases "Sortirovka24-release.aab") -Force
}

$aapt = Join-Path $env:ANDROID_HOME "build-tools\35.0.0\aapt.exe"
if (Test-Path $aapt) {
    Log "aapt badging..."
    & $aapt dump badging (Join-Path $Releases "Sortirovka24-latest-debug.apk") 2>&1 | ForEach-Object {
        Add-Content -Path $Log -Value $_.ToString() -Encoding UTF8
        Write-Host $_
    }
}

Get-Item (Join-Path $Releases "Sortirovka24-latest-debug.apk") | Format-Table Name, Length, LastWriteTime | Out-String | ForEach-Object {
    Add-Content -Path $Log -Value $_ -Encoding UTF8
    Write-Host $_
}

Log "=== BUILD SUCCESS END ==="

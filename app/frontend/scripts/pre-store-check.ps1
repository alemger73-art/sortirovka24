# Pre-flight checks before uploading to App Store / Google Play.
# Run: powershell -ExecutionPolicy Bypass -File scripts/pre-store-check.ps1

$ErrorActionPreference = "Continue"
$FrontendRoot = Split-Path $PSScriptRoot -Parent
$BaseUrl = "https://sortirovka24-production-8788.up.railway.app"
$fail = 0
$warn = 0

function Ok($msg) { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow; $script:warn++ }
function Bad($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:fail++ }

Write-Host "=== Sortirovka24 — pre-store check ===" -ForegroundColor Cyan
Write-Host ""

# --- Versions ---
$gradle = Join-Path $FrontendRoot "android\app\build.gradle"
if (Test-Path $gradle) {
    $g = Get-Content $gradle -Raw
    if ($g -match 'versionCode\s+(\d+)') { $ac = $Matches[1] } else { $ac = "?" }
    if ($g -match 'versionName\s+"([^"]+)"') { $an = $Matches[1] } else { $an = "?" }
    Ok "Android version: $an (code $ac)"
} else { Bad "android/app/build.gradle missing" }

$pbx = Join-Path $FrontendRoot "ios\App\App.xcodeproj\project.pbxproj"
if (Test-Path $pbx) {
    $p = Get-Content $pbx -Raw
    if ($p -match 'MARKETING_VERSION = ([^;]+);') { $in = $Matches[1].Trim() } else { $in = "?" }
    if ($p -match 'CURRENT_PROJECT_VERSION = (\d+);') { $ib = $Matches[1] } else { $ib = "?" }
    Ok "iOS version: $in (build $ib)"
    if ($an -ne "?" -and $in -ne "?" -and $an -ne $in) {
        Warn "Android versionName ($an) != iOS MARKETING_VERSION ($in) — sync with bump-mobile-version.ps1"
    }
} else { Bad "ios project.pbxproj missing" }

# --- Signing (Android) ---
$keystoreProps = Join-Path $FrontendRoot "android\keystore.properties"
$keystoreJks = Join-Path $FrontendRoot "android\sortirovka24-release.jks"
if (Test-Path $keystoreProps -and (Test-Path $keystoreJks)) {
    Ok "Android release keystore configured"
} else {
    Warn "Android keystore missing — run: npm run setup:play-keystore"
}

# --- Firebase (optional for v1) ---
$googleServices = Join-Path $FrontendRoot "android\app\google-services.json"
if (Test-Path $googleServices) {
    Ok "google-services.json present (push enabled on Android)"
} else {
    Warn "google-services.json missing — push on Android disabled until Firebase setup (see MOBILE_APP.md §5)"
}

# --- Assets ---
$icon512 = Join-Path $FrontendRoot "public\icon-512.png"
$feature = Join-Path $FrontendRoot "play-store\feature-graphic.png"
$privacyLocal = Join-Path $FrontendRoot "public\privacy.html"
if (Test-Path $icon512) { Ok "App icon 512: public/icon-512.png" } else { Bad "Missing public/icon-512.png" }
if (Test-Path $feature) { Ok "Play feature graphic: play-store/feature-graphic.png" } else { Warn "Missing play-store/feature-graphic.png" }
if (Test-Path $privacyLocal) { Ok "privacy.html in repo" } else { Bad "Missing public/privacy.html" }

$playShots = Join-Path $FrontendRoot "play-store\screenshots"
$iosShots = Join-Path $FrontendRoot "app-store\screenshots"
$presShots = Join-Path (Split-Path (Split-Path $FrontendRoot -Parent) -Parent) "docs\presentation\screenshots"
$playCount = if (Test-Path $playShots) { @(Get-ChildItem -Path $playShots -Filter *.png -File).Count + @(Get-ChildItem -Path $playShots -Filter *.jpg -File).Count } else { 0 }
$iosCount = if (Test-Path $iosShots) { @(Get-ChildItem -Path $iosShots -Filter *.png -File).Count + @(Get-ChildItem -Path $iosShots -Filter *.jpg -File).Count } else { 0 }
$presCount = if (Test-Path $presShots) { @(Get-ChildItem -Path $presShots -Filter mobile-*.png -File).Count } else { 0 }
if ($playCount -ge 2) { Ok "Play screenshots: $playCount in play-store/screenshots/" }
elseif ($presCount -ge 2) { Ok "Play screenshots source: $presCount in docs/presentation/screenshots/ (run npm run store:prep to copy)" }
else { Warn "Need 2+ screenshots — run: npm run store:prep or BUILD_PLAY_RELEASE.bat" }
if ($iosCount -ge 3) { Ok "App Store screenshots: $iosCount in app-store/screenshots/" }
elseif ($presCount -ge 3) { Ok "App Store screenshot source: docs/presentation/screenshots/ ($presCount files)" }
else { Warn "Need 3+ screenshots — run: npm run store:prep" }

# --- Release AAB ---
$aab = Join-Path $FrontendRoot "releases\Sortirovka24-release.aab"
if (Test-Path $aab) { Ok "Release AAB built: releases/Sortirovka24-release.aab" }
else { Warn "AAB not built yet — double-click BUILD_PLAY_RELEASE.bat or npm run build:android:release" }

# --- Live URLs ---
foreach ($path in @("/health", "/privacy.html", "/terms.html")) {
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl$path" -UseBasicParsing -TimeoutSec 15
        if ($resp.StatusCode -eq 200) { Ok "Online: $BaseUrl$path" }
        else { Bad "$path returned $($resp.StatusCode)" }
    } catch {
        Bad "Cannot reach $BaseUrl$path — deploy to Railway first"
    }
}

# --- Env template ---
$envExample = Join-Path $FrontendRoot ".env.mobile.example"
if (Test-Path $envExample) { Ok ".env.mobile.example present" } else { Warn ".env.mobile.example missing" }

Write-Host ""
Write-Host "Docs:"
Write-Host "  Google Play: app/frontend/play-store/PLAY_STORE.md"
Write-Host "  App Store:   app/frontend/app-store/APP_STORE.md"
Write-Host "  Checklist:   docs/mobile/STORE_RELEASE_CHECKLIST.md"
Write-Host ""

if ($fail -gt 0) {
    Write-Host "Result: $fail blocking issue(s), $warn warning(s)" -ForegroundColor Red
    exit 1
}
Write-Host "Result: ready to build ($warn warning(s))" -ForegroundColor Green
exit 0

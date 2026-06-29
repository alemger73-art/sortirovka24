# Bump mobile app version across Android and iOS.
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/bump-mobile-version.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/bump-mobile-version.ps1 -VersionName 1.0.27

param(
    [string]$VersionName = ""
)

$ErrorActionPreference = "Stop"
$FrontendRoot = Split-Path $PSScriptRoot -Parent
$GradleFile = Join-Path $FrontendRoot "android\app\build.gradle"
$Pbxproj = Join-Path $FrontendRoot "ios\App\App.xcodeproj\project.pbxproj"

if (-not (Test-Path $GradleFile)) { throw "Missing $GradleFile" }
if (-not (Test-Path $Pbxproj)) { throw "Missing $Pbxproj" }

$gradle = Get-Content $GradleFile -Raw
if ($gradle -match 'versionCode\s+(\d+)') { $oldCode = [int]$Matches[1] } else { throw "versionCode not found" }
if ($gradle -match 'versionName\s+"([^"]+)"') { $oldName = $Matches[1] } else { throw "versionName not found" }
$newCode = $oldCode + 1

if ($VersionName) {
    $newName = $VersionName
} else {
    $parts = $oldName -split '\.'
    if ($parts.Length -ge 3) {
        $patch = [int]$parts[2] + 1
        $newName = "$($parts[0]).$($parts[1]).$patch"
    } else {
        $newName = "$oldName.1"
    }
}

$gradle = $gradle -replace "versionCode\s+$oldCode", "versionCode $newCode"
$gradle = $gradle -replace 'versionName\s+"[^"]+"', "versionName `"$newName`""
Set-Content -Path $GradleFile -Value $gradle -Encoding UTF8 -NoNewline

$pbx = Get-Content $Pbxproj -Raw
$pbx = $pbx -replace 'CURRENT_PROJECT_VERSION = \d+;', "CURRENT_PROJECT_VERSION = $newCode;"
$pbx = $pbx -replace 'MARKETING_VERSION = [^;]+;', "MARKETING_VERSION = $newName;"
Set-Content -Path $Pbxproj -Value $pbx -Encoding UTF8 -NoNewline

Write-Host "Version bumped:"
Write-Host "  Android: versionCode $oldCode -> $newCode, versionName $oldName -> $newName"
Write-Host "  iOS:     CURRENT_PROJECT_VERSION=$newCode, MARKETING_VERSION=$newName"
Write-Host ""
Write-Host "Next:"
Write-Host "  npm run build:android:release   # Google Play AAB"
Write-Host "  GitHub Actions -> iOS Release   # TestFlight / App Store"

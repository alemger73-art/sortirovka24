# One-time Play Store signing keystore setup (Sortirovka24)
# Run: powershell -ExecutionPolicy Bypass -File scripts/setup-play-keystore.ps1

$ErrorActionPreference = "Stop"
$FrontendRoot = Split-Path $PSScriptRoot -Parent
$AndroidRoot = Join-Path $FrontendRoot "android"
$JksPath = Join-Path $AndroidRoot "sortirovka24-release.jks"
$PropsPath = Join-Path $AndroidRoot "keystore.properties"
$SecretPath = Join-Path $AndroidRoot "PLAY_SIGNING_SECRET.txt"

$JbrCandidates = @(
    "C:\Program Files\Android\Android Studio\jbr",
    "${env:ProgramFiles}\Android\Android Studio\jbr"
)
$JavaHome = $JbrCandidates | Where-Object { Test-Path (Join-Path $_ "bin\keytool.exe") } | Select-Object -First 1
if (-not $JavaHome) {
    throw "keytool not found. Install Android Studio."
}
$keytool = Join-Path $JavaHome "bin\keytool.exe"

function New-RandomPassword([int]$Length = 24) {
    $chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    -join ((1..$Length) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

if ((Test-Path $JksPath) -and (Test-Path $PropsPath)) {
    Write-Host "Keystore already exists: $JksPath"
    Write-Host "Properties: $PropsPath"
    exit 0
}

$storePass = New-RandomPassword
$keyPass = $storePass
$alias = "sortirovka24"
$dname = "CN=Sortirovka24, OU=Mobile, O=Sortirovka24, L=Karaganda, ST=Karaganda, C=KZ"

Write-Host "Creating release keystore..."
& $keytool -genkeypair -v `
    -keystore $JksPath `
    -alias $alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass $storePass `
    -keypass $keyPass `
    -dname $dname

$props = @"
storeFile=sortirovka24-release.jks
storePassword=$storePass
keyAlias=$alias
keyPassword=$keyPass
"@
Set-Content -Path $PropsPath -Value $props -Encoding Ascii

$secret = @"
Sortirovka24 - Play Store signing (SAVE SECURELY!)
Created: $(Get-Date -Format "yyyy-MM-dd HH:mm")

Keystore: $JksPath
Alias: $alias
Store password: $storePass
Key password: $keyPass

WITHOUT THIS FILE AND KEYSTORE YOU CANNOT UPDATE THE APP ON GOOGLE PLAY.
Copy to password manager / encrypted backup.
"@
Set-Content -Path $SecretPath -Value $secret -Encoding UTF8

Write-Host ""
Write-Host "SUCCESS"
Write-Host "  Keystore: $JksPath"
Write-Host "  Properties: $PropsPath"
Write-Host "  Passwords saved to: $SecretPath"
Write-Host "  >>> SAVE PLAY_SIGNING_SECRET.txt - required for all future Play updates!"

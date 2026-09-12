# Build signed, bundled APK/AAB. Never generate or replace an existing signing identity.
param([int]$VersionCode = 0)
$ErrorActionPreference = 'Stop'
$FrontendRoot = Split-Path $PSScriptRoot -Parent
$AndroidRoot = Join-Path $FrontendRoot 'android'
if (-not (Test-Path -LiteralPath (Join-Path $AndroidRoot 'keystore.properties'))) {
    throw 'Signing is not configured. Set up your upload keystore before building a release.'
}
$JavaRoot = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Android\Android Studio\jbr' }
if (-not (Test-Path -LiteralPath (Join-Path $JavaRoot 'bin/java.exe'))) { throw 'Install JDK 21 or Android Studio, then set JAVA_HOME.' }
$env:JAVA_HOME = $JavaRoot
$env:PATH = "$JavaRoot\bin;$env:PATH"
$SdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $FrontendRoot '.android-sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $SdkRoot 'platforms/android-36/android.jar'))) { throw 'Install platforms;android-36 with Android SDK Manager first.' }
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
[IO.File]::WriteAllText((Join-Path $AndroidRoot 'local.properties'), "sdk.dir=$($SdkRoot.Replace('\','/'))`n")
Push-Location $FrontendRoot
try {
    & node scripts/build-store-web.mjs android
    if ($LASTEXITCODE -ne 0) { throw 'Web build / Capacitor sync failed.' }
    Push-Location $AndroidRoot
    try {
        $gradleArgs = @('bundleRelease', 'assembleRelease', '--no-daemon', '--max-workers=2')
        if ($VersionCode -gt 0) { $gradleArgs += "-PstoreVersionCode=$VersionCode" }
        & .\gradlew.bat @gradleArgs
        if ($LASTEXITCODE -ne 0) { throw 'Gradle release failed.' }
    } finally { Pop-Location }
    $ReleasesDir = Join-Path $FrontendRoot 'releases'
    New-Item -ItemType Directory -Force -Path $ReleasesDir | Out-Null
    foreach ($kind in @('aab', 'apk')) {
        $relative = if ($kind -eq 'aab') { 'app/build/outputs/bundle/release/app-release.aab' } else { 'app/build/outputs/apk/release/app-release.apk' }
        $source = Join-Path $AndroidRoot $relative
        if (-not (Test-Path -LiteralPath $source)) { throw "Missing signed artifact: $source" }
        $destination = Join-Path $ReleasesDir "Sortirovka24-release.$kind"
        Copy-Item -LiteralPath $source -Destination $destination -Force
        Get-FileHash -LiteralPath $destination -Algorithm SHA256
    }
} finally { Pop-Location }

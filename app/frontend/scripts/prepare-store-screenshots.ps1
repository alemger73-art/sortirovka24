# Copy presentation mobile screenshots into store listing folders.
# Run: powershell -ExecutionPolicy Bypass -File scripts/prepare-store-screenshots.ps1

$ErrorActionPreference = "Stop"
$FrontendRoot = Split-Path $PSScriptRoot -Parent
$RepoRoot = Split-Path (Split-Path $FrontendRoot -Parent) -Parent
$Source = Join-Path $RepoRoot "docs\presentation\screenshots"
$PlayDest = Join-Path $FrontendRoot "play-store\screenshots"
$IosDest = Join-Path $FrontendRoot "app-store\screenshots"

if (-not (Test-Path $Source)) {
    Write-Host "Source not found: $Source"
    Write-Host "Take screenshots manually — see play-store/SCREENSHOTS.md and app-store/SCREENSHOTS.md"
    exit 1
}

New-Item -ItemType Directory -Force -Path $PlayDest, $IosDest | Out-Null

$map = @{
    "mobile-home.png" = @("01-home.png", "01-home.png")
    "mobile-food.png" = @("02-food.png", "02-food.png")
    "mobile-taxi.png" = @("03-taxi.png", "03-taxi.png")
    "mobile-announcements.png" = @("04-announcements.png", "04-announcements.png")
    "mobile-more.png" = @("05-more.png", "05-cabinet.png")
    "mobile-account.png" = @("06-account.png", "06-cabinet-alt.png")
    "mobile-masters.png" = @("07-masters.png", "07-masters.png")
    "mobile-food-menu.png" = @("08-food-menu.png", "08-food-menu.png")
}

$copied = 0
foreach ($entry in $map.GetEnumerator()) {
    $src = Join-Path $Source $entry.Key
    if (-not (Test-Path $src)) { continue }
    Copy-Item $src (Join-Path $PlayDest $entry.Value[0]) -Force
    Copy-Item $src (Join-Path $IosDest $entry.Value[1]) -Force
    $copied++
}

Write-Host "Copied $copied screenshot(s) to:"
Write-Host "  $PlayDest"
Write-Host "  $IosDest"
Write-Host ""
Write-Host "Note: App Store prefers exact 1290x2796 from iPhone Pro Max simulator."
Write-Host "These copies are a starting point — replace with native captures before submit."

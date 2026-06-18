# Sortirovka24 presentation PDF generator
# Requires Google Chrome or Microsoft Edge

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HtmlPath = Join-Path $ScriptDir "sortirovka24-presentation.html"
$PdfPath = Join-Path $ScriptDir "Sortirovka24-Presentation.pdf"

if (-not (Test-Path $HtmlPath)) {
    Write-Error "HTML not found: $HtmlPath"
}

$HtmlUri = [Uri]::new((Resolve-Path $HtmlPath)).AbsoluteUri

$browsers = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
)

$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browser) {
    Write-Host "Chrome/Edge not found. Open HTML and use Ctrl+P -> Save as PDF (landscape, background graphics)."
    Start-Process $HtmlPath
    exit 0
}

Write-Host "Generating PDF via: $browser"

& $browser `
    --headless=new `
    --disable-gpu `
    --no-pdf-header-footer `
    --print-to-pdf="$PdfPath" `
    --no-margins `
    "$HtmlUri"

Start-Sleep -Seconds 4

if (Test-Path $PdfPath) {
    $size = (Get-Item $PdfPath).Length / 1KB
    Write-Host "PDF created: $PdfPath ($([math]::Round($size, 0)) KB)"
    Start-Process $PdfPath
} else {
    Write-Host "PDF not created. Open HTML manually: $HtmlPath"
    Start-Process $HtmlPath
}

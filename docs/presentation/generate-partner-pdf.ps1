# Partner presentation PDF
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HtmlPath = Join-Path $ScriptDir "partner-presentation.html"
$PdfPath = Join-Path $ScriptDir "Sortirovka24-Partner.pdf"
$HtmlUri = [Uri]::new((Resolve-Path $HtmlPath)).AbsoluteUri
$browser = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $browser)) { $browser = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe" }
& $browser --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$PdfPath" --no-margins "$HtmlUri"
Start-Sleep -Seconds 4
if (Test-Path $PdfPath) { Start-Process $PdfPath; Write-Host "OK: $PdfPath" } else { Start-Process $HtmlPath }

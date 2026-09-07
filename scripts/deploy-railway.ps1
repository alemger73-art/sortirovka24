# Deploy Sortirovka24 to Railway WITHOUT GitHub.
# Uploads the current working tree (including uncommitted changes).
# Usage: from repo root →  powershell -ExecutionPolicy Bypass -File scripts/deploy-railway.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "== Railway CLI ==" -ForegroundColor Cyan
$railway = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railway) {
  Write-Host "Installing @railway/cli..."
  npm i -g @railway/cli
}

railway whoami
railway status

Write-Host "== Upload deploy (railway up) ==" -ForegroundColor Cyan
railway up --detach

Write-Host "== Waiting for health ==" -ForegroundColor Cyan
$url = "https://sortirovka24-production-8788.up.railway.app/health"
for ($i = 1; $i -le 40; $i++) {
  Start-Sleep -Seconds 15
  try {
    $res = Invoke-RestMethod -Uri $url -TimeoutSec 20
    Write-Host ("[{0}] {1}" -f $i, ($res | ConvertTo-Json -Compress))
    if ($res.status -eq "healthy") {
      Write-Host "OK: production healthy" -ForegroundColor Green
      exit 0
    }
  } catch {
    Write-Host ("[{0}] waiting... {1}" -f $i, $_.Exception.Message)
  }
}

Write-Host "Timed out waiting for healthy" -ForegroundColor Yellow
exit 1

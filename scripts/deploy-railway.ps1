# Explicit Railway upload deploy. Git-connected deploys are preferred.
# This script refuses dirty trees, wrong branches and implicit production deploys.

param(
    [ValidateSet("staging", "production")]
    [string]$Environment = "staging",
    [string]$HealthUrl = $env:STAGING_BASE_URL,
    [switch]$AllowProduction
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$branch = (git branch --show-current).Trim()
$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "Unable to inspect git state" }
if ($dirty) { throw "Deploy refused: commit or discard local changes first" }

if ($Environment -eq "staging") {
    if ($branch -ne "develop") { throw "Staging deploy requires branch develop; current branch is $branch" }
    if (-not $HealthUrl) { throw "Set STAGING_BASE_URL or pass -HealthUrl" }
}

if ($Environment -eq "production") {
    if (-not $AllowProduction) { throw "Production deploy requires the explicit -AllowProduction switch" }
    if ($branch -ne "main") { throw "Production deploy requires branch main; current branch is $branch" }
    if (-not $HealthUrl) { $HealthUrl = "https://sortirovka24-production-8788.up.railway.app" }
}

$railway = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railway) { throw "Railway CLI is not installed. Install it and sign in before deploying." }

Write-Host "== Railway target (verify environment/service below) ==" -ForegroundColor Cyan
railway whoami
railway status
Write-Host "Deploying committed branch '$branch' to '$Environment'." -ForegroundColor Yellow
railway up --detach

$readyUrl = $HealthUrl.TrimEnd("/") + "/health/ready"
Write-Host "== Waiting for readiness: $readyUrl ==" -ForegroundColor Cyan
for ($i = 1; $i -le 40; $i++) {
    Start-Sleep -Seconds 15
    try {
        $res = Invoke-RestMethod -Uri $readyUrl -TimeoutSec 20
        Write-Host ("[{0}] status={1} environment={2} build={3}" -f $i, $res.status, $res.environment, $res.frontend_build)
        if ($res.status -eq "ready" -and $res.environment -eq $Environment) {
            Write-Host "OK: $Environment is ready" -ForegroundColor Green
            exit 0
        }
    } catch {
        Write-Host ("[{0}] waiting: {1}" -f $i, $_.Exception.Message)
    }
}

throw "Timed out waiting for $Environment readiness"

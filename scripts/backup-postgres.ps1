# PostgreSQL backup helper for Sortirovka24 (Railway or any Postgres)
#
# Usage:
#   $env:DATABASE_URL = "postgresql://user:pass@host:5432/railway"
#   powershell -ExecutionPolicy Bypass -File scripts/backup-postgres.ps1
#
# Requires: pg_dump in PATH (PostgreSQL client tools)

param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$OutputDir = "$PSScriptRoot\..\backups"
)

if (-not $DatabaseUrl) {
    Write-Error "DATABASE_URL is not set. Export Railway PostgreSQL URL first."
    exit 1
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Error "pg_dump not found. Install PostgreSQL client tools."
    exit 1
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outFile = Join-Path $OutputDir "sortirovka24_$stamp.sql"

Write-Host "Backing up to $outFile ..."
& pg_dump $DatabaseUrl --no-owner --no-acl -f $outFile

if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Backup complete: $outFile"
Write-Host "Restore: psql `"`$DATABASE_URL`" -f $outFile"

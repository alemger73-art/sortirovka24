# Full Sortirovka24 test suite — backend pytest + frontend lint/tsc/build + optional E2E
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$Log = Join-Path $Root "test-run.log"
$Failed = $false

function Write-Step($Title) {
    "`n========== $Title ==========" | Tee-Object -FilePath $Log -Append
}

"" | Set-Content $Log
"Sortirovka24 test run $(Get-Date -Format o)" | Tee-Object -FilePath $Log -Append

Write-Step "Backend pytest"
Push-Location (Join-Path $Root "app\backend")
python -m pytest -v --ignore=tests/test_integrity.py 2>&1 | Tee-Object -FilePath $Log -Append
$pytestExit = $LASTEXITCODE
Pop-Location
if ($pytestExit -ne 0) { $Failed = $true }

Write-Step "Frontend lint"
Push-Location (Join-Path $Root "app\frontend")
pnpm lint 2>&1 | Tee-Object -FilePath $Log -Append
$lintExit = $LASTEXITCODE
if ($lintExit -ne 0) { $Failed = $true }

Write-Step "Frontend typecheck"
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | Tee-Object -FilePath $Log -Append
$tscExit = $LASTEXITCODE
if ($tscExit -ne 0) { $Failed = $true }

Write-Step "Frontend build"
pnpm build 2>&1 | Tee-Object -FilePath $Log -Append
$buildExit = $LASTEXITCODE
if ($buildExit -ne 0) { $Failed = $true }
Pop-Location

"`n=== SUMMARY ===" | Tee-Object -FilePath $Log -Append
"pytest: exit $pytestExit" | Tee-Object -FilePath $Log -Append
"pnpm lint: exit $lintExit" | Tee-Object -FilePath $Log -Append
"tsc: exit $tscExit" | Tee-Object -FilePath $Log -Append
"pnpm build: exit $buildExit" | Tee-Object -FilePath $Log -Append
if ($Failed) {
    "OVERALL: FAIL" | Tee-Object -FilePath $Log -Append
    exit 1
}
"OVERALL: PASS" | Tee-Object -FilePath $Log -Append
exit 0

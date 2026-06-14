# Sortirovka24 — интеграционный тест API (PowerShell)
# Запуск: .\scripts\integrity_test.ps1
# Или: .\scripts\integrity_test.ps1 -BaseUrl "http://127.0.0.1:8000"

param(
    [string]$BaseUrl = "https://sortirovka24-production-8788.up.railway.app"
)

$BaseUrl = $BaseUrl.TrimEnd("/")
$passed = 0
$failed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Path,
        [string[]]$ExpectStatus = @("200"),
        [string]$Method = "GET",
        [string]$Body = $null
    )
    $uri = "$BaseUrl$Path"
    try {
        $params = @{
            Uri             = $uri
            Method          = $Method
            TimeoutSec      = 25
            UseBasicParsing = $true
        }
        if ($Body) {
            $params["ContentType"] = "application/json"
            $params["Body"] = $Body
        }
        $resp = Invoke-WebRequest @params
        $code = [string]$resp.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $code = [string]$_.Exception.Response.StatusCode.value__
        } else {
            Write-Host "[FAIL] $Name — нет ответа ($uri)" -ForegroundColor Red
            $script:failed++
            return
        }
    }
    if ($ExpectStatus -contains $code) {
        Write-Host "[ OK ] $Name — HTTP $code" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "[FAIL] $Name — HTTP $code (ожидалось: $($ExpectStatus -join '/'))" -ForegroundColor Red
        $script:failed++
    }
}

Write-Host "`n=== Sortirovka24 Integrity Test ===" -ForegroundColor Cyan
Write-Host "Target: $BaseUrl`n"

Test-Endpoint "Health" "/health" @("200")
Test-Endpoint "SPA index" "/" @("200")
Test-Endpoint "Google status" "/api/v1/account/google/status" @("200")
Test-Endpoint "News list" "/api/v1/entities/news" @("200")
Test-Endpoint "Announcements" "/api/v1/entities/announcements" @("200")
Test-Endpoint "Gastronom catalog" "/api/v1/gastronom/catalog" @("200")
Test-Endpoint "Taxi settings" "/api/v1/taxi/settings" @("200")
Test-Endpoint "Account me (no token)" "/api/v1/account/me" @("401")
Test-Endpoint "Entity delete blocked" "/api/v1/entities/news/999999" @("401","403","404","422") "DELETE"
Test-Endpoint "Debug tables blocked" "/api/v1/debug/tables" @("404","401","403")
Test-Endpoint "Delivery write blocked" "/api/categories" @("401","403","422") "POST" '{"name":"test"}'
Test-Endpoint "Create-admin blocked" "/api/v1/admin-auth/create-admin" @("404","401","403","400") "POST"
Test-Endpoint "Bad login" "/api/v1/account/login" @("401","429") "POST" '{"phone":"+77000000000","password":"wrong"}'

Write-Host "`n=== Result: $passed passed, $failed failed ===" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }
exit 0

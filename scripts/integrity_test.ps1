# Sortirovka24 API integrity test (PowerShell)
# Usage: .\scripts\integrity_test.ps1
# Or:    .\scripts\integrity_test.ps1 -BaseUrl "http://127.0.0.1:8000"

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
            Write-Host "[FAIL] $Name - no response ($uri)" -ForegroundColor Red
            $script:failed++
            return
        }
    }
    if ($ExpectStatus -contains $code) {
        Write-Host "[ OK ] $Name - HTTP $code" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "[FAIL] $Name - HTTP $code (expected: $($ExpectStatus -join '/'))" -ForegroundColor Red
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
Test-Endpoint "History events list" "/api/v1/entities/history_events?limit=5" @("200")
Test-Endpoint "Support settings" "/api/v1/support/settings" @("200","404")
$deliveryBody = (@{ name = "integrity-test" } | ConvertTo-Json -Compress)
Test-Endpoint "Delivery write blocked" "/api/categories" @("401","403","422") "POST" $deliveryBody
Test-Endpoint "Create-admin blocked" "/api/v1/admin-auth/create-admin" @("404","401","403","400") "POST"
$loginBody = (@{ phone = "+77000000000"; password = "wrong-password-xyz" } | ConvertTo-Json -Compress)
Test-Endpoint "Bad login" "/api/v1/account/login" @("401","429") "POST" $loginBody

Write-Host "`n=== Result: $passed passed, $failed failed ===" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }
exit 0

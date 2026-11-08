param([string]$BaseUrl = 'http://localhost:5270')
$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['Invoke-WebRequest:TimeoutSec'] = 10
$PSDefaultParameterValues['Invoke-RestMethod:TimeoutSec'] = 10
$health = Invoke-WebRequest -Uri "$BaseUrl/api/health"
$payload = $health.Content | ConvertFrom-Json
if ($health.StatusCode -ne 200 -or $payload.status -ne 'ok' -or $payload.database -ne 'healthy') { throw 'Health check failed' }
Write-Output "HEALTH_HTTP=$($health.StatusCode) $($health.Content)"
$openapi = Invoke-RestMethod -Uri "$BaseUrl/openapi/v1.json"
if (-not $openapi.paths.'/api/health') { throw 'Health endpoint missing in OpenAPI' }
Write-Output "OPENAPI=$($openapi.openapi)"
$openapi.paths.PSObject.Properties.Name
$cases = @(
    # Never send a valid wish here: persistence is now real and needs separate approval.
    @{Path='/api/wishes';Method='POST';Body='{"content":"   "}';Expected=400},
    @{Path='/api/wishes';Method='POST';Body='{"content":""}';Expected=400},
    @{Path='/api/wishes';Method='POST';Body=(@{content=('x' * 2001)} | ConvertTo-Json);Expected=400},
    @{Path='/api/admin/wishes';Method='GET';Expected=401},
    @{Path='/api/admin/wishes/unread-count';Method='GET';Expected=401},
    @{Path='/api/admin/wishes/1/read';Method='PATCH';Expected=401},
    @{Path='/api/auth/admin/login';Method='POST';Expected=503}
)
foreach ($case in $cases) {
    $request = @{Uri=($BaseUrl+$case.Path);Method=$case.Method;SkipHttpErrorCheck=$true}
    if ($case.Body) { $request.Body=$case.Body; $request.ContentType='application/json' }
    $response = Invoke-WebRequest @request
    if ($response.StatusCode -ne $case.Expected) { throw "Unexpected status: $($case.Path) $($response.StatusCode)" }
    Write-Output "$($case.Method) $($case.Path) => $($response.StatusCode)"
}
foreach ($origin in @('http://localhost:5173','http://localhost:4173','https://untrusted.example')) {
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/wishes" -Method Options -Headers @{
        Origin=$origin; 'Access-Control-Request-Method'='POST'; 'Access-Control-Request-Headers'='content-type'
    } -SkipHttpErrorCheck
    $allow = $response.Headers['Access-Control-Allow-Origin']
    if ($origin -ne 'https://untrusted.example' -and $allow -ne $origin) { throw 'Development CORS failed' }
    if ($origin -eq 'https://untrusted.example' -and $allow) { throw 'Untrusted origin allowed' }
    Write-Output "CORS $origin => $allow"
}

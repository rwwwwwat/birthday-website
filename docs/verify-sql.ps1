param(
    [string]$ScriptDomPath = 'C:\Program Files\Microsoft SQL Server Management Studio 22\Release\Common7\IDE\Extensions\Application\Microsoft.SqlServer.TransactSql.ScriptDom.dll',
    [string]$SqlPath = (Join-Path $PSScriptRoot '../database/scripts/001_create_database_and_wishes.sql')
)
$ErrorActionPreference = 'Stop'
# Offline parser only: no SQL client, connection or execution.
Add-Type -LiteralPath $ScriptDomPath
$parser = [Microsoft.SqlServer.TransactSql.ScriptDom.TSql170Parser]::new($true)
$reader = [System.IO.StringReader]::new([System.IO.File]::ReadAllText($SqlPath))
try {
    $parseErrors = $null
    $fragment = $parser.Parse($reader, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) {
        $parseErrors | Select-Object Number,Line,Column,Message | Format-Table -AutoSize
        throw 'SQL syntax validation failed'
    }
    if ($fragment.Batches.Count -lt 1) { throw 'No SQL batches parsed' }
    Write-Output "SQL_PARSE_OK; Parser=TSql170Parser; Batches=$($fragment.Batches.Count); No database connection or execution."
} finally { $reader.Dispose() }

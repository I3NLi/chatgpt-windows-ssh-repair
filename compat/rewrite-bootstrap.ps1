param([Parameter(Mandatory=$true)][string]$EncodedScript)
$ErrorActionPreference = 'Stop'
$scriptText = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($EncodedScript))
$target = '. (Join-Path $controlDirectory ''codex-proxy.ps1'')'
if ($scriptText.Contains('__CODEX_REMOTE_PROXY_STDOUT_MARKER_') -and $scriptText.Contains($target)) {
    $helperPath = (Join-Path $PSScriptRoot 'codex-proxy.ps1').Replace("'", "''")
    $scriptText = $scriptText.Replace($target, ". '$helperPath'")
    [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($scriptText)))
} else {
    [Console]::Out.Write($EncodedScript)
}

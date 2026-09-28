$ErrorActionPreference = 'Stop'
if ($env:RELAY_TEST_BOM -eq '1') {
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($true)
}
Add-Type -Path (Join-Path $PSScriptRoot '../compat/BinaryRelay.cs')
exit [ChatGptSshBinaryRelay]::Run($env:RELAY_TEST_NODE, '-e "process.stdin.pipe(process.stdout)"')

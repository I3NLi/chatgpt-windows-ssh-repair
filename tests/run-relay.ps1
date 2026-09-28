$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot '../compat/BinaryRelay.cs')
exit [ChatGptSshBinaryRelay]::Run($env:RELAY_TEST_NODE, '-e "process.stdin.pipe(process.stdout)"')

# Sourced by the observed Windows bootstrap, which supplies $codexPath.
$script:relaySource = Join-Path $PSScriptRoot 'BinaryRelay.cs'

function Get-RelayExecutable {
    $executable = $codexPath.Trim()
    if (-not [IO.Path]::IsPathRooted($executable) -or
        [IO.Path]::GetExtension($executable) -ne '.exe' -or
        -not (Test-Path -LiteralPath $executable -PathType Leaf)) {
        throw 'codex-path must point to an existing absolute Windows .exe path.'
    }
    return $executable
}

function TP {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = Get-RelayExecutable
    $info.Arguments = 'app-server daemon version'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($info)
    try {
        $output = $process.StandardOutput.ReadToEndAsync()
        $errorOutput = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(5000)) {
            $process.Kill()
            $process.WaitForExit()
            throw 'Codex daemon status check timed out.'
        }
        if ($process.ExitCode -ne 0) { throw 'Codex daemon status check failed.' }
        $status = $output.GetAwaiter().GetResult() | ConvertFrom-Json
        if ($status.status -ne 'running') {
            throw 'Start the Codex daemon from a non-elevated desktop session first.'
        }
        return $true
    } finally { $process.Dispose() }
}

# The legacy bootstrap calls these only if TP returns false. TP throws instead:
# SSH must not silently launch an elevated replacement daemon.
function CL($Arguments) { throw 'Automatic daemon startup is not provided by this helper.' }
function WL { }

function RB($Arguments) {
    if (($Arguments -join ' ') -ne 'app-server proxy') {
        throw 'This compatibility helper only relays app-server proxy.'
    }
    if (-not ('ChatGptSshBinaryRelay' -as [type])) {
        Add-Type -Path $script:relaySource
    }
    exit [ChatGptSshBinaryRelay]::Run((Get-RelayExecutable), 'app-server proxy')
}

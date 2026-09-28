# Source only within an SSH session. No eval, persistent rewrite or watcher.
_chatgpt_ssh_compat_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

powershell.exe() {
    local -a ps_args=("$@")
    local index decoded rewritten target rewriter
    target=". (Join-Path \$controlDirectory 'codex-proxy.ps1')"
    for ((index=0; index < ${#ps_args[@]}-1; index++)); do
        if [[ "${ps_args[index],,}" == '-encodedcommand' ]]; then
            # This ASCII signature check is not the decoder. PowerShell below
            # preserves the complete UTF-16 script, including non-ASCII paths.
            decoded=$(printf '%s' "${ps_args[index+1]}" | base64 --decode 2>/dev/null | tr -d '\000')
            if [[ "$decoded" == *'__CODEX_REMOTE_PROXY_STDOUT_MARKER_'* && "$decoded" == *"$target"* ]]; then
                rewriter=$(cygpath -w "$_chatgpt_ssh_compat_dir/rewrite-bootstrap.ps1") || return
                # The rewriter is not the relay: never let it consume SSH stdin.
                rewritten=$(command powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$rewriter" "${ps_args[index+1]}" < /dev/null) || return
                ps_args[index+1]=$rewritten
            fi
            break
        fi
    done
    command powershell.exe "${ps_args[@]}"
}

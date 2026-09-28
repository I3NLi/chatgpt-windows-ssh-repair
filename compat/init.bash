# Source this file from ~/.bashrc; it does nothing for local shell sessions.
if [ -n "${SSH_CONNECTION:-}" ] || [ -n "${SSH_CLIENT:-}" ]; then
    _chatgpt_codex_dir=$(cygpath -u "${CODEX_HOME:-$HOME/.codex}")
    _chatgpt_codex_bin="$_chatgpt_codex_dir/packages/app-server-daemon/current/bin"
    if [ -x "$_chatgpt_codex_bin/codex.exe" ]; then
        case ":$PATH:" in
            *":$_chatgpt_codex_bin:"*) ;;
            *) export PATH="$_chatgpt_codex_bin:$PATH" ;;
        esac
    fi
    unset _chatgpt_codex_dir _chatgpt_codex_bin
    . "$(dirname -- "${BASH_SOURCE[0]}")/compat.bash"
fi

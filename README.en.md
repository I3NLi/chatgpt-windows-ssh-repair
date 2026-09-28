# ChatGPT Windows SSH Repair

[中文完整说明](README.md) · [Incident report](docs/incident-2026-09-27.zh-CN.md) · [Validation](docs/validation.md)

A redacted incident report and optional compatibility workaround for ChatGPT/Codex SSH connections to a Windows host. This is an independent project, not an official OpenAI component.

The original incident involved successful SSH authentication followed by a stalled Windows PowerShell relay. A direct Codex proxy connection worked; the legacy Windows bootstrap could stall during the WebSocket handshake or subsequent initialization.

The workaround relays binary data through the raw Windows stdin pipe handle and independent byte pumps. Because the client rewrote its helper on reconnect, a narrowly matched Git Bash wrapper replaces the helper import **in memory**. It does not protect or repeatedly overwrite client files.

## Scope

- Observed on 2026-09-27 with Windows build 22631, Git Bash as the SSH shell, Windows PowerShell, and Codex CLI 0.157.1. Version 0.153.4 was also present on the SSH PATH before repair.
- These are historical observations, not a minimum-version claim or a recommendation to downgrade.
- Requires an already running, non-elevated Codex daemon. This repository does not install services or change SSH authentication.
- Only recognizes the observed legacy bootstrap signatures. New client versions, absolute PowerShell paths and different login shells may need no workaround or may be incompatible.
- The original protocol probes passed and the actual client loaded the repaired helper. Opening a project and sending a message in the app were not independently confirmed.

## Diagnose

Configure a trusted SSH alias first, then use Node.js 22+:

```sh
npm ci --ignore-scripts
npm run verify:ssh -- --host windows-dev --mode direct
npm run verify:ssh -- --host windows-dev --mode windows
```

The probe uses existing SSH configuration and key authentication (`BatchMode=yes`). It checks initialization, account availability and the model list without making an inference request. It does not print account details, host paths or raw remote stderr. A passing protocol check with `authenticated: false` still requires remote login.

## Optional manual setup

Copy `compat/` to `~/.local/share/chatgpt-windows-ssh-repair/compat` on the Windows host. Back up the shell profiles and add this to `~/.bashrc`:

```bash
. "$HOME/.local/share/chatgpt-windows-ssh-repair/compat/init.bash"
```

Ensure SSH login shells also source `.bashrc`, without duplicating existing profile logic. The initializer only activates in SSH sessions. Reconnect and test both probe modes before testing the app. See the [Chinese guide](README.md) for complete setup and troubleshooting.

To roll back, remove the source line and reconnect. Do not remove the app's control directory, credentials or unrelated shell configuration.

## Tests

Run `npm test` on Windows with Python 3.10+, Node.js 22+, Git Bash and Windows PowerShell. Tests use temporary directories and do not access live SSH sessions or profiles. They cover later binary frames, EOF, quoted/Unicode paths, signature matching and ordinary command passthrough.

Official setup guidance: [Remote connections](https://learn.chatgpt.com/docs/remote-connections). Licensed under [MIT](LICENSE).

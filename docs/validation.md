# Validation / 验证范围

## Historical incident — 2026-09-27

| Check | Observed result |
| --- | --- |
| Wrong legacy account | Authentication failed |
| Correct Windows account | Actual client authenticated |
| SSH shell CLI before/after PATH change | 0.153.4 → 0.157.1 |
| Managed daemon | Running, 0.157.1 |
| Direct SSH proxy | WebSocket and read-only RPCs passed |
| POSIX login-shell launch | Passed, approximately 2.6 s |
| Original Windows bootstrap with old relay | Handshake or initialization stalled |
| Original Windows bootstrap through fixed helper | Read-only protocol checks passed, approximately 3 s |
| Ordinary encoded PowerShell | Passed without rewriting |
| Actual client after reconnect | Authentication and fixed-helper process observed |
| App opens project and completes a message | Not independently confirmed |
| Reboot / logout / unattended startup | Not tested |

These observations apply to the incident implementation. They are not claims that the repository's generalized version has already been deployed on every host or tested against future clients.

## Repository regression tests

Run `npm test` on Windows. Tests never need SSH keys, account tokens or access to an app-server:

1. Nonmatching scripts, marker-only scripts and import-only scripts remain byte-for-byte unchanged.
2. Unicode script content and helper paths containing spaces, apostrophes and Chinese characters survive rewriting.
3. Non-SSH shells do not install the wrapper.
4. Ordinary and matched encoded scripts execute correctly through Git Bash.
5. Multiple binary frames round-trip without newline dependence, including NUL, high bytes and a frame larger than the relay buffer; stdin EOF shuts down the relay.

GitHub Actions runs these checks on Windows. See the workflow run for the actual result rather than treating the presence of a workflow file as evidence of a pass.

### Local release preparation — 2026-09-29

- All 5 regression tests passed on the original Windows host (Python 3.10, Node.js 26.5.0, Windows PowerShell and Git Bash).
- `node --check scripts/verify-ssh.mjs` passed.
- The repository's generalized probe passed both modes against the host's already installed incident helper: direct approximately 3.4 s, Windows approximately 1.2 s; authenticated, 7 models returned.
- This live check tested the new diagnostic tool against the existing installation. The portable repository helper was tested in temporary directories, not deployed over the working host configuration.
- The staged files were reviewed for private host/account identifiers, credentials and raw logs. Only documentation, generalized source code, synthetic tests, package metadata and CI configuration are included.

## Live protocol verification

The optional `verify-ssh.mjs` probe performs no model inference. It uses the user's SSH alias and waits for the Windows readiness marker before starting WebSocket traffic. It reports only status, timing, platform, authentication presence and model count.

The `windows` mode uses a synthetic bootstrap with the observed signature. To reproduce a future client's exact launch, compare that client's current behavior locally first; do not upload private captured commands or authentication files.

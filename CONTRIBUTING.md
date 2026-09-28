# Contributing

Issues and small pull requests are welcome, in Chinese or English.

For a failure report, include Windows build, PowerShell version, Codex CLI version,
default SSH shell, direct/windows probe status, and the first failing stage.
State whether the failure reproduced without the compatibility wrapper.

Remove account names, real host addresses, private paths and key fingerprints.
Never post private keys, `auth.json`, access tokens, raw encoded client commands,
full event logs or chat transcripts. The repository intentionally contains only
synthetic examples and sanitized findings.

Run `npm ci --ignore-scripts`, `node --check scripts/verify-ssh.mjs` and `npm test`
on Windows before submitting relay changes. Preserve ordinary command passthrough
and the exact, narrow signature matching. Do not add an elevated daemon fallback.

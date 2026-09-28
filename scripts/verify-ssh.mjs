import { spawn } from 'node:child_process';
import { Duplex, Transform } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import WebSocket from 'ws';

const { values } = parseArgs({ options: {
  host: { type: 'string' }, mode: { type: 'string', default: 'direct' },
  timeout: { type: 'string', default: '15' }, help: { type: 'boolean' }
}});
if (values.help) {
  console.log('node scripts/verify-ssh.mjs --host <ssh-alias> [--mode direct|windows] [--timeout 15]');
  process.exit(0);
}
if (!values.host || !/^[A-Za-z0-9_][A-Za-z0-9_.@:-]*$/.test(values.host)) {
  throw new Error('Provide a concrete SSH alias with --host; configure keys and ports in ~/.ssh/config.');
}
if (!['direct', 'windows'].includes(values.mode)) throw new Error('Unknown mode.');
const timeout = Number(values.timeout) * 1000;
if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 120000) throw new Error('Timeout must be 1–120 seconds.');

const windows = values.mode === 'windows';
const marker = `__CODEX_REMOTE_PROXY_STDOUT_MARKER_${randomUUID().toUpperCase()}__`;
// A minimal synthetic bootstrap, not a captured private client command.
const bootstrap = `
$ErrorActionPreference = 'Stop'
$codexDirectory = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$controlDirectory = Join-Path $codexDirectory 'app-server-control'
$codexPath = [IO.File]::ReadAllText((Join-Path $controlDirectory 'codex-path')).Trim()
. (Join-Path $controlDirectory 'codex-proxy.ps1')
if (-not (TP)) { throw 'Daemon unavailable' }
[Console]::Out.Write('${marker}')
[Console]::Out.Flush()
RB @('app-server', 'proxy')
`;
const command = windows
  ? 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ' + Buffer.from(bootstrap, 'utf16le').toString('base64')
  : 'codex app-server proxy';
const child = spawn('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', values.host, command], {
  windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
});
// Drain stderr, but never publish raw remote output or account information.
let stderrBytes = 0;
child.stderr.on('data', data => { stderrBytes += data.length; });
const pending = new Map();
let failStartup;
let resolveReady;
const ready = new Promise((resolve, reject) => { resolveReady = resolve; failStartup = reject; });
let markerSeen = !windows;
let buffered = Buffer.alloc(0);
let ws;
let transport;
let active = true;
const start = Date.now();
const fail = message => {
  if (!active) return;
  failStartup(new Error(message));
  for (const entry of pending.values()) entry.reject(new Error(message));
  pending.clear();
};
child.on('error', () => fail('Could not start SSH.'));
child.on('exit', code => fail(`SSH exited before verification completed (code ${code}).`));
child.stdin.on('error', () => fail('SSH input closed.'));
const output = new Transform({ transform(chunk, encoding, done) {
  if (markerSeen) return done(null, chunk);
  buffered = Buffer.concat([buffered, chunk]);
  const index = buffered.indexOf(marker);
  if (index >= 0) {
    markerSeen = true;
    resolveReady();
    const remaining = buffered.subarray(index + Buffer.byteLength(marker));
    buffered = Buffer.alloc(0);
    return done(null, remaining);
  }
  if (buffered.length > 65536) return done(new Error('Readiness output exceeded limit.'));
  done();
}});
output.on('error', () => fail('SSH readiness stream failed.'));
child.stdout.pipe(output);
if (markerSeen) resolveReady();
const deadline = promise => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Protocol stage timed out.')), timeout);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
const rpc = (id, method, params) => deadline(new Promise((resolve, reject) => {
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }), error => { if (error) reject(new Error('WebSocket send failed.')); });
})).finally(() => pending.delete(id));

try {
  // The app waits for the marker before sending any WebSocket bytes.
  await deadline(ready);
  transport = Duplex.from({ readable: output, writable: child.stdin });
  transport.on('error', () => fail('SSH transport failed.'));
  ws = new WebSocket('ws://localhost/', { createConnection: () => transport, handshakeTimeout: timeout });
  ws.on('error', () => fail('WebSocket failed.'));
  ws.on('close', () => fail('WebSocket closed.'));
  ws.on('message', data => {
    let message;
    try { message = JSON.parse(data.toString()); } catch { fail('Invalid protocol response.'); return; }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(`RPC failed (code ${message.error.code}).`));
    else entry.resolve(message.result);
  });
  await deadline(new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', () => reject(new Error('WebSocket handshake failed.')));
  }));
  const initialization = await rpc(1, 'initialize', {
    clientInfo: { name: 'ssh_repair_probe', version: '0.1.0' },
    capabilities: { experimentalApi: true }
  });
  ws.send(JSON.stringify({ method: 'initialized' }));
  const account = await rpc(2, 'account/read', { refreshToken: false });
  const models = await rpc(3, 'model/list', { includeHidden: false });
  console.log(JSON.stringify({
    protocol: 'passed', mode: values.mode, markerSeen,
    durationMs: Date.now() - start, platform: initialization.platformOs,
    authenticated: Boolean(account.account), modelCount: models.data.length
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ protocol: 'failed', mode: values.mode, markerSeen, error: error.message, stderrBytes }));
  process.exitCode = 1;
} finally {
  active = false;
  ws?.terminate();
  child.kill();
  transport?.destroy();
  output.destroy();
  child.stdin.destroy();
  child.stdout.destroy();
  child.stderr.destroy();
}

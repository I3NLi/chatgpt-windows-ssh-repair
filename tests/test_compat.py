"""Local regression tests; no SSH, credentials or live profile modifications."""
import base64
import os
from pathlib import Path
import queue
import shutil
import subprocess
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]
PS = shutil.which('powershell.exe')
BASH = os.environ.get('GIT_BASH', r'C:\Program Files\Git\bin\bash.exe')
TARGET = ". (Join-Path $controlDirectory 'codex-proxy.ps1')"
MARKER = '__CODEX_REMOTE_PROXY_STDOUT_MARKER_TEST__'

def encoded(text):
    return base64.b64encode(text.encode('utf-16le')).decode()

@unittest.skipUnless(os.name == 'nt' and PS, 'Windows PowerShell required')
class CompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="SSH repair ' ")
        self.addCleanup(self.temp.cleanup)
        self.compat = Path(self.temp.name) / '\u6d4b\u8bd5'
        shutil.copytree(ROOT / 'compat', self.compat)
        # GitHub Windows TEMP may use an 8.3 alias; PowerShell expands it.
        self.compat = self.compat.resolve()

    def rewrite(self, text):
        value = encoded(text)
        result = subprocess.run([PS, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', str(self.compat / 'rewrite-bootstrap.ps1'), value], capture_output=True, timeout=15, check=True)
        return result.stdout.decode()

    def test_nonmatching_commands_unchanged(self):
        for script in ['Write-Output ordinary', TARGET, "Write-Output '" + MARKER + "'"]:
            self.assertEqual(self.rewrite(script), encoded(script))

    def test_unicode_and_quoted_paths_preserved(self):
        source = TARGET + "\nWrite-Output '" + MARKER + " \u4e2d\u6587'"
        actual = base64.b64decode(self.rewrite(source)).decode('utf-16le')
        escaped = str(self.compat / 'codex-proxy.ps1').replace("'", "''")
        self.assertEqual(actual, source.replace(TARGET, ". '" + escaped + "'"))

    def run_bash(self, script, ssh=False):
        if not Path(BASH).exists(): self.skipTest('Git Bash unavailable')
        env = dict(os.environ)
        for key in ('BASH_ENV', 'SSH_CONNECTION', 'SSH_CLIENT'):
            env.pop(key, None)
        if ssh: env['SSH_CONNECTION'] = 'test'
        env['REPAIR_TEST_INIT'] = str(self.compat / 'init.bash')
        return subprocess.run([BASH, '--noprofile', '--norc', '-c',
            '. "$(cygpath -u "$REPAIR_TEST_INIT")"\n' + script], env=env, capture_output=True, timeout=20, check=True).stdout.decode().strip()

    def test_local_shell_is_not_wrapped(self):
        self.assertEqual(self.run_bash("if declare -F powershell.exe >/dev/null; then echo wrapped; else echo normal; fi"), 'normal')

    def test_ssh_wrapper_runs_ordinary_and_matched_scripts(self):
        for script in ["[Console]::Out.Write('OK')", TARGET + "\n# " + MARKER + "\n[Console]::Out.Write('OK')"]:
            command = 'powershell.exe -NoProfile -NonInteractive -EncodedCommand ' + encoded(script)
            self.assertEqual(self.run_bash(command, ssh=True), 'OK')

    def test_binary_frames_roundtrip_and_eof(self):
        env = dict(os.environ, RELAY_TEST_NODE=shutil.which('node'), RELAY_TEST_BOM='1')
        process = subprocess.Popen([PS, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', str(ROOT / 'tests/run-relay.ps1')], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, env=env)
        chunks = queue.Queue()
        def reader():
            while True:
                data = os.read(process.stdout.fileno(), 65536)
                if not data: break
                chunks.put(data)
        thread = threading.Thread(target=reader, daemon=True)
        thread.start()
        received = b''
        expected = b''
        try:
            # Send the next frame only after the previous one returned. This
            # catches the original "handshake works, later frames stall" failure.
            for frame in [b'GET / HTTP/1.1\r\n\r\n', b'\x00\x01\xff\x80', bytes(range(256)), os.urandom(16385), b'last-frame']:
                expected += frame
                process.stdin.write(frame)
                process.stdin.flush()
                while len(received) < len(expected):
                    received += chunks.get(timeout=15)
                self.assertEqual(received, expected)
            process.stdin.close()
            self.assertEqual(process.wait(timeout=10), 0)
            thread.join(timeout=2)
            self.assertEqual(process.stderr.read(), b'')
        finally:
            if process.poll() is None: process.kill()
            process.wait(timeout=5)
            for stream in (process.stdin, process.stdout, process.stderr): stream.close()

if __name__ == '__main__':
    unittest.main(verbosity=2)

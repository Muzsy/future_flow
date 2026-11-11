"""The proxy config capture while Caddy rewrites its certificate-renewal lock files.

On production `ghost_caddy_1` rewrites `<data>/caddy/locks/issue_cert_<domain>.lock` about every 20 s
(six stuck non-Alterward domains). `config_archive` reads every file twice and refuses a moving set, so
every backup died with 'Configuration changed during capture'. Only that exact heartbeat directory is
left out; every other byte under the mounts is still captured and compared.
"""
import importlib.util
import io
import os
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'backup_locks', Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

HOST_PATHS = ('/etc/ssh', '/root/.ssh')  # not present on a CI runner: stood in for below


class CaddyLockCaptureTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        base = Path(directory.name)
        self.data, self.config, self.caddyfile, self.compose = (base / n for n in ('data', 'config', 'Caddyfile', 'compose'))
        self.locks = self.data / 'caddy' / 'locks'
        self.locks.mkdir(parents=True)
        (self.data / 'caddy' / 'certificates').mkdir()
        self.certificate = self.data / 'caddy' / 'certificates' / 'alterward.com.crt'
        self.certificate.write_bytes(b'certificate')
        self.config.mkdir()
        (self.config / 'autosave.json').write_bytes(b'{}')
        self.caddyfile.write_bytes(b'alterward.com {}')
        self.compose.mkdir()
        (self.compose / 'compose.yaml').write_bytes(b'services: {}')
        for domain in ('a.example', 'b.example', 'c.example', 'd.example', 'e.example', 'f.example'):
            (self.locks / ('issue_cert_' + domain + '.lock')).write_bytes(b'x' * 88)
        self.container = {
            'Mounts': [{'Destination': d, 'Type': 'bind', 'Source': str(s)} for d, s in
                       [('/data', self.data), ('/config', self.config), ('/etc/caddy/Caddyfile', self.caddyfile)]],
            'Config': {'Labels': {'com.docker.compose.project.working_dir': str(self.compose),
                                  'com.docker.compose.project.config_files': 'compose.yaml'}}}
        self.reads = {}

    def capture(self, rewrite):
        """Run config_archive; `rewrite(path, count)` may change what the n-th read of a file returns."""
        real_read, real_is_file, real_is_dir = Path.read_bytes, Path.is_file, Path.is_dir
        host = lambda path: str(path).startswith(HOST_PATHS)

        def read_bytes(path):
            if host(path):
                return b'host'
            count = self.reads[str(path)] = self.reads.get(str(path), 0) + 1
            data = real_read(path)
            changed = rewrite(path, count)
            return data if changed is None else changed
        with patch.object(Path, 'read_bytes', read_bytes), \
             patch.object(Path, 'is_file', lambda path: True if host(path) else real_is_file(path)), \
             patch.object(Path, 'is_dir', lambda path: False if host(path) else real_is_dir(path)), \
             patch.object(Path, 'is_symlink', lambda path: os.path.islink(path)):
            return backup.config_archive(self.container)

    def names(self, archive):
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
            return {m.name.rsplit('/', 1)[-1] for m in tar.getmembers()}

    def test_a_lock_that_changes_between_the_two_reads_does_not_fail_the_capture(self):
        lock_dir = self.locks

        def heartbeat(path, count):
            if path.parent == lock_dir:
                return bytes([count]) * 88
        archive, hashes = self.capture(heartbeat)
        names = self.names(archive)
        self.assertFalse(any(n.endswith('.lock') for n in names))
        self.assertTrue({'alterward.com.crt', 'autosave.json', 'Caddyfile', 'compose.yaml'} <= names)
        self.assertFalse(any(name.endswith('.lock') for name in hashes))
        self.assertFalse(any(count for path, count in self.reads.items() if path.endswith('.lock')))  # never even read

    def test_a_changing_certificate_or_config_still_fails_closed(self):
        for target in (self.certificate, self.config / 'autosave.json', self.caddyfile, self.compose / 'compose.yaml'):
            with self.subTest(target.name):
                self.reads.clear()
                with self.assertRaisesRegex(ValueError, 'Configuration changed during capture'):
                    self.capture(lambda path, count, target=target: b'moved' if path == target and count > 1 else None)

    def test_only_the_exact_heartbeat_location_is_left_out(self):
        other = [self.data / 'caddy' / 'locks' / 'sub' / 'issue_cert_x.lock',
                 self.data / 'caddy' / 'other' / 'issue_cert_x.lock',
                 self.data / 'caddy' / 'locks' / 'issue_cert_x.txt',
                 self.data / 'locks' / 'issue_cert_x.lock',
                 self.config / 'caddy' / 'locks' / 'issue_cert_x.lock']
        for path in other:
            with self.subTest(str(path.relative_to(path.parents[3] if len(path.parents) > 3 else path.parent))):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b'x')
                self.reads.clear()
                with self.assertRaisesRegex(ValueError, 'Configuration changed during capture'):
                    self.capture(lambda p, count, path=path: b'moved' if p == path and count > 1 else None)
                path.unlink()

    def test_a_linked_lock_is_still_rejected(self):
        (self.locks / 'issue_cert_link.lock').symlink_to(self.certificate)
        with self.assertRaisesRegex(ValueError, 'Source symlink rejected'):
            self.capture(lambda path, count: None)


if __name__ == '__main__':
    unittest.main()

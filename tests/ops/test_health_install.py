"""Disposable Linux SSH-directory fixtures; no real key or access changes."""
import base64
import datetime as dt
import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('health_install', Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-health-install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


@unittest.skipIf(os.name == 'nt', 'Linux SSH key installer')
class HealthInstallTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.ops = self.root / 'ops';self.ssh = self.root / 'ssh'
        for path in (self.ops, self.ssh):
            path.mkdir(mode=0o700)
        self.authorized = self.ssh / 'authorized_keys'
        self.old = b'# existing owner key\nssh-ed25519 existing-other-key owner'
        self.authorized.write_bytes(self.old);self.authorized.chmod(0o600)
        source = b'# synthetic disposable projection\n'
        blob = b'\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20' + b'x' * 32
        self.request = {'mode': 'install', 'publicKey': 'ssh-ed25519 ' + base64.b64encode(blob).decode(),
                        'expiresAt': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=89)).strftime('%Y%m%d%H%M%SZ'),
                        'sourceBase64': base64.b64encode(source).decode(), 'sourceSha256': hashlib.sha256(source).hexdigest(),
                        'sourceCommit': 'a' * 40}

    def tearDown(self):
        self.temporary.cleanup()

    def test_check_is_readonly_and_install_is_restricted_idempotent_append(self):
        installer.install({**self.request, 'mode': 'check'}, self.ops, self.ssh)
        self.assertEqual(self.authorized.read_bytes(), self.old)
        self.assertFalse((self.ops / 'external-health').exists())
        proof = installer.install(self.request, self.ops, self.ssh)
        data = self.authorized.read_bytes()
        self.assertTrue(data.startswith(self.old + b'\n'))
        self.assertIn(b'restrict,expiry-time=', data)
        self.assertIn(installer.COMMAND.encode(), data)
        self.assertTrue(proof['existingAuthorizedKeysPreserved'])
        installer.install(self.request, self.ops, self.ssh)
        self.assertEqual(self.authorized.read_bytes(), data)

    def test_existing_different_monitor_key_or_projection_blocks_without_key_change(self):
        installer.install(self.request, self.ops, self.ssh)
        before = self.authorized.read_bytes()
        changed = {**self.request, 'publicKey': self.request['publicKey'][:-4] + 'eHh5'}
        with self.assertRaises(ValueError):
            installer.install(changed, self.ops, self.ssh)
        (self.ops / 'external-health/health.py').write_bytes(b'changed')
        with self.assertRaises(ValueError):
            installer.install(self.request, self.ops, self.ssh)
        self.assertEqual(self.authorized.read_bytes(), before)

    def test_invalid_key_expiry_scope_or_source_never_mutates(self):
        cases = [dict(root='../foreign'), dict(publicKey='ssh-ed25519 malformed'), dict(sourceSha256='b' * 64),
                 dict(expiresAt='20000101000000Z'), dict(expiresAt=(dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=92)).strftime('%Y%m%d%H%M%SZ'))]
        for case in cases:
            with self.assertRaises((ValueError, KeyError)):
                installer.install({**self.request, **case}, self.ops, self.ssh)
            self.assertEqual(self.authorized.read_bytes(), self.old)
            self.assertFalse((self.ops / 'external-health').exists())

    def test_linked_authorized_file_and_unrecognized_install_entry_are_refused(self):
        link = self.ssh / 'linked'
        os.link(self.authorized, link)
        with self.assertRaises(ValueError):
            installer.install(self.request, self.ops, self.ssh)
        link.unlink()
        target = self.ops / 'external-health';target.mkdir(mode=0o700)
        (target / 'foreign').write_text('foreign')
        with self.assertRaises(ValueError):
            installer.install(self.request, self.ops, self.ssh)
        self.assertEqual(self.authorized.read_bytes(), self.old)

    def test_source_only_update_preserves_every_authorized_byte_and_expiry(self):
        installer.install(self.request, self.ops, self.ssh)
        before = self.authorized.read_bytes()
        source = b'# reviewed replacement with same fixed command\n'
        request = {**self.request, 'mode': 'update', 'previousSourceSha256': self.request['sourceSha256'],
            'sourceBase64': base64.b64encode(source).decode(), 'sourceSha256': hashlib.sha256(source).hexdigest()}
        proof = installer.install(request, self.ops, self.ssh)
        self.assertTrue(proof['sourceOnlyUpdate'])
        self.assertEqual(self.authorized.read_bytes(), before)
        self.assertEqual((self.ops / 'external-health/health.py').read_bytes(), source)

    def test_source_update_refuses_changed_key_expiry_or_old_hash(self):
        installer.install(self.request, self.ops, self.ssh)
        before = self.authorized.read_bytes()
        old_source = (self.ops / 'external-health/health.py').read_bytes()
        request = {**self.request, 'mode': 'update', 'previousSourceSha256': self.request['sourceSha256']}
        for change in [{'previousSourceSha256': 'f'*64},
                       {'expiresAt': (dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=88)).strftime('%Y%m%d%H%M%SZ')},
                       {'publicKey': self.request['publicKey'][:-4]+'eHh5'}]:
            with self.assertRaises(ValueError):
                installer.install({**request, **change}, self.ops, self.ssh)
            self.assertEqual(self.authorized.read_bytes(), before)
            self.assertEqual((self.ops / 'external-health/health.py').read_bytes(), old_source)

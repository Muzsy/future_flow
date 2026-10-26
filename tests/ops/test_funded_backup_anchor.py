"""Regression for a completed funded runtime with only its ORIGINAL legacy tree."""
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from test_contabo_daily import daily, test_read


class FundedBackupAnchorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.owner = self.root / 'owner'
        self.daily = self.root / 'daily'
        self.funded = self.owner / 'funded-runtime-upgrade'
        self.old = 'a' * 40
        self.current = 'b' * 40
        self.legacy = self.owner / 'upgrades' / self.old
        self.original = self.owner / 'personal-beta' / 'manifest.json'
        self.write(self.original, json.dumps({'commit': self.old}).encode())
        self.write(self.funded / 'prepared.json', json.dumps({
            'baseline': {'authority': {str(self.original): daily.digest(self.original.read_bytes())}}
        }).encode())
        self.write(self.funded / 'journal.json', b'validated separately by funded_upgrade_healthy')
        self.start_patch('OWNER', self.owner)
        self.start_patch('ROOT', self.daily)
        self.start_patch('regular', side_effect=test_read)
        self.health = self.start_patch('funded_upgrade_healthy', return_value=True)

    def start_patch(self, name, *args, **kwargs):
        value = patch.object(daily, name, *args, **kwargs)
        self.addCleanup(value.stop)
        return value.start()

    def write(self, path, data=b'private fixture'):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def anchor(self):
        return daily.legacy_upgrade_archive_directory({'commit': self.current})

    def test_completed_transition_uses_byte_bound_original_commit(self):
        self.assertEqual(self.anchor(), self.legacy)
        self.health.assert_called_once_with('personal-beta')
        self.assertFalse((self.owner / 'upgrades' / self.current).exists())

    def test_unapplied_preparation_keeps_current_legacy_commit(self):
        (self.funded / 'journal.json').unlink()
        self.assertEqual(self.anchor(), self.owner / 'upgrades' / self.current)
        self.health.assert_not_called()

    def test_original_legacy_runtime_without_funded_preparation_is_unchanged(self):
        (self.funded / 'journal.json').unlink()
        (self.funded / 'prepared.json').unlink()
        self.funded.rmdir()
        self.assertEqual(self.anchor(), self.owner / 'upgrades' / self.current)
        self.health.assert_not_called()

    def test_partial_or_invalid_terminal_transition_is_rejected(self):
        self.health.return_value = False
        with self.assertRaises(ValueError):
            self.anchor()

    def test_changed_original_authority_is_rejected(self):
        self.original.write_text(json.dumps({'commit': 'c' * 40}))
        with self.assertRaises(ValueError):
            self.anchor()

    def test_missing_authority_binding_is_rejected(self):
        (self.funded / 'prepared.json').write_text('{"baseline":{"authority":{}}}')
        with self.assertRaises(KeyError):
            self.anchor()

    def test_linked_original_authority_is_rejected(self):
        other = self.root / 'other.json'
        self.original.rename(other)
        self.original.symlink_to(other)
        with self.assertRaises(ValueError):
            self.anchor()

    def test_invalid_bound_commit_cannot_select_a_path(self):
        for commit in ['../escape', '', 'a' * 39, None]:
            with self.subTest(commit=commit):
                raw = json.dumps({'commit': commit}).encode()
                self.original.write_bytes(raw)
                (self.funded / 'prepared.json').write_text(json.dumps({
                    'baseline': {'authority': {str(self.original): daily.digest(raw)}}
                }))
                with self.assertRaises(ValueError):
                    self.anchor()

    def archive_fixture(self):
        names = ['server.env', 'manifest.json', 'effective-compose.json', 'pinned-image.json']
        for name in names:
            self.write(self.owner / name, json.dumps({'commit': self.current}).encode()
                       if name == 'manifest.json' else b'CURRENT-' + name.encode())
            self.write(self.legacy / name, b'ORIGINAL-' + name.encode())
            self.write(self.legacy / 'previous' / name, b'PREVIOUS-' + name.encode())
        for name in ['prepared.json', 'applying.json', 'applied.json']:
            self.write(self.legacy / name)
        for directory, names in [('origin-install', ['inventory.json', 'origin-ca.pem']),
                                 ('proxy-prepare', ['before.Caddyfile', 'before.compose.yaml'])]:
            for name in names:
                self.write(self.owner / directory / name)
        self.write(self.daily / 'config.json')
        self.start_patch('config', return_value={'scriptHashes': {}})
        self.start_patch('reader_config_paths', return_value=[])
        self.start_patch('personal_config_paths', return_value=[self.original])
        self.write(self.funded / 'target' / 'server.env', b'funded target')
        self.write(self.funded / 'recovery' / 'server.env', b'funded recovery')
        self.start_patch('funded_upgrade_config_paths', return_value=list(self.funded.rglob('*.json')) +
                         [self.funded / role / 'server.env' for role in ['target', 'recovery']])
        # All /etc reads stay in the disposable fixture, including CA and units.
        def fixture_path(value):
            path = Path(value)
            return self.root / str(path).lstrip('/') if str(path).startswith('/etc/') else path
        self.start_patch('Path', side_effect=fixture_path)
        for name in ['alterward-backup.service', 'alterward-backup.timer',
                     'alterward-monitor.service', 'alterward-monitor.timer']:
            self.write(self.root / 'etc/systemd/system' / name)
        self.write(self.root / 'etc/alterward/supabase-ca.crt')
        proxy = self.root / 'proxy.conf'
        self.write(proxy)
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w:gz') as archive:
            data = proxy.read_bytes()
            entry = tarfile.TarInfo(str(proxy).lstrip('/'))
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))
        self.start_patch('original_config_archive', return_value=(output.getvalue(), {}))

    def test_real_collector_preserves_current_legacy_and_funded_bytes(self):
        self.archive_fixture()
        data, hashes = daily.extended_config_archive({})
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            actual = {member.name: archive.extractfile(member).read() for member in archive.getmembers()}
        for path in [self.owner / 'server.env', self.legacy / 'server.env',
                     self.legacy / 'previous/server.env', self.original,
                     self.funded / 'target/server.env', self.funded / 'recovery/server.env']:
            key = str(path).lstrip('/')
            self.assertEqual(actual[key], path.read_bytes())
        self.assertEqual(hashes, {name: daily.digest(value) for name, value in actual.items()})
        self.assertFalse((self.owner / 'upgrades' / self.current).exists())

    def test_missing_original_legacy_file_still_fails_capture(self):
        self.archive_fixture()
        (self.legacy / 'applied.json').unlink()
        with self.assertRaises(FileNotFoundError):
            daily.extended_config_archive({})


if __name__ == '__main__':
    unittest.main()

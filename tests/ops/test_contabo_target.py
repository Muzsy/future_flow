import importlib.util
import io
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from subprocess import CompletedProcess
from copy import deepcopy

ROOT = Path(__file__).resolve().parents[2]
library_spec = importlib.util.spec_from_file_location(
    'alterward_backup', ROOT / 'scripts/ops/contabo-backup.py')
library = importlib.util.module_from_spec(library_spec)
library_spec.loader.exec_module(library)
sys.modules['alterward_backup'] = library
spec = importlib.util.spec_from_file_location('target', ROOT / 'scripts/ops/contabo-target.py')
target = importlib.util.module_from_spec(spec)
spec.loader.exec_module(target)


def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as tar:
        for name, kind in entries:
            entry = tarfile.TarInfo(name)
            entry.type = kind
            if kind == tarfile.REGTYPE:
                entry.size = 4
                tar.addfile(entry, io.BytesIO(b'test'))
            else:
                entry.linkname = '/outside'
                tar.addfile(entry)
    return output.getvalue()


class SourceArchiveSafetyTests(unittest.TestCase):
    def test_rendered_owner_gate_and_paid_state_fail_closed(self):
        access = {'teamDomain': 'example.cloudflareaccess.com',
                  'audience': 'a' * 64, 'allowedEmails': ['owner@example.invalid']}
        gate = {'CLOSED_SITE_ENABLED': 'true',
                'CLOUDFLARE_ACCESS_TEAM_DOMAIN': access['teamDomain'],
                'CLOUDFLARE_ACCESS_AUD': access['audience'],
                'CLOSED_SITE_ALLOWED_EMAILS': access['allowedEmails'][0]}
        paid = {'CLOSED_BETA_ENABLED': 'true', 'CLOSED_BETA_USER_IDS': '',
                'AI_PROJECT_BUDGET_USD': '0', 'AI_USER_BUDGET_USD': '0'}
        config = {'services': {
            'web': {'environment': gate},
            'api': {'environment': {**gate, **paid,
                    **{key: 'true' for key in ['OFFICIAL_PUBLICATIONS_ENABLED',
                       'DISCOVERY_ENABLED', 'PUBLIC_COLLECTIONS_ENABLED', 'PUBLIC_SCENARIOS_ENABLED']}}},
            'worker': {'environment': {**paid, 'AI_BUDGET_WINDOW_REQUIRED': 'true',
                       'AI_BUDGET_WINDOW_START': '', 'AI_BUDGET_WINDOW_END': ''}}}}
        target.validate_owner_configuration(config, access)
        for service, key, value in [('web', 'CLOSED_SITE_ENABLED', 'false'),
                                    ('api', 'CLOSED_SITE_ENABLED', None),
                                    ('api', 'CLOUDFLARE_ACCESS_AUD', 'b' * 64),
                                    ('web', 'CLOSED_SITE_ALLOWED_EMAILS', 'foreign@example.invalid'),
                                    ('worker', 'AI_PROJECT_BUDGET_USD', '2'),
                                    ('api', 'CLOSED_BETA_ENABLED', 'false'),
                                    ('worker', 'CLOSED_BETA_USER_IDS', 'uninvited-user'),
                                    ('worker', 'AI_BUDGET_WINDOW_START', '2026-10-09T00:00:00Z')]:
            with self.subTest(service=service, key=key):
                changed = deepcopy(config)
                changed['services'][service]['environment'][key] = value
                with self.assertRaises(ValueError):
                    target.validate_owner_configuration(changed, access)

    def test_host_credentials_cannot_override_fixture_environment(self):
        with patch.dict(os.environ, {'PATH': 'safe-path', 'HOME': 'safe-home',
                                     'OPENAI_API_KEY': 'host-key',
                                     'SUPABASE_SERVICE_ROLE_KEY': 'host-admin',
                                     'DATABASE_URL': 'host-database',
                                     'CLOSED_BETA_ENABLED': 'false'}, clear=True):
            with patch.object(target.subprocess, 'run',
                              return_value=CompletedProcess(['docker'], 0, b'', b'')) as command:
                target.run(['docker', 'compose', 'config'])
        self.assertEqual(command.call_args.kwargs['env'],
                         {'PATH': 'safe-path', 'HOME': 'safe-home'})

    def test_git_directories_and_regular_files_accepted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target.source_extract(archive([('apps/', tarfile.DIRTYPE),
                                           ('apps/web/file', tarfile.REGTYPE),
                                           ('.env.example', tarfile.REGTYPE)]), root)
            self.assertEqual((root / 'apps/web/file').read_bytes(), b'test')

    def test_private_paths_rejected_before_writes(self):
        for name in ['.env', '.env.local', '.env.local.example', '.local/proof', 'env/key.txt',
                     '.git/config', 'node_modules/key', '__pycache__/file']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                with self.assertRaises(ValueError):
                    target.source_extract(archive([('valid', tarfile.REGTYPE),
                                                   (name, tarfile.REGTYPE)]), root)
                self.assertEqual(list(root.iterdir()), [])

    def test_aliases_and_absolute_paths_rejected_before_writes(self):
        for name in ['/root/file', '../file', 'root/../file', 'root//file', 'root\\file']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                with self.assertRaises(ValueError):
                    target.source_extract(archive([('valid', tarfile.REGTYPE),
                                                   (name, tarfile.REGTYPE)]), root)
                self.assertEqual(list(root.iterdir()), [])

    def test_source_links_and_devices_forbidden(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                with self.assertRaises(ValueError):
                    target.source_extract(archive([('danger', kind)]), Path(temporary))

    def test_duplicate_regular_files_rejected_before_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(ValueError):
                target.source_extract(archive([('same', tarfile.REGTYPE),
                                               ('same', tarfile.REGTYPE)]), root)
            self.assertEqual(list(root.iterdir()), [])


if __name__ == '__main__':
    unittest.main()

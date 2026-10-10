import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

directory = Path(__file__).resolve().parents[2] / 'scripts/ops'
spec = importlib.util.spec_from_file_location('alterward_backup', directory / 'contabo-backup.py')
library = importlib.util.module_from_spec(spec)
sys.modules['alterward_backup'] = library
spec.loader.exec_module(library)
spec = importlib.util.spec_from_file_location('managed_recovery', directory / 'contabo-managed-recovery.py')
managed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(managed)


def catalog():
    return {'scope': 'auth-storage-data-and-public-security',
            'roles': ['postgres', 'anon'], 'publicSecurityDigest': '0' * 32,
            'tables': [{'schema': 'auth', 'name': 'users', 'count': 1, 'digest': '0' * 32}]}


class ManagedRecoveryBoundaries(unittest.TestCase):
    def test_invalid_catalog_names_scopes_duplicates_and_missing_users_fail(self):
        for change in [
            {'scope': 'public-data'}, {'roles': ['postgres', 'x";DROP ROLE postgres;--']},
            {'roles': ['anon', 'anon']}, {'publicSecurityDigest': 'bad'},
            {'tables': [{'schema': 'public', 'name': 'aw_lives', 'count': 0, 'digest': '0'*32}]},
            {'tables': catalog()['tables'] * 2},
            {'tables': [{'schema': 'auth', 'name': 'sessions', 'count': 0, 'digest': '0'*32}]},
        ]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                managed.safe_catalog({**catalog(), **change})
        self.assertIsNotNone(managed.safe_catalog(catalog()))

    def test_capture_refuses_foreign_project_or_unverified_snapshot_before_services(self):
        request = {'catalog': catalog(), 'projectRef': 'a'*20, 'snapshot': '00000003-000000AB-1',
                   'recipient': 'age1'+'a'*58,
                   'database': {'host': 'aws-0-eu-west-1.pooler.supabase.com', 'port': '5432',
                                'name': 'postgres', 'user': 'postgres.'+'a'*20, 'password': 'dummy'}}
        for change in [{'host':'database.example.invalid'}, {'user':'postgres.'+'b'*20},
                       {'name':'other'}, {'port':'6543'}, {'password':'dummy\nPGHOST=foreign'}]:
            with self.subTest(change=change), patch.object(managed, 'validate_base'), patch.object(managed, 'existing_state') as state:
                with self.assertRaises(ValueError):
                    managed.capture({**request, 'database': {**request['database'], **change}})
                state.assert_not_called()
        with patch.object(managed, 'validate_base'), patch.object(managed, 'existing_state') as state:
            with self.assertRaises(ValueError):
                managed.capture({**request, 'snapshot':'unsafe;write'})
            state.assert_not_called()

    def test_cleanup_never_removes_foreign_labeled_published_or_wrong_image_container(self):
        base = {'Id':'fixture', 'Image':managed.PINNED_PG, 'Config':{'Labels':{managed.LABEL:'run'}}, 'HostConfig':{'PortBindings':None}}
        for bad in [
            {**base, 'Image':'foreign'},
            {**base, 'Config':{'Labels':{managed.LABEL:'other'}}},
            {**base, 'HostConfig':{'PortBindings':{'5432/tcp':[{'HostPort':'5432'}]}}},
        ]:
            with patch.object(managed,'command',return_value=types.SimpleNamespace(returncode=0,stdout=json.dumps([bad]).encode())) as command:
                with self.assertRaises(ValueError): managed.cleanup('fixture','run')
                self.assertEqual(command.call_count,1)

    def test_wrong_restore_manifest_cannot_read_keys_or_start_a_fixture(self):
        request = {'manifest':{'schemaVersion':'other'},'runId':'20261010T120000Z-12345678'}
        with patch.object(managed,'validate_base'), patch.object(managed,'existing_state') as state:
            with self.assertRaises(ValueError): managed.rehearse(request)
            state.assert_not_called()


if __name__ == '__main__':
    unittest.main()

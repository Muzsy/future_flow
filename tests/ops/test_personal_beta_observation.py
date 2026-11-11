import copy
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/ops' / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


for name, file in [('alterward_backup', 'contabo-backup.py'), ('alterward_target', 'contabo-target.py'),
                   ('alterward_owner', 'contabo-owner.py'), ('alterward_activation', 'contabo-owner-activation.py'),
                   ('alterward_upgrade', 'contabo-owner-upgrade.py'), ('alterward_fence', 'contabo-writer-fence.py')]:
    load(name, file)
observer = load('personal_observation', 'contabo-personal-beta-observation.py')


class PersonalObservationTests(unittest.TestCase):
    def setUp(self):
        self.original = {role: {'Id': str(index + 1) * 64, 'Image': 'sha256:' + 'a' * 64,
            'RestartCount': 0, 'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'}},
            'Config': {'Labels': {'com.docker.compose.project': 'alterward-owner',
                                  'com.docker.compose.service': role}},
            'State': {'Status': 'running', 'Running': True, 'OOMKilled': False}}
            for index, role in enumerate(['web', 'api', 'worker'])}
        self.stopped = copy.deepcopy(list(self.original.values()))
        for item in self.stopped:
            item['State'].update(Status='exited', Running=False)
        self.ids = [item['Id'] for item in self.stopped]
        self.manifest = b'synthetic exact original manifest\n'
        self.digest = hashlib.sha256(self.manifest).hexdigest()
        self.selection = {'participants': [{'email': 'tester@example.invalid',
                                           'userId': '11111111-1111-4111-8111-111111111111'}],
                          'seedProjectKeys': [], 'seedUserKeys': []}  # JS proof is an explicit mocked seam here
        self.proof = {'observedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
            'participantCount': 1, 'identityBindingSha256': hashlib.sha256(json.dumps(
                self.selection['participants'], separators=(',', ':')).encode()).hexdigest(),
            'databaseIdentitySha256': '754b4a0116dfb6a50ff2e28a0f5f850a99c6132ae79b89f9712c53fea8387a11',
            'seedAccounts': 7, 'legacyAccounts': 2, 'activationJournalAbsent': True,
            'databaseTlsVerified': True, 'databaseTlsHostnameVerified': True,
            'priorWindowAccounts': 0, 'unsettledReservations': 0, 'databaseWrites': 0, 'providerApiCalls': 0}

    def observe(self, patch_proof=None, stopped=None, journal=False, manifests=None,
                quiet_before=None, quiet_after=None, selection=None, source=None, ids=None):
        proof = {**self.proof, **(patch_proof or {})}
        quiet = {'databaseTlsVerified': True, 'pendingJobs': 0, 'liveLeases': 0, 'foreignActiveSessions': 0}
        with patch.object(observer.fence, 'original', side_effect=manifests or [self.manifest, self.manifest]), \
             patch.object(Path, 'exists', return_value=journal), \
             patch.object(Path, 'is_symlink', return_value=False), \
             patch.object(observer, 'project_ids', return_value=self.ids if ids is None else ids), \
             patch.object(observer, 'docker', return_value=types.SimpleNamespace(stdout=json.dumps(stopped or self.stopped))), \
             patch.object(observer, 'run', side_effect=[types.SimpleNamespace(stdout=json.dumps(quiet if quiet_before is None else quiet_before)),
                                                       types.SimpleNamespace(stdout=json.dumps(proof)),
                                                       types.SimpleNamespace(stdout=json.dumps(quiet if quiet_after is None else quiet_after))]) as run:
            result = observer.observe_held(self.selection if selection is None else selection, original=self.original,
                           manifest_digest=self.digest, probe_source='// explicit fixture probe seam' if source is None else source)
            self.assertEqual(run.call_count, 3)
            for call in run.call_args_list:
                self.assertIn('--no-deps', call.args[0])
                self.assertIn('--rm', call.args[0])
        return result

    def test_fresh_exact_bound_snapshot_under_stopped_original_services(self):
        result = self.observe()
        self.assertTrue(result['writerFenceHeld'])
        self.assertEqual(result['manifestDigest'], self.digest)

    def test_any_running_or_drifted_service_prevents_observation(self):
        for mutation in ['running', 'restart', 'configuration', 'status']:
            values = copy.deepcopy(self.stopped)
            if mutation == 'running':
                values[0]['State'].update(Status='running', Running=True)
            elif mutation == 'restart':
                values[0]['RestartCount'] = 1
            elif mutation == 'status':
                values[0]['State']['Status'] = 'dead'
            else:
                values[0]['HostConfig']['Memory'] = 999
            with self.assertRaises(ValueError):
                self.observe(stopped=values)

    def test_existing_activation_intent_cannot_be_ignored(self):
        with self.assertRaises(ValueError):
            self.observe(journal=True)

    def test_manifest_and_membership_drift_before_or_after_probes_refuses(self):
        for manifests in [[b'changed'], [self.manifest, b'changed']]:
            with self.subTest(manifests=manifests), self.assertRaises(ValueError):
                self.observe(manifests=manifests)
        with self.assertRaises(ValueError):
            self.observe(ids=self.ids + ['f' * 64])

    def test_queue_lease_or_foreign_writer_activity_before_or_after_refuses(self):
        quiet = {'databaseTlsVerified': True, 'pendingJobs': 0, 'liveLeases': 0, 'foreignActiveSessions': 0}
        for field in ['pendingJobs', 'liveLeases', 'foreignActiveSessions', 'databaseTlsVerified']:
            dirty = {**quiet, field: False if field == 'databaseTlsVerified' else 1}
            for side in ['quiet_before', 'quiet_after']:
                with self.subTest(field=field, side=side), self.assertRaises(ValueError):
                    self.observe(**{side: dirty})

    def test_unbounded_or_extra_authority_cannot_reach_the_probe(self):
        for selection in [{}, {**self.selection, 'writerFenceHeld': True},
                          {**self.selection, 'participants': []},
                          {**self.selection, 'participants': self.selection['participants'] * 11},
                          {**self.selection, 'seedUserKeys': ['a' * 8192]}]:
            with self.subTest(selection=selection.keys()), self.assertRaises(ValueError):
                self.observe(selection=selection)
        with self.assertRaises(ValueError):
            self.observe(source='a' * (128 * 1024 + 1))

    def test_stale_mixed_wrong_database_or_nonzero_window_proofs_are_refused(self):
        for changes in [{'observedAt': '2020-01-01T00:00:00Z'}, {'participantCount': True},
            {'participantCount': 2}, {'identityBindingSha256': 'b' * 64},
            {'databaseIdentitySha256': 'b' * 64}, {'seedAccounts': 6}, {'legacyAccounts': 3},
            {'databaseTlsHostnameVerified': False}, {'activationJournalAbsent': False},
            {'priorWindowAccounts': 1}, {'unsettledReservations': 1},
            {'databaseWrites': False}, {'providerApiCalls': 1}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.observe(patch_proof=changes)


if __name__ == '__main__':
    unittest.main()

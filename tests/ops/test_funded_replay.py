"""Active funded proof uses retained root state, without changing legacy receipts."""
import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

path = Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-funded-replay.py'
spec = importlib.util.spec_from_file_location('funded_replay', path)
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)


class ActiveFundedReplayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.upgrade = self.root / 'funded-runtime-upgrade'
        self.upgrade.mkdir()
        self.authority = self.root / 'reader-original.json'
        self.authority.write_bytes(b'original-window-budget-and-admission')
        self.manifest = {'commit': 'a' * 40, 'imageId': 'sha256:' + 'b' * 64}
        self.files = {}
        for role in ('target', 'recovery'):
            (self.upgrade / role).mkdir()
            for name in replay.FILES:
                raw = replay.encoded(self.manifest) if name == 'manifest.json' else b'protected-' + name.encode()
                (self.upgrade / role / name).write_bytes(raw)
                (self.root / name).write_bytes(raw)
            self.files[role] = {name: replay.sha((self.root / name).read_bytes()) for name in replay.FILES}
        build = {'commit': self.manifest['commit'], 'imageId': self.manifest['imageId']}
        self.candidate = {'version': 'alterward-funded-upgrade-1', 'sourceCommit': 'a' * 40,
                          'bundleSha256': 'c' * 64, 'release': {'target': build, 'recovery': build,
                                                               'runtime': {'generation': 'v9'}},
                          'files': self.files,
                          'baseline': {'authority': {str(self.authority): replay.sha(self.authority.read_bytes())}}}
        self.candidate_sha = replay.sha(replay.encoded(self.candidate))
        self.row = {'state': 'applied', 'changedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'previousSha256': None}
        self.row['sha256'] = replay.sha(replay.encoded(self.row))
        self.journal = {'version': self.candidate['version'], 'preparedSha256': self.candidate_sha, 'states': [self.row]}
        self.readback = {'version': self.candidate['version'], 'sourceCommit': 'a' * 40,
                         'preparedSha256': self.candidate_sha, 'imageId': build['imageId'], 'schema': 38,
                         'protectedDataUnchanged': True, 'paidAiCalls': 0, 'operationPaidAiCalls': 0,
                         'databaseRestored': False}
        self.services = {role: {'Id': str(i) * 64, 'Image': build['imageId'],
                               'Config': {'Labels': {'com.docker.compose.project': replay.PROJECT}}}
                         for i, role in enumerate(('web', 'api', 'worker'), 1)}
        self.containers = list(self.services.values())
        self.daily = SimpleNamespace(OWNER=self.root, funded_upgrade_healthy=lambda _: True, owner_runtime=lambda: (self.manifest, self.services),
                                     reader_config_paths=lambda: [self.authority], personal_config_paths=lambda: [],
                                     containers=lambda: self.containers)
        self.save()

    def save(self):
        for name, value in [('prepared.json', self.candidate), ('journal.json', self.journal), ('readback.json', self.readback)]:
            (self.upgrade / name).write_bytes(replay.encoded(value))

    def proof(self):
        return replay.active_funded_runtime(self.daily, lambda p: p.read_bytes())

    def test_complete_proof_keeps_original_receipts_and_binds_current_runtime(self):
        before = {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        proof = self.proof()
        self.assertEqual(proof['imageId'], self.manifest['imageId'])
        self.assertEqual(proof['role'], 'target')
        replay.require_funded_runtime(self.daily, lambda p: p.read_bytes(), proof)
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()})

    def test_recovered_uses_the_retained_recovery_role(self):
        self.row['state'] = 'recovered'
        self.row['sha256'] = replay.sha(replay.encoded({k: v for k, v in self.row.items() if k != 'sha256'}))
        self.save()
        self.assertEqual(self.proof()['role'], 'recovery')

    def test_incomplete_or_unknown_terminal_never_issues_active_authority(self):
        for state in ('held', 'closed', 'stop-unverified', 'exposure-intent', 'unknown'):
            self.row['state'] = state
            self.row['sha256'] = replay.sha(replay.encoded({k: v for k, v in self.row.items() if k != 'sha256'}))
            self.save()
            with self.subTest(state=state), self.assertRaises(ValueError):
                self.proof()

    def test_chain_or_prepared_binding_tamper_is_rejected(self):
        original = copy.deepcopy(self.journal)
        for change in ('prepared', 'previous', 'hash'):
            self.journal = copy.deepcopy(original)
            if change == 'prepared': self.journal['preparedSha256'] = '0' * 64
            elif change == 'previous': self.journal['states'][0]['previousSha256'] = '0' * 64
            else: self.journal['states'][0]['sha256'] = '0' * 64
            self.save()
            with self.subTest(change=change), self.assertRaises(ValueError): self.proof()

    def test_runtime_or_authority_bytes_cannot_be_replaced(self):
        for path in (self.authority, self.root / 'server.env', self.upgrade / 'target' / 'manifest.json'):
            original = path.read_bytes()
            path.write_bytes(b'changed')
            with self.subTest(path=path.name), self.assertRaises(ValueError): self.proof()
            path.write_bytes(original)

    def test_readback_source_image_schema_and_side_effect_claims_are_required(self):
        before = copy.deepcopy(self.readback)
        for key, value in [('sourceCommit', 'd' * 40), ('imageId', 'sha256:' + 'd' * 64), ('schema', 37),
                           ('protectedDataUnchanged', False), ('paidAiCalls', 1), ('databaseRestored', True)]:
            self.readback = {**before, key: value}
            self.save()
            with self.subTest(key=key), self.assertRaises(ValueError): self.proof()

    def test_pending_probe_or_unhealthy_transition_is_rejected(self):
        self.daily.funded_upgrade_healthy = lambda _: False
        with self.assertRaises(ValueError): self.proof()

    def test_actual_image_or_extra_project_member_is_rejected(self):
        original = self.services['worker']['Image']
        self.services['worker']['Image'] = 'sha256:' + 'f' * 64
        with self.assertRaises(ValueError): self.proof()
        self.services['worker']['Image'] = original
        self.containers.append({**self.services['worker'], 'Id': '4' * 64})
        with self.assertRaises(ValueError): self.proof()

    def test_stale_client_proof_or_unknown_shape_is_rejected(self):
        proof = self.proof()
        for key in proof:
            with self.subTest(key=key), self.assertRaises(ValueError):
                replay.require_funded_runtime(self.daily, lambda p: p.read_bytes(), {**proof, key: 'changed'})
        with self.assertRaises(ValueError):
            replay.require_funded_runtime(self.daily, lambda p: p.read_bytes(), {**proof, 'extra': True})

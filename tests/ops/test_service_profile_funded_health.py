"""The funded-runtime health the Daily backup, monitor and active proof rely on must keep holding
after the service profile (SPR, P2) legitimately rewrote the owner files.

Real private files and the real Daily validators over a completed funded upgrade plus an exposed
successor generation (the production shape), with SPR generations written by the real
service-profile module and the root service-env step's journal/plan layout. Regression for the
Daily backup failing right after P2: funded_upgrade_healthy compared the owner files with the
successor chain, which the service-env step has (by design) replaced under SPR control.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

import test_beta_successor_authority as authority
from test_contabo_daily import daily
import test_funded_replay as funded_replay

replay = funded_replay.replay
directory = Path(__file__).resolve().parents[2] / 'scripts/ops'
spec = importlib.util.spec_from_file_location('profile_for_funded_health', directory / 'contabo-service-profile.py')
profile_module = importlib.util.module_from_spec(spec)
sys.modules['profile_for_funded_health'] = profile_module
spec.loader.exec_module(profile_module)

KEYS = {'server.env': 'serverEnvSha256', 'effective-compose.json': 'effectiveComposeSha256',
        'manifest.json': 'manifestSha256', 'pinned-image.json': 'pinnedImageSha256'}
IMAGE = 'sha256:' + 'c' * 64


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True) + '\n').encode()


class ServiceRecord:
    """Writes SPR generations and the matching service-env evidence the way the root step does."""

    def __init__(self, root, owner, base, uid):
        self.root, self.owner, self.base, self.uid = Path(root), Path(owner), dict(base), uid
        self.profiles = self.root / 'service-profile'
        self.env = self.root / 'service-env'
        self.files = dict(base)
        self.parent = '9' * 64
        self.generation = 0
        self.rows = []
        self.operations = []
        self.env.mkdir(mode=0o700)
        os.chmod(self.env, 0o700)

    def private(self, path, data, mode=0o600):
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        path.write_bytes(data)
        os.chmod(path, mode)

    def journal(self, event, operation, **fields):
        body = {'version': 'alterward-service-env-journal-1', 'sequence': len(self.rows) + 1,
                'at': '2026-11-06T10:40:00Z', 'event': event, 'operationId': operation,
                'previousSha256': self.rows[-1]['sha256'] if self.rows else '0' * 64, **fields}
        self.rows.append({**body, 'sha256': sha(canonical(body))})
        self.private(self.env / 'journal.jsonl', b''.join(canonical(r) for r in self.rows))

    def apply(self, **override):
        """One owner-approved generation: replace the four owner files and activate its profile."""
        self.generation += 1
        number = self.generation
        operation = f'123e4567-e89b-42d3-a456-42661417400{number}'
        new = {name: f'service-{number}-{name}'.encode() for name in KEYS}
        after = {name: sha(data) for name, data in new.items()}
        plan = {'version': 'alterward-service-env-plan-1', 'generation': number,
                'parentProfileSha256': self.parent, 'sourceCommit': 'b' * 40, 'imageId': IMAGE,
                'sourceDirectory': '/root/alterward-ops/build/' + 'b' * 40,
                'before': {KEYS[n]: h for n, h in self.files.items()},
                'after': {KEYS[n]: h for n, h in after.items()}, 'changes': {},
                'backupManifestSha256': '1' * 64, 'restoreProofSha256': '2' * 64}
        approval = sha(f'activate-service-env {number}'.encode())
        plan = {**plan, **override.get('plan', {})}
        folder = self.env / operation
        (folder / 'previous').mkdir(mode=0o700, parents=True)
        os.chmod(folder, 0o700)
        os.chmod(folder / 'previous', 0o700)
        self.private(folder / 'plan.json', canonical({**plan, 'approvalSha256': approval,
                                                       'approvedAt': '2026-11-06T10:39:00Z'}))
        self.journal('intent-persisted', operation, planSha256=sha(canonical(plan)), generation=number)
        for name, data in new.items():
            self.private(self.owner / name, data)
        self.journal('files-replaced', operation)
        self.journal('env-applied', operation, after=plan['after'])
        profile = {'version': 'alterward-service-profile-1', 'generation': number,
                   'parentProfileSha256': self.parent, 'sourceCommit': 'b' * 40, 'imageId': IMAGE,
                   'effectiveComposeSha256': after['effective-compose.json'],
                   'serverEnvSha256': after['server.env'], 'pinnedImageSha256': after['pinned-image.json'],
                   'schema': 40, 'serviceAccessEnforcement': True,
                   'activation': {'approvalSha256': approval, 'approvedAt': '2026-11-06T10:39:00.000Z',
                                  'backupManifestSha256': '1' * 64, 'restoreProofSha256': '2' * 64},
                   'restoredFrom': None}
        now = daily.dt.datetime(2026, 11, 6, 10, 41, tzinfo=daily.dt.timezone.utc)
        record = profile_module.activate(self.profiles, profile, now=now)
        self.parent = record['profileSha256']
        self.journal('completed', operation, generation=number, profileSha256=record['profileSha256'])
        self.files = after
        self.operations.append(operation)
        return operation


class ServiceProfileFundedHealthTests(authority.SuccessorAuthorityTests):
    def setUp(self):
        super().setUp()
        self.value = self.prepare()
        self.expose(self.value)
        self.base = {n: daily.digest((self.owner / n).read_bytes()) for n in daily.RUNTIME_NAMES}
        root = Path(self.tmp.name).resolve()
        self.start_patch('SERVICE_PROFILE_DIR', root / 'service-profile')
        self.start_patch('SERVICE_ENV_DIR', root / 'service-env')
        self.start_patch('UID', os.geteuid())
        self.start_patch('SERVICE_OPERATION_DIR', root / 'service-operations')
        self.record = ServiceRecord(root, self.owner, self.base, os.geteuid())

    def healthy(self):
        return daily.funded_upgrade_healthy('personal-beta')

    def test_the_legacy_funded_chain_is_healthy_before_the_service_profile_exists(self):
        self.assertTrue(self.healthy())

    def test_owner_files_rewritten_without_a_service_profile_are_still_unhealthy(self):
        self.write(self.owner / 'server.env', b'rewritten-by-nobody-approved')
        self.assertFalse(self.healthy())

    def test_p2_rewritten_owner_files_under_an_active_service_profile_are_healthy(self):
        self.record.apply()
        self.assertNotEqual({n: daily.digest((self.owner / n).read_bytes()) for n in daily.RUNTIME_NAMES}, self.base)
        self.assertTrue(self.healthy())
        self.assertEqual(daily.service_active_files(self.base), self.record.files)

    def test_a_second_approved_generation_chains_from_the_first(self):
        self.record.apply()
        self.record.apply()
        self.assertTrue(self.healthy())

    def test_any_owner_file_changed_after_the_profile_is_unhealthy(self):
        self.record.apply()
        for name in daily.RUNTIME_NAMES:
            with self.subTest(name=name):
                current = (self.owner / name).read_bytes()
                self.write(self.owner / name, b'tampered')
                self.assertFalse(self.healthy())
                self.write(self.owner / name, current)
        self.assertTrue(self.healthy())

    def test_files_replaced_but_not_yet_profiled_are_unhealthy(self):
        self.record.apply()
        # A later service-env operation replaced the files; its generation is not activated.
        for name in daily.RUNTIME_NAMES:
            self.write(self.owner / name, b'next-' + name.encode())
        self.assertFalse(self.healthy())

    def test_the_original_files_after_a_profile_are_not_accepted(self):
        self.record.apply()
        for name in daily.RUNTIME_NAMES:
            self.write(self.owner / name, (self.root / 'target' / name).read_bytes())
        self.assertFalse(self.healthy())

    def test_the_plan_must_start_from_the_chain_authority(self):
        self.record.apply(plan={'before': {k: '0' * 64 for k in KEYS.values()}})
        self.assertFalse(self.healthy())

    def test_a_generation_must_continue_the_previous_one(self):
        self.record.apply()
        self.record.files = {n: '0' * 64 for n in daily.RUNTIME_NAMES}
        self.record.apply()
        self.assertFalse(self.healthy())

    def test_profile_digests_must_equal_the_approved_plan(self):
        self.record.apply()
        folder = self.record.env / self.record.operations[0]
        for field, value in [('sourceCommit', 'd' * 40), ('imageId', 'sha256:' + 'd' * 64), ('generation', 2)]:
            with self.subTest(field=field):
                plan = json.loads((folder / 'plan.json').read_bytes())
                original = plan[field]
                plan[field] = value
                self.write(folder / 'plan.json', canonical(plan))
                self.assertFalse(self.healthy())
                plan[field] = original
                self.write(folder / 'plan.json', canonical(plan))
        self.assertTrue(self.healthy())

    def test_an_edited_plan_file_no_longer_matches_its_journal_row(self):
        self.record.apply()
        folder = self.record.env / self.record.operations[0]
        plan = json.loads((folder / 'plan.json').read_bytes())
        plan['changes'] = {'SERVICE_ACCESS_ENFORCEMENT': {'beforeSha256': None, 'afterSha256': '0' * 64}}
        self.write(folder / 'plan.json', canonical(plan))
        self.assertFalse(self.healthy())

    def test_the_owner_approval_must_be_the_one_in_the_profile(self):
        self.record.apply()
        folder = self.record.env / self.record.operations[0]
        plan = json.loads((folder / 'plan.json').read_bytes())
        plan['approvalSha256'] = '0' * 64
        self.write(folder / 'plan.json', canonical(plan))
        self.assertFalse(self.healthy())

    def test_a_missing_or_foreign_operation_journal_fails_closed(self):
        self.record.apply()
        journal = self.record.env / 'journal.jsonl'
        original = journal.read_bytes()
        journal.unlink()
        self.assertFalse(self.healthy())
        lines = original.splitlines(keepends=True)
        self.write(journal, b''.join(lines[:3] + lines[4:]))      # drops the completed row
        self.assertFalse(self.healthy())
        self.write(journal, original)
        self.assertTrue(self.healthy())

    def test_a_broken_profile_record_fails_closed(self):
        self.record.apply()
        stored = self.record.profiles / 'profiles' / '1.json'
        os.chmod(stored, 0o600)
        stored.write_bytes(b'{}')
        os.chmod(stored, 0o400)
        self.assertFalse(self.healthy())

    def test_an_unknown_profile_file_or_head_mismatch_fails_closed(self):
        self.record.apply()
        profiles = self.record.profiles
        self.write(profiles / 'profiles' / '2.json', b'{}')
        self.assertFalse(self.healthy())
        (profiles / 'profiles' / '2.json').unlink()
        head = json.loads((profiles / 'head.json').read_bytes())
        head['journalSha256'] = '0' * 64
        self.write(profiles / 'head.json', canonical(head))
        self.assertFalse(self.healthy())

    def test_the_successor_chain_itself_is_still_enforced_under_a_profile(self):
        self.record.apply()
        self.write(self.root / 'selection.json', b'{}')
        self.assertFalse(self.healthy())


class ServiceProfileActiveProofTests(funded_replay.ActiveFundedReplayTests):
    """`--registry-active-proof` derives its runtime bytes through the same expectation."""

    def setUp(self):
        super().setUp()
        root = Path(self.tmp.name).resolve() / 'records'
        root.mkdir(mode=0o700)
        self.patches = [patch.object(daily, 'SERVICE_PROFILE_DIR', root / 'service-profile'),
                        patch.object(daily, 'SERVICE_ENV_DIR', root / 'service-env'),
                        patch.object(daily, 'UID', os.geteuid())]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)
        self.daily.service_active_files = daily.service_active_files
        self.record = ServiceRecord(root, self.root, self.files['target'], os.geteuid())
        self.manifest_file = self.root / 'manifest.json'

    def test_service_profile_rewritten_owner_files_keep_the_proof_derivable(self):
        before = self.proof()
        self.record.apply()
        proof = self.proof()
        self.assertEqual(proof['preparedSha256'], before['preparedSha256'])
        self.assertNotEqual(proof['runtimeFilesSha256'], before['runtimeFilesSha256'])
        self.assertNotEqual(proof['ownerManifestDigest'], before['ownerManifestDigest'])
        self.assertEqual(replay.require_funded_runtime(self.daily, lambda p: p.read_bytes(), proof), proof)

    def test_a_service_profile_does_not_excuse_changed_retained_candidate_bytes(self):
        self.record.apply()
        (self.upgrade / 'target' / 'server.env').write_bytes(b'changed')
        with self.assertRaises(ValueError):
            self.proof()

    def test_a_service_profile_does_not_excuse_unapproved_owner_bytes(self):
        self.record.apply()
        (self.root / 'server.env').write_bytes(b'changed')
        with self.assertRaises(ValueError):
            self.proof()


# Only the new cases run here; the inherited fixtures are already exercised by their own modules.
for _cls in (ServiceProfileFundedHealthTests, ServiceProfileActiveProofTests):
    for _parent in _cls.__mro__[1:]:
        for _name in list(vars(_parent)):
            if _name.startswith('test_') and _name not in vars(_cls):
                setattr(_cls, _name, None)


if __name__ == '__main__':
    unittest.main()

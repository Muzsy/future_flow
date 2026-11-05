"""`--active-proof` through the REAL capability lifecycle, in the production shape.

The first active-proof regression tests replaced `System.capability` and so never met the
capability record. On the server `funded-runtime-upgrade/capability.json` holds the cleaned
record of the original 6d17fda upgrade while the active generation is a later successor
root, and the helper container's record must never touch that evidence. Here the real
`capability`/`cleanup_capability` run; only the Docker command boundary is substituted.
"""
import json
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import test_beta_successor_authority as authority
import test_beta_successor_chain as chained
import test_funded_active_proof as proof_tests
from test_service_registry_protocol import observed

funded, daily = proof_tests.funded, proof_tests.daily
IMAGE, OPERATOR, OPERATOR_BUNDLE = proof_tests.IMAGE, proof_tests.OPERATOR, proof_tests.OPERATOR_BUNDLE
ORIGINAL_COMMIT = '6d17fda' + '0' * 33


def original_record():
    # The cleaned record the original upgrade left at the original root (the production state).
    return {
        'version': daily.FUNDED_CAPABILITY_VERSION, 'sourceCommit': ORIGINAL_COMMIT, 'bundleSha256': '1' * 64,
        'name': funded.upgrade.PROJECT + '-funded-capability-' + 'a' * 32, 'imageId': 'sha256:' + '9' * 64,
        'commandSha256': funded.sha(funded.encoded(funded.CAPABILITY_COMMAND)),
        'inputSha256': funded.sha(funded.encoded({'apps/api/src/main.ts': '2' * 64})),
        'state': 'cleaned', 'containerId': 'f' * 64}


class RealCapabilityBase(proof_tests.ActiveProofBase):
    def setUp(self):
        # Every successor generation records the WHOLE original funded tree as its authority
        # baseline, so the original record must exist before generation one is prepared.
        prepare = authority.SuccessorAuthorityTests.prepare

        def prepare_with_original_record(fixture, *args, **kwargs):
            fixture.write(fixture.parent / 'capability.json', funded.encoded(original_record()))
            return prepare(fixture, *args, **kwargs)
        p = patch.object(authority.SuccessorAuthorityTests, 'prepare', prepare_with_original_record)
        p.start()
        self.addCleanup(p.stop)
        super().setUp()
        p = patch.object(sys.modules['alterward_backup'], 'ROOT', self.owner)
        p.start()
        self.addCleanup(p.stop)
        for module, name, side_effect in [(funded.readers, 'durable_file', self.fixture.write),
                                          (funded.upgrade, 'atomic_private', self.fixture.write)]:
            p = patch.object(module, name, side_effect=side_effect)
            p.start()
            self.addCleanup(p.stop)
        self.container_ids, self.runs = [], []
        p = patch.object(funded.upgrade, 'run', side_effect=self.helper_run)
        p.start()
        self.addCleanup(p.stop)
        self.original = self.chain.fixture.parent
        self.original_record = original_record()
        self.original_bytes = (self.original / 'capability.json').read_bytes()
        self.scratch = self.owner / funded.ACTIVE_CAPABILITY_NAME
        self.probe = proof_tests.capability()

    def docker(self, *args, **kwargs):
        if args[:2] == ('image', 'inspect'):
            return super().docker(*args, **kwargs)
        assert args[:2] == ('ps', '-aq'), args  # the helper is already gone: --rm
        return SimpleNamespace(stdout=''.join(i + '\n' for i in self.container_ids).encode())

    def helper_run(self, args, **kwargs):
        self.runs.append((args, kwargs))
        record = daily.funded_capability_state(self.scratch)
        # The pending intent is durable BEFORE the helper starts, in the scratch location only.
        assert record['state'] == 'pending' and record['name'] in args
        return SimpleNamespace(stdout=json.dumps(self.probe).encode())

    def system(self, **changes):
        system = funded.System(self.request(**changes), daily)
        system.archive_support = lambda: None
        return system

    def assert_original_evidence_untouched(self):
        self.assertEqual((self.original / 'capability.json').read_bytes(), self.original_bytes)
        for number in range(1, 9):
            self.assertFalse((self.chain.root(number) / 'capability.json').exists(), number)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))


class ProductionShapeTests(RealCapabilityBase):
    def setUp(self):
        super().setUp()
        self.production_shape()
        self.chain.prepare(5, 'schema-040', database=observed())  # the K-A state after `--prepare`

    def test_the_recorded_image_probe_does_not_touch_the_original_capability_record(self):
        before = daily.funded_upgrade_config_paths()
        proof = self.system().active_proof()  # the failing call on the server
        self.assertEqual(proof['preparedSha256'], daily.digest((self.chain.root(4) / 'prepared.json').read_bytes()))
        self.assertEqual(len(self.runs), 1)
        self.assertEqual(self.runs[0][0][-len(funded.CAPABILITY_COMMAND):], funded.CAPABILITY_COMMAND)
        self.assert_original_evidence_untouched()
        self.assertEqual(daily.funded_upgrade_config_paths(), before)  # monitor/backup derivations unchanged
        record = daily.funded_capability_state(self.scratch)
        self.assertEqual((record['state'], record['sourceCommit'], record['bundleSha256']),
                         ('cleaned', OPERATOR, OPERATOR_BUNDLE))
        self.assertEqual(record['inputSha256'], funded.sha(funded.encoded({})))
        self.assertEqual(self.scratch.stat().st_mode & 0o777, 0o700)

    def test_the_exact_source_of_the_active_generation_also_never_uses_the_original_record(self):
        # The checkout IS generation four's source: the full source/capability check runs, still on scratch.
        hashes = {'apps/api/src/main.ts': 'a' * 64}
        system = self.system(sourceCommit='b' * 40, bundleSha256='c' * 64, sourceHashes=hashes)
        system.image = lambda build: (system.capability(build['imageId'], hashes), proof_tests.recorded())[1]
        self.assertTrue(system.active_proof())
        self.assertEqual(len(self.runs), 1)
        self.assert_original_evidence_untouched()
        record = daily.funded_capability_state(self.scratch)
        self.assertEqual((record['state'], record['sourceCommit'], record['inputSha256']),
                         ('cleaned', 'b' * 40, funded.sha(funded.encoded(hashes))))

    def test_the_proof_can_be_issued_again_and_again(self):
        for _ in range(3):
            self.assertTrue(self.system().active_proof())
        self.assertEqual(len(self.runs), 3)
        self.assert_original_evidence_untouched()

    def test_a_stale_pending_helper_record_is_cleaned_before_the_next_probe(self):
        record = {**self.original_record, 'sourceCommit': OPERATOR, 'bundleSha256': OPERATOR_BUNDLE,
                  'inputSha256': funded.sha(funded.encoded({})), 'state': 'pending', 'containerId': None}
        self.fixture.write(self.scratch / 'capability.json', funded.encoded(record))
        self.assertTrue(self.system().active_proof())
        self.assertEqual(daily.funded_capability_state(self.scratch)['state'], 'cleaned')
        self.assert_original_evidence_untouched()

    def test_a_foreign_helper_record_in_the_scratch_location_fails_closed(self):
        for label, change in [('other commit', {'sourceCommit': 'd' * 40}),
                              ('other bundle', {'bundleSha256': 'd' * 64}),
                              ('other input', {'inputSha256': 'd' * 64}),
                              ('other command', {'commandSha256': 'd' * 64}),
                              ('other name', {'name': 'unrelated-funded-capability-' + 'a' * 32})]:
            with self.subTest(label):
                record = {**self.original_record, 'sourceCommit': OPERATOR, 'bundleSha256': OPERATOR_BUNDLE,
                          'inputSha256': funded.sha(funded.encoded({})), 'state': 'pending', **change}
                self.fixture.write(self.scratch / 'capability.json', funded.encoded(record))
                with self.assertRaisesRegex(ValueError, 'capability evidence'):
                    self.system().active_proof()
                self.assertEqual(self.runs, [])
                self.assert_original_evidence_untouched()

    def test_a_changed_original_record_breaks_the_chain_and_issues_no_proof(self):
        # Every later generation baselines the whole original tree: rewriting the original record
        # (which the unfixed code did) turns the chain red, so no proof and no helper may follow.
        self.fixture.write(self.original / 'capability.json',
                           funded.encoded({**self.original_record, 'sourceCommit': OPERATOR}))
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        with self.assertRaisesRegex(ValueError, 'Healthy completed funded state'):
            self.system().active_proof()
        self.assertEqual(self.runs, [])
        self.assertFalse(self.scratch.exists())

    def test_the_cli_entry_point_issues_the_proof_in_the_production_shape(self):
        """`main` as the operator reaches it: locks, installed Daily, request validation, then the proof."""
        (self.owner / 'activation.lock').write_bytes(b'')
        daily_dir = self.owner.parent / 'daily-locks'
        daily_dir.mkdir(exist_ok=True)
        (daily_dir / 'job.lock').write_bytes(b'')
        with patch.object(funded.os, 'geteuid', return_value=0), \
             patch.object(funded.fence, 'DAILY', daily_dir), \
             patch.object(funded.fence, 'installed_daily', return_value=daily), \
             patch.object(funded.readers, 'exclusive_lock'), \
             patch.object(funded.System, 'archive_support', lambda self: None):
            result = funded.main(self.request())
            # A request with an unknown field is refused before anything runs.
            with self.assertRaises(ValueError):
                funded.main({**self.request(), 'extra': True})
        self.assertEqual(result['version'], 'alterward-funded-replay-1')
        self.assertEqual(result['preparedSha256'], daily.digest((self.chain.root(4) / 'prepared.json').read_bytes()))
        self.assertEqual(len(self.runs), 1)
        self.assert_original_evidence_untouched()

    def test_negative_cases_issue_no_proof_and_start_no_helper(self):
        # Tampered active bytes.
        path = self.owner / 'server.env'
        original = path.read_bytes()
        self.fixture.write(path, original + b'x')
        with self.assertRaises(ValueError):
            self.system().active_proof()
        self.fixture.write(path, original)
        # Broken chain.
        link = self.chain.root(2) / 'journal.json'
        kept = link.read_bytes()
        self.fixture.write(link, kept.replace(b'"', b"'", 1))
        with self.assertRaises(ValueError):
            self.system().active_proof()
        self.fixture.write(link, kept)
        # Another image than the recorded one.
        self.probe = {**proof_tests.capability(), 'context': {'planner': 'other'}}
        with self.assertRaisesRegex(ValueError, 'recorded evidence'):
            self.system().active_proof()
        # A helper ran only for the last case, and its record is cleaned, never the original's.
        self.assertEqual(len(self.runs), 1)
        self.assertEqual(daily.funded_capability_state(self.scratch)['state'], 'cleaned')
        self.assert_original_evidence_untouched()


class OriginalGenerationTests(RealCapabilityBase):
    def test_only_the_original_generation_keeps_using_its_own_capability_record(self):
        hashes = {'apps/api/src/main.ts': 'a' * 64}
        system = self.system(sourceHashes=hashes)
        self.assertFalse(system.capability_scratch)
        self.assertEqual(system.capability_home(), self.original)
        # Its own record is held to the exact original bundle: a different one is refused untouched.
        with patch.object(funded.upgrade, 'run') as run, self.assertRaisesRegex(ValueError, 'Exact original funded capability'):
            system.capability(IMAGE, hashes)
        run.assert_not_called()
        self.assertEqual((self.original / 'capability.json').read_bytes(), self.original_bytes)
        self.assertFalse(self.scratch.exists())


if __name__ == '__main__':
    unittest.main()

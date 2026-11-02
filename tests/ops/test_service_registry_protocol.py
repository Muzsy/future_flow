"""040 authority validation: no Docker, DB, host mutation or provider access."""
import copy
import datetime as dt
import hashlib
from pathlib import Path
import unittest
from test_contabo_daily import daily


def observed(schema=39):
    value = {k: 'a' * 64 for k in (
        'identityBindingSha256', 'dataSha256', 'artifactSha256', 'catalogSha256',
        'policiesSha256', 'billingDataSha256', 'migrationPrefixSha256')}
    return {**value, 'version': 'alterward-funded-runtime-2', 'profile': 'service-registry-040',
            'schema': schema, 'drained': True, 'providerApiCalls': 0,
            'registryDataSha256': None if schema == 39 else 'b' * 64,
            'registryRows': None if schema == 39 else {'policy': 0, 'admissions': 0}}


class RegistryProtocolTests(unittest.TestCase):
    def test_only_the_new_schema_and_exact_reviewed_source_can_be_planned(self):
        previous = {'synthetic': 'unchanged terms and accounts'}
        selection = {'purpose': 'schema-040', 'previousTermsSha256': daily.successor_canonical_hash(previous),
                     'fromSchema': 39, 'toSchema': 40}
        at = dt.datetime(2026, 11, 2, 10, 0, tzinfo=dt.timezone.utc)
        plan = daily.registry_schema_plan(selection, previous, at, daily.REGISTRY_040_CHANGE_HASHES)
        self.assertEqual(plan['expiresAt'], '2026-11-02T10:15:00.000Z')
        self.assertEqual(plan['allowedChangeHashes'], daily.REGISTRY_040_CHANGE_HASHES)
        for changes in ({'fromSchema': 38}, {'toSchema': 39}, {'fromSchema': True},
                        {'purpose': 'schema-039'}, {'resetBudget': True}, {'previousTermsSha256': '0' * 64}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                daily.registry_schema_plan({**selection, **changes}, previous, at, daily.REGISTRY_040_CHANGE_HASHES)
        hashes = dict(daily.REGISTRY_040_CHANGE_HASHES)
        hashes[next(iter(hashes))] = '0' * 64
        with self.assertRaises(ValueError):
            daily.registry_schema_plan(selection, previous, at, hashes)

    def test_exact_versions_fields_and_schema_specific_registry_are_required(self):
        for schema in (39, 40):
            value = observed(schema)
            self.assertEqual(daily.parse_registry_runtime(value), value)
            for key in value:
                bad = {k: v for k, v in value.items() if k != key}
                with self.subTest(schema=schema, key=key), self.assertRaises(ValueError):
                    daily.parse_registry_runtime(bad)
        for changes in ({'version': 'alterward-funded-runtime-1'}, {'schema': True},
                        {'providerApiCalls': False}, {'profile': 'legacy039'},
                        {'unknown': False}, {'registryRows': {'policy': 0, 'admissions': 0}}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                daily.parse_registry_runtime({**observed(), **changes})

    def test_schema_upgrade_preserves_both_ledgers_and_receipts_and_starts_empty(self):
        before, after = observed(), observed(40)
        after['catalogSha256'] = 'c' * 64  # the reviewed catalog transition is expected
        daily.same_registry_runtime(before, after, migration=True)
        for key in ('identityBindingSha256', 'dataSha256', 'artifactSha256', 'policiesSha256',
                    'billingDataSha256', 'migrationPrefixSha256'):
            with self.subTest(key=key), self.assertRaises(ValueError):
                daily.same_registry_runtime(before, {**after, key: 'd' * 64}, migration=True)
        for rows in ({'policy': 1, 'admissions': 0}, {'policy': 0, 'admissions': 1}):
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                daily.same_registry_runtime(before, {**after, 'registryRows': rows}, migration=True)

    def test_later_operations_preserve_a_populated_registry_and_catalog(self):
        before = observed(40)
        before['registryRows'] = {'policy': 1, 'admissions': 13}
        daily.same_registry_runtime(before, copy.deepcopy(before))
        for key in ('catalogSha256', 'registryDataSha256', 'billingDataSha256', 'migrationPrefixSha256'):
            with self.subTest(key=key), self.assertRaises(ValueError):
                daily.same_registry_runtime(before, {**before, key: 'd' * 64})
        with self.assertRaises(ValueError):
            daily.same_registry_runtime(before, {**before, 'registryRows': {'policy': 1, 'admissions': 12}})

    def test_false_profile_is_the_only_allowed_new_default(self):
        old = {'services': {r: {'environment': {'UNCHANGED': r}} for r in ('web', 'api', 'worker')}}
        new = copy.deepcopy(old)
        for role in new['services']:
            new['services'][role]['environment']['SERVICE_ACCESS_ENFORCEMENT'] = 'false'
        self.assertEqual(daily.registry_profile_default(old), new)
        self.assertNotIn('SERVICE_ACCESS_ENFORCEMENT', old['services']['web']['environment'])
        for role in new['services']:
            for bad in ('true', '', 'False', False, None):
                changed = copy.deepcopy(new)
                changed['services'][role]['environment']['SERVICE_ACCESS_ENFORCEMENT'] = bad
                with self.subTest(role=role, bad=bad), self.assertRaises(ValueError):
                    daily.registry_profile_default(changed)

    def test_reviewed_app_exceptions_are_exact_source_hashes(self):
        root = Path(__file__).resolve().parents[2]
        expected = daily.REGISTRY_040_CHANGE_HASHES
        self.assertEqual(len(expected), 33)
        for name, digest in expected.items():
            with self.subTest(name=name):
                self.assertEqual(hashlib.sha256((root / name).read_bytes()).hexdigest(), digest)
        self.assertTrue(all(not p.startswith('packages/ai/prompts/') for p in expected))

from unittest.mock import Mock, patch
from test_beta_successor_chain_root import ChainRootBase, root


class RegistryEvidenceTests(ChainRootBase):
    def test_original_backup_binding_survives_a_later_daily_status_refresh(self):
        system = self.system()
        system.root.mkdir(mode=0o700)
        system.backup = Mock()
        candidate = {'sourceCommit': 'a' * 40,
                     'release': {'target': {'imageId': 'sha256:' + 'b' * 64}},
                     'parentPreparedSha256': 'c' * 64, 'parentJournalSha256': 'd' * 64,
                     'parentReadbackSha256': 'e' * 64}
        state = system.root / 'synthetic-daily'
        proof = {'runId': 'synthetic-original', 'sourceCommit': 'a' * 40}
        manifest = {'runId': proof['runId'], 'synthetic': 'original-backup'}
        self.fixture.write(state / 'status' / 'restore.json', root.encoded(proof))
        with patch.object(root.readers, 'durable_file', side_effect=self.fixture.write), patch.object(daily, 'ROOT', state), patch.object(daily, 'completed_archives',
                return_value=[{'manifest': manifest}]):
            before = system.registry_context(candidate, persist=True)
            self.assertEqual(before['backupManifestSha256'], root.canonical_sha(manifest))
            self.assertEqual(before['restoreProofSha256'], root.canonical_sha(proof))
            self.fixture.write(state / 'status' / 'restore.json', root.encoded({'runId': 'later-backup'}))
            system.backup.side_effect = ValueError('Synthetic fresh gate now belongs to backup B')
            self.assertEqual(system.registry_context(candidate), before)
            self.assertEqual(system.backup.call_count, 1)
            with self.assertRaisesRegex(ValueError, 'Original registry backup'):
                system.registry_context({**candidate, 'sourceCommit': 'f' * 40})

    def test_prepare_must_persist_evidence_and_cannot_replace_an_existing_intent(self):
        system = self.system()
        system.root.mkdir(mode=0o700)
        system.registry_context = Mock(side_effect=ValueError('Synthetic persistence refused'))
        system.raw_probe = Mock()
        candidate = {'release': {'target': {'imageId': 'sha256:' + 'b' * 64}}}
        with self.assertRaisesRegex(ValueError, 'persistence refused'):
            system.registry_database_request(candidate, 'registry-prepare')
        system.registry_context.assert_called_once_with(candidate, persist=True)
        self.fixture.write(system.root / 'registry-intent.json', root.encoded({'synthetic': 'preserved'}))
        with self.assertRaisesRegex(ValueError, 'Existing registry intent'):
            system.registry_database_request(candidate, 'registry-prepare')
        system.raw_probe.assert_not_called()
        self.assertEqual(system.registry_context.call_count, 1)

    def test_apply_and_reconcile_cannot_bypass_the_durable_journal_binding(self):
        system = self.system()
        system.registry_context = Mock(return_value={'synthetic': 'measured'})
        system.registry_intent = Mock(side_effect=ValueError('Synthetic invalid durable intent'))
        system.raw_probe = Mock()
        candidate = {'release': {'target': {'imageId': 'sha256:' + 'b' * 64}}}
        for mode in ('registry-apply', 'registry-reconcile'):
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, 'invalid durable'):
                system.registry_database_request(candidate, mode)
        with self.assertRaisesRegex(ValueError, 'Explicit registry controller'):
            system.registry_database_request(candidate, 'migrate')
        system.raw_probe.assert_not_called()
        self.assertEqual(system.registry_intent.call_count, 2)

    def test_registry_intent_is_bound_to_a_hashed_journal_row(self):
        system = self.system()
        system.root.mkdir(mode=0o700)
        context = {'synthetic': 'measured-context'}
        system.registry_context = Mock(return_value=context)
        intent = {'version': 'alterward-registry-upgrade-intent-1', 'context': context}
        self.fixture.write(system.root / 'registry-intent.json', root.encoded(intent))
        system.journal = Mock(return_value={'states': [{'state': 'database-intent',
            'registryIntentSha256': root.canonical_sha(intent)}]})
        self.assertEqual(system.registry_intent({}), intent)
        system.journal.return_value['states'][0]['registryIntentSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'durable journal'):
            system.registry_intent({})

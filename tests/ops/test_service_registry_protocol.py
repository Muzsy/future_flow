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
    def test_staged_registry_uses_complete_v2_guard_and_explicit040_schema(self):
        from test_beta_successor_chain_root import root, funded
        system = object.__new__(root.System)
        system.request = {'selection':{'purpose':'schema-040'}}
        system.generation = 2
        system.daily = daily
        before = observed(40)
        candidate = {'database':before}
        for purpose in ('schema-040','billing-config-040'):
            system.request['selection']['purpose'] = purpose
            system.verify_staged_database(candidate,copy.deepcopy(before))
            for key,value in before.items():
                changed = copy.deepcopy(before)
                changed[key] = not value if isinstance(value,bool) else 'drift'
                with self.subTest(purpose=purpose,key=key), self.assertRaises(ValueError):
                    system.verify_staged_database(candidate,changed)
            with self.assertRaises(ValueError):
                system.verify_staged_database({'database':observed(39)},observed(39))
        legacy = {**observed(39),'version':'alterward-funded-runtime-1'}
        system.request['selection']['purpose'] = 'reader-admission'
        system.verify_staged_database({'database':legacy},legacy)
        with self.assertRaises(ValueError):
            system.verify_staged_database({'database':legacy},{**legacy,'schema':40})
        with self.assertRaises(ValueError):
            funded.System.verify_staged_database(system,{'database':legacy},{**legacy,'schema':40})

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

    @staticmethod
    def serving_039_and_candidate_compose():
        """The 039 serving compose (no Turnstile key) and the 3166a34 candidate render (web key empty)."""
        users = '5f0f2f4a-4b0e-4d7c-8a31-0a5a6a1d0001'
        def service(extra=None):
            return {'image': 'x', 'environment': {'AI_PROJECT_BUDGET_USD': '10', 'AI_USER_BUDGET_USD': '3',
                                                  'CLOSED_BETA_USER_IDS': users, **(extra or {})}}
        serving = {'services': {'web': {'image': 'x', 'environment': {'UNCHANGED': 'w'}},
                                'api': service(), 'worker': service()}}
        candidate = copy.deepcopy(serving)
        candidate['services']['web']['environment']['TURNSTILE_SITE_KEY'] = ''
        return serving, candidate, users

    def prepare_comparison(self, rendered, original, users):
        """build_files: the runtime-delta comparison of the schema-040 prepare."""
        from test_beta_successor_chain_root import root
        selection = {'purpose': 'schema-040', 'previousTermsSha256': 'a' * 64, 'fromSchema': 39, 'toSchema': 40}
        previous = {'participants': [{'userId': users}]}
        return (root.normalized(daily.registry_profile_default(rendered), selection, previous)
                == root.normalized(daily.registry_profile_default(original), selection, previous))

    def test_prepare_accepts_the_empty_web_turnstile_default_against_the_039_serving_compose(self):
        serving, candidate, users = self.serving_039_and_candidate_compose()
        self.assertTrue(self.prepare_comparison(candidate, serving, users))
        self.assertIn('TURNSTILE_SITE_KEY', candidate['services']['web']['environment'])  # input not mutated
        # Already identical renders (key absent on both sides, or empty on both) stay equal.
        self.assertTrue(self.prepare_comparison(serving, serving, users))
        self.assertTrue(self.prepare_comparison(candidate, candidate, users))

    def test_prepare_still_refuses_every_other_turnstile_or_runtime_delta(self):
        serving, candidate, users = self.serving_039_and_candidate_compose()
        cases = []
        for value in ('0x4AAAAAAA', ' ', 'false'):
            changed = copy.deepcopy(candidate)
            changed['services']['web']['environment']['TURNSTILE_SITE_KEY'] = value
            cases.append(('web non-empty ' + repr(value), changed, serving))
        live = copy.deepcopy(serving)
        live['services']['web']['environment']['TURNSTILE_SITE_KEY'] = '0x4AAAAAAA'
        cases.append(('039 serving already had a key, candidate empty', candidate, live))
        for role in ('api', 'worker'):
            for value in ('', '0x4AAAAAAA'):
                changed = copy.deepcopy(candidate)
                changed['services'][role]['environment']['TURNSTILE_SITE_KEY'] = value
                cases.append((role + ' key ' + repr(value), changed, serving))
        for key in ('TURNSTILE_SECRET_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'ANOTHER_NEW_KEY'):
            for role in ('web', 'api', 'worker'):
                for value in ('', 'x'):
                    changed = copy.deepcopy(candidate)
                    changed['services'][role]['environment'][key] = value
                    cases.append((role + ' ' + key + ' ' + repr(value), changed, serving))
        changed = copy.deepcopy(candidate)
        changed['services']['web']['environment']['UNCHANGED'] = 'other'
        cases.append(('changed existing web value', changed, serving))
        for name, rendered, original in cases:
            with self.subTest(name):
                self.assertFalse(self.prepare_comparison(rendered, original, users))

    def test_prepare_persists_the_raw_render_so_the_next_generation_compares_equal(self):
        """The normalization is for the comparison only: a billing-config-040 prepare renders the
        web key as "" again and compares it, unnormalized, with the stored schema-040 compose."""
        import json
        import tempfile
        from unittest.mock import Mock, patch
        from test_beta_successor_chain_root import root
        serving, candidate, users = self.serving_039_and_candidate_compose()
        selection = {'purpose': 'schema-040', 'previousTermsSha256': 'a' * 64, 'fromSchema': 39, 'toSchema': 40}
        written = {}
        with tempfile.TemporaryDirectory() as tmp:
            system = object.__new__(root.System)
            system.daily = daily
            system.root = Path(tmp)
            system.selected = Mock(return_value=selection)
            system.files = Mock(return_value={'server.env': b'', 'manifest.json': b'{}'})
            system.original_terms = Mock(return_value={'participants': [{'userId': users}]})
            system.billing_secrets = Mock(return_value=None)
            system.configuration = Mock(return_value=serving)
            system.hashes = Mock(return_value={})
            system.now = Mock(return_value=dt.datetime(2026, 11, 4, tzinfo=dt.timezone.utc))
            private = Mock()
            with patch.dict('sys.modules', {'alterward_backup': Mock(private_directory=private)}), \
                    patch.object(root, 'candidate_environment', return_value=b''), \
                    patch.object(root.readers, 'durable_file', side_effect=lambda path, data: written.update({path.name: data})), \
                    patch.object(root.upgrade, 'run', return_value=Mock(stdout=json.dumps(candidate))), \
                    patch.object(root.upgrade, 'source_hash', return_value='0' * 64), \
                    patch.object(root.fence, 'original', return_value=b''), \
                    patch.object(daily, 'personal_runtime_policy'):
                system.build_files('target', {'imageTag': 't', 'imageId': 'sha256:' + 'b' * 64,
                                              'sourceDirectory': tmp, 'commit': 'b' * 40}, {})
        stored = json.loads(written['effective-compose.json'])
        self.assertEqual(stored, candidate)
        self.assertEqual(stored['services']['web']['environment']['TURNSTILE_SITE_KEY'], '')
        # Next generation (no registry profile normalization): fresh render vs the stored 040 compose.
        previous = {'participants': [{'userId': users}]}
        self.assertEqual(json.loads(written['manifest.json'])['effectiveComposeSha256'],
                         root.sha(root.frozen(candidate)))
        self.assertEqual(root.normalized(candidate, selection, previous), root.normalized(stored, selection, previous))
        # ... whereas the stored compose would no longer match a fresh render if it had been normalized.
        self.assertNotEqual(root.normalized(daily.registry_profile_default(candidate), selection, previous),
                            root.normalized(candidate, selection, previous))

    def test_turnstile_default_normalization_touches_only_an_empty_web_key(self):
        serving, candidate, _ = self.serving_039_and_candidate_compose()
        self.assertEqual(daily.registry_profile_default(candidate), daily.registry_profile_default(serving))
        for role in ('api', 'worker'):
            changed = copy.deepcopy(candidate)
            changed['services'][role]['environment']['TURNSTILE_SITE_KEY'] = ''
            self.assertEqual(
                daily.registry_profile_default(changed)['services'][role]['environment']['TURNSTILE_SITE_KEY'], '')
        changed = copy.deepcopy(candidate)
        changed['services']['web']['environment']['TURNSTILE_SITE_KEY'] = 'k'
        self.assertEqual(
            daily.registry_profile_default(changed)['services']['web']['environment']['TURNSTILE_SITE_KEY'], 'k')

    @staticmethod
    def committed_source_hashes(ref=None):
        import json
        import subprocess
        root_path = Path(__file__).resolve().parents[2]
        code = """
            import { execFileSync } from 'node:child_process';
            import { readFileSync } from 'node:fs';
            import { fundedSourceBundle } from './scripts/lib/funded-upgrade.mjs';
            const ref = process.argv[1];
            const args = ref ? ['ls-tree', '-r', '--name-only', ref] : ['ls-files'];
            const paths = execFileSync('git', args, { encoding: 'utf8' }).trim().split('\\n');
            const read = ref
                ? path => execFileSync('git', ['cat-file', 'blob', ref + ':' + path])
                : path => readFileSync(path);
            console.log(JSON.stringify(fundedSourceBundle(paths, read).sourceHashes));
        """
        result = subprocess.run(['node', '--input-type=module', '-e', code, *([ref] if ref else [])], cwd=root_path,
            check=True,capture_output=True,text=True,timeout=15)
        return json.loads(result.stdout)

    def test_committed_image_bundle_actually_covers_all57_required_registry_inputs(self):
        hashes = self.committed_source_hashes()
        self.assertEqual({p:hashes.get(p) for p in daily.REGISTRY_040_CHANGE_HASHES},daily.REGISTRY_040_CHANGE_HASHES)
        self.assertNotIn('deploy/server.env',hashes)

    def test_every_changed_serving_engine_source_is_pinned_and_the_rest_matches_the_serving_image(self):
        """Local run of the schema-040 prepare comparison (require_engine_freeze) against the 039 image.

        The fixture represents the 039 serving image. Compare against the retained 040
        migration source, whose reviewed pins remain part of its durable evidence.
        """
        import json
        from test_beta_successor_chain_root import root
        fixture = json.loads((Path(__file__).parent / 'fixtures/serving-image-039-source-hashes.json').read_text())
        serving = fixture['sourceHashes']
        migration_source = '1d312d29f203738c9f9d9a6e5338408c74b82f0b'
        hashes = self.committed_source_hashes(migration_source)
        system = object.__new__(root.System)
        system.request = {'sourceHashes': hashes}
        system.daily = daily
        frozen = system.frozen_source_hashes()
        changed = {p for p, h in frozen.items() if serving.get(p) != h}
        pins = set(daily.REGISTRY_040_CHANGE_HASHES)
        self.assertEqual(sorted(changed - pins), [], 'changed serving-engine sources without a reviewed pin')
        self.assertEqual(sorted(pins - changed), [], 'pins for sources that do not differ from the serving image')
        unpinned = system.registry_frozen_source_hashes()
        self.assertEqual(sorted(p for p, h in unpinned.items() if serving.get(p) != h), [],
                         'Original serving engine sources must remain unchanged')
        self.assertTrue(unpinned)
        billing_image_source = 'efed82ab65f1dfd163c9b28f5da7ad4f99091636'
        system.request = {'sourceHashes': self.committed_source_hashes(billing_image_source)}
        billing_image = system.frozen_source_hashes()
        billing_delta = {path for path in frozen.keys() | billing_image.keys()
                         if frozen.get(path) != billing_image.get(path)}
        self.assertEqual(billing_delta, {'packages/core/src/billing-stripe.ts'},
                         'Only the cycle-end cancellation fix differs in the historical billing image')

    def test_reviewed_app_exceptions_are_exact_source_hashes(self):
        root = Path(__file__).resolve().parents[2]
        expected = daily.REGISTRY_040_CHANGE_HASHES
        self.assertEqual(len(expected), 57)
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
        replay = {'synthetic':'verified boundary'}
        system.registry_restore = Mock(return_value=replay)
        self.fixture.write(state / 'status' / 'restore.json', root.encoded(proof))
        with patch.object(root.readers, 'durable_file', side_effect=self.fixture.write), patch.object(daily, 'ROOT', state), patch.object(daily, 'completed_archives',
                return_value=[{'manifest': manifest}]):
            before = system.registry_context(candidate, persist=True)
            self.assertEqual(before['backupManifestSha256'], root.canonical_sha(manifest))
            self.assertEqual(before['restoreProofSha256'], root.canonical_sha({**proof,'registryReplay':replay}))
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

    def test_registry_sidecars_are_finite_and_never_retroactively_required_in_the_old_backup(self):
        system = self.system()
        self.fixture.write(system.root / 'selection.json', root.encoded({'purpose': 'schema-040'}))
        for name in ('registry-evidence.json', 'registry-intent.json'):
            self.fixture.write(system.root / name, root.encoded({'synthetic': name}))
        names = lambda immutable: {p.name for p in daily.successor_tree_paths(system.root, immutable_only=immutable)}
        self.assertEqual(names(False), {'selection.json', 'registry-evidence.json', 'registry-intent.json'})
        self.assertEqual(names(True), {'selection.json'})
        self.fixture.write(system.root / 'selection.json', root.encoded({'purpose': 'schema-039'}))
        with self.assertRaisesRegex(ValueError, 'explicit successor purpose'):
            names(False)

    def test_real_root_journal_binds_persisted_intent_and_rejects_tampering(self):
        system = self.system()
        system.root.mkdir(mode=0o700)
        system.is_registry_schema = Mock(return_value=True)
        system.is_billing = Mock(return_value=False)
        system.registry_profile = Mock(return_value=True)  # the future purpose remains disabled outside this unit
        system.backup = Mock()
        system.original_terms = Mock(return_value={'participants': []})
        candidate = {'sourceCommit': system.request['sourceCommit'],
            'release': {'target': {'imageId': 'sha256:' + 'b' * 64}},
            'parentPreparedSha256': 'c' * 64, 'parentJournalSha256': 'd' * 64,
            'parentReadbackSha256': 'e' * 64,
            'operation': {'plan': {'purpose': 'schema-040', 'version': daily.SUCCESSOR_REGISTRY_PLAN_VERSION}},
            'preparedAt':'2026-11-02T10:00:00.000Z','expiresAt':'2026-11-02T10:15:00.000Z',
            'files':{'previous':{'manifest.json':'f'*64}}, 'database': observed()}
        state = system.root / 'synthetic-daily'
        from registry_test_proof import registry_replay
        manifest, replay = registry_replay(candidate)
        proof = {'runId': manifest['runId']}
        self.fixture.write(state / 'status' / 'registry-migration-restore.json', root.encoded(replay))
        system.now = Mock(return_value=__import__('datetime').datetime(2026,11,2,10,2,tzinfo=__import__('datetime').timezone.utc))
        self.fixture.write(state / 'status' / 'restore.json', root.encoded(proof))
        def prepare(image, payload):
            self.assertEqual(payload['mode'], 'registry-prepare')
            return {'version': 'alterward-registry-upgrade-intent-1', 'purpose': 'schema-040',
                'context': payload['expected']['context'], 'before': candidate['database'],
                'migrationSha256': daily.REGISTRY_040_MIGRATION_SHA256,
                'observedAt': '2026-11-02T10:00:00.000Z', 'expiresAt': '2026-11-02T10:15:00.000Z',
                'serviceActivationAllowed': False, 'providerApiCalls': 0, 'authProviderWrites': False}
        system.raw_probe = Mock(side_effect=prepare)
        with patch.object(daily, 'ROOT', state), patch.object(daily, 'completed_archives',
                return_value=[{'manifest': manifest,'files':{'manifest.json':{'sha256':replay['backupManifestSha256']}}}]), patch.object(root.readers, 'durable_file',
                side_effect=self.fixture.write), patch.object(root.readers, 'update_durable',
                side_effect=self.fixture.write):
            for tag in ('apply-intent', 'held', 'database-intent'):
                system.record(tag, candidate)
        journal = system.journal(candidate)
        intent = system.registry_intent(candidate)
        self.assertEqual(journal['states'][-1]['registryIntentSha256'], root.canonical_sha(intent))
        self.assertEqual(system.raw_probe.call_count, 1)
        self.assertEqual(system.backup.call_count, 1)
        self.assertEqual(intent['version'], 'alterward-registry-upgrade-intent-1')
        original_evidence = __import__('json').loads((system.root / 'registry-evidence.json').read_bytes())
        for bad in (None, True, 900, '2026-11-02 10:00:00'):
            with self.subTest(timestamp=bad), self.assertRaises(ValueError):
                daily.validate_registry_intent_payload({**intent, 'observedAt': bad}, candidate, original_evidence)
        with self.assertRaises(ValueError):
            daily.validate_registry_intent_payload(intent, candidate, {**original_evidence,
                'restoreProof': {'runId': '20261102T100000Z-ffffffff'}})
        changed = {**intent, 'observedAt': '2020-01-01T00:00:00.000Z', 'expiresAt': '2020-01-01T00:15:00.000Z'}
        self.fixture.write(system.root / 'registry-intent.json', root.encoded(changed))
        with self.assertRaisesRegex(ValueError, 'durable journal'):
            system.journal(candidate)
        self.fixture.write(system.root / 'registry-intent.json', root.encoded(intent))
        row = journal['states'][-1]
        row['registryIntentSha256'] = '0' * 64
        row['sha256'] = root.sha(root.encoded({k:v for k,v in row.items() if k != 'sha256'}))
        self.fixture.write(system.root / 'journal.json', root.encoded(journal))
        with self.assertRaisesRegex(ValueError, 'durable journal'):
            system.registry_intent(candidate)

    def test_registry_journal_hash_field_never_expands_a_legacy_row(self):
        row = {'state': 'database-intent', 'changedAt': '2026-11-02T10:00:00Z',
               'previousSha256': None, 'sha256': 'a' * 64}
        daily.registry_journal_fields(row)
        with self.assertRaises(ValueError):
            daily.registry_journal_fields(row, registry=True)
        row['registryIntentSha256'] = 'b' * 64
        daily.registry_journal_fields(row, registry=True)
        with self.assertRaises(ValueError):
            daily.registry_journal_fields(row)
        with self.assertRaises(ValueError):
            daily.registry_journal_fields({**row, 'state': 'held'}, registry=True)


class RegistryChainTests(ChainRootBase):
    def schema039(self):
        self.chain.admit_readers()
        value = self.chain.prepare(3, 'tester-beta', participants=self.chain.testers())
        self.chain.expose(3, value, window_changed=True)
        value = self.chain.prepare(4, 'schema-039')
        self.chain.expose(4, value, window_changed=False, schema=True)

    def test_registry_generation_keeps_terms_and_requires_the_bound040_readback(self):
        self.schema039()
        before = daily.successor_active_state()
        value = self.chain.prepare(5, 'schema-040', database=observed())
        self.assertEqual(daily.successor_active_state()['directory'], self.chain.root(4))
        self.chain.expose(5, value, window_changed=False)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        after = daily.successor_active_state()
        self.assertEqual(after['directory'], self.chain.root(5))
        from test_funded_replay import replay
        proof = replay.active_funded_runtime(daily, root.fence.original)
        self.assertEqual((proof['version'], proof['schema'], proof['recoveryProfile']),
                         ('alterward-funded-replay-2', 40, 'registry040'))
        self.assertEqual(replay.require_funded_runtime(daily, root.fence.original, proof), proof)
        with self.assertRaises(ValueError):
            replay.require_funded_runtime(daily, root.fence.original, {
                k: ('alterward-funded-replay-1' if k == 'version' else v)
                for k,v in proof.items() if k not in {'schema', 'recoveryProfile'}})
        self.assertEqual((after['terms'], after['access']), (before['terms'], before['access']))
        path = self.chain.root(5) / 'database-after.json'
        import json
        changed = json.loads(path.read_bytes())
        changed['billingDataSha256'] = '0' * 64
        self.fixture.write(path, root.encoded(changed))
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_a_second_registry_or_legacy_config_transition_stops_before_preparation_files(self):
        self.schema039()
        value = self.chain.prepare(5, 'schema-040', database=observed())
        self.chain.expose(5, value, window_changed=False)
        selection = {'purpose': 'schema-040', 'previousTermsSha256': root.canonical_sha(self.chain.terms),
                     'fromSchema': 39, 'toSchema': 40}
        system = self.system(selection=selection)
        with self.assertRaisesRegex(ValueError, 'versioned billing-config-040'):
            system.prepare()
        self.assertFalse(system.root.exists())


class RegistryBillingChainTests(ChainRootBase):
    def setUp(self):
        super().setUp()
        candidate = self.chain.prepare(2, 'schema-040', database=observed())
        self.chain.expose(2, candidate, window_changed=False)
        self.before = observed(40)
        self.before['catalogSha256'] = 'e' * 64
        self.before['registryDataSha256'] = 'f' * 64

    def selection(self, stage):
        from test_beta_successor_chain import billing_selection
        return {**billing_selection(root.canonical_sha(self.chain.terms), stage, founderUserIds=[]),
                'purpose': 'billing-config-040'}

    def test_native_stages_preserve_full_database_and_original_once_only_history(self):
        before = daily.successor_active_state()
        for number, stage in enumerate(('sandbox', 'live', 'enforce'), 3):
            selection = self.selection(stage)
            candidate = self.chain.prepare(number, selection['purpose'], selection=selection, database=self.before)
            self.chain.expose(number, candidate, window_changed=False)
            self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
            active = daily.successor_active_state()
            self.assertEqual((active['terms'], active['access']), (before['terms'], before['access']))
            context = daily.successor_parent_context(number + 1)[2]
            self.assertEqual(context['purposes'][-1], 'billing-config:' + stage)
            self.assertEqual(candidate['operation']['plan']['allowedChanges'], [])
            self.assertEqual(candidate['operation']['plan']['allowedChangeHashes'], {})
        duplicate = self.chain.prepare(6, 'billing-config-040', selection=self.selection('live'), database=self.before)
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_native_config_cannot_adopt_a_039_snapshot_or_omit_the_native_proof(self):
        candidate = self.chain.prepare(3, 'billing-config-040', selection=self.selection('sandbox'), database=observed())
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_native_configuration_never_relaxes_registry_or_ledger_preservation(self):
        import json
        candidate = self.chain.prepare(3, 'billing-config-040', selection=self.selection('sandbox'), database=self.before)
        self.chain.expose(3, candidate, window_changed=False)
        path = self.chain.root(3) / 'database-after.json'
        for field in ('billingDataSha256', 'migrationPrefixSha256', 'registryDataSha256', 'catalogSha256'):
            changed = {**self.before, field: '0' * 64}
            self.fixture.write(path, root.encoded(changed))
            self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
            self.fixture.write(path, root.encoded(self.before))
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))

    def test_legacy_config_is_refused_after_040_and_native_is_refused_before_it(self):
        selection = self.selection('sandbox')
        system = self.system(selection={**selection, 'purpose': 'billing-config'})
        with self.assertRaisesRegex(ValueError, 'versioned billing-config-040'):
            system.prepare()
        self.assertFalse(system.root.exists())


class RegistryRestoreProofTests(unittest.TestCase):
    def fixture(self, migration=True):
        from registry_test_proof import registry_replay
        candidate = {'sourceCommit':'a'*40,'preparedAt':'2026-11-02T10:00:00.000Z',
            'expiresAt':'2026-11-02T10:15:00.000Z','files':{'previous':{'manifest.json':'b'*64}},
            'release':{'target':{'imageId':'sha256:'+'c'*64}}}
        manifest, proof = registry_replay(candidate,migration=migration)
        return candidate, manifest, proof

    def test_only_a_source_archive_candidate_bound_actual_migration_receipt_is_accepted(self):
        candidate, manifest, proof = self.fixture()
        self.assertEqual(daily.validate_registry_restore_proof(candidate,manifest,proof,migration=True),proof)
        for value in (None, '', 'unverified', 1):
            changed = copy.deepcopy(proof)
            changed['registryMigrationRestore']['postVerificationStateSha256'] = value
            with self.subTest(state_hash=value), self.assertRaises(ValueError):
                daily.validate_registry_restore_proof(candidate,manifest,changed,migration=True)
        for key, value in {'sourceCommit':'f'*40,'backupRunId':'foreign',
            'ownerManifestDigest':'f'*64,'backupManifestCanonicalSha256':'f'*64,
            'dataOnlyOriginalBackupLoaded':False,'freshStateEqualBeforeAndAfterReplay':False,
            'tablesMatchedBeforeReplay':103,'paidAiCalls':True,'serviceActivationAllowed':True,
            'capturedAt':'2026-11-02T10:15:00.000Z'}.items():
            with self.subTest(key=key), self.assertRaises(ValueError):
                daily.validate_registry_restore_proof(candidate,manifest,{**proof,key:value},migration=True)
        for key, value in {'imageId':'sha256:'+'f'*64,'backupDumpSha256':'d'*64,
                           'backupRunId':'foreign','quarantineInstanceSha256':'broken'}.items():
            changed = copy.deepcopy(proof)
            changed['registryMigrationRestore']['context'][key] = value
            with self.subTest(context=key), self.assertRaises(ValueError):
                daily.validate_registry_restore_proof(candidate,manifest,changed,migration=True)
        for absent in ('registryCandidate','registryMigrationRestore','fundedRuntime'):
            with self.subTest(absent=absent), self.assertRaises(ValueError):
                daily.validate_registry_restore_proof(candidate,manifest,{k:v for k,v in proof.items() if k!=absent},migration=True)

    def test_native040_receipts_are_separate_from_historical_migration_receipts(self):
        candidate, manifest, proof = self.fixture(migration=False)
        daily.validate_registry_restore_proof(candidate,manifest,proof,migration=False)
        with self.assertRaises(ValueError):
            daily.validate_registry_restore_proof(candidate,manifest,proof,migration=True)
        for change in ({'schema':39},{'version':'alterward-funded-replay-1'},{'recoveryProfile':'historical039'}):
            with self.assertRaises(ValueError):
                daily.validate_registry_restore_proof(candidate,manifest,
                    {**proof,'fundedRuntime':{**proof['fundedRuntime'],**change}},migration=False)


class RegistryLateRecoveryTests(ChainRootBase):
    def test_late_committed_recovery_uses_journal_bound_A_without_fresh_mutable_B(self):
        system = self.system(mode='recover',selection={'purpose':'schema-040'})
        system.root = self.chain.root(2)
        system.registry_profile = Mock(return_value=True)
        system.is_registry_schema = Mock(return_value=True)
        system.root.mkdir(mode=0o700)
        self.fixture.write(system.root/'registry-intent.json',root.encoded({'synthetic':'retained'}))
        system.registry_intent = Mock(return_value={'synthetic':'original journal-bound intent'})
        system.backup = Mock(side_effect=AssertionError('Mutable B gate must not run'))
        system.registry_restore = Mock(side_effect=AssertionError('Expired A must not be retimed'))
        system.now = Mock(return_value=self.chain.at+dt.timedelta(days=1))
        system.require_candidate_restore({'synthetic':'same original candidate'})
        system.registry_intent.assert_called_once()
        system.backup.assert_not_called()
        system.registry_restore.assert_not_called()


class RegistryDailyProofTests(ChainRootBase):
    def setUp(self):
        super().setUp()
        import json
        from registry_test_proof import registry_replay
        candidate = self.chain.prepare(2,'schema-040',database=observed())
        self.chain.expose(2,candidate,window_changed=False)
        self.candidate = candidate
        self.state = self.fixture.owner/'daily-native-proof'
        parent_hash = daily.digest((self.fixture.owner/'manifest.json').read_bytes())
        bound = {**candidate,'files':{**candidate['files'],'previous':{'manifest.json':parent_hash}}}
        manifest = {'runId':'20261102T100000Z-12345678','ownerCommit':candidate['sourceCommit'],
            'ownerImage':candidate['release']['target']['imageId'],'dumpSha256':'a'*64,
            'capturedAt':candidate['preparedAt'],'encryptedFiles':{'application.dump.age':{'sha256':'b'*64,'bytes':100}}}
        _, self.proof = registry_replay(bound,manifest,migration=False)
        self.proof['fundedRuntime']['preparedSha256'] = daily.digest(daily.successor_json(candidate))
        self.records = [{'manifest':manifest,'files':{'manifest.json':{'sha256':self.proof['backupManifestSha256']}},
                         'created':daily.utcnow()-dt.timedelta(minutes=2)}]
        self.path = self.state/'status'/'registry-restore.json'
        self.fixture.write(self.path,root.encoded(self.proof))
        for mock in (patch.object(daily,'ROOT',self.state),
                     patch.object(daily,'completed_archives',return_value=self.records)):
            mock.start()
            self.addCleanup(mock.stop)
        self.value = {'sourceCommit':candidate['sourceCommit']}

    def test_native_monitor_and_timer_gate_require_actual_profile_and_archive_binding(self):
        self.assertTrue(daily.registry_restore_healthy(self.value))
        self.assertTrue(daily.registry_restore_healthy(self.value,latest=True))
        for key, change in {'sourceCommit':'f'*40,'backupManifestSha256':'f'*64,
            'reviewedTables':100,'independentReadOnlyPostReplayVerified':False,
            'freshStateEqualBeforeAndAfterReplay':False,'writerFenceStillHeld':True}.items():
            self.fixture.write(self.path,root.encoded({**self.proof,key:change}))
            with self.subTest(key=key):
                self.assertFalse(daily.registry_restore_healthy(self.value))
        self.path.unlink()
        self.assertFalse(daily.registry_restore_healthy(self.value))  # generic restore.json cannot substitute

    def test_new_backup_does_not_relabel_a_previous_replay_and_timer_activation_needs_the_latest(self):
        newer = copy.deepcopy(self.records[0])
        newer['manifest']['runId'] = '20261102T110000Z-87654321'
        newer['created'] = daily.utcnow()-dt.timedelta(minutes=1)
        self.records.append(newer)
        self.assertTrue(daily.registry_restore_healthy(self.value))
        self.assertFalse(daily.registry_restore_healthy(self.value,latest=True))
        self.records.pop(0)  # after original archive retention, monitor must also refuse
        self.assertFalse(daily.registry_restore_healthy(self.value))

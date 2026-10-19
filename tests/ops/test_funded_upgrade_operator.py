"""Root-only file/state fixture for the funded-runtime upgrade operator.

Real root-private files, durable writes, journal, promotion and evidence
retention run unchanged under a temporary root; only Docker/DB/Compose edges
are a synthetic world. Paid provider, network and the live host are never used.
"""
import copy
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/ops' / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


for _name, _file in [('alterward_backup', 'contabo-backup.py'), ('alterward_target', 'contabo-target.py'),
                     ('alterward_owner', 'contabo-owner.py'), ('alterward_activation', 'contabo-owner-activation.py'),
                     ('alterward_upgrade', 'contabo-owner-upgrade.py'), ('alterward_fence', 'contabo-writer-fence.py'),
                     ('alterward_readers', 'contabo-personal-beta-readers.py'),
                     ('alterward_personal_observation', 'contabo-personal-beta-observation.py'),
                     ('alterward_funded_policy', 'contabo-funded-upgrade-policy.py')]:
    load(_name, _file)
funded = load('alterward_funded_upgrade', 'contabo-funded-upgrade.py')
policy = sys.modules['alterward_funded_policy']
activation = sys.modules['alterward_activation']
backup = sys.modules['alterward_backup']
sys.path.insert(0, str(Path(__file__).parent))
from test_funded_upgrade_policy import funded_config, observation, MIGRATIONS, OLD, NEW, RECOVERY  # noqa: E402

OLD_TAG, NEW_TAG, RECOVERY_TAG = 'contabo-' + 'a' * 12, 'contabo-' + 'b' * 12, 'contabo-' + 'c' * 12
SOURCE = 'export const synthetic = true;\n'
ACCESS = {'teamDomain': 'example.cloudflareaccess.com', 'audience': 'a' * 64,
          'allowedEmails': ['owner@example.com', 'reader@example.com']}
FOREIGN = {'f' * 64: {'restarts': 0, 'status': 'running'}}


def capability(image, migrations=MIGRATIONS, accepted=('d' * 64,)):
    return {'version': policy.CAPABILITY_VERSION, 'migrations': migrations, 'migrationsSha256': '0' * 64,
            'accepted': list(accepted), 'rejected': [], 'fictionPipeline': True,
            'narrativeV1Pipeline': True, 'imageId': image}


class World:
    """Synthetic Docker/DB edge. Everything else is the real operator code."""

    def __init__(self, directory):
        self.directory = directory
        self.running = {'web', 'api', 'worker'}
        self.image = OLD
        self.schema = False
        self.observation = observation()
        self.capabilities = {NEW: capability(NEW), RECOVERY: capability(RECOVERY), OLD: capability(OLD, MIGRATIONS[:1])}
        self.fail = set()
        self.foreign = copy.deepcopy(FOREIGN)
        self.events = []

    def maybe(self, name):
        self.events.append(name)
        if name in self.fail:
            self.fail.discard(name)
            raise RuntimeError('synthetic ' + name)

    def observe(self, *_args):
        self.maybe('observe')
        value = copy.deepcopy(self.observation)
        if self.schema:
            value['schema']['migrations'] = MIGRATIONS
            value['schema']['narrativeArtifactColumn'] = True
        return value

    def image_of(self, path):
        return json.loads(activation.read_private(path.parent / 'manifest.json'))['imageId']

    def render(self, _source, directory):
        tag = [line for line in (directory / 'server.env').read_text().splitlines()
               if line.startswith('ALTERWARD_TAG=')][0]
        image = {OLD_TAG: OLD, NEW_TAG: NEW, RECOVERY_TAG: RECOVERY}[tag.split("'")[1]]
        return funded_config(image, narrative=True)

    def run(self, args, **_kwargs):
        class Result:
            stdout = b''
        if 'db:migrate' in args:
            self.maybe('migrate')
            self.schema = True
        elif 'config' in args:
            Result.stdout = activation.read_private(Path(args[args.index('-f') + 1]))
        return Result

    def up(self, path, services):
        self.maybe('up:' + ','.join(services))
        self.image = self.image_of(path)
        self.running |= set(services)

    def replace(self, path):
        self.maybe('replace')
        self.image = self.image_of(path)
        if self.schema and self.image == OLD:
            raise AssertionError('A pre-038 image must never serve after the schema change')
        self.running = {'web', 'api', 'worker'}

    def stop(self):
        self.maybe('stop')
        self.running = set()

    def inspect(self, config, image):
        self.maybe('inspect')
        if self.running != {'web', 'api', 'worker'} or self.image != image:
            raise ValueError('Incomplete running owner stack')
        if any(config['services'][n]['image'] != image for n in policy.SERVICES):
            raise ValueError('Running image differs')
        return {name: {'Id': name * 4} for name in policy.SERVICES}

    def subset(self, config, image, services):
        self.maybe('subset')
        if self.running != set(services) or self.image != image:
            raise policy.UpgradeRefused('Unexpected running project services')
        return {name: {'Id': name * 4} for name in services}


class Daily:
    FUNDED_UPGRADE_ARCHIVE_POLICY_VERSION = 1

    def personal_runtime_policy(self, environments, now):
        return {'mode': 'personal-beta' if environments['worker'].get('CLOSED_BETA_USER_IDS') else 'owner'}

    def stable_state(self):
        return {}


@unittest.skipUnless(hasattr(os, 'geteuid') and os.geteuid() == 0, 'root-private file contracts')
class RootFundedUpgradeFixtureTests(unittest.TestCase):
    def setUp(self):
        self.signals = {n: signal.getsignal(n) for n in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT)}
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name).resolve()
        base.chmod(0o700)
        self.owner = base / 'owner'
        self.owner.mkdir(mode=0o700)
        self.ca = base / 'ca.crt'
        self.ca.write_bytes(b'-----BEGIN CERTIFICATE-----synthetic')
        self.world = World(self.owner)
        live = self.runtime_files(OLD, OLD_TAG, funded_config(OLD))
        for name, data in live.items():
            self.private(self.owner / name, data)
        personal = self.owner / 'personal-beta'
        personal.mkdir(mode=0o700)
        for name, data in live.items():
            self.private(personal / name, data)
        prepared = activation.encoded({'manifest': json.loads(live['manifest.json']),
                                       'candidateFilesSha256': {k: activation.sha(v) for k, v in live.items()}})
        self.private(personal / 'prepared.json', prepared)
        self.private(personal / 'journal.json', activation.encoded({
            'state': 'exposure-committed', 'preparedSha256': activation.sha(prepared),
            'startsAt': '2026-10-13T10:00:00Z', 'endsAt': '2026-11-12T10:00:00Z'}))
        self.private(personal / 'transition.json', activation.encoded({
            'state': 'applied', 'preparedSha256': activation.sha(prepared)}))
        self.live = live
        w = self.world
        self.patches = [
            patch.object(backup, 'ROOT', base),
            patch.object(funded, 'DIRECTORY', self.owner), patch.object(funded, 'STATE', self.owner / 'funded-upgrade'),
            patch.object(funded, 'PERSONAL', personal), patch.object(funded, 'CA', self.ca),
            patch.object(funded.readers, 'DIRECTORY', self.owner),
            patch.object(funded, 'observe_running', side_effect=lambda *a: w.observe()),
            patch.object(funded, 'observe_stopped', side_effect=lambda *a: w.observe()),
            patch.object(funded, 'capability', side_effect=self.capability),
            patch.object(funded, 'image_proof', side_effect=lambda proof, **_: Path('/synthetic/source')),
            patch.object(funded, 'run', side_effect=w.run), patch.object(funded, 'up', side_effect=w.up),
            patch.object(funded, 'origin_probe', side_effect=lambda _id: w.maybe('origin') or {'anonymousDenied': 4}),
            patch.object(funded, 'running_subset', side_effect=w.subset),
            patch.object(funded, 'require_restored_upgrade', side_effect=lambda *a: w.maybe('restore-proof') or 'run-1'),
            patch.object(funded.readers, 'render', side_effect=w.render),
            patch.object(funded.readers, 'stop_project', side_effect=w.stop),
            patch.object(funded.upgrade, 'inspect_owner', side_effect=w.inspect),
            patch.object(funded.upgrade, 'replace_services', side_effect=w.replace),
            patch.object(funded.upgrade, 'proxy_network', return_value={'id': 'proxy', 'foreignMembers': ['p']}),
            patch.object(funded.upgrade, 'foreign_state', side_effect=lambda: copy.deepcopy(w.foreign)),
            patch.object(funded.upgrade, 'source_hash', return_value='1' * 64),
            patch.dict(sys.modules, {'alterward_personal_observation': type(sys)('fake_observation')}),
        ]
        for item in self.patches:
            item.start()
        sys.modules['alterward_personal_observation'].held_services = lambda original: w.maybe('held-services')

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        for n, handler in self.signals.items():
            signal.signal(n, handler)
        self.temp.cleanup()

    def capability(self, image, policies, source):
        self.world.maybe('capability:' + image[-4:])
        return copy.deepcopy(self.world.capabilities[image])

    @staticmethod
    def private(path, data):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)

    def runtime_files(self, image, tag, config):
        env = ("DATABASE_URL='postgresql://synthetic'\nALTERWARD_TAG='" + tag + "'\n"
               "AI_PROJECT_BUDGET_USD='10'\n").encode()
        compose = activation.frozen(config)
        manifest = {'commit': 'f' * 40, 'imageId': image, 'ownerEnvironmentSha256': activation.sha(env),
                    'effectiveComposeSha256': activation.sha(compose), 'sourceComposeSha256': '1' * 64,
                    'databaseCaSha256': activation.sha(self.ca.read_bytes()),
                    'accessConfigurationSha256': '2' * 64}
        pinned = activation.encoded({'services': {n: {'image': image, 'pull_policy': 'never'} for n in policy.SERVICES}})
        return {'server.env': env, 'pinned-image.json': pinned, 'effective-compose.json': compose,
                'manifest.json': activation.encoded(manifest)}

    def request(self, recovery=RECOVERY):
        def proof(image, tag, commit):
            return {'commit': commit, 'imageId': image, 'imageTag': 'alterward:' + tag,
                    'sourceDirectory': '/synthetic/source'}
        return {'sourceCommit': 'e' * 40, 'auditSourceCommit': 'e' * 40, 'auditResultSha256': '3' * 64,
                'ciRunIds': [101, 102], 'helperSourcesSha256': {'funded': '4' * 64},
                'observationSource': SOURCE, 'observationSourceSha256': activation.sha(SOURCE.encode()),
                'ownerManifestDigest': activation.sha(activation.read_private(self.owner / 'manifest.json')),
                'ownerAccess': ACCESS, 'reviewedImageIds': [RECOVERY],
                'buildProof': proof(NEW, NEW_TAG, 'e' * 40),
                'recoveryProof': proof(recovery, RECOVERY_TAG if recovery == RECOVERY else NEW_TAG,
                                       'c' * 40 if recovery == RECOVERY else 'e' * 40)}

    def prepare(self, **kwargs):
        request = self.request(**kwargs)
        result = funded.prepare(request, Daily())
        request.update(preparedProof=result['preparedProof'], attempt=result['attempt'])
        return request, result

    def journal(self, request):
        return json.loads(activation.read_private(self.owner / 'funded-upgrade' / request['attempt'] / 'journal.json'))

    def live_bytes(self):
        return {name: activation.read_private(self.owner / name) for name in activation.FILES}

    def test_prepare_is_non_mutating_and_binds_exact_evidence(self):
        request, result = self.prepare()
        self.assertEqual(self.live_bytes(), self.live)
        self.assertEqual(self.world.running, {'web', 'api', 'worker'})
        self.assertNotIn('migrate', self.world.events)
        self.assertEqual(result['pendingMigrations'], ['038_narrative_artifacts.sql'])
        proof = result['preparedProof']
        self.assertEqual((proof['activeImageId'], proof['targetImageId'], proof['recoveryImageId']), (OLD, NEW, RECOVERY))
        self.assertNotIn('synthetic_funded_provider_value', json.dumps(proof))
        candidate = json.loads(activation.read_private(self.owner / 'funded-upgrade' / request['attempt'] / 'effective-compose.json'))
        self.assertEqual(candidate['services']['worker']['environment']['NARRATIVE_PIPELINE_MODE'], 'legacy')
        self.assertEqual(policy.protected_environment(candidate), policy.protected_environment(funded_config(OLD)))

    def test_successful_upgrade_preserves_funded_state_and_unrelated_workloads(self):
        request, _ = self.prepare()
        result = funded.apply(request, Daily())
        self.assertTrue(result['upgraded'])
        self.assertEqual((self.world.image, self.world.schema, self.world.running), (NEW, True, {'web', 'api', 'worker'}))
        journal = self.journal(request)
        self.assertEqual(journal['state'], 'applied')
        self.assertEqual([h['state'] for h in journal['history']],
                         ['intent', 'stopped', 'held', 'schema-applied', 'schema-verified', 'promoted',
                          'origin-verified', 'applied'])
        events = self.world.events
        self.assertLess(events.index('restore-proof'), events.index('stop'))
        self.assertLess(events.index('migrate'), events.index('up:web,api'))
        self.assertLess(events.index('up:web,api'), events.index('up:worker'))
        live = json.loads(activation.read_private(self.owner / 'effective-compose.json'))
        before = json.loads(self.live['effective-compose.json'])
        self.assertEqual(policy.protected_environment(live), policy.protected_environment(before))
        self.assertEqual(policy.funded_projection(live), policy.funded_projection(before))
        held = json.loads(activation.read_private(self.owner / 'funded-upgrade' / request['attempt'] / 'held-observation.json'))
        after = json.loads(activation.read_private(self.owner / 'funded-upgrade' / request['attempt'] / 'schema-observation.json'))
        self.assertEqual(policy.preserved_projection(held), policy.preserved_projection(after))
        self.assertEqual(self.world.foreign, FOREIGN)
        # The applied attempt is now the serving authority; the activation stays untouched.
        self.assertEqual(funded.active_runtime(self.request(), Daily())['authority'], request['attempt'])
        self.assertEqual(activation.read_private(self.owner / 'personal-beta' / 'journal.json'),
                         activation.read_private(self.owner / 'personal-beta' / 'journal.json'))
        with self.assertRaises(policy.UpgradeRefused):
            funded.apply(request, Daily())  # no replay of an applied attempt
        # The emergency reader/personal disable may no longer restore pre-038 zero.
        self.assertTrue(funded.readers.funded_upgrade_blocks_zero())

    def test_failed_post_check_after_schema_serves_only_the_compatible_recovery(self):
        request, _ = self.prepare()
        self.world.fail.add('origin')
        with self.assertRaises(RuntimeError):
            funded.apply(request, Daily())
        self.assertEqual(self.journal(request)['state'], 'recovered-compatible')
        self.assertEqual((self.world.image, self.world.schema), (RECOVERY, True))
        self.assertNotIn('replace', self.world.events)

    def test_failed_post_check_without_separate_recovery_stays_closed(self):
        request, _ = self.prepare(recovery=NEW)
        self.world.fail.add('origin')
        with self.assertRaises(RuntimeError):
            funded.apply(request, Daily())
        self.assertEqual(self.journal(request)['state'], 'closed-recovery-required')
        self.assertEqual(self.world.running, set())
        with self.assertRaises(policy.UpgradeRefused):
            self.prepare()  # a closed attempt blocks every new preparation
        recovered = funded.recover(request, Daily())
        self.assertEqual(recovered['state'], 'closed-recovery-required')
        self.assertFalse(recovered['evidenceDeleted'])
        self.assertTrue((self.owner / 'funded-upgrade' / request['attempt'] / 'prepared.json').exists())

    def test_failure_before_schema_restores_the_previous_funded_runtime(self):
        request, _ = self.prepare()
        self.world.observation['queue']['pendingJobs'] = 1  # writer not drained at the held fence
        with self.assertRaises(policy.UpgradeRefused):
            funded.apply(request, Daily())
        self.assertEqual(self.journal(request)['state'], 'restored-previous')
        self.assertEqual((self.world.image, self.world.schema), (OLD, False))
        self.assertEqual(self.live_bytes(), self.live)
        self.assertFalse(funded.readers.funded_upgrade_blocks_zero())

    def test_active_reservation_or_lease_blocks_before_schema(self):
        for path in ('reservation', 'lease'):
            with self.subTest(path=path):
                self.tearDown()
                self.setUp()
                request, _ = self.prepare()
                if path == 'reservation':
                    self.world.observation['ledger']['reservations']['reserved']['count'] = 1
                else:
                    self.world.observation['queue']['liveLeases'] = 1
                with self.assertRaises(policy.UpgradeRefused):
                    funded.apply(request, Daily())
                self.assertFalse(self.world.schema)
                self.assertNotIn('migrate', self.world.events)

    def test_newly_frozen_policy_the_target_cannot_read_blocks_before_schema(self):
        request, _ = self.prepare()
        self.world.observation['policies'].append({'policySha256': 'e' * 64, 'policy': {'mode': 'narrative-v1'},
                                                   'sources': {'jobPayloads': 1, 'jobCheckpoints': 0,
                                                               'storedArtifacts': 0}})
        self.world.capabilities[RECOVERY] = capability(RECOVERY, accepted=('d' * 64, 'e' * 64))
        with self.assertRaises(policy.UpgradeRefused):
            funded.apply(request, Daily())
        self.assertNotIn('migrate', self.world.events)
        self.assertEqual(self.journal(request)['state'], 'restored-previous')

    def test_ledger_change_during_migration_fails_closed(self):
        request, _ = self.prepare()
        original = self.world.run
        def run(args, **kwargs):
            result = original(args, **kwargs)
            if 'db:migrate' in args:
                self.world.observation['ledger']['accountedMicroTotal'] = '0'
            return result
        with patch.object(funded, 'run', side_effect=run):
            with self.assertRaises(policy.UpgradeRefused):
                funded.apply(request, Daily())
        self.assertEqual(self.journal(request)['state'], 'recovered-compatible')

    def test_interrupted_apply_is_recovered_explicitly_from_database_truth(self):
        request, _ = self.prepare()
        # Simulate SIGKILL right after the migration committed: no in-process recovery ran.
        with patch.object(policy, 'fail_closed', side_effect=lambda **_: None):
            self.world.fail.add('subset')
            with self.assertRaises(RuntimeError):
                funded.apply(request, Daily())
        self.assertEqual(self.journal(request)['state'], 'promoted')
        with self.assertRaises(policy.UpgradeRefused):
            funded.apply(request, Daily())  # never a blind retry
        result = funded.recover(request, Daily())
        self.assertEqual(result['state'], 'recovered-compatible')
        self.assertEqual(self.world.image, RECOVERY)
        with self.assertRaises(policy.UpgradeRefused):
            funded.recover(request, Daily())  # terminal

    def test_interruption_before_schema_recovers_previous_runtime(self):
        request, _ = self.prepare()
        with patch.object(policy, 'fail_closed', side_effect=lambda **_: None):
            self.world.fail.add('capability:' + NEW[-4:])
            self.world.events.clear()
            with self.assertRaises(RuntimeError):
                funded.apply(request, Daily())
        self.assertEqual(self.journal(request)['state'], 'stopped')
        result = funded.recover(request, Daily())
        self.assertEqual((result['state'], self.world.image), ('restored-previous', OLD))

    def test_stale_or_altered_preparation_is_refused_before_any_stop(self):
        request, _ = self.prepare()
        later = dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=policy.PREPARATION_SECONDS + 5)
        with patch.object(funded, 'utcnow', return_value=later):
            with self.assertRaises(policy.UpgradeRefused):
                funded.apply(request, Daily())
        altered = copy.deepcopy(request)
        altered['preparedProof']['ledgerSha256'] = '9' * 64
        with self.assertRaises(policy.UpgradeRefused):
            funded.apply(altered, Daily())
        self.assertNotIn('stop', self.world.events)
        self.assertFalse((self.owner / 'funded-upgrade' / request['attempt'] / 'journal.json').exists())

    def test_drift_after_preparation_is_refused_before_any_stop(self):
        for drift in ('foreign', 'access', 'source'):
            with self.subTest(drift=drift):
                self.tearDown()
                self.setUp()
                request, _ = self.prepare()
                if drift == 'foreign':
                    self.world.foreign['0' * 64] = {'restarts': 0, 'status': 'running'}
                elif drift == 'access':
                    request['ownerAccess'] = {**ACCESS, 'allowedEmails': ACCESS['allowedEmails'] + ['new@example.com']}
                else:
                    request['observationSource'] = SOURCE + '//'
                with self.assertRaises(policy.UpgradeRefused):
                    funded.apply(request, Daily())
                self.assertNotIn('stop', self.world.events)

    def test_pre_038_or_policy_blind_recovery_is_refused_at_preparation(self):
        for broken in (capability(RECOVERY, MIGRATIONS[:1]), capability(RECOVERY, accepted=())):
            self.world.capabilities[RECOVERY] = broken
            with self.assertRaises(policy.UpgradeRefused):
                self.prepare()
        self.assertFalse(any((self.owner / 'funded-upgrade').glob('*/prepared.json')))

    def test_owner_zero_runtime_or_hand_edited_activation_is_not_funded_authority(self):
        journal = self.owner / 'personal-beta' / 'journal.json'
        value = json.loads(activation.read_private(journal))
        os.unlink(journal)
        self.private(journal, activation.encoded({**value, 'endsAt': '2026-12-12T10:00:00Z'}))
        with self.assertRaises(policy.UpgradeRefused):
            self.prepare()

    def test_live_bytes_not_produced_by_a_journalled_operation_are_refused(self):
        os.unlink(self.owner / 'pinned-image.json')
        self.private(self.owner / 'pinned-image.json', b'{"services":{}}\n')
        with self.assertRaises(policy.UpgradeRefused):
            self.prepare()

    def test_competing_operator_lock_is_refused_without_waiting(self):
        daily_dir = Path(self.temp.name) / 'daily'
        daily_dir.mkdir(mode=0o700)
        for path in (daily_dir / 'job.lock', self.owner / 'activation.lock'):
            self.private(path, b'')
        import fcntl
        with patch.object(funded.fence, 'DAILY', daily_dir), patch.object(funded, 'DIRECTORY', self.owner), \
                (self.owner / 'activation.lock').open('rb') as held:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(ValueError):
                funded.main({'mode': 'inspect'})


if __name__ == '__main__':
    unittest.main()

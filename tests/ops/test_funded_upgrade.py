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


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/ops' / file)
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


for name, file in [
    ('alterward_backup', 'contabo-backup.py'),
    ('alterward_target', 'contabo-target.py'),
    ('alterward_owner', 'contabo-owner.py'),
    ('alterward_activation', 'contabo-owner-activation.py'),
    ('alterward_upgrade', 'contabo-owner-upgrade.py'),
    ('alterward_fence', 'contabo-writer-fence.py'),
    ('alterward_readers', 'contabo-personal-beta-readers.py'),
    ('alterward_personal_beta', 'contabo-personal-beta.py'),
]:
    load(name, file)
funded = load('test_funded_runtime', 'contabo-funded-upgrade.py')
daily = load('test_funded_daily', 'contabo-daily.py')


def candidate():
    now = dt.datetime.now(dt.timezone.utc)
    return dict(
        version=funded.VERSION,
        sourceCommit='a' * 40,
        bundleSha256='b' * 64,
        preparedAt=now.isoformat(),
        expiresAt=(now + dt.timedelta(seconds=900)).isoformat(),
        baseline={},
        release={},
        files={},
        database={},
    )


class OrderingTests(unittest.TestCase):
    def setUp(self):
        self.saved = {
            n: signal.getsignal(n) for n in funded.upgrade.INTERRUPTION_SIGNALS
        }

    def tearDown(self):
        for n, value in self.saved.items():
            signal.signal(n, value)

    def run_case(self, failure=None):
        class Adapter:
            def __init__(self):
                self.events = []
                self.live = True

            def event(self, name):
                self.events.append(name)
                if name == failure:
                    raise RuntimeError('synthetic boundary fault')

            def preflight(self, c, **kw):
                funded.fresh(c, dt.datetime.now(dt.timezone.utc))
                self.event('preflight')

            def record(self, s, c):
                self.event('journal:' + s)

            def begin_guard(self, c):
                self.event('watch-start')

            def finish_guard(self):
                self.event('watch-finish')

            def restore_restart_policy(self):
                self.event('restart-restored')

            def stop(self):
                self.live = False
                self.event('stop')

            def held(self, c):
                assert not self.live
                self.event('held')

            def backup(self, c):
                assert not self.live
                self.event('backup')

            def capabilities(self, c):
                self.event('compatible-recovery')

            def migrate(self, c):
                assert not self.live
                self.event('migrate')

            def stage(self, c, **kw):
                assert not self.live
                self.event('stage')

            def postcheck(self, c, **kw):
                assert not self.live
                self.event('postcheck')

            def promote(self, c, **kw):
                assert not self.live
                self.event('promote')

            def expose(self, c, **kw):
                self.event('expose')
                self.live = True

            def readback(self, c, **kw):
                self.event('readback')
                return {'paidAiCalls': 0}

        a = Adapter()
        try:
            funded.transition(a, candidate())
        except RuntimeError:
            pass
        return a

    def test_success_records_intent_before_stop_and_postcheck_before_exposure(self):
        a = self.run_case()
        e = a.events
        self.assertLess(e.index('journal:apply-intent'), e.index('stop'))
        self.assertLess(e.index('compatible-recovery'), e.index('migrate'))
        self.assertLess(e.index('postcheck'), e.index('expose'))
        self.assertEqual(e[-1], 'watch-finish')
        self.assertIn('journal:applied', e)

    def test_fault_matrix_stops_and_retains_closed_evidence(self):
        for phase in (
            'held',
            'backup',
            'compatible-recovery',
            'migrate',
            'stage',
            'postcheck',
            'promote',
            'expose',
            'readback',
        ):
            with self.subTest(phase=phase):
                a = self.run_case(phase)
                self.assertFalse(a.live)
                self.assertEqual(a.events[-2], 'journal:closed')

    def test_preflight_failure_does_not_stop_or_mutate(self):
        a = self.run_case('preflight')
        self.assertEqual(a.events, ['preflight'])
        self.assertTrue(a.live)

    def test_stale_candidate_and_unknown_fields_rejected(self):
        c = candidate()
        c['expiresAt'] = (
            dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=1)
        ).isoformat()
        with self.assertRaises(ValueError):
            funded.fresh(c, dt.datetime.now(dt.timezone.utc))
        c = candidate()
        c['ownerZero'] = True
        with self.assertRaises(ValueError):
            funded.fresh(c, dt.datetime.now(dt.timezone.utc))

    def test_original_zero_restart_is_refused_when_funded_runtime_evidence_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            owner = Path(tmp)
            (owner / 'funded-runtime-upgrade').mkdir()
            with patch.object(funded.readers, 'DIRECTORY', owner), patch.object(
                funded.readers.upgrade, 'replace_services'
            ) as start:
                with self.assertRaisesRegex(
                    ValueError, 'original-zero restart refused'
                ):
                    funded.readers.restore_zero({})
                start.assert_not_called()

    def test_cost_or_identity_drift_cannot_be_averaged_or_reset(self):
        a = dict(
            version='v1',
            identityBindingSha256='id',
            dataSha256='cost',
            artifactSha256='artifact',
            policiesSha256='policy',
            drained=True,
        )
        for key in a:
            b = {**a, key: 'changed'}
            with self.subTest(key=key), self.assertRaises(ValueError):
                funded.same_funded(a, b)


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.owner = Path(self.tmp.name)
        self.patch = [
            patch.object(daily, 'OWNER', self.owner),
            patch.object(daily, 'UID', os.getuid()),
        ]
        for p in self.patch:
            p.start()
        self.root = self.owner / 'funded-runtime-upgrade'
        self.root.mkdir(mode=0o700)

    def tearDown(self):
        for p in self.patch[::-1]:
            p.stop()
        self.tmp.cleanup()

    def write(self, name):
        p = self.root / name
        p.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        p.write_bytes(b'synthetic')
        p.chmod(0o600)
        return p

    def test_finite_candidate_archive_preserves_both_images_and_sticky_journal(self):
        for role in ('target', 'recovery'):
            for name in funded.FILES:
                self.write(role + '/' + name)
        self.write('prepared.json')
        self.write('journal.json')
        self.write('readback.json')
        self.write('probe-compose.json')
        self.assertEqual(len(daily.funded_upgrade_config_paths()), 12)
        self.assertEqual(len(daily.funded_upgrade_config_paths(immutable_only=True)), 9)

    def test_unknown_alias_public_or_linked_state_rejected(self):
        self.write('prepared.json')
        bad = self.write('unknown.json')
        with self.assertRaises(ValueError):
            daily.funded_upgrade_config_paths()
        bad.unlink()
        (self.root / 'alias').symlink_to(self.root / 'prepared.json')
        with self.assertRaises(ValueError):
            daily.funded_upgrade_config_paths()

    def test_original_no_upgrade_archive_is_unchanged(self):
        self.assertEqual(daily.funded_upgrade_config_paths(), [])

    def test_incomplete_upgrade_is_not_a_healthy_funded_runtime(self):
        self.write('prepared.json')
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))


@unittest.skipUnless(
    hasattr(os, 'geteuid') and os.geteuid() == 0, 'requires actual Linux/root ownership'
)
class RootJournalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        self.system = object.__new__(funded.System)
        self.system.root = self.root

    def tearDown(self):
        self.tmp.cleanup()

    def test_atomic_journal_is_hash_chained_and_tamper_rejected(self):
        c = candidate()
        self.system.record('apply-intent', c)
        self.system.record('held', c)
        proof = self.system.journal(c)
        self.assertEqual(len(proof['states']), 2)
        self.assertEqual((self.root / 'journal.json').stat().st_mode & 0o777, 0o600)
        proof['states'][0]['state'] = 'applied'
        (self.root / 'journal.json').write_text(json.dumps(proof))
        with self.assertRaises(ValueError):
            self.system.journal(c)

    def test_hardlink_or_symlink_journal_is_never_overwritten(self):
        c = candidate()
        self.system.record('apply-intent', c)
        os.link(self.root / 'journal.json', self.root / 'alias')
        with self.assertRaises(ValueError):
            self.system.record('held', c)
        self.assertEqual((self.root / 'journal.json').stat().st_nlink, 2)

    def test_real_candidate_hash_rejects_manual_window_or_receipt_edit(self):
        c = candidate()
        self.system.request = {
            'preparedSha256': funded.sha(funded.encoded(c)),
            'sourceCommit': c['sourceCommit'],
            'bundleSha256': c['bundleSha256'],
            'release': {},
        }
        funded.readers.durable_file(self.root / 'prepared.json', funded.encoded(c))
        self.assertEqual(self.system.candidate(), c)
        c['baseline'] = {'startsAt': 'reset-window'}
        funded.readers.update_durable(self.root / 'prepared.json', funded.encoded(c))
        with self.assertRaises(ValueError):
            self.system.candidate()

    def test_actual_symlink_candidate_cannot_substitute_owner_zero_receipt(self):
        c = candidate()
        funded.readers.durable_file(self.root / 'owner-zero.json', funded.encoded(c))
        (self.root / 'prepared.json').symlink_to(self.root / 'owner-zero.json')
        self.system.request = {'preparedSha256': funded.sha(funded.encoded(c))}
        with self.assertRaises(ValueError):
            self.system.candidate()


class ExpiredFundedArchiveTests(unittest.TestCase):
    """Real temporary files; root owner checks use the current isolated UID."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.owner = Path(self.tmp.name).resolve()
        self.owner.chmod(0o700)
        self.root = self.owner / 'funded-runtime-upgrade'
        self.root.mkdir(mode=0o700)
        self.patches = [patch.object(funded, 'DIRECTORY', self.owner),
                        patch.object(daily, 'OWNER', self.owner), patch.object(daily, 'UID', os.getuid())]
        if os.getuid() != 0:
            self.patches += [patch.object(funded.fence, 'original', side_effect=daily.regular),
                             patch.object(funded.readers, 'durable_file', side_effect=self.portable_durable)]
        for item in self.patches: item.start()
        self.value = candidate()
        start = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)
        self.value.update(preparedAt=start.isoformat(), expiresAt=(start+dt.timedelta(seconds=900)).isoformat(),
                          baseline={'files': {'serving': 'unchanged'}, 'authority': {'window':'unchanged'}})
        for role in ('target', 'recovery'):
            (self.root / role).mkdir(mode=0o700)
            for name in funded.FILES: self.write(self.root / role / name, b'synthetic-runtime')
        self.value['files'] = {r: {n: funded.sha((self.root/r/n).read_bytes()) for n in funded.FILES}
                               for r in ('target','recovery')}
        self.save_candidate()
        self.system = object.__new__(funded.System)
        self.system.daily = daily
        self.system.root = self.root
        self.system.request = {'preparedSha256': funded.sha(funded.encoded(self.value)), 'sourceCommit': 'a'*40}
        self.system.archive_support = lambda: None
        self.system.baseline = lambda **kwargs: self.value['baseline']

    def tearDown(self):
        for item in self.patches[::-1]: item.stop()
        self.tmp.cleanup()

    def write(self, path, data):
        path.write_bytes(data); path.chmod(0o600)

    def portable_durable(self, path, data):
        if path.exists():
            if daily.regular(path) != data: raise ValueError('Existing bytes differ')
        else: self.write(path, data)

    def save_candidate(self):
        self.write(self.root/'prepared.json', funded.encoded(self.value))

    def test_archive_keeps_exact_files_backup_and_repeated_result(self):
        self.write(self.root/'probe-compose.json', b'{}')
        probe = {'version':daily.FUNDED_PROBE_VERSION, 'sourceCommit':'a'*40,
                 'bundleSha256':'b'*64, 'name':funded.upgrade.PROJECT+'-funded-probe-'+'c'*32,
                 'imageId':'sha256:'+'d'*64, 'composeSha256':funded.sha(b'{}'),
                 'state':'pending', 'containerId':None}
        self.write(self.root/'probe.json', funded.encoded(probe))
        with self.assertRaisesRegex(ValueError,'Pending funded probe'):
            self.system.archive_expired()
        self.write(self.root/'probe.json', funded.encoded({**probe,'state':'cleaned'}))
        before = {p.relative_to(self.root).as_posix(): p.read_bytes() for p in daily.funded_tree_paths(self.root)}
        result = self.system.archive_expired()
        self.assertTrue(result['archived']); self.assertFalse(self.root.exists())
        dest = self.owner/daily.FUNDED_ARCHIVE_NAME/result['preparedSha256']
        self.assertEqual(before, {n:(dest/n).read_bytes() for n in before})
        self.assertEqual(len(daily.funded_upgrade_config_paths()), 12)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertTrue(self.system.archive_expired()['alreadyArchived'])
        self.assertEqual(result['databaseWrites'], 0)

    def test_fresh_preparation_and_any_apply_evidence_refuse_before_move(self):
        original = copy.deepcopy(self.value)
        now = dt.datetime.now(dt.timezone.utc)
        self.value.update(preparedAt=now.isoformat(), expiresAt=(now+dt.timedelta(seconds=900)).isoformat())
        self.save_candidate(); self.system.request['preparedSha256'] = funded.sha(funded.encoded(self.value))
        with self.assertRaisesRegex(ValueError, 'expired'): self.system.archive_expired()
        self.value = original; self.save_candidate()
        self.system.request['preparedSha256'] = funded.sha(funded.encoded(self.value))
        for name in ('journal.json','readback.json','watchdog.json'):
            self.write(self.root/name,b'{}')
            with self.assertRaises(ValueError): self.system.archive_expired()
            self.assertTrue(self.root.exists()); (self.root/name).unlink()

    def test_interruption_after_intent_or_rename_can_be_reconciled(self):
        with patch.object(funded.os, 'rename', side_effect=OSError('before rename')):
            with self.assertRaises(OSError): self.system.archive_expired()
        self.assertTrue((self.root/'archive.json').exists())
        with self.assertRaisesRegex(ValueError, 'Archiving intent'): self.system.candidate()
        with patch.object(funded.readers, 'sync_directory', side_effect=OSError('after rename')):
            with self.assertRaises(OSError): self.system.archive_expired()
        self.assertFalse(self.root.exists())
        self.assertTrue(self.system.archive_expired()['alreadyArchived'])

    def test_modified_candidate_public_permissions_links_or_baseline_drift_refuse(self):
        leaf = self.root/'target'/'server.env'
        leaf.chmod(0o644)
        with self.assertRaises(ValueError): self.system.archive_expired()
        leaf.chmod(0o600)
        self.write(leaf,b'changed')
        with self.assertRaisesRegex(ValueError, 'runtime changed'): self.system.archive_expired()
        self.write(leaf,b'synthetic-runtime')
        leaf.unlink(); leaf.symlink_to(self.root/'recovery'/'server.env')
        with self.assertRaises(ValueError): self.system.archive_expired()
        leaf.unlink(); self.write(leaf,b'synthetic-runtime')
        self.system.baseline = lambda **kwargs: {'different':'authority'}
        with self.assertRaisesRegex(ValueError, 'baseline'): self.system.archive_expired()
        self.assertTrue(self.root.exists())

    def test_archive_tamper_and_capacity_never_drop_evidence(self):
        with patch.object(daily, 'FUNDED_ARCHIVE_LIMIT', 0):
            with self.assertRaisesRegex(ValueError, 'limit reached'): self.system.archive_expired()
        self.assertTrue(self.root.exists())
        result = self.system.archive_expired()
        dest = self.owner/daily.FUNDED_ARCHIVE_NAME/result['preparedSha256']
        self.write(dest/'target'/'server.env', b'tampered')
        with self.assertRaises(ValueError): daily.funded_upgrade_config_paths()
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))


class FundedProbeTests(unittest.TestCase):
    def setUp(self):
        from types import SimpleNamespace
        self.result = lambda data=b'': SimpleNamespace(stdout=data, returncode=0)
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.root.chmod(0o700)
        self.system = object.__new__(funded.System)
        self.system.root, self.system.daily = self.root, daily
        self.system.request = {'sourceCommit': 'a'*40, 'bundleSha256': 'b'*64}
        self.system.archive_support = lambda: None
        self.config = {'services': {'api': {'image': 'old'}}}
        self.system.configuration = lambda path: copy.deepcopy(self.config)
        self.patches = [patch.object(daily, 'UID', os.getuid()),
                        patch.object(funded.fence, 'original', side_effect=daily.regular),
                        patch.object(funded.readers, 'update_durable', side_effect=self.write),
                        patch.object(funded.upgrade, 'docker', side_effect=self.docker)]
        for p in self.patches: p.start()
        self.container = None
        self.removed = []
        self.fail_remove = False

    def tearDown(self):
        for p in self.patches[::-1]: p.stop()
        self.tmp.cleanup()

    def write(self, path, data):
        path.write_bytes(data); path.chmod(0o600)

    def docker(self, *args, **kwargs):
        if args[0] == 'ps':
            return self.result((self.container['Id'].encode()+b'\n') if self.container else b'')
        if args[0] == 'inspect': return self.result(json.dumps([self.container]).encode())
        if args[:2] == ('rm', '--force'):
            self.removed.append(args[2])
            if not self.fail_remove: self.container = None
            return self.result()
        raise AssertionError(args)

    def pending(self):
        config = self.root/'probe-compose.json'
        self.write(config, b'{}')
        record = {'version': daily.FUNDED_PROBE_VERSION, **self.system.request,
                  'name': funded.upgrade.PROJECT+'-funded-probe-'+'c'*32,
                  'imageId':'sha256:'+'d'*64, 'composeSha256':funded.sha(b'{}'),
                  'state':'pending', 'containerId':None}
        self.write(self.root/'probe.json', funded.encoded(record))
        return record

    def running(self, record):
        self.container = {'Id': 'e'*64, 'Name':'/'+record['name'], 'Image':record['imageId'],
            'Config': {'Entrypoint':['node'], 'Cmd':funded.PROBE_COMMAND, 'User':'node',
                'Labels':{'com.alterward.funded-probe':funded.probe_identity(record),
                    'com.docker.compose.project':funded.upgrade.PROJECT,
                    'com.docker.compose.service':'api', 'com.docker.compose.oneoff':'True'}},
            'HostConfig':{'AutoRemove':True, 'RestartPolicy':{'Name':'no'},
                          'Privileged':False, 'PortBindings':{}}}

    def test_exact_pending_probe_removed_by_immutable_id_and_repeat_is_noop(self):
        record = self.pending(); self.running(record)
        self.assertEqual(daily.funded_probe_state(self.root)['state'], 'pending')
        result = self.system.cleanup_probe()
        self.assertTrue(result['probeRemoved'])
        self.assertEqual(self.removed, ['e'*64])
        self.assertEqual(daily.funded_probe_state(self.root)['state'], 'cleaned')
        self.assertFalse(self.system.cleanup_probe()['probeRemoved'])

    def test_absent_probe_before_creation_or_after_autoremove_is_reconciled(self):
        self.pending()
        self.assertFalse(self.system.cleanup_probe()['probeRemoved'])
        self.assertEqual(self.removed, [])
        self.assertEqual(daily.funded_probe_state(self.root)['state'], 'cleaned')

    def test_same_name_with_other_identity_or_service_is_never_removed(self):
        record = self.pending(); self.running(record)
        original = copy.deepcopy(self.container)
        for section, key, value in [(None,'Name','/other'),
                (None,'Image','sha256:'+'f'*64), ('Config','Cmd',['apps/api/dist/main.js']),
                ('Config','User','root'), ('HostConfig','Privileged',True),
                ('HostConfig','AutoRemove',False), ('HostConfig','PortBindings',{'80/tcp':[{}]})]:
            self.container = copy.deepcopy(original)
            (self.container if section is None else self.container[section])[key] = value
            with self.assertRaises(ValueError): self.system.cleanup_probe()
        for label in ('com.alterward.funded-probe','com.docker.compose.project',
                      'com.docker.compose.service','com.docker.compose.oneoff'):
            self.container = copy.deepcopy(original)
            self.container['Config']['Labels'][label] = 'other'
            with self.assertRaises(ValueError): self.system.cleanup_probe()
        self.assertEqual(self.removed, [])

    def test_tampered_source_config_or_public_receipt_refuses_before_docker(self):
        record = self.pending()
        for field, value in [('sourceCommit','f'*40), ('bundleSha256','f'*64),
                             ('composeSha256','f'*64), ('name','another-funded-probe-'+'c'*32)]:
            self.write(self.root/'probe.json', funded.encoded({**record,field:value}))
            with self.assertRaises(ValueError): self.system.cleanup_probe()
        self.write(self.root/'probe.json', funded.encoded(record))
        (self.root/'probe.json').chmod(0o644)
        with self.assertRaises(ValueError): self.system.cleanup_probe()
        self.assertEqual(self.removed, [])

    def test_daemon_or_removal_failure_preserves_pending_evidence(self):
        record = self.pending(); self.running(record)
        self.fail_remove = True
        with self.assertRaisesRegex(ValueError,'removal unverified'): self.system.cleanup_probe()
        self.assertEqual(daily.funded_probe_state(self.root)['state'], 'pending')
        with patch.object(funded.upgrade, 'docker', side_effect=RuntimeError('daemon unavailable')):
            with self.assertRaises(RuntimeError): self.system.cleanup_probe()
        self.assertEqual(daily.funded_probe_state(self.root)['state'], 'pending')

    def test_stop_first_recovery_stops_services_even_with_unknown_oneoff(self):
        services = [{'Id': digit*64, 'Config':{'Labels':{
            'com.docker.compose.project':funded.upgrade.PROJECT,
            'com.docker.compose.service':role, 'com.docker.compose.oneoff':'False'}},
            'State':{'Running':True}}
            for digit, role in [('1','web'),('2','api'),('3','worker')]]
        oneoff = {'Id':'4'*64, 'Config':{'Labels':{
            'com.docker.compose.project':funded.upgrade.PROJECT,
            'com.docker.compose.service':'api', 'com.docker.compose.oneoff':'True'}},
            'State':{'Running':True}}
        items = {v['Id']:v for v in services+[oneoff]}
        stopped = []
        def docker(*args, **kwargs):
            if args[0]=='inspect': return self.result(json.dumps([items[i] for i in args[1:]]).encode())
            if args[0]=='stop':
                stopped.append(args[-1]); items[args[-1]]['State']['Running']=False
                return self.result()
            raise AssertionError(args)
        with patch.object(funded.upgrade, 'project_ids', return_value=list(items)), \
                patch.object(funded.upgrade, 'docker', side_effect=docker):
            with self.assertRaises(ValueError): self.system.roles()
            self.system.stop()
            self.assertEqual(stopped,['1'*64,'2'*64,'3'*64])
            self.assertTrue(oneoff['State']['Running'])
            with self.assertRaises(ValueError): self.system.roles()

    def test_timeout_and_catchable_interruption_always_clean_exact_probe(self):
        import subprocess
        terms = funded.encoded({'participants':[]})
        original = funded.fence.original
        def read(path):
            return terms if path.name == 'terms.json' else original(path)
        for error in (subprocess.TimeoutExpired('synthetic',200), RuntimeError('signal')):
            def execute(command, **kwargs):
                record = daily.funded_probe_state(self.root)
                self.assertEqual(record['state'],'pending')
                self.assertIn(record['name'],command)
                self.running(record)
                raise error
            with patch.object(funded.fence, 'original', side_effect=read), \
                    patch.object(funded.upgrade, 'run', side_effect=execute):
                with self.assertRaises(type(error)): self.system.probe('sha256:'+'d'*64,'capture')
            self.assertEqual(daily.funded_probe_state(self.root)['state'],'cleaned')
            self.assertIsNone(self.container)
        self.assertEqual(self.removed,['e'*64,'e'*64])


class NarrativeSelectionTests(unittest.TestCase):
    def runtime(self):
        return dict(mode='narrative-fiction-v2', generation='v9',
                    cohortUserIds=['00000000-0000-4000-8000-000000000001'],
                    timeoutMs=300000, maxRequestBytes=131072)

    def test_only_narrative_values_change_and_cohort_must_already_be_admitted(self):
        text = "ALTERWARD_TAG='old'\nCLOSED_BETA_USER_IDS='00000000-0000-4000-8000-000000000001'\nAI_PROJECT_BUDGET_USD='2'\nAI_BUDGET_WINDOW_END='fixed'\n"
        result = funded.narrative_environment(text, self.runtime())
        self.assertTrue(result.startswith(text))
        self.assertIn("NARRATIVE_FICTION_GENERATION='v9'", result)
        self.assertEqual(funded.narrative_environment(result, self.runtime()), result)
        self.assertEqual(funded.narrative_environment(text, None), text)
        r = self.runtime(); r['cohortUserIds'] = ['00000000-0000-4000-8000-000000000002']
        with self.assertRaises(ValueError): funded.narrative_environment(text, r)
        for key, value in [('generation','v10'), ('mode','legacy'), ('timeoutMs',True),
                           ('timeoutMs',300001), ('maxRequestBytes',196609), ('budget',10)]:
            r = self.runtime(); r[key] = value
            with self.assertRaises(ValueError): funded.narrative_runtime_values(r)

    def test_invalid_cohort_is_rejected_before_creating_preparation_state(self):
        with tempfile.TemporaryDirectory() as folder:
            system = object.__new__(funded.System)
            system.root = Path(folder) / 'not-created'
            system.archive_support = lambda: None
            system.baseline = lambda: {}
            system.files = lambda path: {'server.env': b"CLOSED_BETA_USER_IDS='00000000-0000-4000-8000-000000000002'\n"}
            system.request = {'release': {'target': {}, 'recovery': {}, 'runtime': self.runtime(),
                **{key: 'a'*64 for key in ('auditSha256','fixtureSha256','privacyFixtureSha256','ciSha256')}}}
            with self.assertRaisesRegex(ValueError, 'already have funded admission'):
                system.prepare()
            self.assertFalse(system.root.exists())

    def test_default_additions_are_allowed_but_other_configuration_drift_is_not_hidden(self):
        old = {'services': {r: {'image':'old', 'environment':{'AI_PROJECT_BUDGET_USD':'2'}} for r in ('web','api','worker')}}
        rendered = copy.deepcopy(old)
        for role in ('api','worker'):
            rendered['services'][role]['environment'].update(funded.NARRATIVE_DEFAULTS)
        rendered['services']['worker']['environment'].update(funded.WORKER_DEFAULTS)
        self.assertEqual(funded.normalized_configuration(old), funded.normalized_configuration(rendered))
        selected = funded.normalized_configuration(old, self.runtime())
        env = selected['services']['worker']['environment']
        self.assertEqual(env['NARRATIVE_FICTION_GENERATION'], 'v9')
        self.assertEqual(env['AI_PROJECT_BUDGET_USD'], '2')
        drift = copy.deepcopy(selected); drift['services']['worker']['environment']['AI_PROJECT_BUDGET_USD'] = '10'
        self.assertNotEqual(funded.normalized_configuration(drift), selected)
        drift = copy.deepcopy(selected); drift['services']['worker']['environment']['NARRATIVE_FICTION_GENERATION'] = 'v8'
        self.assertNotEqual(funded.normalized_configuration(drift), selected)


if __name__ == '__main__':
    unittest.main()

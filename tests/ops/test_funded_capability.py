"""Actual production lifecycle; Docker daemon is a synthetic command boundary."""
import copy
import json
import os
import signal
import subprocess
import sys
import unittest
from unittest.mock import patch
import test_funded_upgrade as base

funded, daily = base.funded, base.daily


class FundedCapabilityTests(unittest.TestCase):
    setUp = base.FundedProbeTests.setUp
    tearDown = base.FundedProbeTests.tearDown
    write = base.FundedProbeTests.write

    def docker(self, *args, **kwargs):
        if args[:2] == ('image', 'inspect'):
            return self.result(json.dumps([{'Id': 'sha256:'+'d'*64, 'Config': {
                'User': 'node', 'WorkingDir': '/app', 'Entrypoint': ['docker-entrypoint.sh']}}]).encode())
        return base.FundedProbeTests.docker(self, *args, **kwargs)

    def pending(self):
        self.system.request['sourceHashes'] = {}
        record = {'version': daily.FUNDED_CAPABILITY_VERSION,
                  'sourceCommit': self.system.request['sourceCommit'],
                  'bundleSha256': self.system.request['bundleSha256'],
                  'name': funded.upgrade.PROJECT+'-funded-capability-'+'c'*32,
                  'imageId': 'sha256:'+'d'*64,
                  'commandSha256': funded.sha(funded.encoded(funded.CAPABILITY_COMMAND)),
                  'inputSha256': funded.sha(funded.encoded({})), 'state': 'pending', 'containerId': None}
        self.write(self.root/'capability.json', funded.encoded(record))
        return record

    def running(self, record):
        self.container = {'Id': 'e'*64, 'Name': '/'+record['name'], 'Image': record['imageId'],
            'Config': {'Entrypoint': ['node'], 'Cmd': funded.CAPABILITY_COMMAND,
                'User': 'node', 'WorkingDir': '/app',
                'Labels': {'com.alterward.funded-capability': funded.probe_identity(record)}},
            'HostConfig': {'AutoRemove': True, 'RestartPolicy': {'Name': 'no'}, 'NetworkMode': 'none',
                'ReadonlyRootfs': True, 'Privileged': False, 'PortBindings': {}, 'Binds': None,
                'Memory': 512*1024**2, 'NanoCpus': 1000000000, 'PidsLimit': 128,
                'CapDrop': ['ALL'], 'SecurityOpt': ['no-new-privileges:true']}}

    def test_timeout_and_interrupt_use_real_production_lifecycle(self):
        self.system.request['sourceHashes'] = {}
        for error in (subprocess.TimeoutExpired('synthetic', 60), KeyboardInterrupt()):
            def execute(args, **kwargs):
                record = daily.funded_capability_state(self.root)
                self.assertEqual(record['state'], 'pending')
                self.assertIn(record['name'], args)
                self.assertIn('com.alterward.funded-capability='+funded.probe_identity(record), args)
                self.assertIn('--read-only', args)
                self.assertEqual(kwargs['timeout'], 60)
                self.running(record)
                raise error
            with patch.object(funded.upgrade, 'run', side_effect=execute):
                with self.assertRaises(type(error)): self.system.capability('sha256:'+'d'*64, {})
            self.assertIsNone(self.container)
            self.assertEqual(daily.funded_capability_state(self.root)['state'], 'cleaned')
            self.assertEqual(daily.funded_capability_state(self.root)['containerId'], 'e'*64)

    def test_original_upgrade_refuses_partial_input_before_creating_any_intent_or_container(self):
        self.system.request['sourceHashes']={'apps/frozen.ts':'a'*64,'scripts/operator.ts':'b'*64}
        with patch.object(funded.upgrade,'run') as execute:
            with self.assertRaises(ValueError):
                self.system.capability('sha256:'+'d'*64,{'apps/frozen.ts':'a'*64})
            execute.assert_not_called()
        self.assertFalse((self.root/'capability.json').exists())

    def test_successor_fixed_engine_scope_has_same_timeout_and_cleanup_binding(self):
        import test_beta_successor_root as successor
        request={**self.system.request,'mode':'prepare','sourceHashes':{
            'apps/frozen.ts':'a'*64,'scripts/operator.ts':'b'*64}}
        scoped=successor.root.System(request,self.system.daily)
        scoped.root=self.root
        scoped.archive_support=self.system.archive_support
        self.system=scoped
        def execute(args,**kwargs):
            record=daily.funded_capability_state(self.root)
            self.assertEqual(record['inputSha256'],funded.sha(funded.encoded({'apps/frozen.ts':'a'*64})))
            self.running(record)
            raise subprocess.TimeoutExpired('synthetic fixed engine check',60)
        with patch.object(funded.upgrade,'run',side_effect=execute):
            with self.assertRaises(subprocess.TimeoutExpired):
                self.system.capability('sha256:'+'d'*64,self.system.frozen_source_hashes())
        self.assertIsNone(self.container)
        self.assertEqual(daily.funded_capability_state(self.root)['state'],'cleaned')
        record=daily.funded_capability_state(self.root)
        self.write(self.root/'capability.json',funded.encoded({**record,'inputSha256':'f'*64}))
        with self.assertRaises(ValueError):self.system.cleanup_capability()

    def test_system_image_uses_owned_capability_before_accepting_result(self):
        self.system.request['sourceHashes'] = {}
        source = self.root/'source'; source.mkdir(mode=0o700)
        build = {'commit': 'a'*40, 'imageId': 'sha256:'+'d'*64,
                 'imageTag': 'alterward:contabo-'+'a'*12, 'sourceDirectory': str(source)}
        def execute(args, **kwargs):
            record = daily.funded_capability_state(self.root)
            self.assertIn(record['name'], args)
            self.running(record)
            raise TimeoutError('synthetic actual image check')
        with patch.object(sys.modules['alterward_backup'], 'ROOT', self.root), \
             patch.object(funded.upgrade, 'run', side_effect=execute):
            with self.assertRaises(TimeoutError): self.system.image(build)
        self.assertIsNone(self.container)
        self.assertEqual(daily.funded_capability_state(self.root)['state'], 'cleaned')

    @unittest.skipUnless(hasattr(os, 'fork'), 'POSIX fork required')
    def test_sigkill_child_disk_intent_is_reconciled_without_child_memory(self):
        self.system.request['sourceHashes'] = {}
        marker = self.root/'synthetic-daemon.json'
        def execute(args, **kwargs):
            self.running(daily.funded_capability_state(self.root))
            marker.write_text(json.dumps(self.container))
            os.kill(os.getpid(), signal.SIGKILL)
        with patch.object(funded.upgrade, 'run', side_effect=execute):
            pid = os.fork()
            if pid == 0:
                self.system.capability('sha256:'+'d'*64, {})
                os._exit(3)
            _, status = os.waitpid(pid, 0)
        self.assertTrue(os.WIFSIGNALED(status))
        self.assertEqual(os.WTERMSIG(status), signal.SIGKILL)
        self.container = json.loads(marker.read_text()); marker.unlink()
        self.assertEqual(daily.funded_capability_state(self.root)['state'], 'pending')
        self.assertTrue(self.system.cleanup_probe()['capabilityRemoved'])
        self.assertEqual(self.removed, ['e'*64])
        self.assertIsNone(self.container)

    def test_foreign_identity_or_resources_never_removed(self):
        record = self.pending(); self.running(record)
        original = copy.deepcopy(self.container)
        for section, key, value in [(None, 'Image', 'sha256:'+'f'*64), (None, 'Name', '/foreign'),
                ('Config', 'Cmd', ['foreign']), ('Config', 'Labels', {}), ('Config', 'User', 'root'),
                ('HostConfig', 'NetworkMode', 'host'), ('HostConfig', 'Memory', 0),
                ('HostConfig', 'Privileged', True), ('HostConfig', 'Binds', ['/host:/app'])]:
            self.container = copy.deepcopy(original)
            (self.container if section is None else self.container[section])[key] = value
            with self.subTest(field=key), self.assertRaises(ValueError): self.system.cleanup_capability()
        self.assertEqual(self.removed, [])

    def test_observed_id_is_durable_and_replacement_is_refused(self):
        self.running(self.pending()); self.fail_remove = True
        with self.assertRaises(ValueError): self.system.cleanup_capability()
        record = daily.funded_capability_state(self.root)
        self.assertEqual(record['containerId'], 'e'*64)
        self.assertEqual(record['state'], 'pending')
        self.container['Id'] = 'f'*64; self.removed.clear()
        with self.assertRaises(ValueError): self.system.cleanup_capability()
        self.assertEqual(self.removed, [])
        self.assertEqual(daily.funded_capability_state(self.root), record)

    def test_source_command_input_and_private_file_binding(self):
        record = self.pending()
        for key, value in [('sourceCommit', 'f'*40), ('bundleSha256', 'f'*64),
                ('commandSha256', 'f'*64), ('inputSha256', 'f'*64),
                ('name', 'foreign-funded-capability-'+'c'*32)]:
            self.write(self.root/'capability.json', funded.encoded({**record, key: value}))
            with self.subTest(field=key), self.assertRaises(ValueError): self.system.cleanup_capability()
        self.write(self.root/'capability.json', funded.encoded(record))
        (self.root/'capability.json').chmod(0o644)
        with self.assertRaises(ValueError): self.system.cleanup_capability()
        self.assertEqual(self.removed, [])

    def test_absence_autoremove_idempotence_and_cleaned_replacement(self):
        record = self.pending()
        self.assertFalse(self.system.cleanup_capability()['capabilityRemoved'])
        self.assertFalse(self.system.cleanup_capability()['capabilityRemoved'])
        self.running(record)
        with self.assertRaises(ValueError): self.system.cleanup_capability()
        self.assertEqual(self.removed, [])

    def test_daemon_failure_keeps_original_pending_evidence(self):
        self.pending(); before = (self.root/'capability.json').read_bytes()
        with patch.object(funded.upgrade, 'docker', side_effect=RuntimeError('daemon unavailable')):
            with self.assertRaises(RuntimeError): self.system.cleanup_capability()
        self.assertEqual((self.root/'capability.json').read_bytes(), before)

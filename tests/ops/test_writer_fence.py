"""Scoped service order, failed capture and permanent recovery hold boundaries."""
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch, Mock
import contextlib

source = Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-writer-fence.py'
spec = importlib.util.spec_from_file_location('writer_fence', source)
fence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fence)


class WriterFenceTests(unittest.TestCase):
    def environment(self):
        services = {name: {
            'Id': str(i)*64, 'Image': 'sha256:'+'a'*64, 'RestartCount': 0,
            'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'}},
            'Config': {'Env': ['SECRET=DO_NOT_PERSIST'], 'Labels': {
                'com.docker.compose.project': 'alterward-owner',
                'com.docker.compose.service': name}},
            'State': {'Status': 'running', 'Running': True, 'OOMKilled': False,
                      'StartedAt': 'original-start', 'FinishedAt': 'original-finish'},
        } for i, name in enumerate(fence.SERVICES, 1)}
        current = {item['Id']: copy.deepcopy(item) for item in services.values()}
        other = copy.deepcopy(services['worker'])
        other.update(Id='4'*64)
        other['Config']['Labels'] = {'com.docker.compose.project': 'foreign'}
        other['Config']['Env'] = ['FOREIGN_CONFIG=private']
        foreign = {other['Id']: other}
        current.update(copy.deepcopy(foreign))
        actions, checkpoints = [], []

        def stop(cid):
            actions.append(('stop', cid))
            current[cid]['State'].update(Status='exited', Running=False, FinishedAt='fence-stop')

        def start(cid):
            actions.append(('start', cid))
            current[cid]['State'].update(Status='running', Running=True, StartedAt='resumed-start')

        callbacks = {'inspect': lambda: copy.deepcopy(current),
                     'observe': lambda: {'databaseTlsVerified': True, 'pendingJobs': 0,
                                         'liveLeases': 0, 'foreignActiveSessions': 0},
                     'stop': stop, 'start': start,
                     'capture': lambda mode: {'mode': mode, 'stateDigest': 'b'*64,
                                             'encryptedAuthority': b'age-encryption.org/v1\nSYNTHETIC_CIPHERTEXT_ONLY'},
                     'verify': lambda: all(current[item['Id']]['State']['Running'] for item in services.values()),
                     'settle': lambda seconds: None,
                     'checkpoint': lambda stage, data: checkpoints.append((stage, data))}
        return services, current, actions, checkpoints, callbacks

    def test_drill_stops_exact_original_services_and_resumes_reverse_order(self):
        services, current, actions, checkpoints, callbacks = self.environment()
        result = fence.run_fence('drill', services, **callbacks)
        self.assertEqual(actions, [('stop', str(i)*64) for i in [1, 2, 3]]+
                         [('start', str(i)*64) for i in [3, 2, 1]])
        self.assertTrue(result['drillResumed'])
        self.assertFalse(result['replayEligibleWhileFenceHeld'])
        self.assertFalse(result['serviceActivationAllowed'])
        self.assertNotIn('DO_NOT_PERSIST', str(checkpoints))
        self.assertNotIn('FOREIGN_CONFIG', str(checkpoints))
        self.assertTrue(current['4'*64]['State']['Running'])

    def test_recovery_success_never_starts_a_service(self):
        services, current, actions, checkpoints, callbacks = self.environment()
        result = fence.run_fence('recovery', services, **callbacks)
        self.assertEqual(len(actions), 3)
        self.assertTrue(all(action == 'stop' for action, _ in actions))
        self.assertTrue(result['replayEligibleWhileFenceHeld'])
        self.assertFalse(result['serviceActivationAllowed'])
        self.assertEqual(checkpoints[-1][0], 'recovery-held')

    def test_invalid_identity_or_autostart_refuses_before_any_stop(self):
        for mutation in [lambda s: s['web']['HostConfig']['RestartPolicy'].update(Name='always'),
                         lambda s: s['api'].update(Id=s['web']['Id']),
                         lambda s: s['worker']['Config']['Labels'].update({'com.docker.compose.project': 'foreign'}),
                         lambda s: s['api'].update(RestartCount=1)]:
            services, _, actions, _, callbacks = self.environment()
            mutation(services)
            with self.assertRaises(ValueError):
                fence.run_fence('drill', services, **callbacks)
            self.assertEqual(actions, [])

    def test_active_work_or_sessions_refuses_before_any_stop(self):
        for key in ['pendingJobs', 'liveLeases', 'foreignActiveSessions', 'databaseTlsVerified']:
            services, _, actions, _, callbacks = self.environment()
            proof = callbacks['observe']()
            proof[key] = False if key == 'databaseTlsVerified' else 1
            callbacks['observe'] = lambda: proof
            with self.assertRaises(ValueError):
                fence.run_fence('drill', services, **callbacks)
            self.assertEqual(actions, [])

    def test_changed_authority_emits_none_and_drill_resumes_originals(self):
        services, _, actions, _, callbacks = self.environment()
        capture = callbacks['capture']
        calls = []
        def changing(mode):
            calls.append(mode)
            result = capture(mode)
            result['stateDigest'] = ('b' if len(calls) == 1 else 'c')*64
            return result
        callbacks['capture'] = changing
        with self.assertRaisesRegex(ValueError, 'changed under'):
            fence.run_fence('drill', services, **callbacks)
        self.assertEqual([cid for action, cid in actions if action == 'start'], [str(i)*64 for i in [3, 2, 1]])

    def test_recovery_capture_failure_stays_closed(self):
        services, _, actions, checkpoints, callbacks = self.environment()
        callbacks['capture'] = Mock(side_effect=ValueError('capture unavailable'))
        with self.assertRaisesRegex(ValueError, 'unavailable'):
            fence.run_fence('recovery', services, **callbacks)
        self.assertFalse(any(action == 'start' for action, _ in actions))
        self.assertEqual(checkpoints[-1][0], 'recovery-held')

    def test_restarted_original_or_changed_foreign_runtime_refuses_resume(self):
        for change in ['foreign', 'writer']:
            services, current, actions, _, callbacks = self.environment()
            def mutate(seconds):
                if seconds == 30:
                    if change == 'foreign':
                        current['4'*64]['State']['StartedAt'] = 'foreign-restart'
                    else:
                        current[services['api']['Id']]['State']['StartedAt'] = 'external-restart'
            callbacks['settle'] = mutate
            with self.assertRaises(ValueError):
                fence.run_fence('drill', services, **callbacks)
            self.assertFalse(any(action == 'start' for action, _ in actions))

    def test_late_nonzero_queue_stops_worker_in_recovery_without_capture(self):
        services, _, actions, _, callbacks = self.environment()
        observe = callbacks['observe']
        calls = []
        def late_queue():
            calls.append(1)
            proof = observe()
            proof['pendingJobs'] = 0 if len(calls) == 1 else 1
            return proof
        callbacks['observe'] = late_queue
        callbacks['capture'] = Mock()
        with self.assertRaisesRegex(ValueError, 'drain'):
            fence.run_fence('recovery', services, **callbacks)
        self.assertEqual(actions, [('stop', str(i)*64) for i in [1, 2, 3]])
        callbacks['capture'].assert_not_called()

    def test_partial_stop_error_resumes_only_stopped_originals(self):
        services, current, actions, checkpoints, callbacks = self.environment()
        stop = callbacks['stop']
        def interrupted(cid):
            if cid == services['api']['Id']:
                raise ValueError('stop transport interrupted')
            stop(cid)
        callbacks['stop'] = interrupted
        with self.assertRaisesRegex(ValueError, 'transport interrupted'):
            fence.run_fence('drill', services, **callbacks)
        self.assertEqual(actions, [('stop', '1'*64), ('start', '1'*64)])
        self.assertTrue(all(current[item['Id']]['State']['Running'] for item in services.values()))
        self.assertEqual(checkpoints[-1][0], 'drill-resumed')

    def test_health_probe_ticks_do_not_look_like_foreign_restarts(self):
        services, current, _, _, callbacks = self.environment()
        def tick(seconds):
            current['4'*64]['State']['Health'] = {'Log': [{'End': str(seconds)}]}
        callbacks['settle'] = tick
        result = fence.run_fence('drill', services, **callbacks)
        self.assertTrue(result['drillResumed'])

    def test_plaintext_or_unknown_bundle_fields_emit_no_authority(self):
        for bad in [b'{"private_user":"plaintext"}', b'age-encryption.org/v1\nshort']:
            services, _, _, _, callbacks = self.environment()
            callbacks['capture'] = lambda mode: {'mode': mode, 'stateDigest': 'a'*64, 'encryptedAuthority': bad}
            with self.assertRaisesRegex(ValueError, 'encrypted authority'):
                fence.run_fence('drill', services, **callbacks)

    def test_busy_original_lock_does_not_query_docker(self):
        daily = Mock()
        @contextlib.contextmanager
        def busy(_path):
            raise BlockingIOError('occupied')
            yield
        daily.exclusive.side_effect = busy
        request = {'mode': 'plan', 'sourceCommit': 'a'*40, 'ownerManifestDigest': 'b'*64}
        with patch.object(fence.os, 'geteuid', return_value=0, create=True), \
                patch.object(fence, 'installed_daily', return_value=daily), \
                patch.object(fence, 'original', return_value=b''), self.assertRaises(BlockingIOError):
            fence.plan(request)
        daily.stable_state.assert_not_called()
        daily.owner_runtime.assert_not_called()
        daily.command.assert_not_called()


if __name__ == '__main__':
    unittest.main()

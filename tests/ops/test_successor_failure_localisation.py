"""A refused successor transition names where it stopped, never what it saw.

The production CLI used to answer every refusal with one generic line, so a refusal before the
first journal row could not be localised. The host now returns a fixed phase label, exception
type names and line numbers of the reviewed modules only. These tests drive the real `main`
over the production-shaped chain (four exposed generations, a prepared schema-040 fifth one).
"""
import json
import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import test_beta_successor_chain as chained
import test_beta_successor_chain_root as base
from test_service_registry_protocol import observed

funded, daily, root = base.funded, base.daily, base.root
SECRET = 'hunter2-private-value'


def raised(source, name, **context):
    namespace = {**context}
    exec(compile(source, '<reviewed-' + name + '>', 'exec'), namespace)
    try:
        namespace['boom']()
    except BaseException as error:
        return error
    raise AssertionError('expected a refusal')


class DiagnosticShapeTests(unittest.TestCase):
    def setUp(self):
        root._phase[0] = 'start'

    def test_only_phase_type_module_and_line_leave_the_host(self):
        error = raised("def boom():\n    raise ValueError(%r)\n" % SECRET, 'alterward_demo')
        root.at('baseline')
        result = root.failure_diagnostic(error)
        self.assertEqual(result, {'version': 'alterward-successor-failure-1', 'phase': 'baseline',
                                  'exceptions': [{'type': 'ValueError', 'frames': [{'module': 'alterward_demo', 'line': 2}]}]})
        self.assertNotIn(SECRET, json.dumps(result))

    def test_the_cause_chain_is_kept_and_the_innermost_frames_win_the_cap(self):
        source = ("def inner():\n    raise KeyError(%r)\n"
                  "def boom():\n    try:\n        inner()\n    except KeyError as cause:\n"
                  "        raise ValueError(%r) from cause\n") % (SECRET, SECRET)
        result = root.failure_diagnostic(raised(source, 'alterward_beta_successor'))
        self.assertEqual([e['type'] for e in result['exceptions']], ['ValueError', 'KeyError'])
        self.assertEqual([f['line'] for f in result['exceptions'][1]['frames']], [5, 2])
        self.assertNotIn(SECRET, json.dumps(result))
        deep = "def boom(n=0):\n    return boom(n + 1) if n < 80 else 1 / 0\n"
        frames = root.failure_diagnostic(raised(deep, 'alterward_deep'))['exceptions'][0]['frames']
        self.assertEqual(len(frames), 32)
        self.assertEqual(frames[-1]['line'], 2)

    def test_foreign_code_and_unknown_phase_and_odd_exception_names_are_not_reported(self):
        outside = compile("def boom():\n    raise RuntimeError('x')\n", '/root/private/other.py', 'exec')
        namespace = {}
        exec(outside, namespace)
        try:
            namespace['boom']()
        except RuntimeError as error:
            root._phase[0] = 'not-a-phase ' + SECRET
            result = root.failure_diagnostic(error)
        self.assertEqual(result['phase'], 'unknown')
        self.assertEqual(result['exceptions'], [{'type': 'RuntimeError', 'frames': []}])
        self.assertNotIn(SECRET, json.dumps(result))
        odd = type('Bad' + SECRET.replace('-', '_') * 6, (Exception,), {})
        self.assertEqual(root.failure_diagnostic(odd(SECRET))['exceptions'][0]['type'], 'Exception')

    def test_a_failed_command_reports_the_program_family_and_exit_code_but_no_argument(self):
        failed = subprocess.CalledProcessError(3, ['/usr/bin/docker', 'inspect', SECRET], output=SECRET.encode())
        item = root.failure_diagnostic(failed)['exceptions'][0]
        self.assertEqual((item['type'], item['program'], item['exitCode']), ('CalledProcessError', 'docker', 3))
        self.assertNotIn(SECRET, json.dumps(item))
        timeout = root.failure_diagnostic(subprocess.TimeoutExpired([SECRET], 60))['exceptions'][0]
        self.assertEqual(timeout['program'], 'other')
        self.assertNotIn('exitCode', timeout)


class ApplyPhaseTests(base.ChainRootBase):
    def setUp(self):
        super().setUp()
        root._phase[0] = 'start'
        self.chain.admit_readers()
        value = self.chain.prepare(3, 'tester-beta', participants=self.chain.testers())
        self.chain.expose(3, value, window_changed=True)
        value = self.chain.prepare(4, 'schema-039')
        self.chain.expose(4, value, window_changed=False, schema=True)
        self.value = self.chain.prepare(5, 'schema-040', database=observed())
        self.owner = self.fixture.owner
        daily_locks = self.owner.parent / 'daily-locks'
        daily_locks.mkdir(exist_ok=True)
        (daily_locks / 'job.lock').write_bytes(b'')
        (self.owner / 'activation.lock').write_bytes(b'')
        for module, name, value_ in [(root.os, 'geteuid', lambda: 0), (funded.fence, 'DAILY', daily_locks),
                                     (funded.fence, 'installed_daily', lambda: daily),
                                     (funded.readers, 'exclusive_lock', lambda *a: None),
                                     (root.System, 'archive_support', lambda self: None)]:
            p = patch.object(module, name, value_)
            p.start()
            self.addCleanup(p.stop)

    def request(self, **changes):
        value = self.value
        return {'mode': 'apply', 'sourceCommit': 'b' * 40, 'bundleSha256': 'c' * 64, 'sourceHashes': {},
                'selection': json.loads((self.chain.root(5) / 'selection.json').read_bytes()),
                'release': {k: v for k, v in value['release'].items() if not k.endswith('CapabilitySha256')},
                'accessSnapshot': {}, 'preparedSha256': daily.digest(chained.encoded(value)),
                'restoreProof': {}, **changes}

    def refused(self, request):
        with self.assertRaises(BaseException) as caught:
            root.main(request)
        return root.failure_diagnostic(caught.exception), caught.exception

    def test_the_phase_names_where_the_production_shaped_apply_stopped(self):
        # The release the client rebuilt differs from the prepared evidence.
        changed = self.request()
        changed['release'] = {**changed['release'], 'ciSha256': '0' * 64}
        result, error = self.refused(changed)
        self.assertEqual(result['phase'], 'candidate')
        self.assertEqual(result['exceptions'][0]['type'], 'ValueError')
        self.assertNotIn(str(error), json.dumps(result))
        # A prepared candidate of another hash.
        self.assertEqual(self.refused(self.request(preparedSha256='0' * 64))[0]['phase'], 'candidate')
        # An unexpected key is refused before any system is built.
        self.assertEqual(self.refused({**self.request(), 'extra': 1})[0]['phase'], 'start')
        # The candidate is authenticated; a pending one-off cleanup that fails is its own phase.
        with patch.object(root.System, 'cleanup_probe', side_effect=ValueError(SECRET)):
            result, _ = self.refused(self.request())
        self.assertEqual(result['phase'], 'cleanup-probe')
        self.assertNotIn(SECRET, json.dumps(result))
        # The first preflight check: the Daily clock of the fixture is not inside the prepared window.
        with patch.object(root.System, 'cleanup_probe', return_value={}):
            result, _ = self.refused(self.request())
        self.assertEqual(result['phase'], 'freshness')
        self.assertFalse((self.chain.root(5) / 'journal.json').exists())

    def test_each_preflight_check_has_its_own_phase(self):
        system = root.System(self.request(), daily)
        candidate = system.candidate()
        observed_baseline = {**candidate['baseline'], 'accessConfigurationSha256': 'a' * 64,
                             'proxyNetwork': {'id': 'network', 'foreignMembers': []}, 'foreign': {}}
        candidate = {**candidate, 'baseline': observed_baseline}
        system.now = lambda: funded.stamp(candidate['preparedAt'])
        stops = [('baseline', 'baseline'), ('parent', 'parent'), ('access', 'access'),
                 ('capabilities', 'capabilities'), ('reconcile_accounts', 'accounts'),
                 ('require_candidate_restore', 'restore')]
        for method, phase in stops:
            with self.subTest(method):
                root._phase[0] = 'start'
                with patch.multiple(system, baseline=lambda **k: candidate['baseline'], parent=lambda: None,
                                    access=lambda *a: None, capabilities=lambda c: None,
                                    reconcile_accounts=lambda c: {'state': 'uncommitted'},
                                    require_candidate_restore=lambda c: None), \
                     patch.object(root.upgrade, 'proxy_network', create=True, return_value=observed_baseline['proxyNetwork']), \
                     patch.object(root.upgrade, 'foreign_state', create=True, return_value=observed_baseline['foreign']):
                    setattr(system, method, self.raising())
                    with self.assertRaises(ValueError) as caught:
                        system.preflight(candidate)
                self.assertEqual(root.failure_diagnostic(caught.exception)['phase'], phase)
                self.assertNotIn(SECRET, json.dumps(root.failure_diagnostic(caught.exception)))
        # Foreign workload or proxy-network drift is the one check that is not a method of its own.
        root._phase[0] = 'start'
        with patch.multiple(system, baseline=lambda **k: candidate['baseline'], parent=lambda: None, access=lambda *a: None), \
             patch.object(root.upgrade, 'proxy_network', create=True, return_value={'id': 'other'}), \
             patch.object(root.upgrade, 'foreign_state', create=True, return_value={}):
            with self.assertRaisesRegex(ValueError, 'Foreign/proxy drift') as caught:
                system.preflight(candidate)
        self.assertEqual(root.failure_diagnostic(caught.exception)['phase'], 'foreign-proxy')

    def test_the_records_a_real_prepare_leaves_behind_pass_the_start_of_apply(self):
        """candidate() and the pending one-off cleanup over the capability/probe records of the 040 preparation."""
        hashes = {**daily.REGISTRY_040_CHANGE_HASHES, 'apps/api/src/main.ts': 'a' * 64}
        request = self.request(sourceHashes=hashes)
        prepare = root.System({**request, 'mode': 'prepare'}, daily)
        prepare.root = self.chain.root(5)
        image = self.value['release']['target']['imageId']
        patches = [patch.object(funded.readers, 'durable_file', side_effect=self.fixture.write),
                   patch.object(funded.upgrade, 'atomic_private', side_effect=self.fixture.write),
                   patch.object(funded.upgrade, 'docker', return_value=SimpleNamespace(stdout=b'')),
                   patch.object(funded.upgrade, 'run', return_value=SimpleNamespace(stdout=b'{}', returncode=0))]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        # The last capability probe of the preparation is the engine freeze over the filtered inputs.
        prepare.capability(image, prepare.schema_frozen_source_hashes())
        record = daily.funded_capability_state(self.chain.root(5))
        self.assertEqual(record['state'], 'cleaned')
        compose = b'{"services":{}}'
        self.fixture.write(self.chain.root(5) / 'probe-compose.json', compose)
        self.fixture.write(self.chain.root(5) / 'probe.json', funded.encoded({
            'version': daily.FUNDED_PROBE_VERSION, 'sourceCommit': 'b' * 40, 'bundleSha256': 'c' * 64,
            'name': funded.upgrade.PROJECT + '-funded-probe-' + 'd' * 32, 'imageId': image,
            'composeSha256': daily.digest(compose), 'state': 'cleaned', 'containerId': None}))
        system = root.System(request, daily)
        candidate = system.candidate()
        self.assertEqual(candidate, self.value)
        result = system.cleanup_probe()
        self.assertEqual((result['capabilityRemoved'], result['probeRemoved']), (False, False))
        # The preparation's own capability record is bound to this exact request; a bundle that moved is refused.
        with self.assertRaisesRegex(ValueError, 'capability evidence'):
            root.System({**request, 'bundleSha256': 'e' * 64}, daily).cleanup_probe()

    def raising(self):
        def refuse(*args, **kwargs):
            raise ValueError(SECRET)
        return refuse


if __name__ == '__main__':
    unittest.main()

"""Preserve the existing owner stack when the fixture patches PROJECT."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-funded-fixture-engine.py'
spec = importlib.util.spec_from_file_location('preservation_engine', path)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class FixturePreservation(unittest.TestCase):
    def setUp(self):
        self.original = engine.activation.PROJECT
        self.fixture = 'alterward-funded-fixture-' + 'f' * 12
        self.state = {}
        for name in ('api', 'web', 'worker'):
            self.add('original-' + name, self.original)
        self.add('unrelated', 'another-project')
        # Other test modules reload these import names during discovery. Patch
        # the retained functions' actual globals, never a newer sys.modules entry.
        for namespace in (engine.upgrade.existing_state.__globals__,
                          engine.upgrade.project_ids.__globals__):
            mock = patch.dict(namespace, {'docker': self.docker})
            mock.start()
            self.addCleanup(mock.stop)
        mock = patch.object(engine.upgrade, 'docker', self.docker)
        mock.start()
        self.addCleanup(mock.stop)
        self.before = engine.upgrade.existing_state()
        self.original_foreign = engine.upgrade.foreign_state()
        mock = patch.object(engine.activation, 'PROJECT', self.fixture)
        mock.start()
        self.addCleanup(mock.stop)
        for name in ('api', 'web', 'worker'):
            self.add('fixture-' + name, self.fixture)
        self.add('sentinel', None)

    def add(self, key, project):
        self.state[key] = {'Id': key, 'RestartCount': 0,
                           'State': {'Status': 'running'}, 'project': project}

    def docker(self, *args):
        if args[0] == 'ps':
            rows = self.state
            if '--filter' in args:
                project = args[args.index('--filter') + 1].split('=', 2)[-1]
                rows = {k: v for k, v in rows.items() if v['project'] == project}
            elif '-q' in args:
                rows = {k: v for k, v in rows.items() if v['State']['Status'] == 'running'}
            value = '\n'.join(rows)
        elif args[0] == 'inspect':
            value = json.dumps([self.state[key] for key in args[1:]])
        else:
            raise AssertionError('Unexpected Docker operation')
        return SimpleNamespace(stdout=value.encode())

    def test_existing_owner_is_preserved_across_project_scope_change(self):
        self.assertEqual(len(self.before), 4)
        self.assertTrue(engine.preserved_containers(self.before, self.fixture, 'sentinel'))
        # Reproduce why the original project-relative baseline failed on target.
        current_foreign = engine.upgrade.foreign_state()
        self.assertNotEqual({k: v for k, v in current_foreign.items()
                             if k != 'sentinel'}, self.original_foreign)

    def test_owner_and_other_workload_restart_or_disappearance_is_rejected(self):
        initial = copy.deepcopy(self.state)
        for key in self.before:
            for change in ('restart', 'missing', 'stopped', 'replacement'):
                with self.subTest(container=key, change=change):
                    self.state = copy.deepcopy(initial)
                    if change == 'restart':
                        self.state[key]['RestartCount'] += 1
                    elif change == 'stopped':
                        self.state[key]['State']['Status'] = 'exited'
                    else:
                        del self.state[key]
                        if change == 'replacement':
                            self.add(key + '-replacement', self.original)
                    self.assertFalse(engine.preserved_containers(self.before, self.fixture, 'sentinel'))

    def test_new_workload_missing_sentinel_and_baseline_masking_are_rejected(self):
        initial = copy.deepcopy(self.state)
        for change in ('new', 'sentinel-missing', 'owner-masked', 'sentinel-masked', 'sentinel-owned'):
            with self.subTest(change=change):
                self.state = copy.deepcopy(initial)
                sentinel = 'sentinel'
                if change == 'new':
                    self.add('unexpected', 'another-project')
                elif change == 'sentinel-missing':
                    del self.state[sentinel]
                elif change == 'owner-masked':
                    self.state['original-api']['project'] = self.fixture
                elif change == 'sentinel-masked':
                    sentinel = 'original-api'
                else:
                    self.state[sentinel]['project'] = self.fixture
                self.assertFalse(engine.preserved_containers(self.before, self.fixture, sentinel))

    def test_fixture_ids_stay_scoped_before_setup_patch_and_after_restore(self):
        for ambient in (self.original, self.fixture):
            with self.subTest(ambient=ambient), patch.object(engine.activation, 'PROJECT', ambient):
                self.assertEqual(set(engine.fixture_project_ids(self.fixture)),
                                 {'fixture-api', 'fixture-web', 'fixture-worker'})
        self.state = {k: v for k, v in self.state.items() if k in self.before}
        with patch.object(engine.activation, 'PROJECT', self.original):
            self.assertEqual(engine.fixture_project_ids(self.fixture), [])
        for project in (self.original, 'another-project', '', '../fixture'):
            with self.subTest(project=project), self.assertRaises(ValueError):
                engine.fixture_project_ids(project)

    def test_cleanup_comparison_excludes_no_container(self):
        self.assertFalse(engine.preserved_containers(self.before))
        self.state = {k: v for k, v in self.state.items() if k in self.before}
        with patch.object(engine.activation, 'PROJECT', self.original):
            self.assertTrue(engine.preserved_containers(self.before))
            self.state['original-api']['RestartCount'] += 1
            self.assertFalse(engine.preserved_containers(self.before))

    def test_setup_failure_before_project_patch_never_removes_existing_owner(self):
        self.state = {k: v for k, v in self.state.items() if k in self.before}
        commands = []

        def command(args, *unused, **options):
            commands.append(args)
            if args[:2] == ['docker', 'inspect']:
                return json.dumps([{'Id': 'postgres', 'Config': {'Labels': {
                    'com.docker.compose.service': 'postgres'}},
                    'HostConfig': {'PortBindings': {}}}]).encode()
            if args[:3] == ['docker', 'network', 'create']:
                raise RuntimeError('synthetic network setup failure')
            if (args[:2] == ['docker', 'ps'] and
                    args[-1].startswith('label=com.alterward.fixture-helper=')):
                return b''
            raise AssertionError('Unexpected Docker mutation')

        with tempfile.TemporaryDirectory(prefix='alterward-ci-') as tmp:
            ca = Path(tmp).resolve() / 'ca.crt'
            ca.write_bytes(b'synthetic public certificate')
            context = {'image': 'sha256:' + 'a' * 64, 'databaseNetwork': 'alterward-ci-1-proxy',
                       'postgres': 'postgres', 'ca': str(ca), 'sourceCommit': 'b' * 40,
                       'sourceHashes': {}, 'bundleSha256': 'c' * 64,
                       'privacy': dict.fromkeys((
                           'fundedV9ReplayAndCharacterStateVerified',
                           'narrativeArtifactsSurvivedPhysicalRestore',
                           'legacyNullArtifactsReadable', 'privateArtifactExcludedFromLifeDto',
                           'idempotentReplay', 'budgetNotReducedAndPaidDisabled'), True)}
            with patch.object(engine.os, 'geteuid', return_value=0), \
                    patch.dict(engine.os.environ, {'CI': 'true', 'GITHUB_ACTIONS': 'true'}), \
                    patch.object(engine.activation, 'PROJECT', self.original), \
                    patch.object(engine, 'run', command):
                with self.assertRaisesRegex(RuntimeError, '^synthetic network setup failure$'):
                    engine.exercise(context)
            self.assertEqual(self.state.keys(), self.before.keys())
            self.assertFalse(any(args[:3] == ['docker', 'rm', '-f'] for args in commands))
            self.assertEqual(list(ca.parent.glob('alterward-funded-fixture-*')), [])


if __name__ == '__main__':
    unittest.main()

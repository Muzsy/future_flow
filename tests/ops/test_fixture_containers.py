"""Direct helper timeout/interrupt ownership, including a killed fork's intents."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import tempfile
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[2]/'scripts/ops/contabo-fixture-containers.py'
spec = importlib.util.spec_from_file_location('fixture_helpers', path)
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
IMAGE = 'sha256:'+'a'*64
PROJECT = 'alterward-funded-fixture-'+'b'*12


class FixtureHelperTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.live = self.root/'docker-state.json'
        self.live.write_text('{}')
        self.commands = []
        self.helpers = h.FixtureContainers(self.root/'intents', PROJECT, lambda: {IMAGE}, self.command)

    def command(self, args):
        self.commands.append(args)
        state = json.loads(self.live.read_text())
        if args[1] == 'ps':
            return ('\n'.join(state)).encode()
        if args[1] == 'inspect':
            return json.dumps([state[args[2]]]).encode()
        if args[1:3] == ['rm', '-f']:
            del state[args[3]]
            self.live.write_text(json.dumps(state))
            return b''
        raise AssertionError(args)

    def create(self, args):
        name = args[args.index('--name')+1]
        label = args[args.index('--label')+1]
        self.assertEqual(label, h.LABEL+'='+PROJECT)
        state = {'1'*64: {'Id': '1'*64, 'Name': '/'+name, 'Image': IMAGE,
                          'Config': {'Labels': {h.LABEL: PROJECT}}}}
        self.live.write_text(json.dumps(state))
        return state

    def test_intent_precedes_creation_and_timeout_removes_actual_owned_id(self):
        def timeout(args):
            entries = list(self.helpers.directory.iterdir())
            self.assertEqual(len(entries), 1)
            self.assertEqual(self.helpers.read(entries[0])['state'], 'pending')
            self.create(args)
            raise TimeoutError('synthetic timeout')
        with self.assertRaises(TimeoutError):
            self.helpers.wrap(timeout)(['docker', 'run', '--rm', IMAGE, 'node', '-e', 'fixture'])
        self.assertEqual(json.loads(self.live.read_text()), {})
        value = self.helpers.read(next(self.helpers.directory.iterdir()))
        self.assertEqual(value['containerId'], '1'*64)
        self.assertEqual(value['state'], 'cleaned')
        self.assertIn(['docker', 'rm', '-f', '1'*64], self.commands)

    def test_sigint_path_also_reconciles_the_owned_helper(self):
        def interrupt(args):
            self.create(args)
            raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            self.helpers.wrap(interrupt)(['docker', 'run', '-i', IMAGE, 'node'])
        self.assertEqual(json.loads(self.live.read_text()), {})

    @unittest.skipUnless(hasattr(os, 'fork'), 'POSIX fork contract')
    def test_parent_reads_intent_from_sigkilled_fork_and_reconciles_container(self):
        pid = os.fork()
        if pid == 0:
            args, _ = self.helpers.prepare(['docker', 'run', '--rm', IMAGE, 'node'])
            self.create(args)
            os.kill(os.getpid(), signal.SIGKILL)
            os._exit(2)
        _, status = os.waitpid(pid, 0)
        self.assertTrue(os.WIFSIGNALED(status))
        self.assertEqual(len(json.loads(self.live.read_text())), 1)
        self.helpers.cleanup_all()
        self.assertEqual(json.loads(self.live.read_text()), {})

    def test_foreign_label_image_or_replaced_id_cannot_be_removed(self):
        for key, value in [('Image', 'sha256:'+'c'*64), ('Config', {'Labels': {}}), ('Id', '2'*64)]:
            args, intent = self.helpers.prepare(['docker', 'run', IMAGE, 'node'])
            state = self.create(args)
            record = self.helpers.read(intent)
            record['containerId'] = '1'*64
            self.helpers.save(intent, record)
            state['1'*64][key] = value
            self.live.write_text(json.dumps(state))
            before = self.live.read_bytes()
            with self.subTest(key=key), self.assertRaises(ValueError): self.helpers.cleanup_one(intent)
            self.assertEqual(self.live.read_bytes(), before)
            self.live.write_text('{}')

    def test_already_removed_container_is_clean_and_other_commands_are_unchanged(self):
        _, intent = self.helpers.prepare(['docker', 'run', IMAGE, 'node'])
        self.helpers.cleanup_one(intent)
        self.assertEqual(self.helpers.read(intent)['state'], 'cleaned')
        for command in (['docker', 'inspect', IMAGE], ['docker', 'run', '--name', 'separately-owned', IMAGE]):
            self.assertEqual(self.helpers.prepare(command), (command, None))
        with self.assertRaises(ValueError): self.helpers.prepare(['docker', 'run', 'unreviewed:tag'])

    def test_unknown_labeled_daemon_container_prevents_success(self):
        self.live.write_text(json.dumps({'f'*64: {}}))
        with self.assertRaisesRegex(ValueError, 'Unreconciled'):
            self.helpers.cleanup_all()
        self.assertFalse(any(c[1:3] == ['rm', '-f'] for c in self.commands))

    def test_incomplete_update_does_not_skip_other_known_container_cleanup(self):
        args, _ = self.helpers.prepare(['docker', 'run', IMAGE])
        self.create(args)
        (self.helpers.directory/'.update-interrupted').write_bytes(b'partial')
        with self.assertRaisesRegex(ValueError, 'incomplete-intent-update'):
            self.helpers.cleanup_all()
        self.assertEqual(json.loads(self.live.read_text()), {})

    def test_failed_daemon_cleanup_preserves_the_private_engine_intents(self):
        args, intent = self.helpers.prepare(['docker', 'run', IMAGE])
        self.create(args)
        original = intent.read_bytes()
        failures = ['daemon-unavailable']
        self.assertFalse(h.cleanup_workspace(self.root, failures))
        self.assertEqual(intent.read_bytes(), original)
        self.assertEqual(len(json.loads(self.live.read_text())), 1)

    def test_outer_workspace_retains_unreconciled_engine_and_cleans_only_after_success(self):
        retained = self.root/'alterward-funded-fixture-retained'
        retained.mkdir(mode=0o700)
        (retained/'intent.json').write_bytes(b'pending identity')
        failures = []
        self.assertFalse(h.cleanup_workspace(self.root, failures, nested_pattern='alterward-funded-fixture-*'))
        self.assertIn('nested-reconciliation-required', failures)
        self.assertEqual((retained/'intent.json').read_bytes(), b'pending identity')
        (retained/'intent.json').unlink(); retained.rmdir()
        self.assertTrue(h.cleanup_workspace(self.root, [], nested_pattern='alterward-funded-fixture-*'))
        self.assertFalse(self.root.exists())

    def test_modified_or_aliased_intent_is_refused(self):
        _, intent = self.helpers.prepare(['docker', 'run', IMAGE])
        value = json.loads(intent.read_text()); value['image'] = None
        intent.write_text(json.dumps(value))
        with self.assertRaises(ValueError): self.helpers.cleanup_one(intent)
        intent.unlink(); intent.symlink_to(self.live)
        with self.assertRaises(ValueError): self.helpers.cleanup_one(intent)


if __name__ == '__main__':
    unittest.main()

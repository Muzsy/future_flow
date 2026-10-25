"""Non-root negative boundaries; actual PostgreSQL/Docker proof runs in CI."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

path = Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-funded-image-rehearsal.py'
spec = importlib.util.spec_from_file_location('image_rehearsal', path)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
IMAGE = 'sha256:'+'a'*64
BINDING = {'sourceCommit': 'b'*40, 'bundleSha256': 'c'*64}


class ImageRehearsalBoundaries(unittest.TestCase):
    def test_only_immutable_image_id_is_accepted(self):
        self.assertEqual(r.validate_image(IMAGE), IMAGE)
        for value in ('alterward:latest', 'sha256:'+'a'*63, '', None, 'sha256:'+'A'*64):
            with self.subTest(value=value), self.assertRaises(ValueError):
                r.validate_image(value)

    def test_image_private_credentials_and_node_injection_are_rejected(self):
        info = {'Id': IMAGE, 'Config': {'User': 'node', 'WorkingDir': '/app',
                'Entrypoint': ['docker-entrypoint.sh'], 'Env': ['NODE_ENV=production', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=public']}}
        r.validate_image_configuration(info, IMAGE)
        for key in ('OPENAI_API_KEY', 'DATABASE_URL', 'ANTHROPIC_API_KEY', 'NODE_OPTIONS', 'NODE_PATH', 'AUTH_TOKEN', 'NEXT_PUBLIC_OPENAI_API_KEY'):
            changed = copy.deepcopy(info)
            changed['Config']['Env'].append(key+'=not-a-real-secret')
            with self.subTest(key=key), self.assertRaises(ValueError):
                r.validate_image_configuration(changed, IMAGE)
        with self.assertRaises(ValueError):
            r.validate_image_configuration({**info, 'Id': 'sha256:'+'d'*64}, IMAGE)

    def test_old_output_is_never_overwritten_and_alias_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            target = root/'proof'
            r.reserve_output(target)
            (target/'original').write_bytes(b'original-receipt')
            with self.assertRaises(FileExistsError): r.reserve_output(target)
            self.assertEqual((target/'original').read_bytes(), b'original-receipt')
            (root/'alias').symlink_to(target, target_is_directory=True)
            with self.assertRaises(ValueError): r.reserve_output(root/'alias')
            with self.assertRaises(ValueError): r.reserve_output(Path('relative'))

    def test_stale_foreign_or_incomplete_proof_is_rejected(self):
        proof = {**BINDING, 'targetImage': IMAGE, 'recoveryImage': IMAGE,
                 'checks': dict.fromkeys(r.CHECKS, True), 'privacyFixtureSha256': 'e'*64, 'paidAiCalls': 0}
        r.require_proof(proof, IMAGE, BINDING)
        for field, value in [('sourceCommit', '0'*40), ('bundleSha256', '0'*64),
                             ('targetImage', 'sha256:'+'0'*64), ('recoveryImage', 'sha256:'+'0'*64),
                             ('paidAiCalls', 1), ('checks', {}), ('privacyFixtureSha256', '')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                r.require_proof({**proof, field: value}, IMAGE, BINDING)
        for check in r.CHECKS:
            with self.subTest(check=check), self.assertRaises(ValueError):
                r.require_proof({**proof, 'checks': {**proof['checks'], check: False}}, IMAGE, BINDING)

    def test_cleanup_uses_actual_id_and_refuses_foreign_image_label_or_name(self):
        name, owner = 'owned-postgres', 'nonce-owner'
        info = {'Id': '1'*64, 'Name': '/'+name, 'Image': IMAGE, 'Config': {'Labels': {r.LABEL: owner}}}
        with patch.object(r, 'run', side_effect=[('1'*64).encode(), json.dumps([info]).encode(), b'']) as run:
            r.clean_container(name, owner, IMAGE)
            self.assertEqual(run.call_args.args[0], ['docker', 'rm', '-f', '1'*64])
        for field, value in [('Image', 'sha256:'+'f'*64), ('Name', '/foreign'), ('Config', {'Labels': {}})]:
            with patch.object(r, 'run', side_effect=[('1'*64).encode(), json.dumps([{**info, field: value}]).encode()]) as run:
                with self.subTest(field=field), self.assertRaises(ValueError): r.clean_container(name, owner, IMAGE)
                self.assertEqual(run.call_count, 2)

    def test_source_probe_cleanup_runs_even_after_timeout(self):
        with patch.object(r, 'run', side_effect=TimeoutError), patch.object(r, 'clean_container') as cleanup:
            with self.assertRaises(TimeoutError): r.verify_image_sources(IMAGE, {**BINDING, 'sourceHashes': {}})
            cleanup.assert_called_once()
            self.assertEqual(cleanup.call_args.args[2], IMAGE)

    def test_uncommitted_source_stops_before_image_or_database_work(self):
        with patch.object(r, 'run', return_value=b' M scripts/example.py\n') as run:
            with self.assertRaises(ValueError): r.source_binding()
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.args[0][-2:], ['status', '--porcelain'])

    def test_incomplete_cleanup_preserves_reconciliation_data_and_publishes_no_proof(self):
        helper_spec = importlib.util.spec_from_file_location('cleanup_test_helper', path.with_name('contabo-fixture-containers.py'))
        helper = importlib.util.module_from_spec(helper_spec)
        helper_spec.loader.exec_module(helper)
        original_mkdtemp = tempfile.mkdtemp
        proof = {**BINDING, 'targetImage': IMAGE, 'recoveryImage': IMAGE,
                 'checks': dict.fromkeys(r.CHECKS, True), 'privacyFixtureSha256': 'e'*64, 'paidAiCalls': 0}
        for failure in ('nested-engine', 'outer-container'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp).resolve()
                output = root/'proof'
                def command(args, **kwargs):
                    if args[0] == 'openssl':
                        for flag in ('-keyout', '-out'):
                            if flag in args: Path(args[args.index(flag)+1]).write_bytes(b'synthetic')
                    if args[:3] == ['docker', 'image', 'inspect']:
                        return json.dumps([{'Id': 'sha256:'+'f'*64}]).encode()
                    if args[-2:] == ['-g', 'postgres']: return b'999'
                    if args[:3] == ['docker', 'run', '-d']: return ('1'*64).encode()
                    if 'scripts/smoke-privacy-restore.ts' in args: return b'{}'
                    return b''
                def exercise(context, **kwargs):
                    if failure == 'nested-engine':
                        retained = Path(context['ca']).parent/'alterward-funded-fixture-retained'
                        retained.mkdir(mode=0o700)
                        intent = retained/'helper-intent.json'
                        intent.write_bytes(b'original-owned-container-identifiers')
                        intent.chmod(0o600)
                        raise RuntimeError('Synthetic engine cleanup incomplete')
                    return proof
                engine = SimpleNamespace(upgrade=SimpleNamespace(foreign_state=lambda: {}),
                    containers=helper, exercise=exercise)
                fake_spec = SimpleNamespace(loader=SimpleNamespace(exec_module=lambda module: None))
                cleanup_error = RuntimeError('Synthetic daemon unavailable') if failure == 'outer-container' else None
                with patch.dict(r.os.environ), \
                     patch.object(r.tempfile, 'mkdtemp', side_effect=lambda **kw: original_mkdtemp(dir=root, **kw)), \
                     patch.object(r.os, 'chown'), patch.object(r, 'run', side_effect=command), \
                     patch.object(r, 'clean_container', side_effect=cleanup_error), \
                     patch.object(r, 'source_binding', return_value=BINDING), \
                     patch.object(r.importlib.util, 'spec_from_file_location', return_value=fake_spec), \
                     patch.object(r.importlib.util, 'module_from_spec', return_value=engine):
                    with self.assertRaisesRegex(RuntimeError, 'cleanup incomplete'):
                        r.isolated(IMAGE, output, BINDING)
                scratch = Path(json.loads((output/'rehearsal-intent.json').read_text())['scratchDirectory'])
                self.assertTrue(scratch.is_dir())
                self.assertEqual(scratch.stat().st_mode & 0o777, 0o700)
                if failure == 'nested-engine':
                    self.assertEqual((scratch/'alterward-funded-fixture-retained/helper-intent.json').read_bytes(),
                                     b'original-owned-container-identifiers')
                for filename in ('funded-upgrade-fixture-proof.json', 'image-rehearsal-receipt.json'):
                    self.assertFalse((output/filename).exists())

    def test_non_root_rejected_before_any_child_command(self):
        with patch.object(r.os, 'geteuid', return_value=1000), patch.object(r, 'run') as run:
            with self.assertRaises(ValueError): r.execute(IMAGE, Path('/tmp/unused-proof'))
            run.assert_not_called()

    def test_legacy_ci_entry_point_still_rejects_a_non_ci_caller(self):
        wrapper_path = path.with_name('contabo-funded-upgrade-fixture.py')
        wrapper_spec = importlib.util.spec_from_file_location('legacy_ci_fixture_wrapper', wrapper_path)
        wrapper = importlib.util.module_from_spec(wrapper_spec)
        wrapper_spec.loader.exec_module(wrapper)
        with patch.object(wrapper.os, 'geteuid', return_value=0), patch.dict(wrapper.os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'Actual CI Linux/root'):
                wrapper.main()

    def test_child_environment_has_no_ci_or_provider_inheritance(self):
        self.assertEqual(r.ENV['DOCKER_HOST'], 'unix:///var/run/docker.sock')
        self.assertNotIn('CI', r.ENV)
        self.assertNotIn('GITHUB_ACTIONS', r.ENV)
        self.assertNotIn('OPENAI_API_KEY', r.ENV)
        self.assertNotIn('DATABASE_URL', r.ENV)


if __name__ == '__main__':
    unittest.main()

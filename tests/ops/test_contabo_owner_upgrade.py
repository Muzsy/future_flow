import copy
from contextlib import ExitStack
import importlib.util
import json
from pathlib import Path
from subprocess import CompletedProcess
import sys
import tempfile
import unittest
from unittest.mock import patch

from test_contabo_owner_activation import activation, ROOT

sys.modules['alterward_activation'] = activation
spec = importlib.util.spec_from_file_location('upgrade', ROOT / 'scripts/ops/contabo-owner-upgrade.py')
upgrade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upgrade)


class OwnerUpgradeTests(unittest.TestCase):
    def test_image_tag_change_preserves_every_other_environment_byte(self):
        text = "SECRET='literal$value'\nAI_PROJECT_BUDGET_USD='0'\nALTERWARD_TAG='old'\n"
        expected = text.replace("ALTERWARD_TAG='old'", "ALTERWARD_TAG='contabo-" + 'a' * 12 + "'")
        self.assertEqual(upgrade.image_only_environment(text, 'alterward:contabo-' + 'a' * 12), expected)
        for tag in ['other:contabo-' + 'a' * 12, 'alterward:latest', 'alterward:contabo-' + 'a' * 40]:
            with self.assertRaises(ValueError):
                upgrade.image_only_environment(text, tag)
        for value in ["SECRET='x'\n", text + "ALTERWARD_TAG='duplicate'\n"]:
            with self.assertRaises(ValueError):
                upgrade.image_only_environment(value, 'alterward:contabo-' + 'a' * 12)

    def config(self, image):
        return {'name': 'alterward-owner', 'services': {name: {'image': image,
                'environment': {'AI_PROJECT_BUDGET_USD': '0', 'CLOSED_BETA_USER_IDS': ''},
                'networks': {'proxy': None}} for name in ['web', 'api', 'worker']}}

    def test_only_image_may_differ_not_budget_access_or_network(self):
        old = self.config('old')
        new = self.config('new')
        self.assertEqual(upgrade.config_without_images(old), upgrade.config_without_images(new))
        for mutate in [lambda v: v['services']['api']['environment'].update(AI_PROJECT_BUDGET_USD='1'),
                       lambda v: v['services']['api']['environment'].update(CLOSED_BETA_USER_IDS='someone'),
                       lambda v: v['services']['web'].update(networks={'public': None})]:
            changed = copy.deepcopy(new)
            mutate(changed)
            self.assertNotEqual(upgrade.config_without_images(old), upgrade.config_without_images(changed))
        self.assertEqual(old['services']['api']['image'], 'old')

    def test_only_verified_build_source_path_is_normalized(self):
        old, new = self.config('old'), self.config('new')
        old['services']['web']['build'] = {'context': str(Path('/fixture/old-source')), 'dockerfile': 'Dockerfile',
                                          'args': {'NEXT_PUBLIC_API_URL': '/api/v1'}}
        new['services']['web']['build'] = {'context': str(Path('/fixture/new-source')), 'dockerfile': 'Dockerfile',
                                          'args': {'NEXT_PUBLIC_API_URL': '/api/v1'}}
        self.assertEqual(upgrade.config_without_images(old, Path('/fixture/old-source')),
                         upgrade.config_without_images(new, Path('/fixture/new-source')))
        with self.assertRaises(ValueError):
            upgrade.config_without_images(new, Path('/fixture/another-source'))
        new['services']['web']['build']['dockerfile'] = 'UnknownDockerfile'
        self.assertNotEqual(upgrade.config_without_images(old, Path('/fixture/old-source')),
                            upgrade.config_without_images(new, Path('/fixture/new-source')))

    def test_replacement_is_scoped_to_three_services_without_network_or_proxy_mutation(self):
        with patch.object(upgrade, 'run') as run:
            upgrade.replace_services(Path('/fixture/effective-compose.json'))
        args = run.call_args.args[0]
        self.assertEqual(args[:4], ['docker', 'compose', '--project-name', 'alterward-owner'])
        self.assertEqual(args[-3:], ['web', 'api', 'worker'])
        self.assertIn('--no-deps', args)
        self.assertIn('never', args)
        self.assertNotIn('down', args)
        self.assertNotIn('restart', args)

    def test_queue_proof_is_read_only_and_requires_actual_tls_and_zero(self):
        self.assertIn('BEGIN READ ONLY', upgrade.QUEUE_PROBE)
        self.assertIn('checkHost(host)', upgrade.QUEUE_PROBE)
        for table in ['ff_jobs', 'aw_jobs', 'aw_shared_jobs', 'aw_public_review_jobs', 'aw_public_content_reviews']:
            self.assertIn(table, upgrade.QUEUE_PROBE)
        for result in [{}, {'pendingJobs': 1, 'databaseTlsVerified': True, 'databaseTlsHostnameVerified': True},
                       {'pendingJobs': 0, 'databaseTlsVerified': False, 'databaseTlsHostnameVerified': True}]:
            with patch.object(upgrade, 'run', return_value=CompletedProcess([], 0, json.dumps(result).encode(), b'')):
                with self.assertRaises(ValueError):
                    upgrade.queue_check(Path('/fixture/config.json'))

    def test_drift_aborts_before_queue_or_stop(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            prepared = {'previousManifestSha256': 'expected'}
            (path / 'prepared.json').write_text(json.dumps(prepared))
            with patch.object(upgrade, 'baseline', return_value=({}, {}, {})), \
                 patch.object(upgrade, 'prepared_path', return_value=path), \
                 patch.object(upgrade, 'read_private', side_effect=lambda p: p.read_bytes()), \
                 patch.object(upgrade, 'queue_check') as queue, patch.object(upgrade, 'run') as run:
                with self.assertRaisesRegex(ValueError, 'Prepared proof differs'):
                    upgrade.apply({'buildProof': {'commit': 'a' * 40}, 'preparedProof': {}})
                queue.assert_not_called()
                run.assert_not_called()

    def test_corrupted_rollback_bytes_cannot_replace_runtime_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            previous = path / 'previous'
            previous.mkdir()
            for name in upgrade.FILES:
                (previous / name).write_bytes(b'changed')
            with patch.object(upgrade, 'read_private', side_effect=lambda p: p.read_bytes()), \
                 patch.object(upgrade, 'atomic_private') as write, patch.object(upgrade, 'replace_services') as replace:
                with self.assertRaisesRegex(ValueError, 'Rollback manifest differs'):
                    upgrade.restore_previous(path, {'previousManifestSha256': 'expected'})
                write.assert_not_called()
                replace.assert_not_called()

    def test_unauthorized_proxy_network_member_rejected(self):
        network = {'Id': 'network', 'Driver': 'bridge', 'Internal': False,
                   'Labels': {'com.alterward.owner': 'true'},
                   'Containers': {'proxy': {}, 'owner-web': {}, 'unexpected': {}}}
        with patch.object(upgrade, 'docker', return_value=CompletedProcess([], 0, json.dumps([network]).encode(), b'')), \
             patch.object(upgrade, 'project_ids', return_value=['owner-web']), \
             patch.object(upgrade, 'proxy_container', return_value={'Id': 'proxy'}):
            with self.assertRaises(ValueError):
                upgrade.proxy_network()

    def test_proxy_network_accepts_only_the_existing_shared_proxy(self):
        network = {'Id': 'network', 'Driver': 'bridge', 'Internal': False,
                   'Labels': {'com.alterward.owner': 'true'},
                   'Containers': {'proxy': {}, 'owner-web': {}, 'owner-api': {}}}
        with patch.object(upgrade, 'docker', return_value=CompletedProcess([], 0, json.dumps([network]).encode(), b'')), \
             patch.object(upgrade, 'project_ids', return_value=['owner-web', 'owner-api']), \
             patch.object(upgrade, 'proxy_container', return_value={'Id': 'proxy'}):
            self.assertEqual(upgrade.proxy_network(), {'id': 'network', 'foreignMembers': ['proxy']})

    def test_unrelated_neighbour_restart_is_reported_without_failing_owner_health(self):
        prepared = {'foreignContainers': {'legacy': {'restarts': 0}},
                    'proxyNetwork': {'id': 'network'}}
        with patch.object(upgrade, 'inspect_owner', return_value={'api': {'Id': 'fixture-api'}}), \
             patch.object(upgrade, 'docker', return_value=CompletedProcess([], 0, b'{"anonymousDenied":4}', b'')), \
             patch.object(upgrade, 'foreign_state', return_value={'legacy': {'restarts': 1}}), \
             patch.object(upgrade, 'proxy_network', return_value=prepared['proxyNetwork']):
            result = upgrade.verify_release(Path('/fixture'), {}, 'fixture-image', prepared)
            self.assertEqual(result['anonymousDenied'], 4)
            self.assertFalse(result['existingForeignContainersUnchanged'])

    def test_candidate_archive_drift_cannot_make_new_rights_eligible_for_old_restore(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            (path / 'previous').mkdir()
            values = {'server.env': b'original-env', 'manifest.json': b'original-manifest',
                      'effective-compose.json': b'original-config', 'pinned-image.json': b'original-pin'}
            prepared = {'previousManifestSha256': upgrade.sha(values['manifest.json']),
                        'previousFilesSha256': {name: upgrade.sha(value) for name, value in values.items()},
                        'candidateFilesSha256': {name: upgrade.sha(value) for name, value in values.items()}}
            for name, value in values.items():
                (path / name).write_bytes(value)
                (path / 'previous' / name).write_bytes(value)
            (path / 'server.env').write_bytes(b'changed-rights')
            with patch.object(upgrade, 'read_private', side_effect=lambda p: p.read_bytes()), \
                 patch.object(upgrade, 'atomic_private') as writes:
                with self.assertRaisesRegex(ValueError, 'Prepared candidate files changed'):
                    upgrade.rollback_inputs(path, prepared)
                writes.assert_not_called()
            self.assertEqual((path / 'server.env').read_bytes(), b'changed-rights')

    def exercise_apply(self, failure=None):
        with tempfile.TemporaryDirectory() as temporary, ExitStack() as patches:
            root = Path(temporary)
            directory, path, source = root / 'owner', root / 'candidate', root / 'source'
            directory.mkdir()
            path.mkdir()
            (path / 'previous').mkdir()
            for name in ['deploy/compose.yaml', 'deploy/compose.contabo.yaml', 'deploy/closed-site-owner.flags.env']:
                file = source / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(b'synthetic-source')
            ca = root / 'ca.crt'
            ca.write_bytes(b'public-ca')
            old_config, new_config = self.config('sha256:old'), self.config('sha256:new')
            old_env = b"ALTERWARD_TAG='contabo-bbbbbbbbbbbb'\nAI_PROJECT_BUDGET_USD='0'\n"
            new_env = upgrade.image_only_environment(old_env.decode(), 'alterward:contabo-aaaaaaaaaaaa').encode()
            common = {'sourceComposeSha256': upgrade.source_hash(source),
                      'databaseCaSha256': upgrade.sha(ca.read_bytes()),
                      'accessConfigurationSha256': upgrade.sha(upgrade.encoded({}))}
            old = {**common, 'commit': 'b' * 40, 'imageId': 'sha256:old',
                   'ownerEnvironmentSha256': upgrade.sha(old_env),
                   'effectiveComposeSha256': upgrade.sha(upgrade.frozen(old_config))}
            new = {**common, 'commit': 'a' * 40, 'imageId': 'sha256:new',
                   'ownerEnvironmentSha256': upgrade.sha(new_env),
                   'effectiveComposeSha256': upgrade.sha(upgrade.frozen(new_config))}
            data = {'server.env': old_env, 'manifest.json': upgrade.encoded(old),
                    'effective-compose.json': upgrade.frozen(old_config), 'pinned-image.json': b'old-override'}
            candidate = {'server.env': new_env, 'manifest.json': upgrade.encoded(new),
                         'effective-compose.json': upgrade.frozen(new_config), 'pinned-image.json': b'new-override'}
            for name in upgrade.FILES:
                (directory / name).write_bytes(data[name])
                (path / 'previous' / name).write_bytes(data[name])
                (path / name).write_bytes(candidate[name])
            prepared = {**new, 'previousManifestSha256': upgrade.sha(data['manifest.json']),
                        'previousFilesSha256': {name: upgrade.sha(value) for name, value in data.items()},
                        'candidateFilesSha256': {name: upgrade.sha(value) for name, value in candidate.items()},
                        'foreignContainers': {'proxy': {'restart': 0}},
                        'proxyNetwork': {'id': 'network', 'foreignMembers': ['proxy']}}
            (path / 'prepared.json').write_bytes(upgrade.encoded(prepared))
            request = {'buildProof': {'commit': 'a' * 40, 'imageTag': 'alterward:contabo-aaaaaaaaaaaa'},
                       'previousBuildProof': {'sourceDirectory': str(source)},
                       'preparedProof': prepared, 'access': {}}
            for name, value in [('DIRECTORY', directory), ('CA', ca)]:
                patches.enter_context(patch.object(upgrade, name, value))
            patches.enter_context(patch.object(upgrade, 'baseline', return_value=(data, old, old_config)))
            patches.enter_context(patch.object(upgrade, 'prepared_path', return_value=path))
            patches.enter_context(patch.object(upgrade, 'read_private', side_effect=lambda p: p.read_bytes()))
            patches.enter_context(patch.object(upgrade, 'validate_inputs', return_value=(source, new['imageId'], {}, {})))
            patches.enter_context(patch.object(upgrade, 'render_owner', return_value=new_config))
            patches.enter_context(patch.object(upgrade, 'foreign_state', return_value=prepared['foreignContainers']))
            patches.enter_context(patch.object(upgrade, 'proxy_network', return_value=prepared['proxyNetwork']))
            queue = patches.enter_context(patch.object(upgrade, 'queue_check', return_value={
                'pendingJobs': 0, 'databaseTlsVerified': True, 'databaseTlsHostnameVerified': True}))
            replace = patches.enter_context(patch.object(upgrade, 'replace_services'))
            commands = patches.enter_context(patch.object(upgrade, 'run', return_value=CompletedProcess(
                [], 0, json.dumps(old_config).encode(), b'')))
            patches.enter_context(patch.object(upgrade.signal, 'signal'))
            verifications = [ValueError('post-start failed'), {'anonymousDenied': 4}] if failure == 'health' else None
            if failure == 'rights-drift':
                def changed_rights(*args):
                    (directory / 'server.env').write_bytes(b"CLOSED_SITE_ALLOWED_EMAILS='revoked'\n")
                    raise ValueError('post-start drift')
                verifications = changed_rights
            patches.enter_context(patch.object(upgrade, 'verify_release', side_effect=verifications,
                                              return_value={'anonymousDenied': 4}))
            writes = []
            def write(p, value):
                writes.append(p.name)
                if failure == 'promotion' and sum(name in upgrade.FILES for name in writes) == 2:
                    raise OSError('one interrupted promotion write')
                p.write_bytes(value)
            patches.enter_context(patch.object(upgrade, 'atomic_private', side_effect=write))
            if failure:
                with self.assertRaises((ValueError, OSError)):
                    upgrade.apply(request)
                if failure == 'rights-drift':
                    self.assertEqual(replace.call_count, 1)
                    self.assertEqual((directory / 'server.env').read_bytes(), b"CLOSED_SITE_ALLOWED_EMAILS='revoked'\n")
                    self.assertTrue((path / 'rollback-failed.json').is_file())
                    self.assertFalse((path / 'rolled-back.json').exists())
                    self.assertIn('stop', commands.call_args_list[-1].args[0])
                else:
                    self.assertEqual(replace.call_count, 2)
                    self.assertTrue((path / 'rolled-back.json').is_file())
                    for name, value in data.items():
                        self.assertEqual((directory / name).read_bytes(), value)
            else:
                result = upgrade.apply(request)
                self.assertTrue(result['upgraded'])
                self.assertFalse(result['databaseRestored'])
                self.assertEqual(replace.call_count, 1)
                self.assertTrue((path / 'applied.json').is_file())
                for name, value in candidate.items():
                    self.assertEqual((directory / name).read_bytes(), value)
                with self.assertRaisesRegex(ValueError, 'Recovery is only for an interrupted upgrade'):
                    upgrade.recover(request)
            self.assertEqual(queue.call_count, 2)
            self.assertTrue((path / 'applying.json').is_file())
            journal_state = json.loads((path / 'applying.json').read_bytes())['state']
            expected_state = 'applied' if not failure else 'rollback-failed' if failure == 'rights-drift' else 'rolled-back'
            self.assertEqual(journal_state, expected_state)
            for call in commands.call_args_list:
                args = call.args[0]
                self.assertEqual(args[:4], ['docker', 'compose', '--project-name', 'alterward-owner'])
                self.assertNotIn('down', args)
                self.assertNotIn('restart', args)

    def test_successful_apply_promotes_only_pinned_candidate(self):
        self.exercise_apply()

    def test_failed_post_start_verification_restores_old_image_and_all_files(self):
        self.exercise_apply('health')

    def test_interruption_during_partial_file_promotion_restores_complete_old_manifest(self):
        self.exercise_apply('promotion')

    def test_unrelated_rights_change_is_preserved_and_only_owner_is_stopped(self):
        self.exercise_apply('rights-drift')


if __name__ == '__main__':
    unittest.main()

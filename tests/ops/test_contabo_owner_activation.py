import importlib.util
import json
from pathlib import Path
from subprocess import CompletedProcess
import sys
import tempfile
import unittest
from unittest.mock import patch

from test_contabo_target import ROOT, owner

sys.modules['alterward_owner'] = owner
spec = importlib.util.spec_from_file_location('activation', ROOT / 'scripts/ops/contabo-owner-activation.py')
activation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activation)


class OwnerActivationTests(unittest.TestCase):
    def test_rendered_dollar_values_cannot_become_second_pass_env_references(self):
        value = {'services': {'api': {'environment': {'SECRET': 'literal$HOST_SECRET$$tail'},
                                     'command': ['node', '$literal']}}, 'number': 1}
        frozen = json.loads(activation.frozen(value))
        self.assertEqual(frozen['services']['api']['environment']['SECRET'],
                         'literal$$HOST_SECRET$$$$tail')
        self.assertEqual(frozen['services']['api']['command'], ['node', '$$literal'])
        self.assertEqual(frozen['number'], 1)
        self.assertEqual(value['services']['api']['environment']['SECRET'], 'literal$HOST_SECRET$$tail')

    def inputs(self, directory):
        source = directory / 'source'
        for name in ['deploy/compose.yaml', 'deploy/compose.contabo.yaml',
                     'deploy/closed-site-owner.flags.env']:
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'fixture')
        environment, config, ca = b"FLAG='false'\n", b'{"fixture":true}\n', b'public-ca'
        manifest = {'commit': 'a' * 40, 'imageId': 'sha256:' + 'b' * 64,
                    'ownerEnvironmentSha256': activation.sha(environment),
                    'effectiveComposeSha256': activation.sha(config),
                    'sourceComposeSha256': activation.source_hash(source),
                    'databaseCaSha256': activation.sha(ca),
                    'accessConfigurationSha256': activation.sha(activation.encoded({}))}
        return source, environment, config, ca, manifest

    def test_env_flag_or_tag_drift_aborts_before_any_docker_command(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, environment, config, ca, manifest = self.inputs(Path(temporary))
            ca_file = Path(temporary) / 'ca.crt'
            ca_file.write_bytes(ca)
            for changed in [b"FLAG='true'\n", environment + b"ALTERWARD_TAG='other'\n",
                            environment + b'\n']:
                data = {'server.env': changed, 'manifest.json': activation.encoded(manifest),
                        'effective-compose.json': config, 'pinned-image.json': b'{}'}
                with self.subTest(changed=changed), patch.object(activation, 'CA', ca_file), \
                     patch.object(activation, 'project_ids', return_value=[]), \
                     patch.object(activation, 'read_private', side_effect=lambda p: data[p.name]), \
                     patch.object(activation, 'validate_inputs', return_value=(source, manifest['imageId'], {}, {})), \
                     patch.object(activation, 'docker') as docker, patch.object(activation, 'run') as run:
                    with self.assertRaises(ValueError):
                        activation.launch({'stageProof': manifest, 'access': {}})
                    docker.assert_not_called()
                    run.assert_not_called()

    def test_frozen_config_source_ca_or_manifest_drift_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, environment, config, ca, manifest = self.inputs(Path(temporary))
            activation.verify_hashes(manifest, manifest, environment, config, source, ca)
            for changed_config, changed_ca, expected in [(config + b' ', ca, manifest),
                    (config, ca + b'other', manifest),
                    (config, ca, {**manifest, 'imageId': 'sha256:' + 'c' * 64})]:
                with self.assertRaises(ValueError):
                    activation.verify_hashes(manifest, expected, environment, changed_config, source, changed_ca)
            (source / 'deploy/compose.yaml').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                activation.verify_hashes(manifest, manifest, environment, config, source, ca)

    def running(self):
        config, items = {'services': {}}, []
        for name in ['web', 'api', 'worker']:
            config['services'][name] = {'environment': {'CLOSED_BETA_ENABLED': 'true',
                    'AI_PROJECT_BUDGET_USD': '0'}, 'mem_limit': 1024, 'pids_limit': 256, 'cpus': 1.0}
            items.append({'Image': 'sha256:expected', 'Config': {'User': 'node',
                    'Labels': {'com.docker.compose.project': 'alterward-owner',
                               'com.docker.compose.service': name},
                    'Env': ['CLOSED_BETA_ENABLED=true', 'AI_PROJECT_BUDGET_USD=0']},
                'HostConfig': {'PortBindings': {}, 'CapDrop': ['ALL'],
                    'SecurityOpt': ['no-new-privileges:true'], 'Init': True,
                    'Memory': 1024, 'PidsLimit': 256, 'NanoCpus': 1_000_000_000},
                'NetworkSettings': {'Ports': {'3000/tcp': None}},
                'State': {'Status': 'running', 'Health': {'Status': 'healthy'}},
                'RestartCount': 0, 'Mounts': [] if name == 'web' else [
                    {'Destination': '/run/secrets/supabase-ca.crt',
                     'Source': str(activation.CA), 'RW': False}]})
        return config, items

    def test_running_gate_image_ports_health_and_secret_mount_fail_closed(self):
        config, items = self.running()
        self.assertEqual(set(activation.validate_running(items, config, 'sha256:expected')),
                         {'web', 'api', 'worker'})
        mutations = [lambda c: c[0].update(Image='sha256:other'),
                     lambda c: c[1]['Config']['Env'].append('ANTHROPIC_API_KEY=unexpected'),
                     lambda c: c[1]['Config']['Env'].append('AI_PROJECT_BUDGET_USD=1'),
                     lambda c: c[2].update(RestartCount=1),
                     lambda c: c[0]['NetworkSettings']['Ports'].update({'3000/tcp': [{'HostPort': '3000'}]}),
                     lambda c: c[1]['State']['Health'].update(Status='unhealthy'),
                     lambda c: c[2]['Mounts'][0].update(RW=True),
                     lambda c: c[0]['HostConfig'].update(Memory=0)]
        for mutate in mutations:
            _, changed = self.running()
            mutate(changed)
            with self.assertRaises(ValueError):
                activation.validate_running(changed, config, 'sha256:expected')

    def test_failed_post_start_check_removes_only_owner_project(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, environment, _, ca, manifest = self.inputs(Path(temporary))
            config = {'services': {'fixture': {}}}
            config_bytes = activation.encoded(config)
            manifest['effectiveComposeSha256'] = activation.sha(config_bytes)
            ca_file = Path(temporary) / 'ca.crt'
            ca_file.write_bytes(ca)
            data = {'server.env': environment, 'manifest.json': activation.encoded(manifest),
                    'effective-compose.json': config_bytes, 'pinned-image.json': b'{}'}
            network = {'Driver': 'bridge', 'Internal': False, 'Containers': {},
                       'Labels': {'com.alterward.owner': 'true'}}
            def docker(*args):
                value = b'network-id' if args[:2] == ('network', 'ls') else \
                        activation.encoded([network]) if args[:2] == ('network', 'inspect') else b'[]'
                return CompletedProcess(args, 0, value, b'')
            with patch.object(activation, 'CA', ca_file), \
                 patch.object(activation, 'project_ids', side_effect=[[], ['owner-container'], []]), \
                 patch.object(activation, 'read_private', side_effect=lambda p: data[p.name]), \
                 patch.object(activation, 'validate_inputs', return_value=(source, manifest['imageId'], {}, {})), \
                 patch.object(activation, 'render_owner', return_value=config), \
                 patch.object(activation, 'existing_state', return_value={'legacy': {'status': 'running'}}), \
                 patch.object(activation, 'docker', side_effect=docker), \
                 patch.object(activation, 'run', return_value=CompletedProcess([], 0, b'{}', b'')) as command:
                with self.assertRaises(ValueError):
                    activation.launch({'stageProof': manifest, 'access': {}})
            last = command.call_args_list[-1].args[0]
            self.assertEqual(last[:4], ['docker', 'compose', '--project-name', 'alterward-owner'])
            self.assertEqual(last[-2:], ['down', '--remove-orphans'])
            self.assertFalse(any('restart' in call.args[0] for call in command.call_args_list))


if __name__ == '__main__':
    unittest.main()

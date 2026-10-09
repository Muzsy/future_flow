"""Exercise the actual upgrade/rollback mutations inside the target fixture.

Only a caller-created internal disposable project and exact synthetic database
are accepted. Fixture rendering bypasses the production host/credential checks;
the mutation, manifest, image-only comparison, queue/TLS and post-start guards
run unchanged. This does not authorize or update the live owner project.
"""

import copy
import json
from pathlib import Path
import re

from alterward_backup import confined, private_directory, private_file
from alterward_target import ROOT, docker, run, owner_overlay, validate_owner_configuration
import alterward_activation as activation
import alterward_upgrade as upgrade


def exercise(request):
    project, network = request['project'], request['network']
    if not re.fullmatch(r'alterward-rehearsal-[a-f0-9]{12}', project) or network != project + '-proxy':
        raise ValueError('Disposable target project required')
    root = confined(ROOT, Path(request['fixture']))
    if not root.name.startswith('runtime-') or root.is_symlink():
        raise ValueError('Confined temporary runtime required')
    env = request['environment']
    required = {'DATABASE_URL': 'postgresql://postgres:rehearsal_unused@postgres:5432/postgres',
                'DATABASE_SSL_CA_HOST_FILE': str(root / 'ca.crt'),
                'PUBLIC_HOST': 'localhost', 'ALTERWARD_PROXY_NETWORK': network,
                'OPENAI_API_KEY': 'rehearsal_openai_unused',
                'SUPABASE_SERVICE_ROLE_KEY': 'rehearsal_admin_unused',
                'NEXT_PUBLIC_SUPABASE_URL': 'https://example.supabase.co',
                'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_rehearsal_unused',
                'PUBLICATION_LINK_SECRET': '1' * 64, 'AI_PROJECT_BUDGET_USD': '0',
                'AI_USER_BUDGET_USD': '0', 'CLOSED_BETA_USER_IDS': ''}
    if any(env.get(key) != value for key, value in required.items()) or env.get('ANTHROPIC_API_KEY'):
        raise ValueError('Exact synthetic credentials and zero allowance required')
    access = request['access']
    base = copy.deepcopy(request['configuration'])
    validate_owner_configuration(base, access, owner_overlay(request['ownerFlags']))
    base['services'] = {name: base['services'][name] for name in ['web', 'api', 'worker']}
    if any(service.get('ports') for service in base['services'].values()):
        raise ValueError('Fixture app cannot expose public ports')
    proofs = [request['previousBuildProof'], request['buildProof']]
    if proofs[0]['imageId'] == proofs[1]['imageId']:
        raise ValueError('Two different pinned images required')
    for proof in proofs:
        if not re.fullmatch(r'[a-f0-9]{40}', proof['commit']):
            raise ValueError('Exact fixture source required')
        source = confined(ROOT, Path(proof['sourceDirectory']))
        if owner_overlay((source / 'deploy/closed-site-owner.flags.env').read_text()) != owner_overlay(request['ownerFlags']):
            raise ValueError('Fixture flags differ from image source')
        inspected = json.loads(docker('image', 'inspect', proof['imageTag']).stdout)[0]
        if inspected['Id'] != proof['imageId'] or inspected['Config']['User'] != 'node':
            raise ValueError('Pinned fixture image changed')

    def own_ids():
        ids = docker('ps', '-aq', '--no-trunc', '--filter',
                     'label=com.docker.compose.project=' + project).stdout.decode().split()
        items = json.loads(docker('inspect', *ids).stdout) if ids else []
        return [item['Id'] for item in items if item['Config']['Labels'].get(
            'com.docker.compose.service') in ['web', 'api', 'worker']]

    def fixture_network():
        value = json.loads(docker('network', 'inspect', network).stdout)[0]
        if (value['Driver'] != 'bridge' or not value['Internal'] or
                value['Labels'].get('com.alterward.rehearsal') != project):
            raise ValueError('Isolated fixture network required')
        foreign = sorted(set(value['Containers']) - set(own_ids()))
        if len(foreign) != 2:
            raise ValueError('Only fixture database and proxy may share the network')
        items = json.loads(docker('inspect', *foreign).stdout)
        if ({item['Config']['Labels'].get('com.docker.compose.service') for item in items}
                != {'postgres', 'smoke-proxy'} or any(item['Config']['Labels'].get(
                'com.docker.compose.project') != project for item in items)):
            raise ValueError('Unexpected fixture peer')
        return {'id': value['Id'], 'foreignMembers': foreign}

    def fixture_inputs(value, text):
        proof = value['buildProof']
        if proof not in proofs:
            raise ValueError('Unknown fixture image source')
        parsed = upgrade.server_environment(text)
        expected = {**env, 'ALTERWARD_TAG': proof['imageTag'].split(':', 1)[1]}
        if parsed != expected or value['access'] != access or value['ownerFlags'] != request['ownerFlags']:
            raise ValueError('Fixture runtime input changed')
        return Path(proof['sourceDirectory']), proof['imageId'], owner_overlay(request['ownerFlags']), parsed

    def fixture_render(source, image, flags, selected_access, env_file, override_file):
        # This exact three-service fixture shape was validated before any mutation.
        text = upgrade.read_private(env_file).decode()
        proof = next(p for p in proofs if p['imageId'] == image)
        fixture_inputs({'buildProof': proof, 'access': selected_access,
                        'ownerFlags': request['ownerFlags']}, text)
        if Path(source) != Path(proof['sourceDirectory']):
            raise ValueError('Wrong fixture source')
        result = copy.deepcopy(base)
        for service in result['services'].values():
            service['image'] = image
            service['pull_policy'] = 'never'
        return result

    upgrade.PROJECT = activation.PROJECT = project
    upgrade.NETWORK = activation.NETWORK = network
    upgrade.CA = activation.CA = root / 'ca.crt'
    upgrade.project_ids = activation.project_ids = own_ids
    upgrade.proxy_network = fixture_network
    upgrade.validate_inputs = fixture_inputs
    upgrade.render_owner = fixture_render
    original_verify = upgrade.verify_release
    results = []
    for name in ['forced-post-check-failure', 'successful-upgrade']:
        directory = root / ('owner-upgrade-' + name)
        private_directory(directory)
        upgrade.DIRECTORY = directory
        previous = proofs[0]
        text = ''.join(key + "='" + value + "'\n" for key, value in
                       {**env, 'ALTERWARD_TAG': previous['imageTag'].split(':', 1)[1]}.items())
        private_file(directory / 'server.env', text.encode())
        override = {'services': {service: {'image': previous['imageId'], 'pull_policy': 'never'}
                                for service in ['web', 'api', 'worker']}}
        private_file(directory / 'pinned-image.json', upgrade.encoded(override))
        config = fixture_render(Path(previous['sourceDirectory']), previous['imageId'], {}, access,
                                directory / 'server.env', directory / 'pinned-image.json')
        private_file(directory / 'effective-compose.json', upgrade.frozen(config))
        manifest = {'commit': previous['commit'], 'imageId': previous['imageId'],
                    'ownerEnvironmentSha256': upgrade.sha(text.encode()),
                    'effectiveComposeSha256': upgrade.sha(upgrade.frozen(config)),
                    'sourceComposeSha256': upgrade.source_hash(Path(previous['sourceDirectory'])),
                    'databaseCaSha256': upgrade.sha((root / 'ca.crt').read_bytes()),
                    'accessConfigurationSha256': upgrade.sha(upgrade.encoded(access))}
        private_file(directory / 'manifest.json', upgrade.encoded(manifest))
        upgrade.replace_services(directory / 'effective-compose.json')
        upgrade.inspect_owner(config, previous['imageId'])
        value = {'buildProof': proofs[1], 'previousBuildProof': previous,
                 'previousStageProof': manifest, 'access': access, 'ownerFlags': request['ownerFlags']}
        prepared = upgrade.prepare(value)
        value['preparedProof'] = prepared['preparedProof']
        failed_once = False
        def verify(*args):
            nonlocal failed_once
            checks = original_verify(*args)
            if name == 'forced-post-check-failure' and not failed_once:
                failed_once = True
                raise RuntimeError('Deliberate fixture post-check failure')
            return checks
        upgrade.verify_release = verify
        if name == 'forced-post-check-failure':
            try:
                upgrade.apply(value)
                raise ValueError('Deliberate failure must not be accepted')
            except RuntimeError as error:
                if str(error) != 'Deliberate fixture post-check failure':
                    raise
            upgrade.inspect_owner(config, previous['imageId'])
            if json.loads(upgrade.read_private(directory / 'manifest.json')) != manifest:
                raise ValueError('Fixture rollback did not restore manifest')
            rollback = json.loads(upgrade.read_private(upgrade.prepared_path(proofs[1]['commit']) / 'rolled-back.json'))
            if not rollback['rollbackVerified']:
                raise ValueError('Actual rollback proof missing')
            results.append({'case': name, 'oldImageRestored': True, 'manifestRestored': True,
                            'queueTlsVerified': True, 'anonymousDenied': 4})
        else:
            result = upgrade.apply(value)
            if not result['upgraded'] or result['imageId'] != proofs[1]['imageId'] or result['paidAiCalls'] != 0:
                raise ValueError('Actual fixture upgrade proof missing')
            results.append({'case': name, 'newImageRunning': True, 'manifestPromoted': True,
                            'queueTlsVerified': True, 'anonymousDenied': 4})
    upgrade.verify_release = original_verify
    return {'upgradeAndRollback': 'passed', 'cases': results,
            'productionConfigurationRenderExercised': False, 'fixtureRenderUsed': True,
            'liveOwnerChanged': False, 'paidAiCalls': 0, 'databaseRestored': False,
            'dnsChanged': False, 'sharedProxyChanged': False}

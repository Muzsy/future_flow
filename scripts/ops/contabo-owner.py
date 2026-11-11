"""Real owner configuration preflight over pinned SSH; never starts an app.

Only temporary root-only files are written. No live DB, provider, DNS, proxy,
email or container mutation. A successful preflight is not a deployment.
"""

import hashlib
import json
import re
import sys
import tempfile
from pathlib import Path

from alterward_backup import private_file, confined
from alterward_target import (
    ROOT, run, docker, existing_state, owner_overlay, validate_owner_configuration,
)


def server_environment(text):
    values = {}
    for line in text.splitlines():
        if not line or line.startswith('#'):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)='([^'\r\n\\]*)'", line)
        if not match or match[1] in values:
            raise ValueError('Invalid protected owner environment')
        values[match[1]] = match[2]
    return values


def validate_inputs(request, text):
    proof = request['buildProof']
    if not re.fullmatch(r'[a-f0-9]{40}', proof['commit']):
        raise ValueError('Exact application commit required')
    source = confined(ROOT, Path(proof['sourceDirectory']))
    image = proof['imageId']
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
        raise ValueError('Pinned image required')
    inspected = json.loads(docker('image', 'inspect', proof['imageTag']).stdout)[0]
    if inspected['Id'] != image or inspected['Config']['User'] != 'node':
        raise ValueError('Image changed after rehearsal')
    flags = owner_overlay(request['ownerFlags'])
    source_flags = owner_overlay((source / 'deploy/closed-site-owner.flags.env').read_text())
    if source_flags != flags:
        raise ValueError('Overlay differs from the built release source')
    environment = server_environment(text)
    if any(environment.get(key) != value for key, value in flags.items()):
        raise ValueError('Protected server env differs from owner matrix')
    if (environment.get('PUBLIC_HOST') != 'alterward.com' or
            environment.get('ALTERWARD_TAG') != proof['imageTag'].split(':', 1)[1] or
            environment.get('OPENAI_API_KEY') != 'alterward_owner_provider_access_disabled' or
            environment.get('ANTHROPIC_API_KEY') or environment.get('SMTP_PASSWORD')):
        raise ValueError('Owner-only provider/host configuration differs')
    return source, image, flags, environment


def render_owner(source, image, flags, access, env_file, override_file):
    config = json.loads(run([
        'docker', 'compose', '--project-name', 'alterward-owner',
        '--env-file', str(env_file), '-f', str(source / 'deploy/compose.contabo.yaml'),
        '-f', str(override_file), 'config', '--format', 'json',
    ]).stdout)
    if set(config['services']) != {'web', 'api', 'worker'}:
        raise ValueError('Unexpected real owner service set')
    validate_owner_configuration(config, access, flags)
    for service in config['services'].values():
        if service.get('ports') or service['image'] != image or service['pull_policy'] != 'never':
            raise ValueError('Real owner image/port boundary differs')
        if (service.get('cap_drop') != ['ALL'] or
                'no-new-privileges:true' not in service.get('security_opt', []) or
                not service.get('init')):
            raise ValueError('Real runtime protection differs')
    return config


def preflight(request):
    source, image, flags, environment = validate_inputs(request, request['ownerEnvironment'])
    proof = request['buildProof']
    baseline = existing_state()
    with tempfile.TemporaryDirectory(prefix='owner-preflight-', dir=ROOT) as temporary:
        directory = Path(temporary)
        env_file = directory / 'server.env'
        private_file(env_file, request['ownerEnvironment'].encode())
        override = {'services': {name: {'image': image, 'pull_policy': 'never'}
                                for name in ['web', 'api', 'worker']}}
        override_file = directory / 'pinned-image.json'
        private_file(override_file, json.dumps(override).encode())
        render_owner(source, image, flags, request['access'], env_file, override_file)
        if existing_state() != baseline:
            raise ValueError('Preflight changed existing containers')
    return {'commit': proof['commit'], 'imageId': image,
            'ownerEnvironmentSha256': hashlib.sha256(request['ownerEnvironment'].encode()).hexdigest(),
            'renderedActualOwnerEnvironment': True, 'fullOwnerMatrixValidated': True,
            'imageIdPinned': True, 'automaticImagePullDisabled': True,
            'publicPorts': 0, 'paidProviderCredentialPresent': False,
            'betaWindowActive': False, 'existingContainersUnchanged': True,
            'temporaryCredentialsRemoved': True, 'containersStarted': 0,
            'databaseConnections': 0, 'paidAiCalls': 0,
            'operatorScriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
            if '__file__' in globals() else request['operatorScriptSha256']}


if __name__ == '__main__':
    try:
        result = preflight(json.load(sys.stdin))
        print(json.dumps({'ok': True, 'result': result}))
    except Exception:
        # Never return the rendered config, environment, addresses or raw errors.
        print(json.dumps({'ok': False, 'phase': 'real-owner-preflight'}))
        sys.exit(1)

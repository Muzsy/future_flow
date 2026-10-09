"""Image-only owner upgrade with immutable preparation and scoped rollback.

The previous manifest, CA, Access and complete Compose shape are verified.
Only the three existing Alterward services are replaced. No migration, DB
restore, DNS/proxy edit, network disconnect or provider activation occurs.
"""

import copy
import json
import os
from pathlib import Path
import re
import signal
import sys
import tempfile
import time

from alterward_backup import private_directory, private_file, proxy_container
from alterward_target import docker, existing_state, run
from alterward_owner import validate_inputs, render_owner, server_environment
from alterward_activation import (
    DIRECTORY, PROJECT, NETWORK, CA, FILES, INTERRUPTION_SIGNALS, interrupted,
    encoded, frozen, sha, read_private, exact_file, project_ids, source_hash,
    verify_hashes, validate_running,
)

QUEUE_PROBE = """import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {X509Certificate} from 'node:crypto';import {TLSSocket} from 'node:tls';const {Client}=createRequire('/app/packages/database/package.json')('pg');const ca=readFileSync(process.env.DATABASE_SSL_CA_FILE,'utf8');const host=new URL(process.env.DATABASE_URL).hostname;const client=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca},connectionTimeoutMillis:10000});try{await client.connect();const socket=client.connection.stream;if(!(socket instanceof TLSSocket)||!socket.encrypted||socket.authorized!==true||client.ssl.ca!==ca||client.ssl.rejectUnauthorized!==true||!new X509Certificate(socket.getPeerCertificate().raw).checkHost(host))throw Error('Database TLS guard failed');await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='10s'");for(const table of ['ff_jobs','aw_jobs','aw_shared_jobs','aw_public_review_jobs','aw_public_content_reviews']){const {rows}=await client.query(`SELECT count(*)::int AS pending FROM ${table} WHERE status IN ('queued','running','validating')`);if(rows[0].pending!==0)throw Error('Owner queue is not empty')}await client.query('COMMIT');console.log(JSON.stringify({pendingJobs:0,databaseTlsVerified:true,databaseTlsHostnameVerified:true}))}finally{await client.end()}"""
ORIGIN_PROBE = """let count=0;for(const url of ['http://alterward-web:3000/','http://alterward-web:3000/discover','http://127.0.0.1:4000/api/public/discovery','http://127.0.0.1:4000/api/public/config']){const r=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'manual'});if(r.status!==403||!r.headers.get('cache-control')?.includes('no-store'))throw Error('Origin access boundary failed');count++}console.log(JSON.stringify({anonymousDenied:count}));"""


def compose(path):
    return ['docker', 'compose', '--project-name', PROJECT, '-f', str(path)]


def config_without_images(value):
    result = copy.deepcopy(value)
    if set(result['services']) != {'web', 'api', 'worker'}:
        raise ValueError('Exactly three owner services required')
    for service in result['services'].values():
        service['image'] = '<pinned-image>'
    return result


def image_only_environment(old_text, image_tag):
    # Change one line in the original protected file; never reconstruct secrets.
    if not re.fullmatch(r'alterward:contabo-[a-f0-9]{12}', image_tag):
        raise ValueError('Exact target tag required')
    new_text, count = re.subn(r"^ALTERWARD_TAG='[^'\r\n]*'$",
                             "ALTERWARD_TAG='" + image_tag.split(':', 1)[1] + "'",
                             old_text, flags=re.MULTILINE)
    if count != 1:
        raise ValueError('One original image tag required')
    old, new = server_environment(old_text), server_environment(new_text)
    old.pop('ALTERWARD_TAG')
    new.pop('ALTERWARD_TAG')
    if old != new:
        raise ValueError('Image-only environment changed another field')
    return new_text


def inspect_owner(config, image):
    ids = project_ids()
    if len(ids) != 3:
        raise ValueError('Expected existing three-service owner stack')
    items = json.loads(docker('inspect', *ids).stdout)
    return validate_running(items, config, image)


def foreign_state():
    own = set(project_ids())
    return {key: value for key, value in existing_state().items() if key not in own}


def proxy_network():
    value = json.loads(docker('network', 'inspect', NETWORK).stdout)[0]
    members = set(value['Containers']) - set(project_ids())
    proxy = proxy_container()['Id']
    if (value['Driver'] != 'bridge' or value['Internal'] or
            value['Labels'].get('com.alterward.owner') != 'true' or members != {proxy}):
        raise ValueError('Existing shared proxy network differs')
    return {'id': value['Id'], 'foreignMembers': sorted(members)}


def baseline(request):
    data = {name: read_private(DIRECTORY / name) for name in FILES}
    manifest = json.loads(data['manifest.json'])
    old_request = {**request, 'buildProof': request['previousBuildProof']}
    source, image, flags, _ = validate_inputs(old_request, data['server.env'].decode())
    verify_hashes(manifest, request['previousStageProof'], data['server.env'],
                  data['effective-compose.json'], source, CA.read_bytes())
    if manifest['accessConfigurationSha256'] != sha(encoded(request['access'])):
        raise ValueError('Previous Access differs')
    config = render_owner(source, image, flags, request['access'],
                          DIRECTORY / 'server.env', DIRECTORY / 'pinned-image.json')
    if frozen(config) != data['effective-compose.json']:
        raise ValueError('Previous render differs')
    inspect_owner(config, image)
    return data, manifest, config


def prepared_path(commit):
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('Exact candidate commit required')
    root = DIRECTORY / 'upgrades'
    private_directory(root)
    path = root / commit
    private_directory(path)
    return path


def prepare(request):
    before = existing_state()
    data, previous, old_config = baseline(request)
    text = image_only_environment(data['server.env'].decode(), request['buildProof']['imageTag'])
    source, image, flags, _ = validate_inputs(request, text)
    if image == previous['imageId']:
        raise ValueError('Candidate must be a different image')
    path = prepared_path(request['buildProof']['commit'])
    original = path / 'previous'
    private_directory(original)
    for name, value in data.items():
        exact_file(original / name, value)
    exact_file(path / 'server.env', text.encode())
    override = {'services': {name: {'image': image, 'pull_policy': 'never'}
                            for name in ['web', 'api', 'worker']}}
    exact_file(path / 'pinned-image.json', encoded(override))
    config = render_owner(source, image, flags, request['access'],
                          path / 'server.env', path / 'pinned-image.json')
    if config_without_images(config) != config_without_images(old_config):
        raise ValueError('Owner upgrade may change only service images')
    exact_file(path / 'effective-compose.json', frozen(config))
    roundtrip = json.loads(run(compose(path / 'effective-compose.json') +
                               ['config', '--format', 'json']).stdout)
    if roundtrip != config:
        raise ValueError('Candidate frozen Compose differs after roundtrip')
    manifest = {'commit': request['buildProof']['commit'], 'imageId': image,
                'ownerEnvironmentSha256': sha(text.encode()),
                'effectiveComposeSha256': sha(frozen(config)),
                'sourceComposeSha256': source_hash(source),
                'databaseCaSha256': previous['databaseCaSha256'],
                'accessConfigurationSha256': previous['accessConfigurationSha256']}
    exact_file(path / 'manifest.json', encoded(manifest))
    prepared = {**manifest, 'previousManifestSha256': sha(data['manifest.json']),
                'previousFilesSha256': {name: sha(value) for name, value in data.items()},
                'previousCommit': previous['commit'], 'previousImageId': previous['imageId'],
                'proxyNetwork': proxy_network(), 'foreignContainers': foreign_state()}
    exact_file(path / 'prepared.json', encoded(prepared))
    if existing_state() != before:
        raise ValueError('Preparation changed running containers')
    return {**prepared, 'preparedProof': prepared, 'prepared': True, 'containersStarted': 0,
            'databaseConnections': 0, 'paidAiCalls': 0, 'dnsChanged': False, 'proxyChanged': False}


def atomic_private(path, data):
    # Refuse links/aliases before replace; fsync bytes and directory metadata.
    read_private(path)
    handle, temporary = tempfile.mkstemp(prefix='.upgrade-', dir=path.parent)
    try:
        with os.fdopen(handle, 'wb') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def queue_check(config_path):
    result = json.loads(run(compose(config_path) + ['run', '-T', '--rm', '--no-deps',
        '--entrypoint', 'node', 'api', '--input-type=module', '-e', QUEUE_PROBE], timeout=60).stdout)
    if (result.get('pendingJobs') != 0 or not result.get('databaseTlsVerified') or
            not result.get('databaseTlsHostnameVerified')):
        raise ValueError('Read-only queue/TLS proof missing')
    return result


def verify_release(path, config, image, prepared):
    services = inspect_owner(config, image)
    checks = json.loads(docker('exec', services['api']['Id'], 'node', '--input-type=module',
                               '-e', ORIGIN_PROBE).stdout)
    if checks.get('anonymousDenied') != 4:
        raise ValueError('Origin probe incomplete')
    if foreign_state() != prepared['foreignContainers'] or proxy_network() != prepared['proxyNetwork']:
        raise ValueError('Shared proxy/legacy containers changed')
    return checks


def replace_services(path):
    run(compose(path) + ['up', '-d', '--no-deps', '--force-recreate', '--no-build',
        '--pull', 'never', '--wait', '--wait-timeout', '120', 'web', 'api', 'worker'], timeout=180)


def restore_previous(path, prepared):
    previous_path = path / 'previous'
    data = {name: read_private(previous_path / name) for name in FILES}
    if sha(data['manifest.json']) != prepared['previousManifestSha256']:
        raise ValueError('Rollback manifest differs')
    if {name: sha(value) for name, value in data.items()} != prepared['previousFilesSha256']:
        raise ValueError('Archived rollback files changed')
    # A partially promoted release may contain either original or candidate bytes.
    # An unrelated edit can represent revoked rights: never overwrite that drift.
    for name, value in data.items():
        current = read_private(DIRECTORY / name)
        candidate = read_private(path / name)
        if current not in (value, candidate):
            raise ValueError('Live runtime drift; refusing to restore previous rights')
    manifest = json.loads(data['manifest.json'])
    if (sha(data['server.env']) != manifest['ownerEnvironmentSha256'] or
            sha(data['effective-compose.json']) != manifest['effectiveComposeSha256'] or
            sha(CA.read_bytes()) != manifest['databaseCaSha256']):
        raise ValueError('Rollback bytes/CA changed')
    for name, value in data.items():
        atomic_private(DIRECTORY / name, value)
    replace_services(DIRECTORY / 'effective-compose.json')
    # Compose accepts escaped literal dollars; config returns effective values.
    config = json.loads(run(compose(DIRECTORY / 'effective-compose.json') +
                            ['config', '--format', 'json']).stdout)
    checks = verify_release(DIRECTORY, config, manifest['imageId'], prepared)
    return {**checks, 'rollbackVerified': True, 'restoredCommit': manifest['commit']}


def apply(request):
    data, previous, old_config = baseline(request)
    path = prepared_path(request['buildProof']['commit'])
    prepared = json.loads(read_private(path / 'prepared.json'))
    if prepared != request['preparedProof']:
        raise ValueError('Prepared proof differs')
    if (prepared['previousManifestSha256'] != sha(data['manifest.json']) or
            prepared['foreignContainers'] != foreign_state() or
            prepared['proxyNetwork'] != proxy_network()):
        raise ValueError('Live baseline changed after preparation')
    candidate = {name: read_private(path / name) for name in FILES}
    manifest = json.loads(candidate['manifest.json'])
    source, image, flags, _ = validate_inputs(request, candidate['server.env'].decode())
    verify_hashes(manifest, prepared, candidate['server.env'], candidate['effective-compose.json'],
                  source, CA.read_bytes())
    config = render_owner(source, image, flags, request['access'],
                          path / 'server.env', path / 'pinned-image.json')
    if (frozen(config) != candidate['effective-compose.json'] or
            config_without_images(config) != config_without_images(old_config) or
            image_only_environment(data['server.env'].decode(), request['buildProof']['imageTag']).encode()
            != candidate['server.env']):
        raise ValueError('Candidate no longer matches image-only preparation')
    journal = path / 'applying.json'
    if journal.exists() or journal.is_symlink():
        raise ValueError('Previous apply attempt requires explicit recovery inspection')
    queues = queue_check(path / 'effective-compose.json')
    private_file(journal, encoded({'preparedSha256': sha(encoded(prepared)), 'startedAt': time.time(),
                                 'previousImageId': previous['imageId'], 'candidateImageId': image}))
    attempted = False
    try:
        attempted = True
        run(compose(DIRECTORY / 'effective-compose.json') +
            ['stop', '--timeout', '60', 'web', 'api', 'worker'], timeout=90)
        queues = queue_check(path / 'effective-compose.json')
        replace_services(path / 'effective-compose.json')
        checks = verify_release(path, config, image, prepared)
        # No schema/data replay: promoting four runtime files only, with a journal.
        for name, value in candidate.items():
            atomic_private(DIRECTORY / name, value)
        verify_hashes(manifest, prepared, read_private(DIRECTORY / 'server.env'),
                      read_private(DIRECTORY / 'effective-compose.json'), source, CA.read_bytes())
        result = {**manifest, **checks, **queues, 'upgraded': True, 'runningServices': 3,
                  'imageOnly': True, 'paidAiCalls': 0, 'betaWindowActive': False,
                  'existingForeignContainersUnchanged': True, 'proxyChanged': False,
                  'dnsChanged': False, 'databaseRestored': False, 'publicPorts': 0}
        exact_file(path / 'applied.json', encoded(result))
        return result
    except BaseException:
        if attempted:
            for signum in INTERRUPTION_SIGNALS:
                signal.signal(signum, signal.SIG_IGN)
            try:
                rollback = restore_previous(path, prepared)
                exact_file(path / 'rolled-back.json', encoded(rollback))
            except BaseException:
                # Do not leave an unverified replacement serving if rollback fails.
                run(compose(path / 'effective-compose.json') +
                    ['stop', '--timeout', '60', 'web', 'api', 'worker'], timeout=90)
                exact_file(path / 'rollback-failed.json', encoded({'ownerStopped': True,
                           'requiresScopedInspection': True, 'previousRightsRestored': False}))
                raise
        raise


def recover(request):
    # Explicit operator action after process/host interruption, never automatic.
    path = prepared_path(request['buildProof']['commit'])
    prepared = json.loads(read_private(path / 'prepared.json'))
    journal = json.loads(read_private(path / 'applying.json'))
    if (prepared != request['preparedProof'] or
            journal.get('preparedSha256') != sha(encoded(prepared))):
        raise ValueError('Explicit exact interrupted-upgrade proof required')
    if prepared['foreignContainers'] != foreign_state() or prepared['proxyNetwork'] != proxy_network():
        raise ValueError('Foreign state changed; manual scoped inspection required')
    if sha(encoded(request['access'])) != prepared['accessConfigurationSha256']:
        raise ValueError('Access changed; do not restore previous rights')
    previous = path / 'previous'
    old_request = {**request, 'buildProof': request['previousBuildProof']}
    old_text = read_private(previous / 'server.env')
    source, image, flags, _ = validate_inputs(old_request, old_text.decode())
    manifest = json.loads(read_private(previous / 'manifest.json'))
    config_bytes = read_private(previous / 'effective-compose.json')
    verify_hashes(manifest, request['previousStageProof'], old_text, config_bytes,
                  source, CA.read_bytes())
    old_config = render_owner(source, image, flags, request['access'],
                             previous / 'server.env', previous / 'pinned-image.json')
    if frozen(old_config) != config_bytes:
        raise ValueError('Rollback frozen config differs')
    queue_check(previous / 'effective-compose.json')
    for signum in INTERRUPTION_SIGNALS:
        signal.signal(signum, signal.SIG_IGN)
    run(compose(previous / 'effective-compose.json') +
        ['stop', '--timeout', '60', 'web', 'api', 'worker'], timeout=90)
    queue_check(previous / 'effective-compose.json')
    result = restore_previous(path, prepared)
    exact_file(path / 'recovered.json', encoded(result))
    return result


if __name__ == '__main__':
    try:
        import fcntl
        read_private(DIRECTORY / 'activation.lock')
        with (DIRECTORY / 'activation.lock').open('rb') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            for signum in INTERRUPTION_SIGNALS:
                signal.signal(signum, interrupted)
            request = json.load(sys.stdin)
            handlers = {'prepare-upgrade': prepare, 'apply-upgrade': apply, 'recover-upgrade': recover}
            if request.get('action') not in handlers:
                raise ValueError('Explicit owner image-upgrade action required')
            result = handlers[request['action']](request)
        print(json.dumps({'ok': True, 'result': result}))
    except BaseException:
        print(json.dumps({'ok': False, 'phase': 'guarded-owner-upgrade'}))
        sys.exit(1)

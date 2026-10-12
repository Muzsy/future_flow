"""Isolated reader file/service transition. Never a paid/Auth/TLS attestation.

Uses three inert node processes in an internal network, synthetic configuration,
and the pinned app image. Exercises actual Docker resources, Compose roundtrip,
root-only fsynced files, successful promotion, failure rollback and emergency
disable despite corrupt candidate bytes. Database/source-render/proxy discovery
are explicit fixture seams; live production adapters are not invoked there.
"""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import re
import tempfile
import types

import alterward_activation as activation
import alterward_target as target
import alterward_upgrade as upgrade
import alterward_readers as readers
import alterward_personal_policy as policy
import alterward_backup as backup

LABEL = 'com.alterward.reader-fixture'


def main(request, continuation=None):
    image = request['buildProof']['imageId']
    if os.geteuid() != 0 or not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
        raise ValueError('Root pinned isolated reader fixture required')
    inspected = json.loads(target.docker('image', 'inspect', image).stdout)[0]
    if inspected['Id'] != image or inspected['Config']['User'] != 'node':
        raise ValueError('Original node image required')
    original_runtime = target.existing_state()
    nonce = os.urandom(8).hex()
    project = 'alterward-reader-fixture-' + nonce
    network = project + '-network'
    created = False
    result = None
    with tempfile.TemporaryDirectory(prefix=project + '-', dir=backup.ROOT) as temporary:
        directory = Path(temporary)
        owner = directory / 'owner'
        backup.private_directory(owner)
        ca = directory / 'fixture-ca.crt'
        ca.write_bytes(b'PUBLIC SYNTHETIC FIXTURE CA; TLS IS NOT TESTED HERE\n')
        ca.chmod(0o644)
        source = directory / 'source'
        backup.private_directory(source / 'deploy')
        for name in ('compose.yaml', 'compose.contabo.yaml', 'closed-site-owner.flags.env'):
            (source / 'deploy' / name).write_text(request['ownerFlags'] if name.endswith('.env') else '{}\n')
        flags = target.owner_overlay(request['ownerFlags'])
        now = dt.datetime.now(dt.timezone.utc)
        access = {'teamDomain': 'fixture.cloudflareaccess.com', 'audience': 'a' * 64,
                  'allowedEmails': ['owner@example.invalid'], 'checkedAt': now.isoformat()}
        gate = {'CLOSED_SITE_ENABLED': 'true', 'CLOUDFLARE_ACCESS_TEAM_DOMAIN': access['teamDomain'],
                'CLOUDFLARE_ACCESS_AUD': access['audience'], 'CLOSED_SITE_ALLOWED_EMAILS': access['allowedEmails'][0]}
        base = {key: value for key, value in flags.items()
                if not key.endswith('_OPERATOR_ENABLED') and key not in ('CLOSED_SITE_ENABLED', 'CLAUDE_PRODUCTION_BUDGET_USD')}
        api = {**base, **gate}
        for key in list(api):
            if key.startswith('AI_BUDGET_WINDOW_'):
                del api[key]
        environments = {'web': {**gate, 'PUBLIC_EXTERNAL_EXPOSURE_ENABLED': 'false'}, 'api': api,
                        'worker': {**base, 'OPENAI_API_KEY': policy.SENTINEL}}
        config = {'name': project, 'networks': {'fixture': {'name': network, 'external': True}}, 'services': {}}
        for role in ('web', 'api', 'worker'):
            port = 3000 if role == 'web' else 4000
            command = ("require('node:http').createServer((q,r)=>{r.writeHead(403,{'cache-control':'no-store'});r.end('Fixture only')}).listen(" + str(port) + ",'0.0.0.0')") if role != 'worker' else 'setInterval(()=>{},1000)'
            service = {'image': image, 'pull_policy': 'never', 'user': 'node', 'init': True,
                       'command': ['node', '-e', command], 'restart': 'unless-stopped',
                       'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'],
                       'read_only': True, 'mem_limit': 134217728, 'cpus': .25, 'pids_limit': 64,
                       'environment': environments[role], 'labels': {LABEL: nonce},
                       'logging': {'driver': 'none'},
                       'networks': {'fixture': {'aliases': ['alterward-' + role]}},
                       'volumes': []}
            if role != 'web':
                service['volumes'] = [{'type': 'bind', 'source': str(ca), 'target': '/run/secrets/supabase-ca.crt', 'read_only': True}]
            if role != 'worker':
                service['healthcheck'] = {'test': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:" + str(port) + "').then(r=>process.exit(r.status===403?0:1))"],
                                          'interval': '1s', 'timeout': '3s', 'retries': 30}
            config['services'][role] = service
        # Patch only the dedicated fixture subprocess's namespace. No project or
        # path override is accepted by the production reader operator.
        activation.PROJECT = upgrade.PROJECT = readers.PROJECT = project
        activation.DIRECTORY = upgrade.DIRECTORY = readers.DIRECTORY = owner
        activation.CA = upgrade.CA = ca
        readers.STATE = owner / 'personal-beta-readers'
        text = "DATABASE_URL='postgresql://synthetic_unused'\nCLOSED_SITE_ALLOWED_EMAILS='owner@example.invalid'\nOPENAI_API_KEY='" + policy.SENTINEL + "'\n"
        text += ''.join(name + "='" + value + "'\n" for name, value in flags.items()
                        if name not in {'OPENAI_API_KEY', 'CLOSED_SITE_ALLOWED_EMAILS'})
        for name, data in [('server.env', text.encode()), ('pinned-image.json', b'{}\n'),
                           ('effective-compose.json', activation.frozen(config))]:
            readers.durable_file(owner / name, data)
        config = json.loads(target.run(upgrade.compose(owner / 'effective-compose.json') +
                                       ['config', '--format', 'json']).stdout)
        upgrade.atomic_private(owner / 'effective-compose.json', activation.frozen(config))
        manifest = {'commit': request['buildProof']['commit'], 'imageId': image,
                    'ownerEnvironmentSha256': activation.sha(text.encode()),
                    'effectiveComposeSha256': activation.sha(activation.frozen(config)),
                    'sourceComposeSha256': activation.source_hash(source),
                    'databaseCaSha256': activation.sha(ca.read_bytes()),
                    'accessConfigurationSha256': activation.sha(activation.encoded(access))}
        readers.durable_file(owner / 'manifest.json', activation.encoded(manifest))
        stage = {**manifest, 'upgraded': True, 'imageOnly': True, 'runningServices': 3,
                 'paidAiCalls': 0, 'betaWindowActive': False}
        def fixture_render(_source, path):
            value = copy.deepcopy(config)
            allowed = readers.server_environment((path / 'server.env').read_text())['CLOSED_SITE_ALLOWED_EMAILS']
            for role in ('web', 'api'):
                value['services'][role]['environment']['CLOSED_SITE_ALLOWED_EMAILS'] = allowed
            return value
        readers.render = fixture_render
        upgrade.validate_inputs = lambda req, env: (source, image, flags, readers.server_environment(env))
        upgrade.baseline = lambda req: (readers.files(owner), manifest, copy.deepcopy(config))
        readers.quiet = lambda path: {'pendingJobs': 0, 'liveLeases': 0, 'foreignActiveSessions': 0, 'databaseTlsVerified': True}
        upgrade.proxy_network = lambda: {'fixtureNetwork': network}
        local = {**request, 'sourceCommit': request['sourceCommit'], 'buildProof': {**request['buildProof'], 'sourceDirectory': str(source)},
                 'ownerManifestDigest': activation.sha(activation.encoded(manifest)),
                 'ownerAccess': access, 'previousStageProof': stage, 'zeroStageProof': stage,
                 'readers': ['tester@example.invalid'],
                 'readerAccess': {**access, 'allowedEmails': ['owner@example.invalid', 'tester@example.invalid']}}
        def fixture_clock(shift=0):
            return lambda: dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=shift)
        # owner_runtime/personal_runtime_policy are the fixture seams for the installed
        # daily tool: the real container inspection of the isolated owner stack.
        def fixture_daily(shift=0):
            return types.SimpleNamespace(
                stable_state=target.existing_state, utcnow=fixture_clock(shift),
                owner_runtime=lambda: (manifest, upgrade.inspect_owner(config, image)),
                personal_runtime_policy=lambda environments, at: {'mode': 'owner'})
        daily = fixture_daily()
        try:
            for module in (activation, upgrade, readers):
                if module.PROJECT != project or module.DIRECTORY != owner:
                    raise ValueError('Isolated project/directory preflight differs')
            if (owner.resolve() != owner or not owner.is_relative_to(directory) or
                    readers.STATE.parent != owner or upgrade.CA != ca or activation.CA != ca):
                raise ValueError('Confined fixture authority preflight differs')
            target.docker('network', 'create', '--internal', '--label', LABEL + '=' + nonce, network)
            created = True
            upgrade.replace_services(owner / 'effective-compose.json')
            initial = readers.files(owner)
            # Expired, never-applied preparation: archive it, then run a normal new cycle.
            stale = readers.prepare(local, daily, policy)
            archive_request = {**local, 'preparedProof': stale['preparedProof']}
            before_archive = target.existing_state()
            try:
                readers.archive_expired(archive_request, daily, policy)
            except ValueError:
                pass
            else:
                raise ValueError('A still fresh preparation was archived')
            expired = fixture_daily(readers.READER_PREPARATION_SECONDS + 60)
            archived = readers.archive_expired(archive_request, expired, policy)
            if (not archived['archived'] or readers.STATE.exists() or readers.files(owner) != initial or
                    target.existing_state() != before_archive or archived['containersStarted'] != 0):
                raise ValueError('Expired preparation archive changed the owner stack')
            readers.require_complete_archives()
            if not readers.archive_root().joinpath(archived['archiveId'], 'complete.json').exists():
                raise ValueError('Archive completion missing')
            if not readers.archive_expired(archive_request, expired, policy)['alreadyArchived']:
                raise ValueError('Archive repeat was not idempotent')
            upgrade.inspect_owner(config, image)
            proof = readers.prepare(local, daily, policy)
            if proof['preparedProof'] == stale['preparedProof']:
                raise ValueError('New cycle reused the archived preparation')
            local['preparedProof'] = proof['preparedProof']
            success = readers.apply(local, daily, policy)
            if success['configurationMode'] != 'readers' or success['paidAiCalls'] != 0:
                raise ValueError('Reader fixture promotion missing')
            continuation_result = continuation(local, daily, config, image, initial) if continuation else {}
            # Emergency recovery deliberately gets unreadable candidate bytes.
            upgrade.atomic_private(readers.STATE / 'effective-compose.json', b'corrupt candidate\n')
            disabled = readers.disable(local)
            if not disabled['zeroBaselineRestored'] or readers.files(owner) != initial:
                raise ValueError('Original zero restore differs')
            # Restore candidate bytes for an independent post-check fault run.
            expected = policy.reader_candidate(config, readers.projection(access), flags, local['readers'], now=daily.utcnow())[0]
            upgrade.atomic_private(readers.STATE / 'effective-compose.json', activation.frozen(expected))
            # The production tool never removes a journal. This isolated case
            # alone rewinds it to exercise the first-attempt failure branch.
            journal = readers.STATE / 'journal.json'
            journal.unlink()
            original_verify = upgrade.verify_release
            def fail_verify(*args, **kwargs):
                original_verify(*args, **kwargs)
                raise ValueError('Deliberate fixture post-check failure')
            upgrade.verify_release = fail_verify
            try:
                readers.apply(local, daily, policy)
            except ValueError:
                pass
            else:
                raise ValueError('Post-check fault was not rejected')
            if readers.files(owner) != initial or json.loads(readers.fence.original(journal))['state'] != 'disabled-after-failure':
                raise ValueError('Post-check failure did not restore zero')
            upgrade.inspect_owner(config, image)
            result = {'actualReaderTransitionPassed': True, 'successfulPromotion': True,
                      'expiredPreparationArchivePassed': True,
                      'corruptCandidateEmergencyRestore': True, 'postCheckFailureRollback': True,
                      'fixtureScope': 'isolated-unpaid-files-and-services',
                      'databaseSourceRenderAndProxyDiscoverySubstituted': True,
                      'cloudflareOrAuthVerified': False, 'paidAiCalls': 0, 'liveDatabaseWrites': 0}
            result.update(continuation_result)
        finally:
            members = target.docker('ps', '-aq', '--filter', 'label=' + LABEL + '=' + nonce).stdout.decode().split()
            if members:
                items = json.loads(target.docker('inspect', *members).stdout)
                if any(item['Image'] != image or item['Config']['Labels'].get('com.docker.compose.project') != project
                       for item in items):
                    raise ValueError('Fixture cleanup ownership differs')
                target.docker('rm', '-f', *members)
            if created:
                value = json.loads(target.docker('network', 'inspect', network).stdout)[0]
                if value.get('Labels', {}).get(LABEL) != nonce or value.get('Containers'):
                    raise ValueError('Fixture network cleanup differs')
                target.docker('network', 'rm', network)
        if target.existing_state() != original_runtime:
            raise ValueError('Existing production/foreign containers changed')
        result.update(existingContainersUnchanged=True, temporaryFixturesRemoved=True,
                      sourceCommit=request['sourceCommit'])
    return result

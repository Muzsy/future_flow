"""Inert funded controller fixture. No real participant, DB restore or provider.

Actual Docker/file/stop/promote/zero-recovery and stdin ES-module execution;
Auth/SQL/TLS, backup-gate and source-render are explicitly substituted seams.
"""
import copy
import datetime as dt
import json
from pathlib import Path

import alterward_personal_beta as beta
import alterward_personal_policy as policy
import alterward_personal_observation as observation
import alterward_readers as readers
import alterward_readers_fixture as reader_fixture
import alterward_upgrade as upgrade


def main(request):
    def continuation(local, daily, config, image, initial):
        owner = readers.DIRECTORY
        beta.DIRECTORY = observation.DIRECTORY = owner
        observation.PROJECT = readers.PROJECT
        original_render = readers.render
        original_verify = upgrade.verify_release
        original_observe = observation.observe_held
        original_backup = beta.require_restored_preparation
        original_validate_services = observation.fence.validate_services
        def fixture_validate_services(values):
            # Production pins its project literal. Only this inert namespace
            # adapts that literal to the nonce-owned internal fixture project.
            adapted = copy.deepcopy(values)
            for role, item in adapted.items():
                if item['Config']['Labels'].get('com.docker.compose.project') != readers.PROJECT:
                    raise ValueError('Actual isolated project differs')
                item['Config']['Labels']['com.docker.compose.project'] = 'alterward-owner'
            return original_validate_services(adapted)
        observation.fence.validate_services = fixture_validate_services
        applied_reader_journal = readers.fence.original(readers.STATE / 'journal.json')
        reader_files = readers.files(readers.STATE)
        def render(_source, path):
            values = readers.server_environment((path / 'server.env').read_text())
            result = copy.deepcopy(config)
            for role in ('web', 'api'):
                result['services'][role]['environment']['CLOSED_SITE_ALLOWED_EMAILS'] = values['CLOSED_SITE_ALLOWED_EMAILS']
            for role in ('api', 'worker'):
                env = result['services'][role]['environment']
                for name in beta.ENV_KEYS:
                    if name in env:
                        env[name] = values[name]
            return result
        readers.render = render
        beta.require_restored_preparation = lambda *_args: 'explicit-inert-backup-seam'
        def observe(selection, *, original, manifest_digest, probe_source):
            observation.held_services(original)  # actual stopped identity/config/project capture
            if readers.sha(readers.fence.original(owner / 'manifest.json')) != manifest_digest:
                raise ValueError('Actual fixture manifest changed')
            # Prove the actual image accepts the reviewed export-containing ES
            # module via -e and receives stdin through compose run -T. No DB
            # connection, provider import or runtime worker is used.
            glue = """
import {readFileSync as fixtureRead} from 'node:fs';
const fixtureInput=JSON.parse(fixtureRead(0,'utf8'));
const fixtureValue=await Promise.resolve(validateParticipants(fixtureInput.participants));
console.log(JSON.stringify({participantCount:fixtureValue.users.length,stdinModuleGlue:true}));
"""
            command = upgrade.compose(owner / 'effective-compose.json') + ['run', '-T', '--rm', '--no-deps',
                '--entrypoint', 'node', 'api', '--input-type=module', '-e', probe_source + glue]
            result = json.loads(upgrade.run(command, input=json.dumps(selection).encode(), timeout=60).stdout)
            if result != {'participantCount': 1, 'stdinModuleGlue': True}:
                raise ValueError('Physical stdin/module glue did not pass')
            observation.held_services(original)
            return {'observedAt': daily.utcnow().isoformat(), 'priorWindowAccounts': 0,
                'identityBindingSha256': readers.sha(json.dumps(selection['participants'], separators=(',', ':')).encode()),
                'writerFenceHeld': True, 'fixtureAuthSqlAndTlsSubstituted': True}
        observation.observe_held = observe
        cases = []
        try:
            for label in ('success', 'post-check-fault'):
                # Separate inert fixture state for each case. Production journals
                # are never erased, reallocated or rewound by this operator.
                beta.STATE = owner / ('personal-fixture-' + label)
                if (beta.DIRECTORY != owner or observation.DIRECTORY != owner or
                        observation.PROJECT != readers.PROJECT or beta.STATE.parent != owner or
                        upgrade.DIRECTORY != owner or upgrade.PROJECT != readers.PROJECT):
                    raise ValueError('Personal fixture project/directory preflight differs')
                for name, data in reader_files.items():
                    upgrade.atomic_private(owner / name, data)
                upgrade.atomic_private(readers.STATE / 'journal.json', applied_reader_journal)
                upgrade.replace_services(owner / 'effective-compose.json')
                start = (daily.utcnow() + dt.timedelta(minutes=10)).replace(microsecond=0)
                terms = {'participants': [{'email': 'tester@example.invalid', 'userId': '11111111-1111-4111-8111-111111111111'}],
                    'projectUsd': '2', 'userUsd': '0.5', 'startsAt': start.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'endsAt': (start + dt.timedelta(days=30)).strftime('%Y-%m-%dT%H:%M:%SZ')}
                selected = {**local, 'ownerManifestDigest': readers.sha(reader_files['manifest.json']),
                    'terms': terms, 'openaiKey': 'synthetic_provider_never_called',
                    'observationSelection': {'seedProjectKeys': [], 'seedUserKeys': []},
                    'observationSource': request['observationSource']}
                prepared = beta.prepare(selected, daily, policy)
                selected.pop('openaiKey')  # apply/disable genuinely need no local key
                selected['preparedProof'] = prepared['preparedProof']
                if label == 'post-check-fault':
                    def fail(*args, **kwargs):
                        original_verify(*args, **kwargs)
                        raise ValueError('Deliberate funded fixture verification fault')
                    upgrade.verify_release = fail
                    try:
                        beta.apply(selected, daily, policy)
                    except ValueError:
                        pass
                    else:
                        raise ValueError('Funded post-check fault was not refused')
                    if readers.files(owner) != initial or json.loads(readers.fence.original(beta.STATE / 'transition.json'))['state'] != 'disabled-after-failure':
                        raise ValueError('Funded fault failed to restore original zero')
                else:
                    result = beta.apply(selected, daily, policy)
                    if result['configurationMode'] != 'personal-beta' or not result['budgetWindowConfigured']:
                        raise ValueError('Inert funded promotion missing')
                    # Candidate/provider/UUID/window drift cannot prevent a scoped
                    # disable. It must restart only verified ORIGINAL zero.
                    upgrade.atomic_private(beta.STATE / 'server.env', b'corrupt provider/UUID/window candidate\n')
                    disabled = beta.disable(selected)
                    if not disabled['zeroBaselineRestored'] or readers.files(owner) != initial:
                        raise ValueError('Funded corrupt-candidate zero recovery failed')
                if not (beta.STATE / 'journal.json').exists():
                    raise ValueError('Sticky exposure journal was not retained')
                try:
                    beta.require_unattempted()
                except ValueError:
                    pass
                else:
                    raise ValueError('Repeated funding attempt was accepted')
                cases.append(label)
                upgrade.verify_release = original_verify
            # Return the applied inert reader fixture to its original harness.
            for name, data in reader_files.items():
                upgrade.atomic_private(owner / name, data)
            upgrade.atomic_private(readers.STATE / 'journal.json', applied_reader_journal)
            upgrade.replace_services(owner / 'effective-compose.json')
            return {'actualPersonalTransitionPassed': True, 'personalSuccessfulPromotion': True,
                    'personalPostCheckFailureRollback': True, 'personalCorruptCandidateEmergencyRestore': True,
                    'stickyExposureJournalRetained': True, 'actualNodeStdinModuleGluePassed': True,
                    'admissionDatabaseAndBackupSubstituted': True, 'personalCases': len(cases)}
        finally:
            readers.render = original_render
            upgrade.verify_release = original_verify
            observation.observe_held = original_observe
            beta.require_restored_preparation = original_backup
            observation.fence.validate_services = original_validate_services
    return reader_fixture.main(request, continuation)

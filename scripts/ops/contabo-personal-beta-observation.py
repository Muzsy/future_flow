"""Read-only admission observation for an already held personal-beta transition.

No CLI, service stop/start, provider key or funding action. The trusted caller
must own the existing locks, capture original services from Docker (not JSON),
and provide the git-bound JS source. Actual admission still needs a journalled
configuration operator and a fresh observation immediately before promotion.
"""
import datetime as dt
import hashlib
import json
import re
from pathlib import Path

from alterward_activation import DIRECTORY, PROJECT, project_ids
from alterward_target import docker, run
import alterward_upgrade as upgrade
import alterward_fence as fence

NODE_ADAPTER = r"""
import {createRequire as betaRequire} from 'node:module';
import {readFileSync as betaRead} from 'node:fs';
import {TLSSocket as BetaTls} from 'node:tls';
import {X509Certificate as BetaCertificate} from 'node:crypto';
const betaInput=JSON.parse(betaRead(0,'utf8'));
validateObservationRequest(betaInput.selection);
const betaHost=new URL(process.env.DATABASE_URL).hostname;
const {Client:BetaClient}=betaRequire('/app/packages/database/package.json')('pg');
const betaClient=new BetaClient({connectionString:process.env.DATABASE_URL,
  ssl:{rejectUnauthorized:true,ca:betaRead(process.env.DATABASE_SSL_CA_FILE,'utf8')},
  connectionTimeoutMillis:10000});
const betaWatchdog=setTimeout(()=>process.exit(1),45000);betaWatchdog.unref();
try {
 await betaClient.connect();const stream=betaClient.connection.stream;
 if(!(stream instanceof BetaTls)||!stream.encrypted||!stream.authorized||
    !new BetaCertificate(stream.getPeerCertificate().raw).checkHost(betaHost))throw Error('TLS');
 const proof=await observePersonalBetaAdmission(betaClient,betaInput.selection,
  {activationJournalPresent:betaInput.activationJournalPresent,connectionHostname:betaHost});
 console.log(JSON.stringify({...proof,databaseTlsVerified:true,databaseTlsHostnameVerified:true}));
}catch{process.exitCode=1;}finally{clearTimeout(betaWatchdog);await betaClient.end();}
"""


def held_services(original):
    """Same original three Docker identities/configurations, all stopped."""
    ids = fence.validate_services(original)
    if set(project_ids()) != ids:
        raise ValueError('Held observation project membership changed')
    values = json.loads(docker('inspect', *sorted(ids)).stdout)
    by_id = {value['Id']: value for value in values}
    if set(by_id) != ids:
        raise ValueError('Held observation identities differ')
    for role, before in original.items():
        value = by_id[before['Id']]
        if (fence.identity(value) != fence.identity(before) or value['State']['Running'] or
                value['State']['Status'] != 'exited' or value['State'].get('OOMKilled') or
                value['Config'] != before['Config'] or value['HostConfig'] != before['HostConfig'] or
                value['Config']['Labels'].get('com.docker.compose.project') != PROJECT or
                value['Config']['Labels'].get('com.docker.compose.service') != role):
            raise ValueError('Original held service/configuration changed')
    return True


def observe_held(selection, *, original, manifest_digest, probe_source):
    # These keyword authorities are captured by trusted server code, never
    # accepted from the participant selection or another remote JSON field.
    if (not isinstance(probe_source, str) or len(probe_source.encode()) > 128 * 1024 or
            not isinstance(manifest_digest, str) or
            not re.fullmatch('[a-f0-9]{64}', manifest_digest)):
        raise ValueError('Bounded git-bound observation source and manifest required')
    if (not isinstance(selection, dict) or set(selection) != {'participants', 'seedProjectKeys', 'seedUserKeys'} or
            not isinstance(selection['participants'], list) or not 1 <= len(selection['participants']) <= 10 or
            len(json.dumps(selection).encode()) > 8192):
        raise ValueError('Bounded selection without provider/window authority required')
    if hashlib.sha256(fence.original(DIRECTORY / 'manifest.json')).hexdigest() != manifest_digest:
        raise ValueError('Held source manifest changed')
    journal = DIRECTORY / 'personal-beta' / 'journal.json'
    if journal.exists() or journal.is_symlink():
        raise ValueError('A previous activation intent forbids a new window')
    held_services(original)
    path = DIRECTORY / 'effective-compose.json'
    quiet = json.loads(run(upgrade.compose(path) + ['run', '-T', '--rm', '--no-deps',
                           '--entrypoint', 'node', 'api', '--input-type=module', '-e',
                           fence.PROBE], timeout=60).stdout)
    if not fence.quiet(quiet):
        raise ValueError('Fresh read-only queue/lease/foreign-writer boundary required')
    held_services(original)
    result = json.loads(run(upgrade.compose(path) + ['run', '-T', '--rm', '--no-deps',
                           '--entrypoint', 'node', 'api', '--input-type=module', '-e',
                           probe_source + '\n' + NODE_ADAPTER],
                           input=json.dumps({'selection': selection,
                                             'activationJournalPresent': False}).encode(),
                           timeout=60).stdout)
    after = json.loads(run(upgrade.compose(path) + ['run', '-T', '--rm', '--no-deps',
                           '--entrypoint', 'node', 'api', '--input-type=module', '-e',
                           fence.PROBE], timeout=60).stdout)
    if not fence.quiet(after):
        raise ValueError('Read-only source boundary changed during observation')
    held_services(original)
    if journal.exists() or journal.is_symlink():
        raise ValueError('Activation intent appeared during observation')
    if hashlib.sha256(fence.original(DIRECTORY / 'manifest.json')).hexdigest() != manifest_digest:
        raise ValueError('Manifest changed during held observation')
    instant = dt.datetime.fromisoformat(result['observedAt'].replace('Z', '+00:00'))
    now = dt.datetime.now(dt.timezone.utc)
    binding = hashlib.sha256(json.dumps([{'email': pair['email'], 'userId': pair['userId']}
                                        for pair in selection['participants']],
                                        separators=(',', ':')).encode()).hexdigest()
    if (instant.tzinfo != dt.timezone.utc or not 0 <= (now - instant).total_seconds() <= 60 or
            type(result.get('participantCount')) is not int or
            result.get('participantCount') != len(selection['participants']) or
            result.get('identityBindingSha256') != binding or
            result.get('databaseIdentitySha256') != '754b4a0116dfb6a50ff2e28a0f5f850a99c6132ae79b89f9712c53fea8387a11' or
            type(result.get('seedAccounts')) is not int or result['seedAccounts'] != 7 or
            type(result.get('legacyAccounts')) is not int or result['legacyAccounts'] != 2 or
            result.get('databaseTlsVerified') is not True or
            result.get('databaseTlsHostnameVerified') is not True or
            result.get('activationJournalAbsent') is not True or
            any(type(result.get(key)) is not int or result[key] != 0
                for key in ['priorWindowAccounts', 'unsettledReservations', 'databaseWrites', 'providerApiCalls'])):
        raise ValueError('Fresh held admission proof incomplete')
    return {**result, 'writerFenceHeld': True, 'manifestDigest': manifest_digest,
            'originalServiceIdsSha256': hashlib.sha256(json.dumps(sorted(fence.validate_services(original))).encode()).hexdigest()}

"""Derive active funded recovery authority from original root state, never a registry guess."""
import hashlib
import datetime as dt
import json
import re
from pathlib import Path

VERSION = 'alterward-funded-replay-1'
PROJECT = 'alterward-owner'
STATES = {'apply-intent', 'recovery-intent', 'held', 'migration-intent', 'schema-038',
          'staged', 'verified-staged', 'exposure-intent', 'applied', 'recovered',
          'closed', 'stop-unverified', 'watchdog-stop-intent'}
FIELDS = {'version', 'sourceCommit', 'bundleSha256', 'preparedSha256', 'imageId',
          'role', 'ownerManifestDigest', 'runtimeFilesSha256', 'authoritySha256'}
FILES = ('server.env', 'pinned-image.json', 'effective-compose.json', 'manifest.json')


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def active_funded_runtime(daily, original):
    if daily.funded_upgrade_healthy('personal-beta') is not True:
        raise ValueError('Healthy completed funded state without pending probe required')
    root = daily.OWNER / 'funded-runtime-upgrade'
    candidate = json.loads(original(root / 'prepared.json'))
    journal = json.loads(original(root / 'journal.json'))
    readback = json.loads(original(root / 'readback.json'))
    prepared_sha = sha(encoded(candidate))
    if (candidate.get('version') != 'alterward-funded-upgrade-1' or
            not re.fullmatch(r'[a-f0-9]{40}', candidate.get('sourceCommit', '')) or
            not re.fullmatch(r'[a-f0-9]{64}', candidate.get('bundleSha256', '')) or
            journal.get('version') != candidate['version'] or
            journal.get('preparedSha256') != prepared_sha or
            not isinstance(journal.get('states'), list) or not 1 <= len(journal['states']) <= 32):
        raise ValueError('Original complete funded transition required')
    previous = None
    for row in journal['states']:
        if (set(row) != {'state', 'changedAt', 'previousSha256', 'sha256'} or
                row['previousSha256'] != previous or
                row['sha256'] != sha(encoded({k: v for k, v in row.items() if k != 'sha256'}))):
            raise ValueError('Original funded journal chain required')
        if (row['state'] not in STATES or
                dt.datetime.fromisoformat(row['changedAt'].replace('Z', '+00:00')).utcoffset() != dt.timedelta(0)):
            raise ValueError('Known UTC journal state required')
        previous = row['sha256']
    terminal = journal['states'][-1]['state']
    if terminal not in ('applied', 'recovered'):
        raise ValueError('Incomplete funded transition cannot issue active replay authority')
    role = 'target' if terminal == 'applied' else 'recovery'
    build = candidate['release'][role]
    if (build.get('commit') != candidate['sourceCommit'] or
            not re.fullmatch(r'sha256:[a-f0-9]{64}', build.get('imageId', ''))):
        raise ValueError('Exact committed funded image required')
    actual = {name: sha(original(daily.OWNER / name)) for name in FILES}
    retained = {name: sha(original(root / role / name)) for name in FILES}
    if actual != retained or retained != candidate['files'][role]:
        raise ValueError('Active and prepared runtime bytes differ')
    authority = {path: sha(original(Path(path)))
                 for path in candidate['baseline']['authority']}
    paths = daily.reader_config_paths() + daily.personal_config_paths()
    if (not authority or set(authority) != {str(p) for p in paths} or
            authority != candidate['baseline']['authority']):
        raise ValueError('Original funded admission and window authority changed')
    if (readback.get('version') != candidate['version'] or
            readback.get('sourceCommit') != candidate['sourceCommit'] or
            readback.get('preparedSha256') != prepared_sha or
            readback.get('imageId') != build['imageId'] or readback.get('schema') != 38 or
            readback.get('protectedDataUnchanged') is not True or
            readback.get('paidAiCalls') != 0 or readback.get('operationPaidAiCalls') != 0 or
            readback.get('databaseRestored') is not False):
        raise ValueError('Completed source/image-bound funded readback required')
    manifest, services = daily.owner_runtime()
    if (set(services) != {'web', 'api', 'worker'} or manifest.get('commit') != build['commit'] or
            manifest.get('imageId') != build['imageId'] or
            any(c['Image'] != build['imageId'] for c in services.values())):
        raise ValueError('Actual active funded image differs')
    owned = [c for c in daily.containers()
             if c['Config'].get('Labels', {}).get('com.docker.compose.project') == PROJECT]
    if len(owned) != 3 or {c['Id'] for c in owned} != {c['Id'] for c in services.values()}:
        raise ValueError('Exactly three active funded services, no extra one-off required')
    return {'version': VERSION, 'sourceCommit': candidate['sourceCommit'],
            'bundleSha256': candidate['bundleSha256'], 'preparedSha256': prepared_sha,
            'imageId': build['imageId'], 'role': role,
            'ownerManifestDigest': sha(original(daily.OWNER / 'manifest.json')),
            'runtimeFilesSha256': sha(encoded(actual)), 'authoritySha256': sha(encoded(authority))}


def require_funded_runtime(daily, original, expected):
    if not isinstance(expected, dict) or set(expected) != FIELDS:
        raise ValueError('Exact funded runtime proof shape required')
    actual = active_funded_runtime(daily, original)
    if expected != actual:
        raise ValueError('Funded runtime proof is stale or belongs to another transition')
    return actual

"""Root service-profile step for the restricted environment and image releases.

The environment path (ADR-011, P2) changes only a closed key set, each key with
its own value rule. The separate native040 image path keeps server.env and the
full Compose configuration, except the three pinned image IDs, unchanged.
Neither path adds a historical successor-chain generation. One run:

  plan   (read-only)  validate request + host, print the plan hash, the per-key
                      before/after value digests and the approval sentence;
  apply               re-derive the same plan, require its hash and the exact
                      sentence, persist intent + previous files, replace
                      server.env / effective-compose.json / manifest.json, restart
                      api, worker and web from the frozen compose, verify, and then
                      activate the next SPR generation in the same session;
  resume              bring an interrupted operation to a terminal state: finish
                      the SPR step when the environment is proven live, otherwise
                      restore the previous files (hash-verified).

A failed restart attempts to restore and re-verify the previous files and image.
Profile activation interruptions are reconciled with resume. The image plan reads
schema, queue and hold status; neither step performs database or provider writes.
No value of server.env is ever printed or journaled (digests only).
"""

import argparse
import copy
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import tempfile
import uuid

OPS = Path('/root/alterward-ops')
OWNER_DIR = OPS / 'owner'
STEP_DIR = OPS / 'service-env'
PROFILE_DIR = OPS / 'service-profile'
STATE_DIR = Path('/var/lib/alterward/service-operations')
PROJECT = 'alterward-owner'
SERVICES = ('web', 'api', 'worker')
OWNER_FILES = ('server.env', 'effective-compose.json', 'manifest.json', 'pinned-image.json')
REQUEST_VERSION = 'alterward-service-env-request-1'
PLAN_VERSION = 'alterward-service-env-plan-1'
IMAGE_REQUEST_VERSION = 'alterward-service-image-request-1'
IMAGE_PLAN_VERSION = 'alterward-service-image-plan-1'
COMMIT = re.compile(r'[a-f0-9]{40}')
# This first image release has one reviewed product change (#185). A future
# broader release needs its own explicit compatibility rules.
IMAGE_DELTA_PATH = 'packages/core/src/billing-stripe.ts'
IMAGE_DELTA_SHA256 = 'e0b44f075357e86226f0b1bd671b8fc4b4ada074ea84b364bda3b75137a39b7a'
IMAGE_SCOPE = ('apps', 'packages', 'database', 'deploy', 'Dockerfile', '.dockerignore',
               'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json')
JOURNAL_VERSION = 'alterward-service-env-journal-1'
EVENTS = {'intent-persisted', 'files-replaced', 'env-applied', 'completed', 'rolled-back',
          'rollback-failed'}
ZERO = '0' * 64
HEX64 = re.compile(r'[a-f0-9]{64}')
IMAGE = re.compile(r'sha256:[a-f0-9]{64}')
ENV_LINE = re.compile(r"([A-Z][A-Z0-9_]*)='([^'\r\n\\]*)'")
SAFE_VALUE = re.compile(r'[A-Za-z0-9_.,:\-]*')
STAMP = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z')
USD = re.compile(r'[0-9]{1,3}(\.[0-9]{1,2})?')
BACKUP_MANIFEST_PATH = re.compile(r'daily/backups/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}/manifest\.json')
RESTORE_PROOF_PATH = 'daily/status/registry-restore.json'
RUN_ID = re.compile(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}')
# Same shape as the web's Turnstile site-key rule (a key the web would hide the form for must not pass here).
TURNSTILE_KEY = re.compile(r'[0-3]x[A-Za-z0-9_-]{15,64}')
MAX_BACKUP_AGE_SECONDS = 26 * 3600      # the Daily backup_stale threshold
MAX_PROOF_AGE_SECONDS = 6 * 3600        # the Daily timer-activation freshness for the native proof
PROOF_TRUE = ('independentReadOnlyPostReplayVerified', 'reviewedSecurityCatalog', 'dataOnlyOriginalBackupLoaded',
              'temporaryContainersAndPlaintextRemoved', 'freshStateEqualBeforeAndAfterReplay',
              'originalIdsImagesPreserved', 'foreignContainersUnchanged')
PROOF_FALSE = ('writerFenceStillHeld', 'serviceActivationAllowed', 'liveDatabaseWrites', 'authProviderWrites',
               'externalMessagesSent')

# Hard ceilings agreed by the owner (first wave 45/6/2, later waves 100/8.50/3).
MAX_PROJECT_USD = 100
MAX_USER_USD = 8.5
MAX_DAILY_LIMIT = 3
MAX_WINDOW_DAYS = 31

# Closed key set: key -> exact value rule. Everything else is refused.
ALLOWED = {
    'SERVICE_ACCESS_ENFORCEMENT': lambda v: v == 'true',
    'CLOSED_SITE_ENABLED': lambda v: v == 'true',
    'CLOUDFLARE_ACCESS_TEAM_DOMAIN':
        lambda v: re.fullmatch(r'[a-z0-9][a-z0-9-]{0,62}\.cloudflareaccess\.com', v) is not None,
    'CLOUDFLARE_ACCESS_AUD': lambda v: HEX64.fullmatch(v) is not None,
    'CLOSED_BETA_USER_IDS': lambda v: v == '',
    'NARRATIVE_COHORT_USER_IDS': lambda v: v == '',
    'AI_PROJECT_BUDGET_USD': lambda v: USD.fullmatch(v) is not None and 0 < float(v) <= MAX_PROJECT_USD,
    'AI_USER_BUDGET_USD': lambda v: USD.fullmatch(v) is not None and 0 < float(v) <= MAX_USER_USD,
    'GENERATION_DAILY_LIMIT': lambda v: re.fullmatch(r'[1-9]', v) is not None and int(v) <= MAX_DAILY_LIMIT,
    'AI_BUDGET_WINDOW_START': lambda v: STAMP.fullmatch(v) is not None,
    'AI_BUDGET_WINDOW_END': lambda v: STAMP.fullmatch(v) is not None,
    'AI_BUDGET_WINDOW_REQUIRED': lambda v: v == 'true',
    # Public Turnstile site key (not a secret; the web container reads it at runtime). The secret
    # key lives in the Supabase CAPTCHA settings, never in server.env. It is mandatory in the
    # service profile and must reach a service through the release's compose, otherwise the
    # plan is refused (validate_after, check_compose_delta).
    'TURNSTILE_SITE_KEY': lambda v: TURNSTILE_KEY.fullmatch(v) is not None,
}
PLACEHOLDER_PROVIDER = 'alterward_owner_provider_access_disabled'


class Refusal(ValueError):
    """Fail-closed refusal with an operator-readable, value-free reason."""


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parent / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


DAILY_SCRIPTS = OPS / 'daily/scripts'


def load_daily(directory=None):
    """Load the installed Daily the way its own entry and the recovery tools do.

    Daily imports the shared library as `alterward_backup`, so that module is registered first.
    Only the paths that read the successor chain need it; the rest of this step never loads Daily.
    """
    directory = Path(directory) if directory is not None else DAILY_SCRIPTS
    sys.dont_write_bytecode = True
    for name, filename in (('alterward_backup', 'backup_lib.py'), ('alterward_daily', 'contabo-daily.py')):
        spec = importlib.util.spec_from_file_location(name, directory / filename)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    module.config()  # Checks the installed Daily scripts against their recorded hashes.
    return module


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True) + '\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def _uid():
    return os.geteuid() if hasattr(os, 'geteuid') else 0


def _stamp(now):
    return now.astimezone(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _private_directory(path, *, create=False):
    if create:
        path.mkdir(mode=0o700, parents=False, exist_ok=True)
    value = path.lstat()
    if (stat.S_ISLNK(value.st_mode) or not stat.S_ISDIR(value.st_mode) or value.st_uid != _uid()
            or stat.S_IMODE(value.st_mode) != 0o700):
        raise Refusal('Private operation directory required')


def _private_read(path):
    try:
        value = path.lstat()
    except FileNotFoundError:
        raise Refusal('Required private file missing') from None
    if (not stat.S_ISREG(value.st_mode) or value.st_nlink != 1 or value.st_uid != _uid()
            or stat.S_IMODE(value.st_mode) != 0o600):
        raise Refusal('Private regular file required')
    return path.read_bytes()


def _fsync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _create(path, data):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(fd, 0o600)
        os.write(fd, data)
        os.fsync(fd)
    finally:
        os.close(fd)
    _fsync_directory(path.parent)


def _replace(path, data):
    """Atomic same-directory replace of a root-private file (rename + fsync)."""
    temporary = path.with_name('.' + path.name + '.service-env.new')
    if temporary.exists() or temporary.is_symlink():
        temporary.unlink()
    _create(temporary, data)
    os.replace(temporary, path)
    _fsync_directory(path.parent)


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def frozen(config):
    """Same freezing as the owner activation: literal dollars survive Compose re-interpolation."""
    def escape(value):
        if isinstance(value, str):
            return value.replace('$', '$$')
        if isinstance(value, dict):
            return {key: escape(item) for key, item in value.items()}
        if isinstance(value, list):
            return [escape(item) for item in value]
        return value
    return encoded(escape(config))


def unfrozen(config):
    def restore(value):
        if isinstance(value, str):
            return value.replace('$$', '$')
        if isinstance(value, dict):
            return {key: restore(item) for key, item in value.items()}
        if isinstance(value, list):
            return [restore(item) for item in value]
        return value
    return restore(config)


# ---- environment handling (value-free errors) ------------------------------
def parse_env(text):
    values = {}
    for line in text.splitlines():
        if not line or line.startswith('#'):
            continue
        match = ENV_LINE.fullmatch(line)
        if not match or match[1] in values:
            raise Refusal('Protected server environment invalid')
        values[match[1]] = match[2]
    return values


def apply_env(text, changes):
    """Replace existing lines in place, append missing keys; touch nothing else."""
    for key in changes:
        text, count = re.subn(r'^' + key + r"='[^'\r\n\\]*'$", lambda _m, k=key: k + "='" + changes[k] + "'",
                              text, flags=re.MULTILINE)
        if count > 1:
            raise Refusal('Duplicate environment key')
        if count == 0:
            text = text.rstrip('\n') + '\n' + key + "='" + changes[key] + "'\n"
    return text


def validate_request(raw):
    if not isinstance(raw, dict) or set(raw) != {'version', 'imageId', 'sourceDirectory', 'values',
                                                  'backupManifestPath', 'restoreProofPath'}:
        raise Refusal('Exact request keys required')
    if raw['version'] != REQUEST_VERSION or not isinstance(raw['imageId'], str) or not IMAGE.fullmatch(raw['imageId']):
        raise Refusal('Exact request version and image required')
    source = raw['sourceDirectory']
    if (not isinstance(source, str) or '..' in source.split('/') or not source.startswith('/root/alterward-ops/')
            or not isinstance(raw['backupManifestPath'], str)
            or not BACKUP_MANIFEST_PATH.fullmatch(raw['backupManifestPath'])
            or raw['restoreProofPath'] != RESTORE_PROOF_PATH):
        raise Refusal('Exact request paths required')
    values = raw['values']
    if not isinstance(values, dict) or not values:
        raise Refusal('Non-empty value set required')
    for key, value in values.items():
        rule = ALLOWED.get(key)
        if rule is None:
            raise Refusal('Key is not in the allowed set: ' + str(key)[:64])
        if (not isinstance(value, str) or not SAFE_VALUE.fullmatch(value) or not rule(value)):
            raise Refusal('Value rejected for key ' + key)
    return raw



def validate_image_request(raw, root):
    required = {'version', 'build', 'backupManifestPath', 'restoreProofPath', 'rehearsalDirectory'}
    if not isinstance(raw, dict) or set(raw) != required or raw['version'] != IMAGE_REQUEST_VERSION:
        raise Refusal('Exact service image request required')
    build = raw['build']
    if (not isinstance(build, dict) or set(build) != {'commit', 'imageId', 'imageTag', 'sourceDirectory'}
            or not all(isinstance(v, str) for v in build.values()) or not COMMIT.fullmatch(build['commit'])
            or not IMAGE.fullmatch(build['imageId'])
            or build['imageTag'] != 'alterward:contabo-' + build['commit'][:12]):
        raise Refusal('Exact service image build identity required')
    for directory in (build['sourceDirectory'], raw['rehearsalDirectory']):
        if not isinstance(directory, str):
            raise Refusal('Exact private release directory required')
        path = Path(directory)
        if (not path.is_relative_to(root) or path == root or path.resolve() != path
                or path.as_posix() != directory or '..' in path.parts):
            raise Refusal('Exact private release directory required')
    if (not isinstance(raw['backupManifestPath'], str) or not BACKUP_MANIFEST_PATH.fullmatch(raw['backupManifestPath'])
            or raw['restoreProofPath'] != RESTORE_PROOF_PATH):
        raise Refusal('Exact backup and restore evidence paths required')
    return raw


def image_only_compose(config, previous_image, target_image):
    """Keep every frozen Compose field except the three immutable image IDs."""
    result = copy.deepcopy(config)
    services = result.get('services')
    if not isinstance(services, dict) or set(services) != set(SERVICES):
        raise Refusal('Exactly three owner services required')
    for service in services.values():
        if service.get('image') != previous_image or service.get('pull_policy') != 'never':
            raise Refusal('All services must already use the pinned image without pulls')
        service['image'] = target_image
    return result


def require_image_rehearsal(directory, rehearsal, build, binding):
    _private_directory(directory)
    names = ('image-rehearsal-receipt.json', 'funded-upgrade-fixture-proof.json',
             'beta-successor-fixture-proof.json', 'registry040-image-fixture.json',
             'registry-successor-fixture-proof.json')
    raw = {name: _private_read(directory / name) for name in names}
    receipt, funded, successor, registry, registry_successor = (json.loads(raw[n]) for n in names)
    if (receipt.get('version') != 'alterward-image-rehearsal-1'
            or receipt.get('sourceCommit') != build['commit'] or receipt.get('imageId') != build['imageId']
            or receipt.get('fixtureSha256') != sha(raw[names[1]])
            or any(receipt.get(k) is not True for k in ('syntheticDataOnly', 'cleanupVerified',
                                                       'foreignContainersUnchanged'))
            or type(receipt.get('paidAiCalls')) is not int or receipt['paidAiCalls'] != 0):
        raise Refusal('Exact clean image rehearsal required')
    rehearsal.require_proof(funded, build['imageId'], binding)
    rehearsal.require_successor_proof(successor, build['imageId'], binding)
    rehearsal.require_registry_proof(registry, build['imageId'], binding)
    rehearsal.require_successor_proof(registry_successor, build['imageId'], binding, registry=True)
    return sha(canonical({name: sha(raw[name]) for name in names}))


def validate_after(env):
    """Cross-key rules on the complete resulting environment (never prints values)."""
    def need(key, expected):
        if env.get(key) != expected:
            raise Refusal('Resulting environment requires ' + key + ' to be ' + ('empty' if expected == '' else expected))
    need('SERVICE_ACCESS_ENFORCEMENT', 'true')
    need('CLOSED_SITE_ENABLED', 'true')
    need('BILLING_ENABLED', 'true')       # precondition: set by the successor chain, never here
    need('BILLING_ENFORCEMENT', 'true')
    need('CLOSED_BETA_USER_IDS', '')
    need('NARRATIVE_COHORT_USER_IDS', '')
    need('AI_BUDGET_WINDOW_REQUIRED', 'true')
    if not ALLOWED['CLOUDFLARE_ACCESS_TEAM_DOMAIN'](env.get('CLOUDFLARE_ACCESS_TEAM_DOMAIN', '')):
        raise Refusal('Resulting environment requires a valid Cloudflare Access issuer host')
    if not ALLOWED['CLOUDFLARE_ACCESS_AUD'](env.get('CLOUDFLARE_ACCESS_AUD', '')):
        raise Refusal('Resulting environment requires a valid Cloudflare Access audience')
    project, user = env.get('AI_PROJECT_BUDGET_USD', ''), env.get('AI_USER_BUDGET_USD', '')
    if not ALLOWED['AI_PROJECT_BUDGET_USD'](project) or not ALLOWED['AI_USER_BUDGET_USD'](user) \
            or float(user) > float(project):
        raise Refusal('Resulting environment requires positive, ordered, ceiling-bound USD budgets')
    if not ALLOWED['TURNSTILE_SITE_KEY'](env.get('TURNSTILE_SITE_KEY', '')):
        raise Refusal('Resulting environment requires a valid Turnstile site key')
    if 'GENERATION_DAILY_LIMIT' in env and not ALLOWED['GENERATION_DAILY_LIMIT'](env['GENERATION_DAILY_LIMIT']):
        raise Refusal('Resulting environment requires a bounded daily generation limit')
    start, end = env.get('AI_BUDGET_WINDOW_START', ''), env.get('AI_BUDGET_WINDOW_END', '')
    if not STAMP.fullmatch(start) or not STAMP.fullmatch(end):
        raise Refusal('Resulting environment requires an exact UTC budget window')
    span = dt.datetime.fromisoformat(end.replace('Z', '+00:00')) - dt.datetime.fromisoformat(start.replace('Z', '+00:00'))
    if not dt.timedelta(0) < span <= dt.timedelta(days=MAX_WINDOW_DAYS):
        raise Refusal('Resulting environment requires a budget window of at most ' + str(MAX_WINDOW_DAYS) + ' days')
    if env.get('OPENAI_API_KEY', '') in ('', PLACEHOLDER_PROVIDER):
        raise Refusal('A positive budget requires the real provider key to be present')
    if env.get('ANTHROPIC_API_KEY') or env.get('SMTP_PASSWORD'):
        raise Refusal('Unexpected provider credential present')


def check_compose_delta(old, new, changed):
    """The rendered configurations may differ only in environment values of the changed keys."""
    def without_env(config):
        result = copy.deepcopy(config)
        for service in result.get('services', {}).values():
            service.pop('environment', None)
        return result
    if set(old.get('services', {})) != set(SERVICES) or set(new.get('services', {})) != set(SERVICES):
        raise Refusal('Unexpected service set')
    if without_env(old) != without_env(new):
        raise Refusal('Rendered configuration differs beyond the environment')
    seen = set()
    for name in SERVICES:
        before, after = old['services'][name].get('environment') or {}, new['services'][name].get('environment') or {}
        for key in set(before) | set(after):
            if before.get(key) != after.get(key):
                if key not in changed:
                    raise Refusal('Rendered environment differs outside the planned keys')
                seen.add(key)
        if after.get('SERVICE_ACCESS_ENFORCEMENT') != 'true':
            raise Refusal('Every service must run with service access enforcement')
    if seen != set(changed):
        raise Refusal('A planned key does not reach the rendered services')
    if not (new['services']['web'].get('environment') or {}).get('TURNSTILE_SITE_KEY'):
        raise Refusal('The Turnstile site key does not reach the rendered web service')


def _moment(value):
    if not isinstance(value, str):
        raise Refusal('Evidence timestamp missing')
    try:
        stamp = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        raise Refusal('Evidence timestamp invalid') from None
    if stamp.tzinfo is None:
        raise Refusal('Evidence timestamp invalid')
    return stamp


def check_evidence(manifest_bytes, proof_bytes, owner_manifest, now, *, owner_manifest_sha256,
                   prepared_sha256, operator_commit=None):
    """The backup manifest and the native 040 restore proof must be real, bound to each other
    and to the running release, and fresh. Same facts the Daily registry_restore_healthy
    verifies (without importing it); any missing field fails closed."""
    try:
        backup, proof = json.loads(manifest_bytes), json.loads(proof_bytes)
    except ValueError:
        raise Refusal('Backup manifest or restore proof is not JSON') from None
    if not isinstance(backup, dict) or not isinstance(proof, dict):
        raise Refusal('Backup manifest or restore proof has an unexpected shape')
    run_id = backup.get('runId')
    active = proof.get('fundedRuntime')
    if (not isinstance(run_id, str) or not RUN_ID.fullmatch(run_id) or proof.get('backupRunId') != run_id
            or proof.get('backupManifestSha256') != sha(manifest_bytes)):
        raise Refusal('The restore proof is not bound to this backup manifest')
    if (backup.get('ownerCommit') != owner_manifest.get('commit') or backup.get('ownerImage') != owner_manifest.get('imageId')
            or proof.get('sourceCommit') != (operator_commit or owner_manifest.get('commit'))):
        raise Refusal('The backup or restore proof is not of the running release')
    if (not isinstance(active, dict) or active.get('version') != 'alterward-funded-replay-2'
            or active.get('schema') != 40 or active.get('recoveryProfile') != 'registry040'
            or active.get('sourceCommit') != backup.get('ownerCommit') or active.get('imageId') != backup.get('ownerImage')):
        raise Refusal('The restore proof is not a native 040 proof')
    # Bound to the exact owner manifest and successor candidate the Daily compares it with.
    if (not HEX64.fullmatch(str(active.get('ownerManifestDigest'))) or active.get('ownerManifestDigest') != owner_manifest_sha256
            or not HEX64.fullmatch(str(active.get('preparedSha256'))) or active.get('preparedSha256') != prepared_sha256):
        raise Refusal('The restore proof is not bound to the current owner manifest and successor candidate')
    if (proof.get('tablesMatchedBeforeReplay') != 103 or proof.get('reviewedTables') != 102
            or proof.get('reviewedForeignKeys') != 226 or proof.get('paidAiCalls') != 0
            or any(proof.get(k) is not True for k in PROOF_TRUE) or any(proof.get(k) is not False for k in PROOF_FALSE)):
        raise Refusal('The native restore proof is incomplete')
    backup_age = (now - _moment(backup.get('capturedAt'))).total_seconds()
    proof_time = _moment(proof.get('capturedAt'))
    proof_age = (now - proof_time).total_seconds()
    if not 0 <= backup_age <= MAX_BACKUP_AGE_SECONDS:
        raise Refusal('The backup manifest is not fresh')
    if not 0 <= proof_age <= MAX_PROOF_AGE_SECONDS or proof_time < _moment(backup.get('capturedAt')):
        raise Refusal('The native restore proof is not fresh')


def authority_value(env, key):
    return sha(env.get(key, '').encode())


# ---- journal ----------------------------------------------------------------
class Journal:
    def __init__(self, directory):
        self.dir = Path(directory)
        self.path = self.dir / 'journal.jsonl'

    def rows(self):
        if not self.path.exists() and not self.path.is_symlink():
            return []
        rows, previous = [], ZERO
        for number, line in enumerate(_private_read(self.path).splitlines(), 1):
            try:
                row = json.loads(line)
            except ValueError:
                raise Refusal('Service-env journal unreadable') from None
            body = {k: v for k, v in row.items() if k != 'sha256'} if isinstance(row, dict) else None
            if (body is None or row.get('version') != JOURNAL_VERSION or row.get('sequence') != number
                    or row.get('event') not in EVENTS or row.get('previousSha256') != previous
                    or row.get('sha256') != sha(canonical(body)) or line != canonical(row).rstrip(b'\n')):
                raise Refusal('Service-env journal chain broken')
            previous = row['sha256']
            rows.append(row)
        return rows

    def append(self, event, operation_id, now, **fields):
        rows = self.rows()
        body = {'version': JOURNAL_VERSION, 'sequence': len(rows) + 1, 'at': _stamp(now), 'event': event,
                'operationId': operation_id, 'previousSha256': rows[-1]['sha256'] if rows else ZERO, **fields}
        row = {**body, 'sha256': sha(canonical(body))}
        new = not self.path.exists()
        fd = os.open(self.path, os.O_CREAT | os.O_APPEND | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        try:
            os.fchmod(fd, 0o600)
            os.write(fd, canonical(row))
            os.fsync(fd)
        finally:
            os.close(fd)
        if new:
            _fsync_directory(self.dir)
        return row

    def state(self, operation_id):
        events = [r['event'] for r in self.rows() if r['operationId'] == operation_id]
        return events[-1] if events else None

    def open_operations(self):
        last = {}
        for row in self.rows():
            last[row['operationId']] = row['event']
        return [i for i, e in last.items() if e not in ('completed', 'rolled-back')]


# ---- core -------------------------------------------------------------------
class Stepper:
    """Core logic with injected host boundaries (tests use fakes).

    host.images()                       -> {service: imageId}, exactly one container each
    host.pending_jobs()                 -> number of queued/running/validating jobs
    host.source_sha256(path)            -> digest of the build source's compose inputs
    host.render(env_bytes, pinned_bytes, source) -> rendered compose config (dict)
    host.restart()                      -> recreate api/worker/web from the owner's frozen compose
    host.verify_running(config, image)  -> raise Refusal unless running == config, healthy, origin closed
    host.observe()                      -> operator-style digests of the running service
    """

    def __init__(self, *, owner_dir, step_dir, profile_dir, state_dir, host, clock, identity):
        self.operator = _load('service_operator_for_env', 'contabo-service-operator.py')
        self.profile = self.operator._load('service_profile_for_env', 'contabo-service-profile.py')
        self.owner = Path(owner_dir)
        self.step = Path(step_dir)
        self.profile_dir = Path(profile_dir)
        self.state_dir = Path(state_dir)
        self.host = host
        self.clock = clock
        self.identity = identity
        self.journal = Journal(self.step)

    # ---- planning (read-only) -------------------------------------------
    def _owner_bytes(self):
        return {name: _private_read(self.owner / name) for name in OWNER_FILES}

    def _spr_state(self):
        directory = self.profile_dir
        if not directory.exists() and not directory.is_symlink():
            return None
        try:
            return self.profile.verify(directory)
        except self.profile.ProfileError as error:
            raise Refusal('Service profile not verified: ' + str(error)) from None

    def plan(self, request):
        request = validate_request(request)
        files = self._owner_bytes()
        manifest = json.loads(files['manifest.json'])
        old_text = files['server.env'].decode()
        env_before = parse_env(old_text)
        # Owner files must be the ones the manifest names, and the stack must be the pinned image.
        if (sha(files['server.env']) != manifest.get('ownerEnvironmentSha256')
                or sha(files['effective-compose.json']) != manifest.get('effectiveComposeSha256')):
            raise Refusal('Owner files do not match their manifest')
        if manifest.get('imageId') != request['imageId']:
            raise Refusal('Requested image is not the pinned owner image')
        old_config = json.loads(files['effective-compose.json'])
        # The running containers must be exactly the stored configuration: a restart would
        # otherwise also carry every unplanned drift, and the billing precondition must hold
        # in the running state, not only in the files (read-only: inspect + anonymous probe).
        try:
            self.host.verify_running(unfrozen(old_config), request['imageId'])
        except Refusal as error:
            raise Refusal('Running services differ from the stored configuration: ' + str(error)) from None
        images = self.host.images()
        if set(images) != set(SERVICES) or any(images[s] != request['imageId'] for s in SERVICES):
            raise Refusal('Running services are not the requested image')
        if self.host.source_sha256(request['sourceDirectory']) != manifest.get('sourceComposeSha256'):
            raise Refusal('Compose source differs from the running release')
        try:
            unfinished = self.operator.Journal(self.state_dir).unfinished_all()
        except self.operator.Refusal as error:
            raise Refusal(str(error)) from None
        if unfinished:
            raise Refusal('Unfinished service operation: reconcile it first')
        if self.journal.open_operations():
            raise Refusal('Unfinished service-env operation: resume it first')
        changes = {k: v for k, v in request['values'].items() if env_before.get(k) != v}
        if not changes:
            raise Refusal('The request changes nothing')
        env_after_text = apply_env(old_text, changes)
        env_after = parse_env(env_after_text)
        if {k: v for k, v in env_before.items() if k not in changes} != \
                {k: v for k, v in env_after.items() if k not in changes}:
            raise Refusal('Unrelated environment changed')
        validate_after(env_after)
        pending = self.host.pending_jobs()
        if pending != 0:
            raise Refusal('Queued or running jobs exist: wait until the queue is empty')
        try:
            config = self.host.render(env_after_text.encode(), files['pinned-image.json'], request['sourceDirectory'])
        except Refusal:
            raise
        except Exception:
            raise Refusal('Rendering the new configuration failed') from None
        new_frozen = frozen(config)
        check_compose_delta(old_config, json.loads(new_frozen), set(changes))
        # SPR parent and generation.
        current = self._spr_state()
        successor = self.host.successor_state()
        if successor.get('pending') is not False or successor.get('upgradeHealthy') is not True:
            raise Refusal('A successor or upgrade state is still in progress')
        if current is None:
            # The first generation descends from the successor chain's last billing-enforce readback,
            # computed from the chain itself, never named by the request.
            if (successor.get('purpose') != 'billing-config-040' or successor.get('stage') != 'enforce'
                    or not isinstance(successor.get('readbackSha256'), str)
                    or not HEX64.fullmatch(successor['readbackSha256'])):
                raise Refusal('The successor chain does not end at the billing enforce stage')
            parent, generation = successor['readbackSha256'], 1
        else:
            parent, generation = current['profileSha256'], current['generation'] + 1
        evidence_root = ops_root(self.owner)
        backup_bytes = _private_read(evidence_root / request['backupManifestPath'])
        proof_bytes = _private_read(evidence_root / request['restoreProofPath'])
        check_evidence(backup_bytes, proof_bytes, manifest, self.clock(),
                       owner_manifest_sha256=sha(files['manifest.json']),
                       prepared_sha256=successor.get('preparedSha256'))
        backup, restore = sha(backup_bytes), sha(proof_bytes)
        new_manifest = {**manifest, 'ownerEnvironmentSha256': sha(env_after_text.encode()),
                        'effectiveComposeSha256': sha(new_frozen)}
        plan = {
            'version': PLAN_VERSION, 'generation': generation, 'parentProfileSha256': parent,
            'sourceCommit': manifest['commit'], 'imageId': request['imageId'],
            'sourceDirectory': request['sourceDirectory'],
            'before': {'serverEnvSha256': sha(files['server.env']),
                       'effectiveComposeSha256': sha(files['effective-compose.json']),
                       'manifestSha256': sha(files['manifest.json']),
                       'pinnedImageSha256': sha(files['pinned-image.json'])},
            'after': {'serverEnvSha256': sha(env_after_text.encode()),
                      'effectiveComposeSha256': sha(new_frozen),
                      'manifestSha256': sha(encoded(new_manifest)),
                      'pinnedImageSha256': sha(files['pinned-image.json'])},
            'changes': {k: {'beforeSha256': authority_value(env_before, k) if k in env_before else None,
                            'afterSha256': sha(v.encode())} for k, v in sorted(changes.items())},
            'backupManifestSha256': backup, 'restoreProofSha256': restore,
        }
        plan_sha = sha(canonical(plan))
        artifacts = {'serverEnv': env_after_text.encode(), 'compose': new_frozen,
                     'manifest': encoded(new_manifest), 'config': config}
        return plan, plan_sha, artifacts

    def plan_image(self, raw):
        request = validate_image_request(raw, ops_root(self.owner))
        build = request['build']
        files = self._owner_bytes()
        manifest = json.loads(files['manifest.json'])
        old_image, old_commit = manifest['imageId'], manifest['commit']
        if (old_image == build['imageId'] or old_commit == build['commit']
                or not IMAGE.fullmatch(old_image) or not COMMIT.fullmatch(old_commit)
                or manifest.get('ownerEnvironmentSha256') != sha(files['server.env'])
                or manifest.get('effectiveComposeSha256') != sha(files['effective-compose.json'])):
            raise Refusal('New image and exact current owner files required')
        current = self._spr_state()
        successor = self.host.successor_state()
        if (current is None or successor.get('pending') is not False or successor.get('upgradeHealthy') is not True
                or successor.get('purpose') != 'billing-config-040' or successor.get('stage') != 'enforce'):
            raise Refusal('Active service profile above native040 billing enforcement required')
        profile = current['profile']
        if profile['sourceCommit'] != old_commit or profile['schema'] != 40:
            raise Refusal('Current owner commit does not match the native040 service profile')
        self.operator.assert_running_matches(profile, self.host.observe())
        if self.journal.open_operations() or self.operator.Journal(self.state_dir).unfinished_all():
            raise Refusal('An unfinished service operation exists')
        before = unfrozen(json.loads(files['effective-compose.json']))
        validate_after(parse_env(files['server.env'].decode()))
        self.host.verify_running(before, old_image)
        if self.host.pending_jobs() != 0:
            raise Refusal('Queued or running jobs exist')
        self.host.require_image_hold()
        pin = {'services': {s: {'image': old_image, 'pull_policy': 'never'} for s in SERVICES}}
        if json.loads(files['pinned-image.json']) != pin:
            raise Refusal('Current image pin differs from the serving image')
        for service in pin['services'].values():
            service['image'] = build['imageId']
        next_pin = encoded(pin)
        target = image_only_compose(before, old_image, build['imageId'])
        if self.host.source_sha256(build['sourceDirectory']) != manifest.get('sourceComposeSha256'):
            raise Refusal('Image release must preserve the original Compose source')
        fresh_render = self.host.render(files['server.env'], next_pin, build['sourceDirectory'])
        # The cached release directory may change only the verified build context;
        # the serving configuration itself keeps its original context and pins.
        adjusted = copy.deepcopy(fresh_render)
        for name in SERVICES:
            old_build = target['services'][name].get('build')
            new_build = adjusted['services'][name].get('build')
            if old_build is not None and new_build is not None:
                if new_build.get('context') != build['sourceDirectory']:
                    raise Refusal('Candidate Compose context differs from the verified source')
                new_build['context'] = old_build['context']
        if adjusted != target:
            raise Refusal('Candidate configuration changes more than the service images')
        binding, capability_sha, rehearsal_sha = self.host.verify_image_release(request, old_commit)
        evidence_root = ops_root(self.owner)
        backup_bytes = _private_read(evidence_root / request['backupManifestPath'])
        proof_bytes = _private_read(evidence_root / request['restoreProofPath'])
        check_evidence(backup_bytes, proof_bytes, manifest, self.clock(),
                       owner_manifest_sha256=sha(files['manifest.json']),
                       prepared_sha256=successor['preparedSha256'],
                       operator_commit=self.host.verify_latest_restore(request))
        next_compose = frozen(target)
        next_manifest = encoded({**manifest, 'commit': build['commit'], 'imageId': build['imageId'],
                                 'effectiveComposeSha256': sha(next_compose)})
        after = {**files, 'pinned-image.json': next_pin, 'manifest.json': next_manifest,
                 'effective-compose.json': next_compose}
        keys = dict(zip(OWNER_FILES, ('serverEnvSha256', 'effectiveComposeSha256',
                                      'manifestSha256', 'pinnedImageSha256')))
        plan = {'version': IMAGE_PLAN_VERSION, 'generation': current['generation'] + 1,
                'parentProfileSha256': current['profileSha256'], 'sourceCommit': build['commit'],
                'imageId': build['imageId'], 'before': {keys[k]: sha(v) for k, v in files.items()},
                'after': {keys[k]: sha(v) for k, v in after.items()}, 'changes': {},
                'backupManifestSha256': sha(backup_bytes), 'restoreProofSha256': sha(proof_bytes),
                'previousCommit': old_commit, 'previousImageId': old_image, 'build': build,
                'bundleSha256': binding['bundleSha256'], 'capabilitySha256': capability_sha,
                'rehearsalSha256': rehearsal_sha}
        return plan, sha(canonical(plan)), {'files': after, 'config': target}

    @staticmethod
    def phrase(plan, plan_sha):
        verb = 'activate-service-image' if plan['version'] == IMAGE_PLAN_VERSION else 'activate-service-env'
        return f'{verb} {plan_sha[:16]} generation {plan["generation"]}'

    def plan_report(self, request, *, image=False):
        plan, plan_sha, _ = self.plan_image(request) if image else self.plan(request)
        return {'planSha256': plan_sha, 'plan': plan, 'confirm': self.phrase(plan, plan_sha),
                'changedKeys': sorted(plan['changes']), 'paidAiCalls': 0}

    # ---- apply --------------------------------------------------------------
    def apply(self, request, *, plan_sha256, confirm, image=False):
        plan, plan_sha, artifacts = self.plan_image(request) if image else self.plan(request)
        if plan_sha != plan_sha256:
            raise Refusal('The plan changed since it was shown: run plan again')
        expected = self.phrase(plan, plan_sha)
        if confirm != expected:
            raise Refusal('Owner confirmation required: --confirm "' + expected + '"')
        operation_id = str(uuid.uuid4())
        directory = self.step / operation_id
        _private_directory(directory, create=True)
        previous = directory / 'previous'
        _private_directory(previous, create=True)
        files = self._owner_bytes()
        self._check_files(plan['before'])
        for name, data in files.items():
            _create(previous / name, data)
        _create(directory / 'plan.json', canonical({**plan, 'approvalSha256': sha(confirm.encode()),
                                                    'approvedAt': _stamp(self.clock())}))
        user, host_name = self.identity()
        self.journal.append('intent-persisted', operation_id, self.clock(), planSha256=plan_sha,
                            generation=plan['generation'], changes=plan['changes'],
                            **({'planVersion': IMAGE_PLAN_VERSION} if image else {}),
                            before=plan['before'], after=plan['after'],
                            operatorSha256=sha(canonical({'user': user, 'host': host_name})))
        try:
            if image:
                self.host.stop()
                for name in ('effective-compose.json', 'manifest.json', 'pinned-image.json'):
                    _replace(self.owner / name, artifacts['files'][name])
            else:
                _replace(self.owner / 'server.env', artifacts['serverEnv'])
                _replace(self.owner / 'effective-compose.json', artifacts['compose'])
                _replace(self.owner / 'manifest.json', artifacts['manifest'])
            self.journal.append('files-replaced', operation_id, self.clock())
            self.host.restart()
            self.host.verify_running(artifacts['config'], plan['imageId'])
            self._check_files(plan['after'])
        except BaseException as error:
            if not self._rollback(operation_id, directory, plan):
                raise Refusal('Runtime change failed and restoration did not verify; operation ' + operation_id) from None
            label = 'image' if image else 'environment'
            reason = ': ' + str(error) if isinstance(error, Refusal) else ''
            raise Refusal('The new ' + label + ' was not accepted and the previous files were restored' + reason) from None
        self.journal.append('env-applied', operation_id, self.clock(), after=plan['after'])
        return self._finish(operation_id, directory, plan)

    def _check_files(self, expected):
        files = self._owner_bytes()
        if (sha(files['server.env']) != expected['serverEnvSha256']
                or sha(files['effective-compose.json']) != expected['effectiveComposeSha256']
                or sha(files['manifest.json']) != expected['manifestSha256']
                or sha(files['pinned-image.json']) != expected['pinnedImageSha256']):
            raise Refusal('Owner files differ from the plan')

    def _rollback(self, operation_id, directory, plan):
        """Restore the previous files byte-exactly, restart and re-verify. Never raises."""
        try:
            previous = directory / 'previous'
            stored = {name: _private_read(previous / name) for name in OWNER_FILES}
            image = plan['version'] == IMAGE_PLAN_VERSION
            if any(sha(stored[n]) != plan['before'][k] for n, k in (
                    ('server.env', 'serverEnvSha256'), ('effective-compose.json', 'effectiveComposeSha256'),
                    ('manifest.json', 'manifestSha256'), ('pinned-image.json', 'pinnedImageSha256'))):
                raise Refusal('Stored previous files differ from the plan')
            names = OWNER_FILES if image else ('server.env', 'effective-compose.json', 'manifest.json')
            if image:
                self.host.stop()
            for name in names:
                if _private_read(self.owner / name) != stored[name]:
                    _replace(self.owner / name, stored[name])
            self.host.restart()
            self.host.verify_running(unfrozen(json.loads(stored['effective-compose.json'])),
                                     plan['previousImageId'] if image else plan['imageId'])
            self._check_files(plan['before'])
            self.journal.append('rolled-back', operation_id, self.clock(), restored=plan['before'])
            return True
        except BaseException:
            try:
                self.journal.append('rollback-failed', operation_id, self.clock())
            except BaseException:
                pass
            return False

    def _finish(self, operation_id, directory, plan):
        """Activate the next SPR generation for a live, verified environment."""
        approval = json.loads(_private_read(directory / 'plan.json'))
        profile = {
            'version': self.profile.PROFILE_VERSION, 'generation': plan['generation'],
            'parentProfileSha256': plan['parentProfileSha256'], 'sourceCommit': plan['sourceCommit'],
            'imageId': plan['imageId'], 'effectiveComposeSha256': plan['after']['effectiveComposeSha256'],
            'serverEnvSha256': plan['after']['serverEnvSha256'],
            'pinnedImageSha256': plan['after']['pinnedImageSha256'], 'schema': 40,
            'serviceAccessEnforcement': True,
            'activation': {'approvalSha256': approval['approvalSha256'], 'approvedAt': approval['approvedAt'],
                           'backupManifestSha256': plan['backupManifestSha256'],
                           'restoreProofSha256': plan['restoreProofSha256']},
            'restoredFrom': None}
        parsed = self.profile.parse_profile(profile)
        expected_hash = self.profile.profile_hash(parsed)
        # The record is the root of trust for the running service: write it only for a service that already matches.
        try:
            self.operator.assert_running_matches(parsed, self.host.observe())
        except self.operator.Refusal as error:
            raise Refusal('Running service does not match the service profile to be activated: ' + str(error)) from None
        current = self._spr_state_or_none()
        if current is not None and current['generation'] == plan['generation']:
            if current['profileSha256'] != expected_hash:
                raise Refusal('A different service profile generation already exists')
        else:
            if (current is None and plan['generation'] != 1) or \
                    (current is not None and current['generation'] != plan['generation'] - 1):
                raise Refusal('Service profile generation order differs from the plan')
            try:
                self.profile.activate(self.profile_dir, profile, now=self.clock())
            except self.profile.ProfileError as error:
                raise Refusal('Service profile activation failed (the environment is live): '
                              'run resume --operation-id ' + operation_id + ': ' + str(error)) from None
        record = self.profile.verify(self.profile_dir)
        if record['profileSha256'] != expected_hash:
            raise Refusal('The active service profile is not the planned generation')
        self.journal.append('completed', operation_id, self.clock(), generation=record['generation'],
                            profileSha256=record['profileSha256'])
        return {'operationId': operation_id, 'generation': record['generation'],
                'profileSha256': record['profileSha256'], 'planSha256': sha(canonical(plan)),
                'changedKeys': sorted(plan['changes']), 'before': plan['before'], 'after': plan['after'],
                'paidAiCalls': 0, 'databaseConnections': 0}

    def _spr_state_or_none(self):
        directory = self.profile_dir
        if not directory.exists() and not directory.is_symlink():
            return None
        try:
            return self.profile.verify(directory)
        except self.profile.ProfileError:
            # Partial write: leave the repair to the documented owner procedure.
            raise Refusal('Service profile record is incomplete: repair it per ADR-011, then resume') from None

    # ---- resume ---------------------------------------------------------------
    @staticmethod
    def rollback_phrase(operation_id, *, image=False):
        name = 'image' if image else 'env'
        return f'rollback-service-{name} {operation_id}'

    def resume(self, operation_id, *, rollback=False, confirm=None):
        state = self.journal.state(operation_id)
        if state is None:
            raise Refusal('No such service-env operation')
        if state in ('completed', 'rolled-back'):
            raise Refusal('Operation already ended')
        directory = self.step / operation_id
        _private_directory(directory)
        plan_file = json.loads(_private_read(directory / 'plan.json'))
        plan = {k: v for k, v in plan_file.items() if k not in ('approvalSha256', 'approvedAt')}
        intent = [r for r in self.journal.rows() if r['operationId'] == operation_id
                  and r['event'] == 'intent-persisted']
        image = len(intent) == 1 and intent[0].get('planVersion') == IMAGE_PLAN_VERSION
        if image or plan.get('version') == IMAGE_PLAN_VERSION:
            plan_sha = sha(canonical(plan))
            if (not image or plan.get('version') != IMAGE_PLAN_VERSION
                    or intent[0].get('planSha256') != plan_sha
                    or plan_file.get('approvalSha256') != sha(self.phrase(plan, plan_sha).encode())):
                raise Refusal('Stored image plan does not match the journaled approval')
        if rollback:
            # Exit from a live-but-unprofiled environment: allowed only before this plan's SPR
            # generation exists, and only with the owner's operation-specific sentence.
            if state != 'env-applied':
                raise Refusal('--rollback only applies to an applied environment; plain resume restores the rest')
            if confirm != self.rollback_phrase(operation_id, image=image):
                raise Refusal('Owner confirmation required: --confirm "' + self.rollback_phrase(operation_id, image=image) + '"')
            current = self._spr_state_or_none()
            if current is not None and current['generation'] >= plan['generation']:
                raise Refusal('The service profile generation already exists: it cannot be rolled back here')
            if not self._rollback(operation_id, directory, plan):
                raise Refusal('Rollback did not verify: service left as is; emergency stop is available')
            return {'operationId': operation_id, 'outcome': 'rolled-back', 'paidAiCalls': 0}
        if state == 'env-applied':
            self._check_files(plan['after'])
            config = unfrozen(json.loads(_private_read(self.owner / 'effective-compose.json')))
            self.host.verify_running(config, plan['imageId'])
            return self._finish(operation_id, directory, plan)
        if not self._rollback(operation_id, directory, plan):
            raise Refusal('Rollback did not verify: service left as is; emergency stop is available')
        return {'operationId': operation_id, 'outcome': 'rolled-back', 'paidAiCalls': 0}


def ops_root(owner_dir):
    """Evidence paths in a request are relative to the ops root (owner's parent directory)."""
    return Path(owner_dir).parent


class HostRuntime:
    """Docker/compose adapter. Unverified on the target until the E2/E3 rehearsal."""

    QUEUE_PROBE = ("import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';"
                   "const {Client}=createRequire('/app/packages/database/package.json')('pg');"
                   "const ca=readFileSync(process.env.DATABASE_SSL_CA_FILE,'utf8');"
                   "const client=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca},"
                   "connectionTimeoutMillis:10000});try{await client.connect();await client.query('BEGIN READ ONLY');"
                   "let n=0;for(const table of ['ff_jobs','aw_jobs','aw_shared_jobs','aw_public_review_jobs',"
                   "'aw_public_content_reviews','aw_scenario_reviews']){const {rows}=await client.query(`SELECT count(*)::int AS pending "
                   "FROM ${table} WHERE status IN ('queued','running','validating')`);n+=rows[0].pending}"
                   "await client.query('COMMIT');console.log(JSON.stringify({pendingJobs:n}))}finally{await client.end()}")

    ANONYMOUS_PROBE = ("let count=0;for(const url of ['http://alterward-web:3000/','http://alterward-web:3000/discover',"
                       "'http://127.0.0.1:4000/api/public/discovery','http://127.0.0.1:4000/api/public/config'])"
                       "{const r=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'manual'});"
                       "if(r.status!==403||!r.headers.get('cache-control')?.includes('no-store'))"
                       "throw Error('Origin access boundary failed');count++}"
                       "console.log(JSON.stringify({anonymousDenied:count}));")

    def __init__(self, *, owner_dir=OWNER_DIR, runner=None, operator=None, daily=None, daily_loader=None):
        self.owner = Path(owner_dir)
        self.runner = runner or self._run
        self.operator = operator
        self._daily = daily
        self._daily_loader = daily_loader or load_daily

    @property
    def daily(self):
        """Daily is loaded on first use: rollback and the other host calls never touch it."""
        if self._daily is None:
            self._daily = self._daily_loader()
        return self._daily

    @staticmethod
    def _run(args, *, input=None, timeout=60):
        result = subprocess.run(args, input=input, capture_output=True, timeout=timeout,
                                env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C'})
        if result.returncode:
            raise Refusal('Host command failed')
        return result.stdout

    def _compose(self):
        return ['docker', 'compose', '--project-name', PROJECT, '-f', str(self.owner / 'effective-compose.json')]

    def images(self):
        result = {}
        for service in SERVICES:
            ids = self.runner(self._compose() + ['ps', '-q', service]).decode().split()
            if len(ids) != 1:
                raise Refusal('Exactly one running container per service required')
            result[service] = self.runner(['docker', 'inspect', '--format', '{{.Image}}', ids[0]]).decode().strip()
        return result

    def pending_jobs(self):
        output = self.runner(self._compose() + ['exec', '-T', 'api', 'node', '--input-type=module', '-e',
                                                self.QUEUE_PROBE], timeout=60)
        value = json.loads(output)
        if type(value.get('pendingJobs')) is not int:
            raise Refusal('Queue probe returned an unexpected result')
        return value['pendingJobs']

    def require_image_hold(self):
        operator = self.operator.Operator(profile_dir=ops_root(self.owner) / PROFILE_DIR.name,
                                          state_dir=STATE_DIR, runtime=self.operator.HostRuntime(owner_dir=self.owner),
                                          clock=lambda: dt.datetime.now(dt.timezone.utc), identity=lambda: ())
        status = operator.status()
        database = status.get('database') or {}
        policy = database.get('policy') or {}
        if (status.get('runningMatchesProfile') is not True or status.get('unfinishedOperations') != []
                or policy.get('generationEnabled') is not False or policy.get('checkoutEnabled') is not False
                or policy.get('mode') != 'invitation' or policy.get('reconcileRequired') is not False):
            raise Refusal('Admission, generation and checkout must be paused before changing the image')

    def verify_latest_restore(self, request):
        daily = self.daily
        value = daily.config()
        if not daily.registry_restore_healthy(value, latest=True):
            raise Refusal('Fresh native040 restore of the latest backup required')
        proof = json.loads(_private_read(ops_root(self.owner) / request['restoreProofPath']))
        if request['backupManifestPath'] != f'daily/backups/{proof["backupRunId"]}/manifest.json':
            raise Refusal('Requested backup is not the latest restored archive')
        return value['sourceCommit']

    def verify_image_release(self, request, previous_commit):
        build = request['build']
        source = Path(build['sourceDirectory'])
        _private_directory(source)
        rehearsal = _load('service_image_rehearsal', 'contabo-funded-image-rehearsal.py')
        rehearsal.REPO = source
        git = ['git', '-c', 'safe.directory=' + str(source)]
        if (rehearsal.run(git + ['rev-parse', 'HEAD']).decode().strip() != build['commit']
                or rehearsal.run(git + ['status', '--porcelain', '--ignored', '--untracked-files=all']).strip()):
            raise Refusal('Exact clean release checkout required')
        rehearsal.run(git + ['merge-base', '--is-ancestor', previous_commit, build['commit']])
        delta = rehearsal.run(git + ['diff', '--no-renames', '--name-only', '-z', previous_commit,
                                    build['commit'], '--', *IMAGE_SCOPE])
        if delta != IMAGE_DELTA_PATH.encode() + b'\0':
            raise Refusal('Only the reviewed Stripe cancellation correction may change')
        binding = rehearsal.source_binding()
        if (binding['sourceCommit'] != build['commit']
                or binding['sourceHashes'].get(IMAGE_DELTA_PATH) != IMAGE_DELTA_SHA256):
            raise Refusal('The cancellation correction differs from the reviewed bytes')
        identity = json.loads(self.runner(['docker', 'image', 'inspect', build['imageTag']]))
        if len(identity) != 1:
            raise Refusal('Exact cached release image required')
        rehearsal.validate_image_configuration(identity[0], build['imageId'])
        evidence_sha = require_image_rehearsal(Path(request['rehearsalDirectory']), rehearsal, build, binding)
        capability = rehearsal.verify_image_sources(build['imageId'], binding, registry=True)
        return binding, sha(encoded(capability)), evidence_sha

    def source_sha256(self, source):
        path = Path(source)
        if path.is_symlink() or not path.is_dir():
            raise Refusal('Release source directory required')
        names = ['deploy/compose.yaml', 'deploy/compose.contabo.yaml', 'deploy/closed-site-owner.flags.env']
        return sha(b''.join((path / n).read_bytes() for n in names))

    def render(self, env_bytes, pinned_bytes, source):
        with tempfile.TemporaryDirectory(prefix='alterward-service-env-',
                                         dir='/run' if os.access('/run', os.W_OK) else None) as scratch:
            env_file, override = Path(scratch) / 'server.env', Path(scratch) / 'pinned-image.json'
            _create(env_file, env_bytes)
            _create(override, pinned_bytes)
            output = self.runner(['docker', 'compose', '--project-name', PROJECT, '--env-file', str(env_file),
                                  '-f', str(Path(source) / 'deploy/compose.contabo.yaml'), '-f', str(override),
                                  'config', '--format', 'json'])
        return json.loads(output)

    def stop(self):
        self.runner(self._compose() + ['stop', '--timeout', '30', *SERVICES], timeout=120)

    def restart(self):
        self.runner(self._compose() + ['up', '-d', '--no-build', '--pull', 'never', '--wait',
                                       '--wait-timeout', '120'], timeout=180)

    def verify_running(self, config, image_id):
        ids = self.runner(['docker', 'ps', '-aq', '--no-trunc', '--filter',
                           'label=com.docker.compose.project=' + PROJECT]).decode().split()
        containers = json.loads(self.runner(['docker', 'inspect', *ids])) if ids else []
        by_service = {}
        for item in containers:
            labels = item['Config'].get('Labels', {})
            name = labels.get('com.docker.compose.service')
            if labels.get('com.docker.compose.project') != PROJECT or name in by_service:
                raise Refusal('Unexpected running project member')
            by_service[name] = item
        if set(by_service) != set(SERVICES):
            raise Refusal('Incomplete running owner stack')
        for name, item in by_service.items():
            environment = {}
            for entry in item['Config'].get('Env', []):
                key, value = entry.split('=', 1)
                environment[key] = value
            expected = config['services'][name]['environment']
            state = item['State']
            if (any(environment.get(k) != str(v) for k, v in expected.items())
                    or item['Image'] != image_id or not state.get('Running') or state.get('OOMKilled')
                    or (name != 'worker' and state.get('Health', {}).get('Status') != 'healthy')):
                raise Refusal('Running service does not match the frozen configuration')
        output = self.runner(self._compose() + ['exec', '-T', 'api', 'node', '--input-type=module', '-e',
                                                self.ANONYMOUS_PROBE], timeout=60)
        if json.loads(output).get('anonymousDenied') != 4:
            raise Refusal('Origin access boundary failed')

    def observe(self):
        return self.operator.HostRuntime(owner_dir=self.owner).observe()

    def successor_state(self):
        """The successor chain's last fully exposed generation, read through Daily's own validators."""
        try:
            daily = self.daily
            healthy = bool(daily.funded_upgrade_healthy('personal-beta'))
            if not daily.successor_roots():
                return {'pending': False, 'upgradeHealthy': healthy, 'purpose': None, 'stage': None,
                        'readbackSha256': None, 'preparedSha256': None}
            state = daily.successor_active_state()
            prepared = daily.regular(state['directory'] / 'prepared.json')
            plan = json.loads(prepared)['operation']['plan']
            readback = daily.regular(state['directory'] / 'readback.json')
            return {'pending': state['pending'] is not None, 'upgradeHealthy': healthy,
                    'purpose': plan.get('purpose'), 'stage': plan.get('stage'), 'readbackSha256': sha(readback),
                    'preparedSha256': sha(prepared)}
        except Refusal:
            raise
        except Exception:
            raise Refusal('The successor chain could not be read') from None


def parser():
    top = argparse.ArgumentParser(prog='contabo-service-env')
    sub = top.add_subparsers(dest='command', required=True)
    plan = sub.add_parser('plan')
    plan.add_argument('--request', required=True)
    image_plan = sub.add_parser('image-plan')
    image_plan.add_argument('--request', required=True)
    apply = sub.add_parser('apply')
    apply.add_argument('--request', required=True)
    apply.add_argument('--plan-sha256', required=True)
    apply.add_argument('--confirm', required=True)
    image_apply = sub.add_parser('image-apply')
    image_apply.add_argument('--request', required=True)
    image_apply.add_argument('--plan-sha256', required=True)
    image_apply.add_argument('--confirm', required=True)
    resume = sub.add_parser('resume')
    resume.add_argument('--operation-id', required=True)
    resume.add_argument('--rollback', action='store_true')
    resume.add_argument('--confirm')
    return top


def run(arguments, stepper):
    if arguments.command == 'resume':
        if arguments.confirm is not None and not arguments.rollback:
            raise Refusal('--confirm only belongs to --rollback')
        return stepper.resume(str(uuid.UUID(arguments.operation_id)), rollback=arguments.rollback,
                              confirm=arguments.confirm)
    request = json.loads(_private_read(Path(arguments.request)))
    if arguments.command in ('plan', 'image-plan'):
        return stepper.plan_report(request, image=arguments.command == 'image-plan')
    if not HEX64.fullmatch(arguments.plan_sha256):
        raise Refusal('Exact plan hash required')
    return stepper.apply(request, plan_sha256=arguments.plan_sha256, confirm=arguments.confirm,
                         image=arguments.command == 'image-apply')


def build_stepper():
    """Wire the step to the real host. Daily is not loaded here: only the plan path reads it, lazily."""
    operator = _load('service_operator_for_env_main', 'contabo-service-operator.py')
    _private_directory(STATE_DIR, create=True)
    _private_directory(STEP_DIR, create=True)
    stepper = Stepper(owner_dir=OWNER_DIR, step_dir=STEP_DIR, profile_dir=PROFILE_DIR, state_dir=STATE_DIR,
                      host=HostRuntime(operator=operator), clock=lambda: dt.datetime.now(dt.timezone.utc),
                      identity=lambda: (os.environ.get('SUDO_USER') or os.environ.get('USER') or 'root',
                                        socket.gethostname()))
    return operator, stepper


def main(argv=None):
    arguments = parser().parse_args(sys.argv[1:] if argv is None else argv)
    if _uid() != 0:
        print('root required', file=sys.stderr)
        return 2
    try:
        operator, stepper = build_stepper()
        # The operator's lock keeps a service operation and this step from running together.
        with operator.operation_lock(STATE_DIR):
            image_operation = arguments.command in ('image-plan', 'image-apply')
            if arguments.command == 'resume':
                operation = str(uuid.UUID(arguments.operation_id))
                rows = [r for r in stepper.journal.rows() if r['operationId'] == operation
                        and r['event'] == 'intent-persisted']
                image_operation = any(r.get('planVersion') == IMAGE_PLAN_VERSION for r in rows)
            if image_operation:
                daily = stepper.host.daily
                with daily.exclusive(daily.ROOT / 'job.lock'), daily.exclusive(OWNER_DIR / 'activation.lock'):
                    result = run(arguments, stepper)
            else:
                result = run(arguments, stepper)
            print(json.dumps(result, sort_keys=True))
        return 0
    except (Refusal, ValueError, OSError, RuntimeError, ImportError, subprocess.SubprocessError) as error:
        print('Service env step refused: ' + (str(error) if type(error).__name__ == 'Refusal' else 'invalid input'),
              file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

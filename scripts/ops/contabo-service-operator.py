"""Root service operator: pause/resume, bounded-admission waves, revocation and
restore reconcile. No arbitrary SQL, no free-form JSON, no Auth provider.

Authority comes from the durable service-profile record (ADR-011, accepted
2026-11-03), verified here read-only before every privileged operation:
  * the record's hash chain is intact and the active profile is well formed;
  * the running api/worker/web images, the effective compose, the server.env and
    pinned-image digests and SERVICE_ACCESS_ENFORCEMENT=true all match it.
Any failure refuses the operation. The only exception is an explicit
`--emergency` flag on the two exposure-REDUCING operations (pause both gates,
close the open wave): they may run without a verified profile, but only against
the observed running api image, and the journal marks them
`unverifiedAuthority: true`. Opening, raising capacity, resuming, revoking
and restore-reconcile never run without a verified profile.

Every privileged operation follows the persist-before-SQL protocol of the DB
core (scripts/lib/service-operations.ts): prepare (read-only) -> durable intent
file + hash-chained journal row -> apply (one serializable transaction) ->
readback row. A lost apply response is resolved only by a read-only reconcile
of the stored intent, never by repeating SQL, and only once the original
helper is provably gone (this process holds the exclusive operation lock).
"""

import argparse
import contextlib
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import socket
import stat
import subprocess
import sys
import uuid

OPS = Path('/root/alterward-ops')
OWNER_DIR = OPS / 'owner'
STATE_DIR = Path('/var/lib/alterward/service-operations')
PROJECT = 'alterward-owner'
SERVICES = ('api', 'worker', 'web')
PROBE_COMMAND = ['--import', 'tsx', 'scripts/ops/service-operation-probe.ts']
JOURNAL_VERSION = 'alterward-service-operator-journal-1'
INTENT_NAME = 'intent.json'
READBACK_NAME = 'readback.json'
ZERO = '0' * 64
HEX64 = re.compile(r'[a-f0-9]{64}')
IMAGE = re.compile(r'sha256:[a-f0-9]{64}')
UNVERIFIED_COMMIT = '0' * 40
# Exposure-reducing operations that may run on emergency authority.
EMERGENCY_KINDS = ('pause', 'wave-close')
ROW_COMMON = {'version', 'sequence', 'at', 'event', 'operationId', 'previousSha256', 'sha256'}
EVENTS = {'intent-persisted', 'apply-started', 'applied', 'apply-unknown',
          'reconciled-committed', 'reconciled-uncommitted', 'drift-accepted'}


class Refusal(ValueError):
    """A fail-closed refusal with an operator-readable reason; nothing was changed."""


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parent / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
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
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    value = path.lstat()
    if (stat.S_ISLNK(value.st_mode) or not stat.S_ISDIR(value.st_mode) or value.st_uid != _uid()
            or stat.S_IMODE(value.st_mode) != 0o700):
        raise Refusal('Private operation directory required')


def _private_read(path):
    value = path.lstat()
    if (not stat.S_ISREG(value.st_mode) or value.st_nlink != 1 or value.st_uid != _uid()
            or stat.S_IMODE(value.st_mode) != 0o600):
        raise Refusal('Private regular operation file required')
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


class Journal:
    """Append-only, hash-chained operation journal (fsync before the SQL step)."""

    def __init__(self, state_dir):
        self.dir = Path(state_dir)
        self.path = self.dir / 'journal.jsonl'

    def rows(self):
        if not self.path.exists() and not self.path.is_symlink():
            return []
        rows, previous = [], ZERO
        for number, line in enumerate(_private_read(self.path).splitlines(), 1):
            try:
                row = json.loads(line)
            except ValueError:
                raise Refusal('Operation journal unreadable') from None
            body = {k: v for k, v in row.items() if k != 'sha256'} if isinstance(row, dict) else None
            if (body is None or not ROW_COMMON <= set(row) or row['version'] != JOURNAL_VERSION
                    or row['sequence'] != number or row['event'] not in EVENTS
                    or row['previousSha256'] != previous or row['sha256'] != sha(canonical(body))
                    or line != canonical(row).rstrip(b'\n')):
                raise Refusal('Operation journal chain broken')
            previous = row['sha256']
            rows.append(row)
        return rows

    def head(self):
        rows = self.rows()
        return rows[-1]['sha256'] if rows else ZERO

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

    def unfinished_all(self):
        """Operations that started SQL (or may have) without a terminal row."""
        state = {}
        for row in self.rows():
            if row['event'] in ('intent-persisted', 'apply-started', 'apply-unknown'):
                state[row['operationId']] = row
            else:
                state.pop(row['operationId'], None)
        # intent-persisted without apply-started never reached SQL
        return [r for r in state.values() if r['event'] != 'intent-persisted']

    def last(self, operation_id, event):
        found = [r for r in self.rows() if r['operationId'] == operation_id and r['event'] == event]
        return found[-1] if found else None


@contextlib.contextmanager
def operation_lock(state_dir):
    import fcntl  # POSIX-only root tooling
    fd = os.open(Path(state_dir) / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        value = os.fstat(fd)
        if not stat.S_ISREG(value.st_mode) or value.st_uid != _uid() or value.st_nlink != 1:
            raise Refusal('Private operation lock required')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise Refusal('Another service operation is running') from None
        yield
    finally:
        os.close(fd)


def authority_sha(profile_sha, profile):
    return sha(canonical({'profileSha256': profile_sha, 'sourceCommit': profile['sourceCommit'],
                          'imageId': profile['imageId'],
                          'effectiveComposeSha256': profile['effectiveComposeSha256']}))


def unverified_authority_sha(image_id):
    return sha(canonical({'unverifiedAuthority': True, 'imageId': image_id}))


def assert_running_matches(profile, observed):
    """Raise Refusal unless the observed running service is the approved profile."""
    images = observed.get('images') if isinstance(observed, dict) else None
    if (not isinstance(images, dict) or set(images) != set(SERVICES)
            or any(images[s] != profile['imageId'] for s in SERVICES)):
        raise Refusal('Running service images do not match the service profile')
    for key in ('effectiveComposeSha256', 'serverEnvSha256', 'pinnedImageSha256'):
        if observed.get(key) != profile[key]:
            raise Refusal('Running service configuration does not match the service profile')
    if observed.get('serviceAccessEnforcement') is not True:
        raise Refusal('SERVICE_ACCESS_ENFORCEMENT is not enabled in the running service')


class Operator:
    """Core logic with injected host boundaries (tests use fakes).

    runtime.observe()                -> running images / config digests
    runtime.probe(image_id, data, directory) -> parsed JSON from the one-off probe
    """

    def __init__(self, *, profile_dir, state_dir, runtime, clock, identity):
        self.profile_module = _load('service_profile', 'contabo-service-profile.py')
        self.profile_dir = Path(profile_dir)
        self.state_dir = Path(state_dir)
        self.runtime = runtime
        self.clock = clock
        self.identity = identity
        self.journal = Journal(self.state_dir)

    # ---- authority -------------------------------------------------------
    def verified_profile(self):
        try:
            record = self.profile_module.verify(self.profile_dir)
        except self.profile_module.ProfileError as error:
            raise Refusal('Service profile not verified: ' + str(error)) from None
        assert_running_matches(record['profile'], self.runtime.observe())
        return record

    def _probe(self, image_id, payload, directory):
        value = self.runtime.probe(image_id, payload, directory)
        if not isinstance(value, dict):
            raise Refusal('Probe returned an unexpected result')
        return value

    # ---- read-only status -------------------------------------------------
    def status(self, accounts=()):
        result = {'serviceProfile': None, 'runningMatchesProfile': False, 'database': None,
                  'journalHeadSha256': self.journal.head()}
        result['unfinishedOperations'] = [r['operationId'] for r in self.journal.unfinished_all()]
        try:
            record = self.verified_profile()
        except Refusal as error:
            result['serviceProfile'] = {'verified': False, 'reason': str(error)}
            return result
        result['serviceProfile'] = {'verified': True, 'generation': record['generation'],
                                    'profileSha256': record['profileSha256']}
        result['runningMatchesProfile'] = True
        directory = self.state_dir
        result['database'] = self._status_probe(record['profile']['imageId'], list(accounts), directory)
        return result

    def _status_probe(self, image_id, accounts, directory):
        value = self._probe(image_id, {'mode': 'service-status', 'accounts': accounts}, directory)
        if (value.get('version') != 'alterward-service-status-1' or value.get('schema') != 40
                or value.get('paidAiCalls') != 0 or value.get('authProviderWrites') is not False
                or not isinstance(value.get('migrationPrefixSha256'), str)
                or not HEX64.fullmatch(value['migrationPrefixSha256'])):
            raise Refusal('Database status did not match the reviewed 040 receipt')
        return value

    # ---- request construction (closed set) --------------------------------
    @staticmethod
    def build_request(command, status, args):
        policy = status['policy']
        if command == 'bootstrap':
            if policy is not None:
                raise Refusal('Service policy already exists')
            return {'kind': 'bootstrap', 'members': []}
        if policy is None:
            raise Refusal('Service policy missing: bootstrap first')
        revision = policy['revision']
        if command == 'pause':
            return {'kind': 'policy', 'expectedPolicyRevision': revision,
                    'generationEnabled': False, 'checkoutEnabled': False}
        if command == 'resume':
            if policy['reconcileRequired']:
                raise Refusal('Restore quarantine active: use restore-reconcile')
            return {'kind': 'policy', 'expectedPolicyRevision': revision,
                    'generationEnabled': True, 'checkoutEnabled': True}
        if command == 'wave-close':
            return {'kind': 'wave', 'expectedPolicyRevision': revision,
                    'capacity': policy['admissionCapacity'], 'open': False}
        if command == 'wave-open':
            capacity = args['capacity']
            if type(capacity) is not int or not 0 < capacity <= 100000:
                raise Refusal('Capacity must be a positive integer')
            if capacity <= policy['admissionUsed']:
                raise Refusal('Capacity must exceed the used places')
            added = max(0, capacity - policy['admissionCapacity'])
            if args.get('approve_added') != added:
                raise Refusal(f'Raising capacity adds {added} places; confirm with --approve-added {added}')
            return {'kind': 'wave', 'expectedPolicyRevision': revision, 'capacity': capacity, 'open': True}
        if command == 'restore-reconcile':
            if not policy['reconcileRequired']:
                raise Refusal('No restore quarantine to reconcile')
            return {'kind': 'restore-reconcile', 'expectedPolicyRevision': revision}
        if command == 'revoke':
            account = next((a for a in status['accounts'] if a['userId'] == args['user']), None)
            if account is None or account['admission'] is None or account['admission']['state'] != 'active':
                raise Refusal('Account has no active admission to revoke')
            return {'kind': 'admission', 'expectedPolicyRevision': revision,
                    'members': [{'userId': args['user'], 'expectedRevision': account['admission']['revision'],
                                 'state': 'revoked'}]}
        raise Refusal('Unknown service operation')

    # ---- privileged operations -------------------------------------------
    def execute(self, command, args=None, *, emergency=False, argv=()):
        args = args or {}
        if emergency and command not in EMERGENCY_KINDS:
            raise Refusal('Emergency authority is limited to pause and wave close')
        # An exposure-reducing emergency stop must not wait for a reconcile; the
        # DB core's revision check still guards it. Everything else must.
        unfinished = self.journal.unfinished_all()
        if unfinished and not emergency:
            raise Refusal('Unfinished operation ' + unfinished[0]['operationId'] + ': reconcile it first')
        unverified = False
        try:
            record = self.verified_profile()
            image_id = record['profile']['imageId']
            context_base = {'sourceCommit': record['profile']['sourceCommit'], 'imageId': image_id,
                            'authoritySha256': authority_sha(record['profileSha256'], record['profile'])}
            profile_generation = record['generation']
        except Refusal as error:
            if not (emergency and command in EMERGENCY_KINDS):
                raise
            # Emergency: exposure-reducing only, against the observed api image.
            observed = self.runtime.observe()
            image_id = (observed.get('images') or {}).get('api') if isinstance(observed, dict) else None
            if not isinstance(image_id, str) or not IMAGE.fullmatch(image_id):
                raise Refusal('Running api image could not be observed') from error
            context_base = {'sourceCommit': UNVERIFIED_COMMIT, 'imageId': image_id,
                            'authoritySha256': unverified_authority_sha(image_id)}
            profile_generation, unverified = None, True
        operation_id = str(uuid.uuid4())
        directory = self.state_dir / operation_id
        _private_directory(directory, create=True)
        try:
            return self._run_operation(command, args, image_id, context_base, profile_generation, unverified,
                                       operation_id, directory, argv)
        except Refusal:
            # Nothing is journaled before the intent is durable: a refusal that
            # happened earlier leaves no trace worth keeping.
            if not (directory / INTENT_NAME).exists():
                shutil.rmtree(directory, ignore_errors=True)
            raise

    def _run_operation(self, command, args, image_id, context_base, profile_generation, unverified,
                       operation_id, directory, argv):
        status = self._status_probe(image_id, [args['user']] if command == 'revoke' else [], directory)
        request = self.build_request(command, status, args)
        user, host = self.identity()
        context = {**context_base, 'parentOperationSha256': self.journal.head() if self.journal.rows()
                   else context_base['authoritySha256'],
                   'operatorSha256': sha(canonical({'user': user, 'host': host, 'argv': list(argv)})),
                   'operationId': operation_id}
        prepared = self._probe(image_id, {'mode': 'service-prepare', 'context': context, 'request': request},
                               directory)
        intent, intent_sha = prepared.get('intent'), prepared.get('intentSha256')
        if (not isinstance(intent, dict) or not isinstance(intent_sha, str) or not HEX64.fullmatch(intent_sha)
                or intent.get('context') != context or intent.get('request') != request):
            raise Refusal('Prepared intent does not match the requested operation')
        intent_bytes = canonical(intent)
        fields = {'kind': request['kind'], 'command': command, 'intentSha256': intent_sha,
                  'intentFileSha256': sha(intent_bytes), 'authoritySha256': context['authoritySha256'],
                  'parentOperationSha256': context['parentOperationSha256'],
                  'profileGeneration': profile_generation, 'unverifiedAuthority': unverified}
        # Durable intent and journal row BEFORE any SQL.
        _create(directory / INTENT_NAME, intent_bytes)
        self.journal.append('intent-persisted', operation_id, self.clock(), **fields)
        self.journal.append('apply-started', operation_id, self.clock(), pid=os.getpid(),
                            intentFileSha256=fields['intentFileSha256'])
        try:
            receipt = self._probe(image_id, {'mode': 'service-apply', 'context': context, 'intent': intent,
                                             'intentSha256': intent_sha}, directory)
        except Exception as error:
            self.journal.append('apply-unknown', operation_id, self.clock(), errorType=type(error).__name__)
            raise Refusal('Apply result unknown for ' + operation_id +
                          ': run reconcile --operation-id; SQL is never repeated') from None
        receipt_bytes = canonical(receipt)
        _create(directory / READBACK_NAME, receipt_bytes)
        self.journal.append('applied', operation_id, self.clock(), readbackFileSha256=sha(receipt_bytes),
                            outcome=receipt.get('outcome'))
        return {'operationId': operation_id, 'kind': request['kind'], 'outcome': receipt.get('outcome'),
                'unverifiedAuthority': unverified, 'paidAiCalls': 0, 'authProviderWrites': False}

    def _unfinished(self, operation_id):
        if operation_id not in {r['operationId'] for r in self.journal.unfinished_all()}:
            raise Refusal('No unfinished operation with that id')
        started = self.journal.last(operation_id, 'apply-started')
        persisted = self.journal.last(operation_id, 'intent-persisted')
        if not started or not persisted:
            raise Refusal('Operation journal incomplete for that id')
        directory = self.state_dir / operation_id
        _private_directory(directory)
        intent_bytes = _private_read(directory / INTENT_NAME)
        if sha(intent_bytes) != persisted['intentFileSha256']:
            raise Refusal('Stored intent does not match the journal')
        intent = json.loads(intent_bytes)
        image_id = intent['context']['imageId']
        if not IMAGE.fullmatch(image_id):
            raise Refusal('Stored intent image invalid')
        return persisted, directory, intent, image_id

    def reconcile(self, operation_id, *, accept_drift=False, confirm=None):
        """Read-only resolution of a lost apply. Never repeats SQL."""
        persisted, directory, intent, image_id = self._unfinished(operation_id)
        if accept_drift:
            return self._accept_drift(operation_id, persisted, directory, confirm)
        try:
            receipt = self._probe(image_id, {'mode': 'service-reconcile', 'context': intent['context'],
                                             'intent': intent, 'intentSha256': persisted['intentSha256']},
                                  directory)
        except Refusal:
            raise
        except Exception:
            phrase = self.accept_drift_phrase(operation_id, persisted['intentSha256'])
            raise Refusal('The outcome could not be proven (the state moved on or the database is unreachable). '
                          'If the state moved on, the owner may close it with: reconcile --operation-id '
                          f'{operation_id} --accept-drift --confirm "{phrase}"') from None
        outcome = receipt.get('outcome')
        if outcome not in ('committed', 'uncommitted'):
            raise Refusal('Reconcile did not return an exact outcome')
        receipt_bytes = canonical(receipt)
        if outcome == 'committed':
            _create(directory / READBACK_NAME, receipt_bytes)
        self.journal.append('reconciled-' + outcome, operation_id, self.clock(),
                            readbackFileSha256=sha(receipt_bytes))
        return {'operationId': operation_id, 'outcome': outcome,
                'next': None if outcome == 'committed' else 'start a new operation; the old one changed nothing'}

    @staticmethod
    def accept_drift_phrase(operation_id, intent_sha256):
        return f'accept-drift {operation_id} {intent_sha256[:16]}'

    def _accept_drift(self, operation_id, persisted, directory, confirm):
        """Owner-confirmed, journaled close of an operation whose outcome can no longer be proven.

        Used when the database moved on after a lost response (typically an emergency stop),
        so the readback matches neither the intent's before nor its after state. It runs no
        SQL, never raises capacity and never opens a wave: it needs the verified service
        profile, a readable current status and a closed service (mode invitation), then it
        only records that the owner accepted the unproven outcome together with the observed state.
        """
        expected = self.accept_drift_phrase(operation_id, persisted['intentSha256'])
        if confirm != expected:
            raise Refusal(f'Owner confirmation required: --confirm "{expected}"')
        record = self.verified_profile()
        image_id = record['profile']['imageId']
        intent = json.loads(_private_read(directory / INTENT_NAME))
        try:
            self._probe(intent['context']['imageId'],
                        {'mode': 'service-reconcile', 'context': intent['context'], 'intent': intent,
                         'intentSha256': persisted['intentSha256']}, directory)
        except Exception:
            pass  # the drift this command exists for (or an unreachable database: status fails next)
        else:
            raise Refusal('The outcome is provable: run reconcile without --accept-drift')
        try:
            status = self._status_probe(image_id, [], directory)
        except Refusal:
            raise
        except Exception:
            raise Refusal('Current database status could not be read') from None
        policy = status['policy']
        if policy is None or policy['mode'] != 'invitation':
            raise Refusal('Close the service first (wave --close): drift is only accepted while closed')
        observed = {k: policy[k] for k in ('revision', 'mode', 'generationEnabled', 'checkoutEnabled',
                                           'reconcileRequired', 'admissionCapacity', 'admissionUsed')}
        user, host = self.identity()
        self.journal.append('drift-accepted', operation_id, self.clock(),
                            intentSha256=persisted['intentSha256'],
                            observedPolicySha256=sha(canonical(observed)),
                            confirmationSha256=sha(expected.encode()),
                            operatorSha256=sha(canonical({'user': user, 'host': host})),
                            profileGeneration=record['generation'], observedPolicy=observed)
        return {'operationId': operation_id, 'outcome': 'drift-accepted', 'observedPolicy': observed,
                'next': 'review the observed policy; nothing was changed, capacity and mode are untouched'}


class HostRuntime:
    """Docker/compose adapter. Unverified on the target until the E2/E3 rehearsal."""

    def __init__(self, *, owner_dir=OWNER_DIR, project=PROJECT, runner=None):
        self.owner = Path(owner_dir)
        self.project = project
        self.runner = runner or self._run

    @staticmethod
    def _run(args, *, input=None, timeout=60):
        result = subprocess.run(args, input=input, capture_output=True, timeout=timeout,
                                env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C'})
        if result.returncode:
            raise RuntimeError('Host command failed')
        return result.stdout

    def _compose(self, path):
        return ['docker', 'compose', '--project-name', self.project, '-f', str(path)]

    def observe(self):
        compose_path = self.owner / 'effective-compose.json'
        config = json.loads(_private_read(compose_path))
        services = config.get('services') or {}
        images = {}
        for service in SERVICES:
            ids = self.runner(self._compose(compose_path) + ['ps', '-q', service]).decode().split()
            if len(ids) != 1:
                raise Refusal('Exactly one running container per service required')
            images[service] = self.runner(['docker', 'inspect', '--format', '{{.Image}}', ids[0]]).decode().strip()
        enforcement = all(
            (services.get(s, {}).get('environment') or {}).get('SERVICE_ACCESS_ENFORCEMENT') == 'true'
            for s in SERVICES)
        return {'images': images, 'effectiveComposeSha256': sha(_private_read(compose_path)),
                'serverEnvSha256': sha(_private_read(self.owner / 'server.env')),
                'pinnedImageSha256': sha(_private_read(self.owner / 'pinned-image.json')),
                'serviceAccessEnforcement': enforcement}

    def probe(self, image_id, data, directory):
        config = json.loads(_private_read(self.owner / 'effective-compose.json'))
        config['services']['api']['image'] = image_id
        path = Path(directory) / 'probe-compose.json'
        if path.exists():
            path.unlink()
        _create(path, canonical(config))
        name = f'{self.project}-service-probe-{uuid.uuid4().hex}'
        try:
            output = self.runner(
                self._compose(path) + ['run', '-T', '--rm', '--no-deps', '--pull', 'never', '--name', name,
                                       '--entrypoint', 'node', 'api', *PROBE_COMMAND],
                input=canonical(data).rstrip(b'\n'), timeout=200)
        finally:
            with contextlib.suppress(Exception):
                self.runner(['docker', 'rm', '-f', name])
        return json.loads(output)


def parser():
    top = argparse.ArgumentParser(prog='contabo-service-operator')
    sub = top.add_subparsers(dest='command', required=True)
    status = sub.add_parser('status')
    status.add_argument('--user', action='append', default=[])
    sub.add_parser('bootstrap')
    for name in ('pause', 'resume'):
        item = sub.add_parser(name)
        if name == 'pause':
            item.add_argument('--emergency', action='store_true')
    wave = sub.add_parser('wave')
    mode = wave.add_mutually_exclusive_group(required=True)
    mode.add_argument('--open', action='store_true')
    mode.add_argument('--close', action='store_true')
    wave.add_argument('--capacity', type=int)
    wave.add_argument('--approve-added', type=int)
    wave.add_argument('--emergency', action='store_true')
    revoke = sub.add_parser('revoke')
    revoke.add_argument('--user', required=True)
    sub.add_parser('restore-reconcile')
    reconcile = sub.add_parser('reconcile')
    reconcile.add_argument('--operation-id', required=True)
    reconcile.add_argument('--accept-drift', action='store_true')
    reconcile.add_argument('--confirm')
    return top


def run(arguments, operator, argv):
    if arguments.command == 'status':
        return operator.status(arguments.user)
    if arguments.command == 'reconcile':
        if arguments.confirm is not None and not arguments.accept_drift:
            raise Refusal('--confirm only belongs to --accept-drift')
        return operator.reconcile(str(uuid.UUID(arguments.operation_id)),
                                  accept_drift=arguments.accept_drift, confirm=arguments.confirm)
    if arguments.command == 'wave':
        if arguments.close and arguments.capacity is not None:
            raise Refusal('A wave close takes no capacity')
        if arguments.open and arguments.capacity is None:
            raise Refusal('A wave open needs --capacity')
        command = 'wave-open' if arguments.open else 'wave-close'
        args = {'capacity': arguments.capacity, 'approve_added': arguments.approve_added}
    else:
        command, args = arguments.command, {'user': getattr(arguments, 'user', None)}
        if command == 'revoke':
            args['user'] = str(uuid.UUID(arguments.user))
    return operator.execute(command, args, emergency=bool(getattr(arguments, 'emergency', False)),
                            argv=argv)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    arguments = parser().parse_args(argv)
    if _uid() != 0:
        print('root required', file=sys.stderr)
        return 2
    try:
        _private_directory(STATE_DIR, create=True)
        operator = Operator(
            profile_dir=OPS / 'service-profile', state_dir=STATE_DIR, runtime=HostRuntime(),
            clock=lambda: dt.datetime.now(dt.timezone.utc),
            identity=lambda: (os.environ.get('SUDO_USER') or os.environ.get('USER') or 'root', socket.gethostname()))
        with operation_lock(STATE_DIR):
            print(json.dumps(run(arguments, operator, argv), sort_keys=True))
        return 0
    except (Refusal, ValueError, OSError, RuntimeError, subprocess.SubprocessError) as error:
        print('Service operation refused: ' + (str(error) if isinstance(error, Refusal) else 'invalid input'),
              file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

"""Service operations on the new production host (plan 055; replaces the old
host's contabo-service-operator).

    python3 -I scripts/prod/service.py status [--user <uuid> ...]
    python3 -I scripts/prod/service.py plan pause|resume|reconcile|bootstrap
    python3 -I scripts/prod/service.py plan wave --open --capacity <n>
    python3 -I scripts/prod/service.py plan wave --close
    python3 -I scripts/prod/service.py plan revoke --user <uuid> [--user <uuid> ...]
    python3 -I scripts/prod/service.py apply --approved <card sha256>

The database work is the reviewed, host-independent core
(scripts/lib/service-operations.ts) behind scripts/ops/service-operation-probe.ts,
run in a one-off container of the running api image over verify-full TLS. The
probe only allows exposure-neutral or -reducing kinds: policy (pause/resume),
wave (open/close/capacity), admission revocations, restore-reconcile and the
initial empty bootstrap of a fresh database; nobody
is granted access this way (people join through an open wave).

The protocol keeps the old operator's guarantees:

1. ``plan`` reads the state, lets the core prepare the exact intent (read-only)
   and prints a card with the policy before and after; the prepared intent is
   kept privately until it expires;
2. ``apply`` needs the card's SHA-256. It writes the intent and a hash-chained
   journal row before any SQL, lets the core apply it in one serializable
   transaction, and records the readback;
3. a lost apply response is never repeated: a read-only reconcile of the stored
   intent decides whether it committed.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path

spec = importlib.util.spec_from_file_location('prod_release', Path(__file__).with_name('release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

ROOT = release.ROOT
APP = Path(os.environ.get('ALTERWARD_APP', ROOT / 'app'))
STATE = Path(os.environ.get('ALTERWARD_SERVICE_STATE', ROOT / 'ops' / 'service'))
PROBE = ['node', '--import', 'tsx', 'scripts/ops/service-operation-probe.ts']
ZERO = '0' * 64
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}')
HEX64 = re.compile(r'[0-9a-f]{64}')
JOURNAL_VERSION = 'alterward-prod-service-journal-1'


class Refusal(ValueError):
    """A refusal with an operator-readable reason; nothing was changed."""


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def private_write(path, data, exclusive=False):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if exclusive:
        with open(path, 'xb') as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        return
    temporary = path.with_name(path.name + '.tmp')
    with open(temporary, 'wb') as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def probe(payload, timeout=240):
    """One call of the reviewed probe in a one-off container of the api image."""
    out = subprocess.run(
        ['docker', 'compose', '-f', str(release.COMPOSE), '--env-file', str(release.ENV_FILE), 'run', '--rm',
         '--no-deps', '-T', '--entrypoint', PROBE[0], 'api', *PROBE[1:]],
        input=json.dumps(payload), capture_output=True, text=True, timeout=timeout, cwd=APP)
    lines = [line for line in out.stdout.splitlines() if line.startswith('{')]
    if out.returncode or not lines:
        marker = next((line for line in out.stderr.splitlines() if 'ALTERWARD_PROBE_FAILURE' in line), '')
        raise RuntimeError('Service probe failed' + (': ' + marker[:200] if marker else ''))
    return json.loads(lines[-1])


def status(users=()):
    return probe({'mode': 'service-status', 'accounts': list(users)})


# --- journal ---------------------------------------------------------------

def journal_rows():
    path = STATE / 'journal.jsonl'
    if not path.exists():
        return []
    rows, previous = [], ZERO
    for line in path.read_text().splitlines():
        row = json.loads(line)
        body = {k: v for k, v in row.items() if k != 'sha256'}
        if row.get('previousSha256') != previous or sha(canonical(body)) != row.get('sha256'):
            raise Refusal('The service journal chain is broken')
        rows.append(row)
        previous = row['sha256']
    return rows


def journal_append(event, operation_id, **fields):
    rows = journal_rows()
    body = {'version': JOURNAL_VERSION, 'sequence': len(rows) + 1, 'at': release.utcnow().isoformat(),
            'event': event, 'operationId': operation_id,
            'previousSha256': rows[-1]['sha256'] if rows else ZERO, **fields}
    row = {**body, 'sha256': sha(canonical(body))}
    path = STATE / 'journal.jsonl'
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open(path, 'a') as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(json.dumps(row, sort_keys=True) + '\n')
        handle.flush()
        os.fsync(handle.fileno())
    return row


@contextlib.contextmanager
def operation_lock():
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open(STATE / 'lock', 'w') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refusal('Another service operation is running')
        yield


# --- requests and context --------------------------------------------------

def build_request(operation, observed, capacity=None, users=()):
    policy = observed.get('policy')
    if operation == 'bootstrap':
        # Creates the initial, closed policy of a fresh or restored database.
        if policy:
            raise Refusal('The service policy already exists')
        return {'kind': 'bootstrap', 'members': []}
    if not policy:
        raise Refusal('No service policy exists; bootstrap it first')
    revision = policy['revision']
    if operation in ('pause', 'resume'):
        on = operation == 'resume'
        return {'kind': 'policy', 'expectedPolicyRevision': revision, 'generationEnabled': on,
                'checkoutEnabled': on}
    if operation == 'wave-open':
        if capacity is None or not 0 <= capacity <= 100000:
            raise Refusal('wave --open needs --capacity between 0 and 100000')
        return {'kind': 'wave', 'expectedPolicyRevision': revision, 'capacity': capacity, 'open': True}
    if operation == 'wave-close':
        return {'kind': 'wave', 'expectedPolicyRevision': revision, 'capacity': policy['admissionCapacity'],
                'open': False}
    if operation == 'revoke':
        accounts = {a['userId']: a for a in observed.get('accounts', [])}
        members = []
        for user in users:
            admission = (accounts.get(user) or {}).get('admission')
            if not admission or admission.get('state') != 'active':
                raise Refusal('Only an account with an active admission can be revoked')
            members.append({'userId': user, 'expectedRevision': admission['revision'], 'state': 'revoked'})
        if not members:
            raise Refusal('revoke needs at least one --user')
        return {'kind': 'admission', 'expectedPolicyRevision': revision, 'members': members}
    if operation == 'reconcile':
        return {'kind': 'restore-reconcile', 'expectedPolicyRevision': revision}
    raise Refusal('Unknown operation')


def running_image():
    ident = release.compose('ps', '-q', 'api').stdout.strip()
    if not ident:
        raise Refusal('The api service is not running')
    image = release.run(['docker', 'inspect', '--format', '{{.Image}}', ident]).stdout.strip()
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', image):
        raise Refusal('Exact running api image required')
    return image


def authority():
    """The newest released receipt binds the operation to the serving release."""
    receipts = sorted(p for p in (ROOT / 'releases').glob('*.json') if re.fullmatch(r'\d{8}T\d{6}Z\.json', p.name))
    for path in reversed(receipts):
        data = path.read_bytes()
        record = json.loads(data)
        if record.get('outcome') == 'released':
            return record['commit'], sha(data)
    raise Refusal('No released receipt on this host')


def context():
    commit, authority_sha = authority()
    rows = journal_rows()
    return {'sourceCommit': commit, 'imageId': running_image(), 'authoritySha256': authority_sha,
            'parentOperationSha256': rows[-1]['sha256'] if rows else ZERO,
            'operatorSha256': sha(Path(__file__).read_bytes()), 'operationId': str(uuid.uuid4())}


def describe(policy):
    if not policy:
        return 'no policy'
    gates = 'generation and checkout on' if policy['generationEnabled'] and policy['checkoutEnabled'] else (
        'paused (generation and checkout off)' if not policy['generationEnabled'] and not policy['checkoutEnabled']
        else f"generation {'on' if policy['generationEnabled'] else 'off'}, "
             f"checkout {'on' if policy['checkoutEnabled'] else 'off'}")
    return (f"{policy['mode']} admission, capacity {policy['admissionCapacity']}, {gates}"
            + (', reconcile required' if policy.get('reconcileRequired') else ''))


def card_text(operation, request, intent, intent_sha):
    before, after = intent['before'], intent['after']
    lines = ['# Alterward service operation card (new host)', '',
             f'- Operation: {operation} ({request["kind"]})',
             f'- Before: {describe(before.get("policy"))}',
             f'- After: {describe(after.get("policy"))}']
    for account in after.get('accounts', []):
        lines.append(f"- Account {account['userId']}: admission "
                     f"{(account.get('admission') or {}).get('state', 'none')} after the operation")
    lines += [f'- Prepared intent: sha256 `{intent_sha}`, valid until {intent["expiresAt"]}',
              '- Steps: intent and journal row persisted before SQL, one serializable transaction, readback; '
              'a lost response is reconciled read-only, never repeated',
              '- Approving this card authorizes this operation on the production service.']
    return '\n'.join(lines) + '\n'


def plan(operation, capacity=None, users=()):
    observed = status(users)
    request = build_request(operation, observed, capacity, users)
    ctx = context()
    prepared = probe({'mode': 'service-prepare', 'context': ctx, 'request': request})
    intent, intent_sha = prepared['intent'], prepared['intentSha256']
    text = card_text(operation, request, intent, intent_sha)
    card = sha(text.encode())
    private_write(STATE / 'pending' / (card + '.json'),
                  canonical({'operation': operation, 'context': ctx, 'request': request, 'intent': intent,
                             'intentSha256': intent_sha, 'card': card}))
    return text, card


def apply(approved):
    pending_path = STATE / 'pending' / (approved + '.json')
    if not HEX64.fullmatch(approved) or not pending_path.exists():
        raise Refusal('No prepared operation for this card; plan it again')
    pending = json.loads(pending_path.read_text())
    if pending['card'] != approved:
        raise Refusal('The prepared operation differs from the approved card')
    if dt.datetime.fromisoformat(pending['intent']['expiresAt'].replace('Z', '+00:00')) <= release.utcnow():
        raise Refusal('The prepared intent expired; plan it again')
    ctx = pending['context']
    rows = journal_rows()
    if ctx['parentOperationSha256'] != (rows[-1]['sha256'] if rows else ZERO):
        raise Refusal('Another operation ran since this card was prepared; plan it again')
    op_id = ctx['operationId']
    folder = STATE / 'operations' / op_id
    private_write(folder / 'intent.json', canonical(pending), exclusive=True)
    journal_append('intent-persisted', op_id, intentSha256=pending['intentSha256'], card=approved,
                   operation=pending['operation'])
    follow = {'context': ctx, 'intent': pending['intent'], 'intentSha256': pending['intentSha256']}
    journal_append('apply-started', op_id)
    try:
        result = probe({'mode': 'service-apply', **follow})
        outcome = 'applied'
    except Exception:
        journal_append('apply-unknown', op_id)
        result = probe({'mode': 'service-reconcile', **follow})
        outcome = {'committed': 'reconciled-committed', 'uncommitted': 'reconciled-uncommitted'}.get(
            result.get('outcome'), 'reconciled-drift')
    journal_append(outcome, op_id)
    readback = status([m['userId'] for m in pending['request'].get('members', [])])
    private_write(folder / 'readback.json', canonical({'outcome': outcome, 'result': result,
                                                       'readback': readback}), exclusive=True)
    pending_path.unlink()
    return {'operation': pending['operation'], 'operationId': op_id, 'outcome': outcome,
            'policy': readback.get('policy')}


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['status', 'plan', 'apply'])
    parser.add_argument('operation', nargs='?', choices=['pause', 'resume', 'wave', 'revoke', 'reconcile', 'bootstrap'])
    parser.add_argument('--open', action='store_true')
    parser.add_argument('--close', action='store_true')
    parser.add_argument('--capacity', type=int)
    parser.add_argument('--user', action='append', default=[])
    parser.add_argument('--approved')
    args = parser.parse_args(argv)
    try:
        users = [u.lower() for u in args.user]
        if any(not UUID.fullmatch(u) for u in users) or len(set(users)) != len(users) or len(users) > 10:
            raise Refusal('Up to ten distinct account UUIDs required')
        if args.command == 'status':
            print(json.dumps(status(users)))
            return 0
        with operation_lock():
            if args.command == 'apply':
                print(json.dumps(apply(args.approved or '')))
                return 0
            operation = args.operation
            if operation == 'wave':
                if args.open == args.close:
                    raise Refusal('wave needs exactly one of --open or --close')
                operation = 'wave-open' if args.open else 'wave-close'
            if operation is None:
                raise Refusal('plan needs an operation')
            text, card = plan(operation, args.capacity, users)
            print(text + f'\ncard sha256: {card}')
            return 0
    except Refusal as error:
        print(json.dumps({'ok': False, 'error': 'Refusal', 'message': str(error)}))
        return 1
    except Exception as error:
        print(json.dumps({'ok': False, 'error': type(error).__name__, 'message': str(error)[:200]}))
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

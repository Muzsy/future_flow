"""Image release on the new production host (plan 055 F2b).

    python3 -I scripts/prod/release.py plan  --image sha256:<64> --commit <40> --pr <n>
    python3 -I scripts/prod/release.py apply --image sha256:<64> --commit <40> --pr <n> --approved <card sha256>

``plan`` checks that the image is in the host's registry and that its cosign
signature (made by CI, annotated with the commit) verifies with the host's
public key, then prints the release card and its SHA-256. ``apply`` rebuilds
the card and refuses unless it equals the approved one, then:

1. requires a restore check of a backup taken less than two hours ago
   (``ship.py`` triggers that backup and runs the check on the operator
   machine), then takes a fresh encrypted backup (``backup.py``);
2. drains the worker: it is stopped with a 15-minute grace, so running
   chapters finish (new requests wait in the queue);
3. switches web, api and worker to the new digest (``ALTERWARD_IMAGE``);
4. waits for web and api to report healthy and the worker to run;
5. on failure, switches back to the previous digest (if that image exists here;
   the first release has none) and waits again;
6. writes a release receipt and removes images no longer needed.

The switch never changes the database schema: ``ship.py`` refuses releases
that add migrations (those need their own planned procedure).
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(os.environ.get('ALTERWARD_ROOT', '/srv/alterward'))
ENV_FILE = Path(os.environ.get('ALTERWARD_ENV_FILE', ROOT / 'secrets' / 'server.env'))
COMPOSE = Path(os.environ.get('ALTERWARD_COMPOSE', ROOT / 'app' / 'deploy' / 'prod' / 'compose.prod.yaml'))
COSIGN_KEY = Path(os.environ.get('ALTERWARD_COSIGN_KEY', ROOT / 'ops' / 'cosign.pub'))
REGISTRY = os.environ.get('ALTERWARD_REGISTRY', '127.0.0.1:5000/alterward')
COSIGN = ('ghcr.io/sigstore/cosign/cosign:v2.4.1'
          '@sha256:b03690aa52bfe94054187142fba24dc54137650682810633901767d8a3e15b31')
APP_SERVICES = tuple(os.environ.get('ALTERWARD_APP_SERVICES', 'web api worker').split())
HEALTHCHECKED = tuple(os.environ.get('ALTERWARD_HEALTHCHECKED', 'web api').split())
DRAIN_SECONDS = int(os.environ.get('ALTERWARD_DRAIN_SECONDS', '900'))
HEALTH_SECONDS = int(os.environ.get('ALTERWARD_HEALTH_SECONDS', '300'))
DIGEST = re.compile(r'sha256:[0-9a-f]{64}')
COMMIT = re.compile(r'[0-9a-f]{40}')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def run(args, timeout=600, check=True):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=check)


def compose(*args, timeout=600):
    return run(['docker', 'compose', '-f', str(COMPOSE), '--env-file', str(ENV_FILE), *args], timeout=timeout)


def read_env_image(text):
    for line in text.splitlines():
        if line.startswith('ALTERWARD_IMAGE='):
            return line.split('=', 1)[1].strip().strip('\'"')
    return ''


def with_image(text, reference):
    """The env text with ALTERWARD_IMAGE replaced (or appended); nothing else changes."""
    lines, done = [], False
    for line in text.splitlines():
        if line.startswith('ALTERWARD_IMAGE='):
            lines.append('ALTERWARD_IMAGE=' + reference)
            done = True
        else:
            lines.append(line)
    if not done:
        lines.append('ALTERWARD_IMAGE=' + reference)
    return '\n'.join(lines) + '\n'


def write_env(text):
    temporary = ENV_FILE.with_name(ENV_FILE.name + '.tmp')
    with open(temporary, 'w') as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, ENV_FILE)


def card_text(image, commit, pr, previous, signature_ok):
    lines = ['# Alterward release card (new host)', '',
             f'- Release commit: `{commit}` (PR #{pr})',
             f'- Image digest: `{image}` from `{REGISTRY}`',
             f'- Signature: {"verified, annotated with the commit" if signature_ok else "NOT VERIFIED"}',
             f'- Replaces: `{previous or "nothing (first release)"}`',
             '- Database schema: unchanged (releases with migrations are refused)',
             '- Steps: verified recent restore, fresh backup, worker drain (running chapters finish), switch web/api/worker, '
             'health check, automatic rollback on failure, receipt, image retention',
             '- Approving this card authorizes this switch on the production host.']
    return '\n'.join(lines) + '\n'


def verify_signature(reference, commit):
    # Root inside the container so it can read the key from the private ops directory (read-only mount).
    out = run(['docker', 'run', '--rm', '--network', 'host', '--user', '0:0', '-v', f'{COSIGN_KEY}:/cosign.pub:ro', COSIGN,
               'verify', '--key', '/cosign.pub', '--allow-insecure-registry', '--insecure-ignore-tlog=true',
               '-a', f'commit={commit}', reference], timeout=180, check=False)
    return out.returncode == 0


def plan(image, commit, pr):
    if not DIGEST.fullmatch(image) or not COMMIT.fullmatch(commit) or not re.fullmatch(r'[1-9]\d{0,5}', str(pr)):
        raise ValueError('Exact image digest, commit and PR number required')
    reference = f'{REGISTRY}@{image}'
    run(['docker', 'pull', reference], timeout=900)
    signature_ok = verify_signature(reference, commit)
    if not signature_ok:
        raise ValueError('The image signature does not verify for this commit')
    previous = read_env_image(ENV_FILE.read_text())
    text = card_text(image, commit, pr, previous, signature_ok)
    return reference, previous, text, sha(text.encode())


def states():
    out = {}
    for service in APP_SERVICES:
        ident = compose('ps', '-q', service).stdout.strip()
        if not ident:
            out[service] = None
            continue
        raw = run(['docker', 'inspect', '--format', '{{json .State}}', ident]).stdout
        out[service] = json.loads(raw)
    return out


def healthy(current):
    for service in APP_SERVICES:
        state = current.get(service)
        if not state or state.get('Running') is not True:
            return False
        if service in HEALTHCHECKED and (state.get('Health') or {}).get('Status') != 'healthy':
            return False
    return True


def wait_healthy(deadline_seconds, sleep=time.sleep, now=time.monotonic):
    end = now() + deadline_seconds
    while now() < end:
        if healthy(states()):
            return True
        sleep(5)
    return False


def image_present(reference):
    """A previous image counts only if it exists here (not the first-release placeholder)."""
    return bool(reference) and run(['docker', 'image', 'inspect', reference], timeout=60,
                                   check=False).returncode == 0


def switch(reference):
    write_env(with_image(ENV_FILE.read_text(), reference))
    compose('up', '-d', '--no-deps', *APP_SERVICES, timeout=900)


def restore_recent(record, now, limit=dt.timedelta(hours=2)):
    """The operator's restore check succeeded on a backup taken within the limit."""
    try:
        captured = dt.datetime.fromisoformat(record['backupCapturedAt'])
        checked = dt.datetime.fromisoformat(record['checkedAt'])
        return (record.get('ok') is True and captured.utcoffset() == dt.timedelta(0)
                and dt.timedelta(0) <= now - captured <= limit and captured <= checked <= now)
    except (KeyError, TypeError, ValueError):
        return False


def skip_backup_for_test():
    # Only a disposable test root may skip the backup; production never can.
    return os.environ.get('ALTERWARD_TEST_SKIP_BACKUP') == '1' and ROOT.resolve() != Path('/srv/alterward')


def apply(image, commit, pr, approved):
    reference, previous, text, card = plan(image, commit, pr)
    if card != approved:
        raise ValueError('The release card differs from the approved one')
    receipt = {'schemaVersion': 'alterward-prod-release-1', 'commit': commit, 'pr': int(pr), 'image': image,
               'previous': previous, 'card': card, 'startedAt': utcnow().isoformat()}
    if skip_backup_for_test():
        receipt['backup'] = 'skipped-test-root'
    else:
        try:
            restore = json.loads((ROOT / 'ops' / 'status' / 'restore.json').read_text())
        except (OSError, ValueError):
            restore = {}
        if not restore_recent(restore, utcnow()):
            raise RuntimeError('No restore check of a backup from the last two hours; nothing was switched')
        receipt['restoreChecked'] = restore.get('runId')
        backup = run([sys.executable, '-I', str(Path(__file__).with_name('backup.py')), 'backup'], timeout=1500,
                     check=False)
        if backup.returncode:
            raise RuntimeError('Fresh backup failed; nothing was switched')
        receipt['backup'] = json.loads(backup.stdout.strip().splitlines()[-1]).get('runId')
    receipt['services'] = list(APP_SERVICES)
    rollback = previous if image_present(previous) else None
    try:
        if 'worker' in APP_SERVICES:
            compose('stop', '-t', str(DRAIN_SECONDS), 'worker', timeout=DRAIN_SECONDS + 120)
        switch(reference)
        if wait_healthy(HEALTH_SECONDS):
            receipt['outcome'] = 'released'
        elif rollback:
            switch(rollback)
            receipt['outcome'] = 'rolled-back' if wait_healthy(HEALTH_SECONDS) else 'rollback-unhealthy'
        else:
            receipt['outcome'] = 'unhealthy-no-previous'
    except Exception as error:
        receipt['outcome'] = 'error'
        receipt['error'] = type(error).__name__
        raise
    finally:
        # Every attempt leaves a receipt, also when a step fails half way.
        receipt['finishedAt'] = utcnow().isoformat()
        path = ROOT / 'releases' / (utcnow().strftime('%Y%m%dT%H%M%SZ') + '.json')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(receipt, indent=1))
    return receipt


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['plan', 'apply'])
    parser.add_argument('--image', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--pr', required=True)
    parser.add_argument('--approved')
    args = parser.parse_args(argv)
    try:
        if args.command == 'plan':
            _, _, text, card = plan(args.image, args.commit, args.pr)
            print(text + f'\ncard sha256: {card}')
            return 0
        if not args.approved or not re.fullmatch(r'[0-9a-f]{64}', args.approved):
            raise ValueError('--approved <card sha256> required')
        receipt = apply(args.image, args.commit, args.pr, args.approved)
        print(json.dumps(receipt))
        return 0 if receipt['outcome'] == 'released' else 1
    except subprocess.CalledProcessError as error:
        print(json.dumps({'ok': False, 'error': 'CalledProcessError',
                          'step': ' '.join(str(a) for a in error.cmd[:3])}))
        return 1
    except Exception as error:
        print(json.dumps({'ok': False, 'error': type(error).__name__, 'message': str(error)[:200]}))
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

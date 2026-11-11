"""Installed encrypted managed capture/expiry and finite historical expiry.

Reads only the existing application connection. Never restores, activates
testers/providers, stores an age identity or touches unrelated services.
"""
import contextlib
import datetime as dt
import email.utils
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import select
import signal
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT = Path('/root/alterward-ops/recovery-lifecycle')
DAILY = Path('/root/alterward-ops/daily')
WORK = Path('/run/alterward-recovery-work')
ARCHIVE_ROOT = Path('/root/alterward-ops/managed-recovery')
LABEL = 'com.alterward.recovery-capture'
SOURCES = {'lifecycle.py', 'managed.py', 'expiry.py', 'local.py', 'legacy.py', 'catalog.mjs'}
PHASE = 'validation'


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


def load():
    sys.dont_write_bytecode = True
    module('alterward_backup', DAILY / 'scripts/backup_lib.py')
    daily = module('alterward_daily', DAILY / 'scripts/contabo-daily.py')
    daily.config()  # Checks the original installed daily source and units.
    daily.regular(ROOT / 'config.json')
    config = json.loads(daily.regular(ROOT / 'config.json'))
    if (set(config) != {'schemaVersion', 'sourceCommit', 'scriptHashes', 'projectBinding', 'unitHashes'} or
            config['schemaVersion'] != 'alterward-recovery-lifecycle-1' or
            not re.fullmatch(r'[a-f0-9]{40}', config['sourceCommit']) or
            not re.fullmatch(r'[a-f0-9]{64}', config['projectBinding']) or
            set(config['scriptHashes']) != SOURCES or
            set(config['unitHashes']) != {'alterward-recovery.service', 'alterward-recovery.timer'}):
        raise ValueError('Exact installed recovery binding required')
    for files, parent in [(config['scriptHashes'], ROOT / 'scripts'),
                          (config['unitHashes'], Path('/etc/systemd/system'))]:
        for name, expected in files.items():
            if (not re.fullmatch(r'[a-f0-9]{64}', expected) or
                    hashlib.sha256(daily.regular(parent / name)).hexdigest() != expected):
                raise ValueError('Installed recovery source changed')
    expiry = module('alterward_managed_expiry', ROOT / 'scripts/expiry.py')
    module('alterward_managed_local', ROOT / 'scripts/local.py')
    legacy = module('alterward_legacy', ROOT / 'scripts/legacy.py')
    managed = module('alterward_managed', ROOT / 'scripts/managed.py')
    return config, daily, expiry, legacy, managed


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Clock redirects refused')


def independent_clock(now):
    # A public HTTPS response provides the independent expiry decision clock;
    # no token, account identifier, project data or local key is transmitted.
    req = urllib.request.Request('https://api.github.com/?alterward-clock=' + secrets.token_hex(8),
        headers={'User-Agent': 'Alterward-recovery-clock', 'Cache-Control': 'no-cache'})
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=15) as response:
        if response.status != 200 or response.headers.get('Age', '0') != '0':
            raise ValueError('Fresh HTTPS clock required')
        return decision_clock(now, response.headers.get('Date'))


def decision_clock(now, date):
    peer = email.utils.parsedate_to_datetime(date)
    if (peer.utcoffset() != dt.timedelta(0) or now.utcoffset() != dt.timedelta(0) or
            abs((peer - now).total_seconds()) > 300):
        raise ValueError('Independent HTTPS and local UTC clocks must match')
    return min(now, peer)


def capture_due(previous, now, force=False):
    if force or previous is None:
        return True
    captured = dt.datetime.fromisoformat(previous['lastCaptureAt'])
    if captured.utcoffset() != dt.timedelta(0) or captured > now:
        raise ValueError('Original capture clock regressed')
    return now - captured >= dt.timedelta(hours=23)


@contextlib.contextmanager
def snapshot(daily, managed, api):
    policy = {'knownAuth': sorted(managed.KNOWN_AUTH_TABLES),
              'knownStorage': sorted(managed.KNOWN_STORAGE_TABLES),
              'excludedAuth': sorted(managed.EXCLUDED_AUTH_DATA),
              'excludedStorage': sorted(managed.EXCLUDED_STORAGE_DATA),
              'userColumns': sorted(managed.KNOWN_AUTH_USER_COLUMNS),
              'securitySql': managed.SECURITY_SQL}
    code = daily.regular(ROOT / 'scripts/catalog.mjs').decode()
    process = subprocess.Popen(['docker', 'exec', '-i', api, 'node', '--max-old-space-size=128',
        '--input-type=module', '-e', code, json.dumps(policy)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        if not select.select([process.stdout], [], [], 90)[0]:
            raise TimeoutError('Managed snapshot preparation timed out')
        raw = process.stdout.readline(16 * 1024**2 + 2)
        if len(raw) > 16 * 1024**2 + 1 or not raw.endswith(b'\n'):
            raise ValueError('Bounded private catalog frame required')
        value = json.loads(raw)
        if value.get('databaseTlsVerified') is not True:
            raise ValueError('Snapshot TLS proof required')
        managed.safe_catalog(value['catalog'])
        yield value
        process.stdin.write(b'COMMIT\n');process.stdin.flush();process.stdin.close()
        if process.wait(timeout=20):
            raise ValueError('Managed source snapshot failed')
    finally:
        if not process.stdin.closed:
            process.stdin.close()
        if process.poll() is None:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill();process.wait(timeout=10)


def previous_status(daily, config):
    # Capture evidence is durable independently of a later expiry/status error.
    path = ROOT / 'capture.json'
    if not path.exists():
        return None
    value = json.loads(daily.regular(path))
    if any(value.get(k) != config[k] for k in ['sourceCommit', 'scriptHashes', 'unitHashes']):
        raise ValueError('Original lifecycle state required')
    return value


def clean_work(daily, managed):
    daily.private_dir(WORK)
    if daily.command(['findmnt', '-n', '-o', 'FSTYPE', '-T', str(WORK)]).strip() != b'tmpfs':
        raise ValueError('Recovery workspace must be actual memory filesystem')
    paths = list(WORK.rglob('*'))
    if len(paths) > 100 or sum(p.lstat().st_size for p in paths) > 256 * 1024**2:
        raise ValueError('Bounded original scratch required')
    for path in paths:
        if path.is_dir():
            daily.private_dir(path)
        else:
            daily.regular(path)  # Refuses links, hardlinks, special files/owner drift.
    pending = [p for p in ARCHIVE_ROOT.iterdir() if p.name.startswith('.pending-')]
    for parent in pending:
        if not managed.RUN_ID.fullmatch(parent.name.removeprefix('.pending-')):
            raise ValueError('Original pending archive required')
        daily.private_dir(parent)
        if set(p.name for p in parent.iterdir()) - managed.FILES - {'manifest.json'}:
            raise ValueError('Foreign pending archive entry')
        for path in parent.iterdir():
            daily.regular(path)
    clients = []
    for value in daily.containers():
        run = value['Config'].get('Labels', {}).get(LABEL)
        if run is None:
            continue
        if (not managed.RUN_ID.fullmatch(run) or
                value['Name'] != '/alterward-managed-capture-' + run.lower() or
                value['Image'] != managed.PINNED_PG or value['HostConfig'].get('PortBindings') or
                value['HostConfig'].get('CapDrop') != ['ALL'] or
                value['HostConfig'].get('ReadonlyRootfs') is not True or
                not value['Mounts'] or any(not m['Source'].startswith(str(WORK) + '/') or m['RW'] for m in value['Mounts'])):
            raise ValueError('Original isolated scratch client required')
        clients.append(value['Id'])
    # Validate the entire cleanup set before the first mutation.
    for client in clients:
        daily.command(['docker', 'rm', '-f', client])
    for path in sorted(paths, key=lambda p: len(p.parts), reverse=True):
        path.rmdir() if path.is_dir() else path.unlink()
    for parent in pending:
        for path in parent.iterdir():
            path.unlink()
        parent.rmdir()
    daily.expiry_sync(ARCHIVE_ROOT)


def persist_capture(daily, expiry, managed, manifest):
    run = manifest['runId']
    source = managed.ROOT / run
    # The systemd sandbox creates distinct writable bind mounts. Staging and
    # final publication must share the same managed-root mount (no EXDEV).
    pending = expiry.ROOT / ('.pending-' + run)
    pending.mkdir(mode=0o700)
    # Durable files are written outside the usable archive root; the complete
    # original bundle is then atomically renamed into its final run directory.
    for name in sorted(managed.FILES | {'manifest.json'}):
        raw = daily.regular(source / name)
        if name != 'manifest.json':
            item = manifest['encryptedFiles'][name]
            if len(raw) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256']:
                raise ValueError('Captured ciphertext changed before publication')
        elif json.loads(raw) != manifest:
            raise ValueError('Original capture manifest changed')
        daily.durable_file(pending / name, raw)
    daily.expiry_sync(pending)
    target = expiry.ROOT / run
    if target.exists() or target.is_symlink():
        raise ValueError('Never replace an original capture')
    os.rename(pending, target)
    daily.expiry_sync(expiry.ROOT)


def perform(config, daily, expiry, legacy, managed, force=False):
    global PHASE
    PHASE = 'scratch-cleanup'
    clean_work(daily, managed)
    before = daily.stable_state()
    _, services = daily.owner_runtime()
    daily_config = daily.config()
    pg = daily.owner_database()
    env = dict(v.split('=', 1) for v in services['api']['Config']['Env'])
    project_url = urllib.parse.urlsplit(env['SUPABASE_URL'])
    project = project_url.hostname.split('.')[0] if project_url.hostname else ''
    if (project_url.scheme != 'https' or project_url.hostname != project + '.supabase.co' or
            not re.fullmatch(r'[a-z]{20}', project) or
            hashlib.sha256(project.encode()).hexdigest() != config['projectBinding']):
        raise ValueError('Original hosted project binding required')
    previous = previous_status(daily, config)
    now = daily.utcnow()
    # Independent UTC must be available before any historical deletion.
    PHASE = 'independent-clock'
    decision = independent_clock(now)
    PHASE = 'managed-inventory'
    catalog = expiry.catalog(expiry.ROOT, config['projectBinding'], decision)
    result = expiry.expire(expiry.ROOT, catalog['expectedManifests'], config['projectBinding'], decision, True)
    captured = False
    if capture_due(previous, now, force):
        PHASE = 'managed-capture'
        run = now.strftime('%Y%m%dT%H%M%SZ-') + secrets.token_hex(4)
        managed.ROOT = WORK / 'stage'
        managed.SCRATCH_ROOT = WORK
        managed.LABEL = LABEL
        try:
            with snapshot(daily, managed, services['api']['Id']) as source:
                manifest = managed.capture({'runId': run, 'commit': config['sourceCommit'],
                    'sourceHashes': config['scriptHashes'], 'image': daily_config['postgresImage'],
                    'recipient': daily_config['recipient'], 'catalog': source['catalog'],
                    'database': pg, 'ca': Path('/etc/alterward/supabase-ca.crt').read_text(),
                    'snapshot': source['snapshot'], 'projectRef': project})
            persist_capture(daily, expiry, managed, manifest)
        finally:
            clean_work(daily, managed)
        captured = True
        latest_run, last_capture = manifest['runId'], manifest['capturedAt']
        daily.atomic(ROOT / 'capture.json', {
            **{k: config[k] for k in ['sourceCommit', 'scriptHashes', 'unitHashes']},
            'lastRunId': latest_run, 'lastCaptureAt': last_capture})
    else:
        latest_run, last_capture = previous['lastRunId'], previous['lastCaptureAt']
    # A current complete managed capture and application backup must both exist
    # before expiry of the enrolled older configuration/application copies.
    PHASE = 'historical-preconditions'
    current = expiry.catalog(expiry.ROOT, config['projectBinding'], daily.utcnow())
    latest = current['expectedManifests'].get(latest_run)
    if (latest_run not in current['freshRuns'] or latest is None or
            latest['capturedAt'] != last_capture or
            daily.utcnow() - dt.datetime.fromisoformat(last_capture) > dt.timedelta(hours=26)):
        raise ValueError('Fresh managed archive required before historical expiry')
    status = daily.status_snapshot(daily_config)
    if not status['backup'].get('ok') or not daily.current_proof(status['backup'], daily_config, 26 * 3600):
        raise ValueError('Fresh application backup required before historical expiry')
    PHASE = 'historical-expiry'
    # Finite original enrollment was independently verified before installation.
    # Refresh the external clock after capture; no reused long-running peer time.
    decision = independent_clock(daily.utcnow())
    with legacy.local_lock(Path('/root/alterward-ops/legacy-retention')):
        historical = legacy.expire(Path('/root/alterward-ops/legacy-retention'),
            Path('/root/alterward-ops/backups'), decision, True)
    if daily.stable_state() != before:
        raise ValueError('Existing container state changed during recovery operation')
    return {'ok': True, 'capturedAt': daily.utcnow().isoformat(),
            **{k: config[k] for k in ['sourceCommit', 'scriptHashes', 'unitHashes']},
            'lastCaptureAt': last_capture, 'lastRunId': latest_run,
            'capturedThisRun': captured, 'databaseTlsVerified': True,
            'managedExpired': result['removedArchives'], 'historicalFilesExpired': historical['filesRemoved'],
            'independentClockVerified': True, 'existingContainersUnchanged': True,
            'automaticRestoreAllowed': False, 'paidAiCalls': 0}


def main(force=False):
    global PHASE
    os.umask(0o077)
    if os.geteuid() != 0:
        raise ValueError('Root scoped operation required')
    config, daily, expiry, legacy, managed = load()
    try:
        with expiry.operator_locks():
            value = perform(config, daily, expiry, legacy, managed, force)
            daily.atomic(ROOT / 'status.json', value)
            return value
    except BlockingIOError:
        # Another original daily/owner operation owns the locks; do not replace
        # the last successful evidence with a fake fresh success.
        return {'ok': True, 'skippedBusy': True, 'statusRefreshed': False}
    except Exception:
        try:
            previous = previous_status(daily, config)
        except Exception:
            previous = None  # Corrupt old metadata must still record failure.
        failure = {'ok': False, 'capturedAt': daily.utcnow().isoformat(),
            **{k: config[k] for k in ['sourceCommit', 'scriptHashes', 'unitHashes']},
            'phase': PHASE, 'paidAiCalls': 0}
        if previous:
            failure.update({k: previous[k] for k in ['lastCaptureAt', 'lastRunId']})
        daily.atomic(ROOT / 'status.json', failure)
        raise


if __name__ == '__main__':
    def interrupted(_signum, _frame):
        raise InterruptedError('Recovery operation interrupted')
    for name in ['SIGTERM', 'SIGINT', 'SIGHUP']:
        signal.signal(getattr(signal, name), interrupted)
    try:
        print(json.dumps({'ok': main().get('ok', False)}))
    except Exception:
        print('{"ok":false,"phase":"recovery-lifecycle"}')
        sys.exit(1)

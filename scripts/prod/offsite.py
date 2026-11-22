"""Offsite copy and restore check on the operator machine (plan 055 F2a).

    python3 -I scripts/prod/offsite.py run        # sync + restore-check (timer)
    python3 -I scripts/prod/offsite.py sync
    python3 -I scripts/prod/offsite.py restore-check

* ``sync`` copies every new backup from the production host over the
  key-only SSH name ``alterward-new`` and checks each file against the
  manifest's SHA-256.
* ``restore-check`` decrypts the newest local backup with the age identity
  (which exists only here, never on the host), restores it into a disposable
  local PostgreSQL 17 container, counts the tables and rows of schema
  ``public`` and reports the result back to the host
  (``/srv/alterward/ops/status/restore.json``), where the monitor reads it.

Local copies are kept for 14 days. Nothing secret is printed.
"""
import datetime as dt
import hashlib
import json
import os
import re
import secrets as token
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HOST = os.environ.get('ALTERWARD_PROD_HOST', 'alterward-new')
REMOTE = os.environ.get('ALTERWARD_REMOTE_ROOT', '/srv/alterward')
if not re.fullmatch(r'/[A-Za-z0-9_./-]+', REMOTE) or '..' in REMOTE:
    raise SystemExit('Invalid remote root')
REPO = Path(__file__).resolve().parents[2]
LOCAL = Path(os.environ.get('ALTERWARD_OFFSITE_DIR', REPO / '.local' / 'prod-offsite'))
IDENTITY = Path(os.environ.get('ALTERWARD_BACKUP_IDENTITY',
                               REPO / '.local' / 'operator-secrets' / 'prod-backup-identity.txt'))
POSTGRES = 'postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826'
RUN_ID = re.compile(r'\d{8}T\d{6}Z-[0-9a-f]{8}')
FILES = ('manifest.json', 'application.dump.age', 'config.tar.age')
LOCAL_RETENTION = dt.timedelta(days=14)
MIN_TABLES = 1


def sha(data):
    return hashlib.sha256(data).hexdigest()


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def run(args, **kwargs):
    return subprocess.run(args, capture_output=True, check=True, timeout=kwargs.pop('timeout', 600), **kwargs)


def private_write(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    with open(temporary, 'wb') as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(data)
    os.replace(temporary, path)


def verify_copy(directory):
    """Every encrypted file matches the manifest; returns the manifest."""
    manifest = json.loads((directory / 'manifest.json').read_bytes())
    if manifest.get('schemaVersion') != 'alterward-prod-backup-1' or manifest.get('runId') != directory.name:
        raise ValueError('Unexpected manifest')
    for name, meta in manifest['encryptedFiles'].items():
        data = (directory / name).read_bytes()
        if sha(data) != meta['sha256'] or len(data) != meta['bytes']:
            raise ValueError('Offsite copy differs from its manifest')
    return manifest


def to_copy(remote, local):
    return sorted(name for name in remote if RUN_ID.fullmatch(name) and name not in local)


def local_expired(names, now):
    out = []
    for name in names:
        if RUN_ID.fullmatch(name):
            stamp = dt.datetime.strptime(name[:16], '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc)
            if now - stamp > LOCAL_RETENTION:
                out.append(name)
    newest = max((n for n in names if RUN_ID.fullmatch(n)), default=None)
    return [n for n in out if n != newest]


def sync():
    listing = run(['ssh', '-o', 'BatchMode=yes', HOST, f'ls -1 {REMOTE}/backups']).stdout.decode().split()
    LOCAL.mkdir(mode=0o700, parents=True, exist_ok=True)
    local = {p.name for p in LOCAL.iterdir() if p.is_dir()}
    copied = []
    for name in to_copy(listing, local):
        partial = LOCAL / (name + '.partial')
        shutil.rmtree(partial, ignore_errors=True)
        partial.mkdir(mode=0o700)
        for file in FILES:
            data = run(['ssh', '-o', 'BatchMode=yes', HOST, f'cat {REMOTE}/backups/{name}/{file}']).stdout
            private_write(partial / file, data)
        partial.rename(LOCAL / name)
        verify_copy(LOCAL / name)
        copied.append(name)
    for name in local_expired([p.name for p in LOCAL.iterdir() if p.is_dir()], utcnow()):
        shutil.rmtree(LOCAL / name)
    return copied


def restore_check():
    names = sorted(p.name for p in LOCAL.iterdir() if p.is_dir() and RUN_ID.fullmatch(p.name))
    if not names:
        raise ValueError('No offsite backup to check')
    directory = LOCAL / names[-1]
    manifest = verify_copy(directory)
    name = 'alterward-restore-check-' + token.token_hex(4)
    with tempfile.TemporaryDirectory(prefix='alterward-restore-') as tmp:
        dump = Path(tmp) / 'application.dump'
        plain = run(['age', '-d', '-i', str(IDENTITY), str(directory / 'application.dump.age')]).stdout
        if sha(plain) != manifest['dumpSha256']:
            raise ValueError('Decrypted dump differs from the manifest')
        private_write(dump, plain)
        os.chmod(tmp, 0o755)
        os.chmod(dump, 0o644)  # read by the disposable container only
        password = token.token_hex(16)
        run(['docker', 'run', '-d', '--name', name, '--network', 'none', '-e', 'POSTGRES_PASSWORD=' + password,
             '-v', tmp + ':/restore:ro', POSTGRES])
        try:
            for _ in range(60):
                if subprocess.run(['docker', 'exec', name, 'pg_isready', '-U', 'postgres'],
                                  capture_output=True).returncode == 0:
                    break
                subprocess.run(['sleep', '1'])
            # The dump creates schema public itself; drop the empty default one of
            # this disposable database first.
            run(['docker', 'exec', name, 'psql', '-U', 'postgres', '-q', '-c', 'drop schema public cascade'])
            run(['docker', 'exec', name, 'pg_restore', '-U', 'postgres', '-d', 'postgres', '--no-owner',
                 '--no-acl', '--exit-on-error', '/restore/application.dump'])
            # Analyze first so the row statistics are exact for the check.
            run(['docker', 'exec', name, 'psql', '-U', 'postgres', '-q', '-c', 'analyze'])
            counts = run(['docker', 'exec', name, 'psql', '-U', 'postgres', '-At', '-c',
                          "select count(*), coalesce(sum(n_live_tup),0) from pg_stat_user_tables "
                          "where schemaname='public'"]).stdout.decode().strip().split('|')
        finally:
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
    tables = int(counts[0])
    if tables < MIN_TABLES:
        raise ValueError('Restored backup has no tables')
    result = {'ok': True, 'runId': manifest['runId'], 'backupCapturedAt': manifest['capturedAt'],
              'checkedAt': utcnow().isoformat(), 'tables': tables, 'rows': int(counts[1])}
    run(['ssh', '-o', 'BatchMode=yes', HOST,
         f'umask 077; mkdir -p {REMOTE}/ops/status; cat > {REMOTE}/ops/status/restore.json.tmp '
         f'&& mv {REMOTE}/ops/status/restore.json.tmp {REMOTE}/ops/status/restore.json'],
        input=json.dumps(result).encode())
    return result


def main(argv):
    commands = {'sync': lambda: {'copied': sync()}, 'restore-check': restore_check,
                'run': lambda: {'copied': sync(), 'restore': restore_check()}}
    if len(argv) != 1 or argv[0] not in commands:
        print('usage: offsite.py sync|restore-check|run', file=sys.stderr)
        return 2
    try:
        print(json.dumps(commands[argv[0]]()))
        return 0
    except subprocess.CalledProcessError as error:
        # The program and subcommand only (never the arguments, which may carry
        # a disposable password) and the tail of its own error output.
        step = ' '.join(str(a) for a in error.cmd[:2])
        tail = (error.stderr or b'').decode('utf-8', 'replace').strip().splitlines()[-1:] or ['']
        print(json.dumps({'ok': False, 'error': 'CalledProcessError', 'step': step, 'stderr': tail[0][:200]}))
        return 1
    except Exception as error:  # type only, never values
        print(json.dumps({'ok': False, 'error': type(error).__name__}))
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

"""Daily encrypted backup on the new production host (plan 055 F2a).

    python3 -I scripts/prod/backup.py backup        # run by the backup timer
    python3 -I scripts/prod/backup.py status        # last result, no secrets

What it does, and nothing more:

* dumps the application database (schema ``public``, custom format, TLS with
  certificate verification) with the pinned PostgreSQL 17 client image;
* packs the host configuration (``server.env``, the Cloudflare Origin
  certificate and key, the deploy files) into a tar archive;
* encrypts both with the operator's age *public* key: the host can encrypt but
  never decrypt (the identity stays on the operator machine, where
  ``scripts/prod/offsite.py`` pulls, decrypts and test-restores every backup);
* writes ``manifest.json`` with the SHA-256 of every file;
* keeps seven days of backups.

Secrets never reach stdout, logs or the manifest.
"""
import datetime as dt
import hashlib
import io
import json
import os
import re
import secrets as token
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.parse
from pathlib import Path

ROOT = Path(os.environ.get('ALTERWARD_ROOT', '/srv/alterward'))
SECRETS = ROOT / 'secrets'
BACKUPS = ROOT / 'backups'
STATUS = ROOT / 'ops' / 'status'
CONFIG = ROOT / 'ops' / 'backup.json'
APP = ROOT / 'app'
POSTGRES = 'postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826'
RETENTION = dt.timedelta(days=7)
MAX_DUMP = 512 * 1024 ** 2
RECIPIENT = re.compile(r'age1[0-9a-z]{58}')
RUN_ID = re.compile(r'\d{8}T\d{6}Z-[0-9a-f]{8}')
CONFIG_FILES = ('secrets/server.env', 'secrets/origin/origin.crt', 'secrets/origin/origin.key',
                'app/deploy/prod/compose.prod.yaml', 'app/deploy/prod/Caddyfile', 'app/deploy/compose.yaml')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def private_write(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    with open(temporary, 'wb') as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def parse_env(text):
    """KEY=VALUE lines; single or double quotes around the value are removed."""
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '\'"':
            value = value[1:-1]
        values[key.strip()] = value
    return values


def database_target(url):
    """Host, port, database, user and password from DATABASE_URL (never printed)."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ('postgres', 'postgresql') or not parts.hostname or not parts.username:
        raise ValueError('A postgres DATABASE_URL is required')
    return {'host': parts.hostname, 'port': str(parts.port or 5432),
            'database': (parts.path or '/postgres').lstrip('/') or 'postgres',
            'user': urllib.parse.unquote(parts.username),
            'password': urllib.parse.unquote(parts.password or '')}


def config_archive(root):
    """A deterministic tar of the host configuration files that exist."""
    buffer = io.BytesIO()
    hashes = {}
    with tarfile.open(fileobj=buffer, mode='w', format=tarfile.PAX_FORMAT) as archive:
        for name in CONFIG_FILES:
            path = root / name
            if not path.is_file() or path.is_symlink():
                continue
            data = path.read_bytes()
            hashes[name] = sha(data)
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = len(data), 0o600, 0
            archive.addfile(info, io.BytesIO(data))
    return buffer.getvalue(), hashes


def expired(names, now):
    """Run directories older than the retention period, newest never removed."""
    stamps = []
    for name in names:
        if RUN_ID.fullmatch(name):
            stamps.append((dt.datetime.strptime(name[:16], '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc), name))
    stamps.sort()
    keep_newest = stamps[-1][1] if stamps else None
    return [name for stamp, name in stamps if now - stamp > RETENTION and name != keep_newest]


def run(args, **kwargs):
    return subprocess.run(args, capture_output=True, check=True, timeout=kwargs.pop('timeout', 300), **kwargs)


def dump_database(target, ca_file, scratch, network=None):
    passfile = scratch / 'pgpass'
    line = ':'.join(v.replace('\\', '\\\\').replace(':', '\\:') for v in
                    (target['host'], target['port'], target['database'], target['user'], target['password']))
    private_write(passfile, (line + '\n').encode())
    shutil.copyfile(ca_file, scratch / 'ca.crt')
    os.chmod(scratch / 'ca.crt', 0o600)  # the client runs as root in its container
    env = ['-e', 'PGHOST=' + target['host'], '-e', 'PGPORT=' + target['port'],
           '-e', 'PGDATABASE=' + target['database'], '-e', 'PGUSER=' + target['user'],
           '-e', 'PGPASSFILE=/private/pgpass', '-e', 'PGSSLMODE=verify-full',
           '-e', 'PGSSLROOTCERT=/private/ca.crt', '-e', 'PGCONNECT_TIMEOUT=15',
           '-e', 'PGOPTIONS=-c statement_timeout=300000 -c timezone=UTC']
    name = 'alterward-backup-' + token.token_hex(4)
    args = ['docker', 'run', '--rm', '--name', name, '--read-only', '--memory', '512m', '--cpus', '1',
            '--pids-limit', '64', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
            '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
            '--mount', 'type=bind,src=' + str(scratch) + ',dst=/private,readonly', *env,
            *(['--network', network] if network else []),
            '--entrypoint', 'pg_dump', POSTGRES, '--format=custom', '--schema=public', '--no-owner',
            '--no-acl', '--lock-wait-timeout=5000']
    dump = run(args, timeout=600).stdout
    if not dump.startswith(b'PGDMP') or len(dump) > MAX_DUMP:
        raise ValueError('Invalid database dump')
    return dump


def backup(now=None):
    now = now or utcnow()
    settings = json.loads(CONFIG.read_text())
    recipient = settings['recipient']
    if not RECIPIENT.fullmatch(recipient):
        raise ValueError('Invalid age recipient')
    env = parse_env((SECRETS / 'server.env').read_text())
    target = database_target(env['DATABASE_URL'])
    run_id = now.strftime('%Y%m%dT%H%M%SZ') + '-' + token.token_hex(4)
    directory = BACKUPS / run_id
    with tempfile.TemporaryDirectory(prefix='alterward-backup-') as tmp:
        scratch = Path(tmp)
        network = settings.get('network')
        if network is not None and not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,62}', network):
            raise ValueError('Invalid network name')
        dump = dump_database(target, SECRETS / 'supabase-ca.crt', scratch, network)
        config, hashes = config_archive(ROOT)
        files = {}
        for name, data in (('application.dump.age', dump), ('config.tar.age', config)):
            source = scratch / (name + '.plain')
            private_write(source, data)
            encrypted = run(['age', '-r', recipient, str(source)]).stdout
            source.unlink()
            private_write(directory / name, encrypted)
            files[name] = {'sha256': sha(encrypted), 'bytes': len(encrypted)}
    manifest = {'schemaVersion': 'alterward-prod-backup-1', 'runId': run_id, 'capturedAt': now.isoformat(),
                'scope': 'public-schema-and-host-config', 'postgresImage': POSTGRES,
                'image': env.get('ALTERWARD_IMAGE', ''), 'dumpSha256': sha(dump),
                'configSha256': sha(config), 'configFiles': hashes, 'encryptedFiles': files}
    private_write(directory / 'manifest.json', json.dumps(manifest, indent=1).encode())
    removed = expired([p.name for p in BACKUPS.iterdir() if p.is_dir()], now)
    for name in removed:
        shutil.rmtree(BACKUPS / name)
    result = {'ok': True, 'runId': run_id, 'capturedAt': now.isoformat(),
              'dumpBytes': len(dump), 'expired': len(removed)}
    private_write(STATUS / 'backup.json', json.dumps(result).encode())
    return result


def main(argv):
    if argv == ['backup']:
        try:
            result = backup()
        except Exception as error:  # the status records the type only, never values
            result = {'ok': False, 'error': type(error).__name__, 'capturedAt': utcnow().isoformat()}
            private_write(STATUS / 'backup.json', json.dumps(result).encode())
            print(json.dumps(result))
            return 1
        print(json.dumps(result))
        return 0
    if argv == ['status']:
        path = STATUS / 'backup.json'
        print(path.read_text() if path.exists() else '{"ok":false,"error":"NoBackupYet"}')
        return 0
    print('usage: backup.py backup|status', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

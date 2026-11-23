"""A planned database migration on the new production host (plan 055).

    python3 -I scripts/prod/migrate.py plan  --file database/migrations/<NNN_name>.sql
    python3 -I scripts/prod/migrate.py apply --file database/migrations/<NNN_name>.sql --approved <card sha256>
    python3 -I scripts/prod/migrate.py record-plan|record --file ... [--approved <card>]   # register an
        already applied file in ff_migrations (041 was applied before registration existed)

Image releases never change the schema (``ship.py`` refuses a release that
adds a migration without a receipt from here). A migration is its own step,
run from the app directory of the commit that contains it:

1. ``plan`` prints the card: the file and its SHA-256, the statements it
   runs, and the steps;
2. ``apply`` rebuilds the card and refuses unless it equals the approved one,
   requires a restore check of a backup from the last two hours, takes one
   more fresh backup, then runs the whole file in a single transaction
   (``psql -1``, stop on the first error) with the pinned PostgreSQL client
   over verify-full TLS, and writes a receipt
   (``releases/migration-<NNN>-<time>-<random>.json``, never overwritten) naming the file's SHA-256.

Only additive migrations belong here: the running image must keep working
on the migrated schema, so a later image rollback stays possible.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name):
    spec = importlib.util.spec_from_file_location('prod_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = _load('backup')
release = _load('release')
ROOT = backup.ROOT
APP = Path(os.environ.get('ALTERWARD_APP', ROOT / 'app'))
FILE = re.compile(r'database/migrations/(\d{3})_[a-z0-9_]+\.sql')
STATEMENT = re.compile(r'^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|REVOKE|GRANT|COMMENT|DO)\b[^\n;]{0,80}',
                       re.I | re.M)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def migration(path_text):
    match = FILE.fullmatch(path_text)
    if not match:
        raise ValueError('A database/migrations/NNN_name.sql path is required')
    data = (APP / path_text).read_bytes()
    return match.group(1), data


def app_checksum(data):
    """The application's ff_migrations checksum: core hash() of the file text,
    i.e. SHA-256 of its JSON string encoding (scripts/migrate.ts)."""
    text = data.decode().replace('\r\n', '\n')
    return sha(json.dumps(text, ensure_ascii=False).encode())


def registration(path_text, data):
    """The ff_migrations row the application's runner would write for this file."""
    name = path_text.rsplit('/', 1)[1]
    if not re.fullmatch(r'\d{3}_[a-z0-9_]+\.sql', name):
        raise ValueError('Invalid migration name')
    return (f"\nINSERT INTO ff_migrations(name, checksum) VALUES ('{name}', '{app_checksum(data)}');\n").encode()


def card_text(path_text, number, data):
    statements = [' '.join(m.group(0).split()) for m in STATEMENT.finditer(data.decode())]
    lines = ['# Alterward database migration card (new host)', '',
             f'- Migration: `{path_text}` (number {number})',
             f'- File SHA-256: `{sha(data)}`',
             f'- Statements ({len(statements)}):']
    lines += [f'  - `{s}`' for s in statements[:40]]
    lines += [f'- Registered in ff_migrations with checksum `{app_checksum(data)}`, in the same transaction',
              '- Steps: verified recent restore, fresh backup, the whole file in one transaction '
              '(stop on the first error), receipt',
              '- The running image is not switched; image releases stay a separate step.',
              '- Approving this card authorizes this migration on the production database.']
    return '\n'.join(lines) + '\n'


def plan(path_text):
    number, data = migration(path_text)
    text = card_text(path_text, number, data)
    return number, data, text, sha(text.encode())


def run_sql(data):
    env_values = backup.parse_env((backup.SECRETS / 'server.env').read_text())
    target = backup.database_target(env_values['DATABASE_URL'])
    settings = json.loads(backup.CONFIG.read_text())
    network = settings.get('network')
    if network is not None and not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,62}', network):
        raise ValueError('Invalid network name')
    with tempfile.TemporaryDirectory(prefix='alterward-migrate-') as tmp:
        scratch = Path(tmp)
        line = ':'.join(v.replace('\\', '\\\\').replace(':', '\\:') for v in
                        (target['host'], target['port'], target['database'], target['user'], target['password']))
        backup.private_write(scratch / 'pgpass', (line + '\n').encode())
        backup.private_write(scratch / 'ca.crt', (backup.SECRETS / 'supabase-ca.crt').read_bytes())
        backup.private_write(scratch / 'migration.sql', data)
        args = ['docker', 'run', '--rm', '--read-only', '--memory', '256m', '--cap-drop', 'ALL',
                '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
                '--mount', 'type=bind,src=' + str(scratch) + ',dst=/private,readonly',
                '-e', 'PGHOST=' + target['host'], '-e', 'PGPORT=' + target['port'],
                '-e', 'PGDATABASE=' + target['database'], '-e', 'PGUSER=' + target['user'],
                '-e', 'PGPASSFILE=/private/pgpass', '-e', 'PGSSLMODE=verify-full',
                '-e', 'PGSSLROOTCERT=/private/ca.crt', '-e', 'PGCONNECT_TIMEOUT=15',
                '-e', 'PGOPTIONS=-c statement_timeout=120000 -c lock_timeout=10000',
                *(['--network', network] if network else []),
                '--entrypoint', 'psql', backup.POSTGRES, '-X', '-q', '-1', '-v', 'ON_ERROR_STOP=1',
                '-f', '/private/migration.sql']
        out = subprocess.run(args, capture_output=True, text=True, timeout=300)
    if out.returncode:
        # Only the ERROR line: it names the failure, while DETAIL lines may quote row values.
        error = next((line for line in out.stderr.splitlines() if 'ERROR' in line), 'unknown error')
        raise RuntimeError('Migration failed and was rolled back: ' + error[:200])


def apply(path_text, approved):
    number, data, text, card = plan(path_text)
    if card != approved:
        raise ValueError('The migration card differs from the approved one')
    if not release.skip_backup_for_test():
        try:
            restore = json.loads((ROOT / 'ops' / 'status' / 'restore.json').read_text())
        except (OSError, ValueError):
            restore = {}
        if not release.restore_recent(restore, release.utcnow()):
            raise RuntimeError('No restore check of a backup from the last two hours; nothing was changed')
        fresh = backup.backup()
    else:
        restore, fresh = {}, {'runId': 'skipped-test-root'}
    receipt = {'schemaVersion': 'alterward-prod-migration-1', 'file': path_text, 'number': number,
               'fileSha256': sha(data), 'card': card, 'restoreChecked': restore.get('runId'),
               'backup': fresh.get('runId'), 'startedAt': release.utcnow().isoformat()}
    try:
        run_sql(data + registration(path_text, data))
        receipt['outcome'] = 'applied'
        receipt['registered'] = True
    except Exception as error:
        receipt['outcome'] = 'failed'
        receipt['error'] = str(error)[:240]
        raise
    finally:
        receipt['finishedAt'] = release.utcnow().isoformat()
        # Never overwrite: every attempt keeps its own receipt.
        path = ROOT / 'releases' / (f"migration-{number}-{release.utcnow().strftime('%Y%m%dT%H%M%SZ')}-"
                                    f"{os.urandom(4).hex()}.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'x') as handle:
            handle.write(json.dumps(receipt, indent=1))
    return receipt


def record_card(path_text):
    number, data = migration(path_text)
    lines = ['# Alterward migration registration card (new host)', '',
             f'- Migration: `{path_text}` (number {number}), file SHA-256 `{sha(data)}`',
             '- Already applied by migrate.py (receipt on this host) before the registration existed',
             f'- Writes one ff_migrations row: name `{path_text.rsplit("/", 1)[1]}`, '
             f'checksum `{app_checksum(data)}`; fails if the row already exists',
             '- Approving this card authorizes this single row on the production database.']
    text = '\n'.join(lines) + '\n'
    return number, data, text, sha(text.encode())


def applied_receipt(path_text, data):
    for path in sorted((ROOT / 'releases').glob('migration-*.json')):
        try:
            record = json.loads(path.read_text())
        except ValueError:
            continue
        if (record.get('file') == path_text and record.get('fileSha256') == sha(data)
                and record.get('outcome') == 'applied'):
            return path.name
    return None


def record(path_text, approved):
    number, data, text, card = record_card(path_text)
    if card != approved:
        raise ValueError('The registration card differs from the approved one')
    source = applied_receipt(path_text, data)
    if not source:
        raise ValueError('No applied migrate.py receipt for exactly this file on this host')
    run_sql(registration(path_text, data))
    receipt = {'schemaVersion': 'alterward-prod-migration-record-1', 'file': path_text, 'number': number,
               'fileSha256': sha(data), 'checksum': app_checksum(data), 'card': card, 'appliedReceipt': source,
               'outcome': 'registered', 'at': release.utcnow().isoformat()}
    path = ROOT / 'releases' / (f"migration-record-{number}-{release.utcnow().strftime('%Y%m%dT%H%M%SZ')}-"
                                f"{os.urandom(4).hex()}.json")
    with open(path, 'x') as handle:
        handle.write(json.dumps(receipt, indent=1))
    return receipt


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['plan', 'apply', 'record-plan', 'record'])
    parser.add_argument('--file', required=True)
    parser.add_argument('--approved')
    args = parser.parse_args(argv)
    try:
        if args.command in ('plan', 'record-plan'):
            _, _, text, card = (plan if args.command == 'plan' else record_card)(args.file)
            print(text + f'\ncard sha256: {card}')
            return 0
        if not args.approved or not re.fullmatch(r'[0-9a-f]{64}', args.approved):
            raise ValueError('--approved <card sha256> required')
        print(json.dumps((apply if args.command == 'apply' else record)(args.file, args.approved)))
        return 0
    except Exception as error:
        print(json.dumps({'ok': False, 'error': type(error).__name__, 'message': str(error)[:240]}))
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

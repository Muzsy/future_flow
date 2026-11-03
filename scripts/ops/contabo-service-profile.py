"""Durable service-profile record (SPR), ADR-011 (accepted 2026-11-03).

The record names the one approved production service: source commit, image,
effective compose, server.env digest, pinned image digest, schema 40 and the
mandatory SERVICE_ACCESS_ENFORCEMENT=true. It is the authority the service
operator verifies before every privileged service operation.

Layout (root, 0700), next to owner/ and daily/:
  profiles/<n>.json   immutable generation n (0400)
  journal.jsonl       append-only, hash-chained (profile-activated / -superseded)
  head.json           atomically replaced pointer to the active generation
  .lock               serializes activation

Only `activate` writes, and only the owner-approved root command runs it. The
operator helper imports `verify` and never writes here. No secret value, no
server.env content and no account data ever enter the record: digests only.
"""

import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

PROFILE_DIR = Path('/root/alterward-ops/service-profile')
PROFILE_VERSION = 'alterward-service-profile-1'
HEAD_VERSION = 'alterward-service-profile-head-1'
JOURNAL_VERSION = 'alterward-service-profile-journal-1'
ZERO = '0' * 64
HEX64 = re.compile(r'[a-f0-9]{64}')
HEX40 = re.compile(r'[a-f0-9]{40}')
IMAGE = re.compile(r'sha256:[a-f0-9]{64}')
UTC_STAMP = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z')
PROFILE_KEYS = {'version', 'generation', 'parentProfileSha256', 'sourceCommit', 'imageId',
                'effectiveComposeSha256', 'serverEnvSha256', 'pinnedImageSha256', 'schema',
                'serviceAccessEnforcement', 'activation', 'restoredFrom'}
ACTIVATION_KEYS = {'approvalSha256', 'approvedAt', 'backupManifestSha256', 'restoreProofSha256'}
JOURNAL_EVENTS = {'profile-activated', 'profile-superseded'}
ROW_KEYS = {'version', 'sequence', 'event', 'generation', 'profileSha256', 'at',
            'previousSha256', 'sha256'}


class ProfileError(ValueError):
    """The service-profile record is missing, malformed or inconsistent."""


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True) + '\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def profile_hash(profile):
    return sha(canonical(profile))


def _uid():
    return os.geteuid() if hasattr(os, 'geteuid') else 0


def _read(path, *, modes=(0o400, 0o600)):
    try:
        value = path.lstat()
    except FileNotFoundError:
        raise ProfileError('Service profile record incomplete') from None
    if (not stat.S_ISREG(value.st_mode) or value.st_nlink != 1 or value.st_uid != _uid()
            or stat.S_IMODE(value.st_mode) not in modes):
        raise ProfileError('Private regular profile file required')
    return path.read_bytes()


def _private_directory(path):
    try:
        value = path.lstat()
    except FileNotFoundError:
        raise ProfileError('Service profile directory missing') from None
    if (stat.S_ISLNK(value.st_mode) or not stat.S_ISDIR(value.st_mode) or value.st_uid != _uid()
            or stat.S_IMODE(value.st_mode) != 0o700):
        raise ProfileError('Private profile directory required')


def _fsync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _create(path, data, mode):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    try:
        os.fchmod(fd, mode)
        os.write(fd, data)
        os.fsync(fd)
    finally:
        os.close(fd)
    _fsync_directory(path.parent)


def _replace(path, data):
    temporary = path.with_name('.' + path.name + '.new')
    with contextlib.suppress(FileNotFoundError):
        temporary.unlink()
    _create(temporary, data, 0o600)
    os.replace(temporary, path)
    _fsync_directory(path.parent)


def _stamp_ok(value):
    if not isinstance(value, str) or not UTC_STAMP.fullmatch(value):
        return False
    try:
        dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return False
    return True


def _hex(value, pattern):
    return isinstance(value, str) and pattern.fullmatch(value) is not None


def parse_profile(raw):
    """Exact, closed validation of one generation. Returns the same object."""
    if not isinstance(raw, dict) or set(raw) != PROFILE_KEYS:
        raise ProfileError('Exact service profile keys required')
    generation = raw['generation']
    activation = raw['activation']
    if (raw['version'] != PROFILE_VERSION
            or type(generation) is not int or generation < 1
            or not _hex(raw['parentProfileSha256'], HEX64)
            or not _hex(raw['sourceCommit'], HEX40)
            or not _hex(raw['imageId'], IMAGE)
            or not all(_hex(raw[k], HEX64) for k in ('effectiveComposeSha256', 'serverEnvSha256',
                                                     'pinnedImageSha256'))
            or type(raw['schema']) is not int or raw['schema'] != 40
            or raw['serviceAccessEnforcement'] is not True
            or not isinstance(activation, dict) or set(activation) != ACTIVATION_KEYS
            or not _hex(activation['approvalSha256'], HEX64)
            or not _stamp_ok(activation['approvedAt'])
            or not _hex(activation['backupManifestSha256'], HEX64)
            or not _hex(activation['restoreProofSha256'], HEX64)
            or not (raw['restoredFrom'] is None or _hex(raw['restoredFrom'], HEX64))):
        raise ProfileError('Exact service profile values required')
    return raw


def _row(sequence, event, generation, profile_sha, at, previous):
    body = {'version': JOURNAL_VERSION, 'sequence': sequence, 'event': event,
            'generation': generation, 'profileSha256': profile_sha, 'at': at,
            'previousSha256': previous}
    return {**body, 'sha256': sha(canonical(body))}


def _parse_rows(data):
    rows, previous = [], ZERO
    for number, line in enumerate(data.splitlines(), 1):
        try:
            row = json.loads(line)
        except ValueError:
            raise ProfileError('Service profile journal unreadable') from None
        if not isinstance(row, dict) or set(row) != ROW_KEYS:
            raise ProfileError('Exact journal row required')
        body = {k: v for k, v in row.items() if k != 'sha256'}
        if (row['version'] != JOURNAL_VERSION or row['sequence'] != number
                or type(row['sequence']) is not int
                or row['event'] not in JOURNAL_EVENTS
                or type(row['generation']) is not int or row['generation'] < 1
                or not _hex(row['profileSha256'], HEX64) or not _stamp_ok(row['at'])
                or row['previousSha256'] != previous
                or row['sha256'] != sha(canonical(body))
                or line != canonical(row).rstrip(b'\n')):
            raise ProfileError('Service profile journal chain broken')
        previous = row['sha256']
        rows.append(row)
    return rows, previous


def verify(directory=PROFILE_DIR):
    """Return the verified active profile or raise ProfileError (fail closed)."""
    directory = Path(directory)
    _private_directory(directory)
    _private_directory(directory / 'profiles')
    rows, journal_head = _parse_rows(_read(directory / 'journal.jsonl'))
    if not rows:
        raise ProfileError('Service profile journal empty')
    try:
        head = json.loads(_read(directory / 'head.json'))
    except ValueError:
        raise ProfileError('Service profile head unreadable') from None
    # Replay: generations activate in order 1..n, each superseded by the next.
    expected_generation, active, parent, profiles = 1, None, None, {}
    for row in rows:
        if row['event'] == 'profile-activated':
            if row['generation'] != expected_generation or active is not None:
                raise ProfileError('Service profile generations out of order')
            try:
                profile = parse_profile(json.loads(_read(directory / 'profiles' / f'{row["generation"]}.json')))
            except ValueError as error:
                if isinstance(error, ProfileError):
                    raise
                raise ProfileError('Service profile unreadable') from None
            digest = profile_hash(profile)
            if (digest != row['profileSha256'] or profile['generation'] != row['generation']
                    or (parent is not None and profile['parentProfileSha256'] != parent)):
                raise ProfileError('Service profile generation does not match its journal')
            profiles[row['generation']] = profile
            active, parent = row['generation'], digest
        else:
            if active is None or row['generation'] != active or row['profileSha256'] != parent:
                raise ProfileError('Service profile supersede out of order')
            active, expected_generation = None, active + 1
    if active is None:
        raise ProfileError('No active service profile generation')
    names = {p.name for p in (directory / 'profiles').iterdir()}
    if names != {f'{n}.json' for n in profiles}:
        raise ProfileError('Unexpected service profile files')
    if (not isinstance(head, dict) or set(head) != {'version', 'generation', 'profileSha256', 'journalSha256'}
            or head['version'] != HEAD_VERSION or head['generation'] != active
            or head['profileSha256'] != parent or head['journalSha256'] != journal_head):
        raise ProfileError('Service profile head does not match the journal')
    return {'profile': profiles[active], 'profileSha256': parent, 'generation': active,
            'journalSha256': journal_head, 'sequence': len(rows)}


def activate(directory, profile, *, now):
    """Write the next generation. Owner-approved root command only."""
    profile = parse_profile(profile)
    directory = Path(directory)
    stamp = now.astimezone(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    if not directory.exists():
        directory.mkdir(mode=0o700, parents=False)
        (directory / 'profiles').mkdir(mode=0o700)
    _private_directory(directory)
    _private_directory(directory / 'profiles')
    with contextlib.ExitStack() as stack:
        import fcntl  # POSIX-only root tooling; keep the module importable elsewhere
        lock = os.open(directory / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        stack.callback(os.close, lock)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        journal = directory / 'journal.jsonl'
        if journal.exists() or journal.is_symlink():
            current = verify(directory)  # a broken record is never extended
            if profile['generation'] != current['generation'] + 1 or \
                    profile['parentProfileSha256'] != current['profileSha256']:
                raise ProfileError('Next generation must follow the active profile')
            previous, sequence = current['journalSha256'], current['sequence']
            rows = [_row(sequence + 1, 'profile-superseded', current['generation'],
                         current['profileSha256'], stamp, previous)]
            previous = rows[0]['sha256']
            sequence += 1
        else:
            if profile['generation'] != 1 or any((directory / 'profiles').iterdir()):
                raise ProfileError('First generation required for an empty record')
            previous, sequence, rows = ZERO, 0, []
        digest = profile_hash(profile)
        rows.append(_row(sequence + 1, 'profile-activated', profile['generation'], digest, stamp, previous))
        _create(directory / 'profiles' / f'{profile["generation"]}.json', canonical(profile), 0o400)
        fd = os.open(journal, os.O_CREAT | os.O_APPEND | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        try:
            os.fchmod(fd, 0o600)
            os.write(fd, b''.join(canonical(row) for row in rows))
            os.fsync(fd)
        finally:
            os.close(fd)
        _fsync_directory(directory)
        _replace(directory / 'head.json', canonical({
            'version': HEAD_VERSION, 'generation': profile['generation'], 'profileSha256': digest,
            'journalSha256': rows[-1]['sha256']}))
        return verify(directory)


def main(argv=None):
    parser = argparse.ArgumentParser(prog='contabo-service-profile')
    sub = parser.add_subparsers(dest='action', required=True)
    sub.add_parser('verify')
    act = sub.add_parser('activate')
    act.add_argument('--profile-file', required=True)
    arguments = parser.parse_args(argv)
    if _uid() != 0:
        print('root required', file=sys.stderr)
        return 2
    try:
        if arguments.action == 'verify':
            value = verify()
        else:
            raw = Path(arguments.profile_file)
            value = activate(PROFILE_DIR, json.loads(_read(raw)), now=dt.datetime.now(dt.timezone.utc))
        print(json.dumps({k: v for k, v in value.items() if k != 'profile'}, sort_keys=True))
        return 0
    except (ProfileError, ValueError, OSError) as error:
        print('Service profile refused: ' + (str(error) if isinstance(error, ProfileError) else 'invalid input'),
              file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

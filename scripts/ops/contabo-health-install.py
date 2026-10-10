"""Install one explicit forced-command monitor key, preserving other SSH keys.

No application, database, proxy, firewall, timer or global sshd change. Key
material in the request is public only. Run as an explicitly approved operator.
"""
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile

OPS = Path('/root/alterward-ops')
SSH = Path('/root/.ssh')
COMMAND = '/usr/bin/python3 -I /root/alterward-ops/external-health/health.py'
COMMENT = 'alterward-readonly-health'


def identity(value):
    return (value.st_dev, value.st_ino, value.st_mode, value.st_uid,
            value.st_nlink, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def original(path, directory=False):
    state = path.lstat()
    if (path.resolve() != path.absolute() or state.st_uid != os.geteuid() or
            not (stat.S_ISDIR(state.st_mode) if directory else stat.S_ISREG(state.st_mode)) or
            stat.S_IMODE(state.st_mode) != (0o700 if directory else 0o600) or
            (not directory and (state.st_nlink != 1 or state.st_size > 1024**2))):
        raise ValueError('Original private install target required')
    return state


def read(path):
    state = original(path)
    data = path.read_bytes()
    if identity(original(path)) != identity(state) or len(data) != state.st_size:
        raise ValueError('Install target changed during read')
    return data, identity(state)


def sync(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def install(request, ops=OPS, ssh=SSH):
    required = {'mode', 'publicKey', 'expiresAt', 'sourceBase64', 'sourceSha256', 'sourceCommit'}
    if request.get('mode') == 'update':
        required.add('previousSourceSha256')
    if set(request) != required or request['mode'] not in {'check', 'install', 'update'}:
        raise ValueError('Exact reviewed install request required')
    if not re.fullmatch(r'[a-f0-9]{40}', request['sourceCommit']) or not re.fullmatch(r'[a-f0-9]{64}', request['sourceSha256']):
        raise ValueError('Exact reviewed source binding required')
    source = base64.b64decode(request['sourceBase64'], validate=True)
    if len(source) > 65536 or hashlib.sha256(source).hexdigest() != request['sourceSha256']:
        raise ValueError('Bounded reviewed source required')
    public = request['publicKey']
    if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/]{68}', public):
        raise ValueError('Exact unadorned Ed25519 public key required')
    blob = base64.b64decode(public.split()[1], validate=True)
    if len(blob) != 51 or blob[:19] != b'\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20':
        raise ValueError('Original Ed25519 key structure required')
    expires = dt.datetime.strptime(request['expiresAt'], '%Y%m%d%H%M%SZ').replace(tzinfo=dt.timezone.utc)
    if not 0 < (expires - dt.datetime.now(dt.timezone.utc)).total_seconds() <= 91 * 86400:
        raise ValueError('Bounded ninety-day monitor access required')
    for path in (ops, ssh):
        original(path, True)
    authorized = ssh / 'authorized_keys'
    old, before = read(authorized)
    lines = old.decode().splitlines()
    ours = [line for line in lines if line.endswith(' ' + COMMENT)]
    line = f'restrict,expiry-time="{request["expiresAt"]}",command="{COMMAND}" {public} {COMMENT}'
    if (ours and ours != [line]) or any(public in value and value != line for value in lines):
        raise ValueError('Existing monitor access differs; explicit rotation required')
    root = ops / 'external-health'
    target = root / 'health.py'
    previous = previous_identity = None
    if root.exists() or root.is_symlink():
        original(root, True)
        if {p.name for p in root.iterdir()} - {'health.py'}:
            raise ValueError('Unknown projection install entry')
        if target.exists() or target.is_symlink():
            previous, previous_identity = read(target)
            if request['mode'] == 'update':
                if (not re.fullmatch(r'[a-f0-9]{64}', request['previousSourceSha256']) or
                        hashlib.sha256(previous).hexdigest() != request['previousSourceSha256'] or ours != [line]):
                    raise ValueError('Exact previous source and unchanged existing restricted access required')
            elif previous != source:
                raise ValueError('Installed projection differs; explicit upgrade required')
    if request['mode'] == 'update':
        if previous is None or previous_identity is None or ours != [line]:
            raise ValueError('Only an existing unchanged monitor can be upgraded')
        fd, name = tempfile.mkstemp(prefix='.health-update-', dir=root)
        temporary = Path(name)
        try:
            with os.fdopen(fd, 'wb') as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(source);stream.flush();os.fsync(stream.fileno())
            if read(target) != (previous, previous_identity) or read(authorized) != (old, before):
                raise ValueError('Original projection or restricted access changed before update')
            os.replace(temporary, target);sync(root)
        finally:
            if temporary.exists():
                temporary.unlink()
        if read(target)[0] != source or read(authorized) != (old, before):
            raise ValueError('Source-only monitor upgrade read-back failed')
    if request['mode'] == 'install':
        if not root.exists():
            root.mkdir(mode=0o700)
            sync(ops)
        if not target.exists():
            fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            try:
                with os.fdopen(fd, 'wb', closefd=False) as stream:
                    stream.write(source);stream.flush();os.fsync(fd)
            finally:
                os.close(fd)
            sync(root)
        if not ours:
            data = old + (b'' if old.endswith(b'\n') or not old else b'\n') + line.encode() + b'\n'
            fd, name = tempfile.mkstemp(prefix='.alterward-health-', dir=ssh)
            temporary = Path(name)
            try:
                with os.fdopen(fd, 'wb') as stream:
                    os.fchmod(stream.fileno(), 0o600)
                    stream.write(data);stream.flush();os.fsync(stream.fileno())
                current, state = read(authorized)
                if current != old or state != before:
                    raise ValueError('SSH keys changed before append')
                os.replace(temporary, authorized)
                sync(ssh)
            finally:
                if temporary.exists():
                    temporary.unlink()
        if read(target)[0] != source or read(authorized)[0].decode().splitlines() != lines + ([] if ours else [line]):
            raise ValueError('Installed access read-back failed')
    return {'mode': request['mode'], 'sourceCommit': request['sourceCommit'], 'sourceSha256': request['sourceSha256'],
            'forcedCommandOnly': True, 'forwardingPtyUserRcDisabled': True, 'expiresAt': request['expiresAt'],
            'existingAuthorizedKeysPreserved': True, 'applicationOrGlobalSshConfigurationChanged': False,
            'privateKeyReceived': False, 'sourceOnlyUpdate': request['mode'] == 'update'}


if __name__ == '__main__':
    import sys
    try:
        if os.geteuid() != 0:
            raise ValueError('Root install operator required')
        print(json.dumps({'ok': True, 'result': install(json.load(sys.stdin))}))
    except Exception:
        print(json.dumps({'ok': False, 'phase': 'restricted-health-install'}));sys.exit(1)

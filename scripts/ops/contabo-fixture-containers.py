"""Durable ownership for direct Docker one-offs in the synthetic fixture.

Intent precedes creation and is shared across forked children. Cleanup accepts
only the original nonce name, label, image and (once observed) immutable ID.
"""
import json
import os
from pathlib import Path
import re
import shutil
import stat
import uuid

LABEL = 'com.alterward.fixture-helper'


def reserve_archive_directories(base, database):
    """Separate every real backup/offsite cycle, including repeated same-DB cases."""
    base = Path(base)
    info = base.lstat()
    if (base.resolve() != base or not stat.S_ISDIR(info.st_mode)
            or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700
            or not base.name.startswith('alterward-funded-fixture-')
            or not re.fullmatch(r'aw_fixture_[a-f0-9]{24}',database)):
        raise ValueError('Owned synthetic fixture archive scope required')
    suffix = database + '-' + uuid.uuid4().hex
    daily, offsite = base / ('daily-' + suffix), base / ('offsite-' + suffix)
    daily.mkdir(mode=0o700)
    offsite.mkdir(mode=0o700)
    return daily, offsite


class FixtureContainers:
    def __init__(self, directory, project, images, command):
        self.directory = Path(directory)
        self.directory.mkdir(mode=0o700)
        self.project = project
        self.images = images
        self.command = command

    def save(self, path, value, *, create=False):
        target = path if create else path.with_name('.update-'+uuid.uuid4().hex)
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as handle:
            json.dump(value, handle, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        if not create:
            os.replace(target, path)
        fd = os.open(self.directory, os.O_DIRECTORY)
        try: os.fsync(fd)
        finally: os.close(fd)

    def prepare(self, args):
        args = list(args)
        if args[:2] != ['docker', 'run'] or '--name' in args:
            return args, None
        images = set(self.images()) - {None}
        selected = images.intersection(args)
        if len(selected) != 1:
            raise ValueError('One exact fixture helper image required')
        image = selected.pop()
        name = self.project+'-helper-'+uuid.uuid4().hex[:24]
        path = self.directory/(name+'.json')
        self.save(path, {'name': name, 'project': self.project, 'image': image,
                         'containerId': None, 'state': 'pending'}, create=True)
        return args[:2]+['--name', name, '--label', LABEL+'='+self.project]+args[2:], path

    def read(self, path):
        info = path.lstat()
        if (path.resolve() != path or not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or
                info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600):
            raise ValueError('Original private helper intent required')
        value = json.loads(path.read_bytes())
        if (set(value) != {'name', 'project', 'image', 'containerId', 'state'} or
                value['project'] != self.project or value['image'] not in set(self.images()) - {None} or
                not re.fullmatch(re.escape(self.project)+r'-helper-[a-f0-9]{24}', value['name']) or
                path.name != value['name']+'.json' or value['state'] not in {'pending', 'cleaned'} or
                (value['containerId'] is not None and not re.fullmatch(r'[a-f0-9]{64}', value['containerId']))):
            raise ValueError('Exact helper ownership intent required')
        return value

    def cleanup_one(self, path):
        if path is None:
            return
        value = self.read(path)
        ids = self.command(['docker', 'ps', '-aq', '--no-trunc', '--filter',
                            'name=^/'+re.escape(value['name'])+'$']).decode().split()
        if ids:
            if len(ids) != 1:
                raise ValueError('Ambiguous fixture helper container')
            info = json.loads(self.command(['docker', 'inspect', ids[0]]))[0]
            if (not re.fullmatch(r'[a-f0-9]{64}', info['Id']) or info['Name'] != '/'+value['name'] or info['Image'] != value['image'] or
                    info['Config'].get('Labels', {}).get(LABEL) != self.project or
                    (value['containerId'] is not None and info['Id'] != value['containerId'])):
                raise ValueError('Foreign helper cannot be removed')
            value['containerId'] = info['Id']
            self.save(path, value)
            self.command(['docker', 'rm', '-f', info['Id']])
        value['state'] = 'cleaned'
        self.save(path, value)

    def wrap(self, original):
        def wrapped(args, *a, **kwargs):
            command, intent = self.prepare(args)
            try:
                return original(command, *a, **kwargs)
            finally:
                self.cleanup_one(intent)
        return wrapped

    def cleanup_all(self):
        # Read disk afresh: a SIGKILLed fork child cannot update parent memory.
        # One damaged intent must not prevent cleanup of the remaining known ones.
        failures = []
        for path in sorted(self.directory.iterdir()):
            if not path.name.endswith('.json'):
                failures.append('incomplete-intent-update')
                continue
            try:
                self.cleanup_one(path)
            except BaseException:
                failures.append('intent-cleanup')
        try:
            remaining = self.command(['docker', 'ps', '-aq', '--no-trunc', '--filter', 'label='+LABEL+'='+self.project]).strip()
            if remaining:
                failures.append('Unreconciled helper containers remain')
        except BaseException:
            failures.append('daemon-readback')
        if failures:
            raise ValueError('Fixture helper cleanup incomplete: ' + ','.join(failures))


def cleanup_workspace(directory, failures, *, nested_pattern=None):
    """Keep private reconciliation evidence until daemon cleanup is proven."""
    directory = Path(directory)
    if nested_pattern is not None:
        try:
            if any(directory.glob(nested_pattern)):
                failures.append('nested-reconciliation-required')
        except BaseException:
            failures.append('nested-reconciliation-readback')
    if failures:
        return False
    try:
        shutil.rmtree(directory)
    except BaseException:
        failures.append('workspace-cleanup')
    return not failures

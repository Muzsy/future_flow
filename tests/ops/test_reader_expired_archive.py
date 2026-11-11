"""Expired, never-applied reader preparation archive: state machine and file contracts.

The portable class replaces only the root/POSIX primitives (ownership, fsync,
O_NOFOLLOW) and runs everywhere. The root class exercises the real primitives and
is run by the dedicated root CI step. No Docker, provider, database or server.
"""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import importlib.util

ROOT = Path(__file__).resolve().parents[2]
UTC = dt.timezone.utc


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/ops' / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


for _name, _file in [('alterward_backup', 'contabo-backup.py'), ('alterward_target', 'contabo-target.py'),
                     ('alterward_owner', 'contabo-owner.py'), ('alterward_activation', 'contabo-owner-activation.py'),
                     ('alterward_upgrade', 'contabo-owner-upgrade.py'), ('alterward_fence', 'contabo-writer-fence.py')]:
    load(_name, _file)
readers = load('reader_expired_archive', 'contabo-personal-beta-readers.py')

NOW = dt.datetime(2026, 10, 12, 21, 0, 19, tzinfo=UTC)
OWNER_FILES = {
    'server.env': b"CLOSED_SITE_ALLOWED_EMAILS='owner@example.invalid'\n",
    'pinned-image.json': b'{}\n',
    'effective-compose.json': b'{"services":{}}\n',
    'manifest.json': readers.encoded({'commit': 'a' * 40, 'imageId': 'sha256:' + 'b' * 64}),
}
CANDIDATE_FILES = {**OWNER_FILES,
                   'server.env': b"CLOSED_SITE_ALLOWED_EMAILS='owner@example.invalid,tester@example.invalid'\n",
                   'effective-compose.json': b'{"services":{"readers":true}}\n',
                   'manifest.json': readers.encoded({'commit': 'a' * 40, 'candidate': True})}


def plain_original(path):
    # Same bounded-file contract as fence.original, without root ownership.
    info = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError('Original bounded root file required')
    return path.read_bytes()


def plain_directory(path):
    if path.is_symlink() or not path.is_dir():
        raise ValueError('Original private reader directory required')


def plain_durable(path, data):
    if path.exists() or path.is_symlink():
        if plain_original(path) != data:
            raise ValueError('Existing durable reader file differs')
        return
    if not path.parent.is_dir():
        raise ValueError('Original private reader parent required')
    with path.open('xb') as handle:
        handle.write(data)


def plain_mkdir(path):
    path.mkdir(parents=True, exist_ok=True)


class World:
    """One synthetic owner directory with a valid prepared reader state."""

    def __init__(self, base, age_seconds=1000):
        self.owner = Path(base) / 'owner'
        self.owner.mkdir()
        self.state = self.owner / 'personal-beta-readers'
        for name, data in OWNER_FILES.items():
            (self.owner / name).write_bytes(data)
        self.prepared_at = NOW - dt.timedelta(seconds=age_seconds)
        self.write_state()

    def write_state(self, **override):
        state = self.state
        (state / 'original').mkdir(parents=True)
        original = {**OWNER_FILES}
        for name, data in original.items():
            (state / 'original' / name).write_bytes(data)
        (state / 'original' / 'stage.json').write_bytes(readers.encoded({'upgraded': True, 'imageOnly': True}))
        (state / 'original' / 'access.json').write_bytes(readers.encoded({'allowedEmails': ['owner@example.invalid']}))
        for name, data in CANDIDATE_FILES.items():
            (state / name).write_bytes(data)
        readers_json = readers.encoded(['tester@example.invalid'])
        access_json = readers.encoded({'allowedEmails': ['owner@example.invalid', 'tester@example.invalid']})
        (state / 'readers.json').write_bytes(readers_json)
        (state / 'access.json').write_bytes(access_json)
        self.value = {
            'manifest': {'commit': 'a' * 40},
            'previousManifestSha256': readers.sha(OWNER_FILES['manifest.json']),
            'originalFilesSha256': {n: readers.sha(d) for n, d in OWNER_FILES.items()},
            'candidateFilesSha256': {n: readers.sha(d) for n, d in CANDIDATE_FILES.items()},
            'readersSha256': readers.sha(readers_json), 'accessSha256': readers.sha(access_json),
            'preparedAt': self.prepared_at.isoformat(), 'sourceCommit': 'c' * 40,
            'proxyNetwork': {'id': 'n', 'foreignMembers': ['p']}, 'selectedReaders': 1, 'accessEmailCount': 2}
        self.value.update(override)
        (state / 'prepared.json').write_bytes(readers.encoded(self.value))

    @property
    def request(self):
        return {'preparedProof': self.value, 'ownerManifestDigest': readers.sha(OWNER_FILES['manifest.json']),
                'sourceCommit': 'd' * 40}

    def tree(self, base=None):
        base = base or self.state
        names = list(readers.STATE_NAMES) + ['original/' + n for n in readers.ORIGINAL_NAMES]
        return {n: (base / n).read_bytes() for n in names}


class PortableArchiveTests(unittest.TestCase):
    def setUp(self):
        self.handlers = {n: signal.getsignal(n) for n in readers.INTERRUPTION_SIGNALS}
        self.temp = tempfile.TemporaryDirectory()
        self.world = World(self.temp.name)
        self.calls = []
        self.mode = 'owner'
        self.stable = {'web': 1}
        self.patches = [
            patch.object(readers, 'STATE', self.world.state),
            patch.object(readers, 'DIRECTORY', self.world.owner),
            patch.object(readers.fence, 'original', plain_original),
            patch.object(readers, 'private_root_directory', plain_directory),
            patch.object(readers, 'private_directory', plain_mkdir),
            patch.object(readers, 'durable_file', plain_durable),
            patch.object(readers, 'sync_directory', lambda path: self.calls.append(('sync', path.name))),
            patch.object(readers, 'sync_file', lambda path: self.calls.append(('sync', path.name))),
            patch.object(readers, 'file_time', lambda path: self.world.prepared_at.timestamp()),
            patch.object(readers, 'zero_baseline', self.zero_baseline),
            patch.object(readers.upgrade, 'inspect_owner', lambda config, image: self.calls.append(('inspect',))),
            patch.object(readers.upgrade, 'foreign_state', lambda: {'proxy': 1}),
            patch.object(readers, 'docker', side_effect=AssertionError('archive must not call Docker')),
            patch.object(readers, 'run', side_effect=AssertionError('archive must not run commands')),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        for number, handler in self.handlers.items():
            signal.signal(number, handler)
        self.temp.cleanup()

    def zero_baseline(self, request, base=None):
        original = (base or readers.STATE) / 'original'
        return {n: plain_original(original / n) for n in readers.FILES}, {}, 'config', 'image'

    def daily(self, now=NOW):
        services = {name: {'Config': {'Env': ['CLOSED_SITE_ENABLED=true']}} for name in ('web', 'api', 'worker')}
        return types.SimpleNamespace(
            utcnow=lambda: now, stable_state=lambda: dict(self.stable),
            owner_runtime=lambda: ({'commit': 'a' * 40}, services),
            personal_runtime_policy=lambda env, at: {'mode': self.mode})

    def archive(self, **kw):
        return readers.archive_expired(kw.get('request', self.world.request), kw.get('daily', self.daily()), None)

    def entry(self):
        (entry,) = list(readers.archive_root().iterdir())
        return entry

    # --- success and the new-cycle precondition -------------------------------------
    def test_expired_unapplied_preparation_moves_byte_identically_then_a_new_cycle_may_start(self):
        before = self.world.tree()
        result = self.archive()
        self.assertFalse(self.world.state.exists())
        entry = self.entry()
        self.assertEqual({p.name for p in entry.iterdir()}, {'intent.json', 'complete.json', 'state'})
        self.assertEqual(self.world.tree(entry / 'state'), before)
        for key in ('containersStarted', 'containersStopped', 'paidAiCalls', 'databaseWrites'):
            self.assertEqual(result[key], 0)
        self.assertTrue(result['archived'] and not result['alreadyArchived'] and not result['betaWindowActive'])
        self.assertEqual(result['archiveId'], entry.name)
        readers.require_complete_archives()  # new prepare precondition holds
        self.assertEqual(readers.archive_summary(), {'valid': True, 'complete': 1, 'incomplete': 0})
        for name, data in OWNER_FILES.items():  # serving zero baseline is untouched
            self.assertEqual((self.world.owner / name).read_bytes(), data)
        intent = json.loads((entry / 'intent.json').read_bytes())
        self.assertEqual(intent['preparedSourceCommit'], 'c' * 40)
        self.assertEqual(intent['archiverSourceCommit'], 'd' * 40)
        self.assertEqual(intent['expirySeconds'], 900)

    def test_a_second_cycle_gets_its_own_identity_and_the_old_proof_cannot_apply_it(self):
        old = self.world.request
        self.archive()
        newer = World.__new__(World)
        newer.owner, newer.state = self.world.owner, self.world.state
        newer.prepared_at = NOW - dt.timedelta(seconds=40)
        newer.write_state()
        self.assertNotEqual(old['preparedProof'], newer.value)
        with self.assertRaises(ValueError):
            readers.prepared(old)  # exact prepared receipt mismatch
        self.assertEqual(readers.prepared(newer.request)[0], newer.value)
        self.assertNotEqual(readers.archive_identity(old['preparedProof']), readers.archive_identity(newer.value))

    def test_apply_still_rejects_an_expired_preparation_and_the_bound_is_shared(self):
        self.assertEqual(readers.READER_PREPARATION_SECONDS, 900)
        # Same commit as the preparation, so only the 900 second gate can refuse it.
        request = {**self.world.request, 'sourceCommit': self.world.value['sourceCommit']}
        with patch.object(readers.upgrade, 'proxy_network', lambda: self.world.value['proxyNetwork']):
            with self.assertRaisesRegex(ValueError, 'Fresh reader preparation required'):
                readers.apply(request, self.daily(), None)

    # --- freshness / clock ------------------------------------------------------------
    def test_only_a_strictly_expired_preparation_is_accepted(self):
        for age, accepted in [(0, False), (899, False), (900, False), (901, True), (5000, True)]:
            with self.subTest(age=age):
                temp = tempfile.TemporaryDirectory()
                try:
                    world = World(temp.name, age)
                    with patch.object(readers, 'STATE', world.state), patch.object(readers, 'DIRECTORY', world.owner), \
                         patch.object(readers, 'file_time', lambda p, w=world: w.prepared_at.timestamp()):
                        if accepted:
                            self.assertEqual(readers.expired_preparation(world.request, self.daily())[0], world.value)
                        else:
                            with self.assertRaisesRegex(ValueError, 'fresh'):
                                readers.expired_preparation(world.request, self.daily())
                finally:
                    temp.cleanup()

    def test_a_future_preparation_time_is_rejected_for_that_reason(self):
        temp = tempfile.TemporaryDirectory()
        try:
            world = World(temp.name, -30)  # prepared 30 seconds "after" the server clock
            with patch.object(readers, 'STATE', world.state), patch.object(readers, 'DIRECTORY', world.owner):
                with self.assertRaisesRegex(ValueError, 'Future preparation time'):
                    readers.expired_preparation(world.request, self.daily())
        finally:
            temp.cleanup()

    def test_future_malformed_naive_or_offset_times_are_rejected(self):
        for stamp in [(NOW + dt.timedelta(seconds=1)).isoformat(), '2026-10-12 20:00:00+00:00',
                      '2026-10-12T20:00:00', '2026-10-12T20:00:00Z', '2026-10-12T22:00:00+02:00',
                      '2026-10-12T20:00:00.5+00:00', '', None]:
            with self.subTest(stamp=stamp):
                temp = tempfile.TemporaryDirectory()
                try:
                    world = World(temp.name)
                    shutil.rmtree(world.state)
                    world.write_state(preparedAt=stamp)
                    with patch.object(readers, 'STATE', world.state), patch.object(readers, 'DIRECTORY', world.owner):
                        with self.assertRaises(ValueError):
                            readers.expired_preparation(world.request, self.daily())
                finally:
                    temp.cleanup()

    def test_file_time_that_disagrees_with_the_claimed_time_or_the_clock_is_rejected(self):
        for stamp in [self.world.prepared_at.timestamp() + 301, self.world.prepared_at.timestamp() - 301,
                      (NOW + dt.timedelta(seconds=5)).timestamp()]:
            with self.subTest(stamp=stamp):
                with patch.object(readers, 'file_time', lambda path, s=stamp: s):
                    with self.assertRaises(ValueError):
                        readers.expired_preparation(self.world.request, self.daily())
        with self.assertRaises(ValueError):  # naive server clock
            readers.expired_preparation(self.world.request, self.daily(NOW.replace(tzinfo=None)))

    # --- evidence that makes the preparation not "unapplied" --------------------------
    def test_any_journal_temp_unknown_or_missing_evidence_blocks_archiving(self):
        extras = ['journal.json', '.upgrade-abcd1234', 'unexpected.json', 'candidate']
        for extra in extras:
            with self.subTest(extra=extra):
                (self.world.state / extra).write_bytes(b'{}\n')
                with self.assertRaisesRegex(ValueError, 'Complete unapplied'):
                    self.archive()
                (self.world.state / extra).unlink()
        for missing in ['prepared.json', 'readers.json', 'original/stage.json']:
            with self.subTest(missing=missing):
                path = self.world.state / missing
                data = path.read_bytes()
                path.unlink()
                with self.assertRaisesRegex(ValueError, 'Complete unapplied'):
                    self.archive()
                path.write_bytes(data)
        self.archive()  # untouched after every refusal

    def test_funded_personal_state_or_non_owner_serving_blocks_archiving(self):
        (self.world.owner / 'personal-beta').mkdir()
        with self.assertRaisesRegex(ValueError, 'Funded personal'):
            self.archive()
        (self.world.owner / 'personal-beta').rmdir()
        self.mode = 'personal'
        with self.assertRaisesRegex(ValueError, 'Owner-only serving'):
            self.archive()
        self.assertTrue(self.world.state.exists())

    def test_drift_foreign_runtime_and_receipt_mismatch_block_archiving(self):
        request = self.world.request
        with self.assertRaises(ValueError):
            readers.archive_expired({**request, 'preparedProof': {**self.world.value, 'selectedReaders': 2}}, self.daily(), None)
        with self.assertRaises(ValueError):
            readers.archive_expired({**request, 'ownerManifestDigest': 'e' * 64}, self.daily(), None)
        (self.world.state / 'server.env').write_bytes(b'tampered\n')
        with self.assertRaisesRegex(ValueError, 'Durable preparation changed'):
            self.archive()
        (self.world.state / 'server.env').write_bytes(CANDIDATE_FILES['server.env'])
        (self.world.owner / 'server.env').write_bytes(b'serving drift\n')
        with self.assertRaises(ValueError):
            self.archive()
        self.assertTrue(self.world.state.exists())
        self.assertFalse(readers.archive_root().exists())

    def test_prepared_schema_rejects_extra_missing_and_malformed_fields(self):
        base = self.world.value
        bad = [{**base, 'extra': 1}, {k: v for k, v in base.items() if k != 'proxyNetwork'},
               {**base, 'sourceCommit': 'xyz'}, {**base, 'readersSha256': 'zz'},
               {**base, 'selectedReaders': True}, {**base, 'selectedReaders': 11, 'accessEmailCount': 11},
               {**base, 'candidateFilesSha256': {**base['candidateFilesSha256'], 'extra': 'a' * 64}}]
        for value in bad:
            with self.subTest(value=sorted(value)):
                with self.assertRaises(ValueError):
                    readers.valid_prepared(value)
        readers.valid_prepared(base)

    # --- interruption, idempotency, collisions ---------------------------------------
    def test_crash_before_the_move_resumes_with_the_recorded_intent(self):
        with patch.object(readers.os, 'rename', side_effect=OSError('crash')):
            with self.assertRaises(OSError):
                self.archive()
        entry = self.entry()
        self.assertTrue(self.world.state.exists())
        self.assertEqual({p.name for p in entry.iterdir()}, {'intent.json'})
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            readers.require_complete_archives()  # a new cycle cannot start from here
        recorded = (entry / 'intent.json').read_bytes()
        result = self.archive(daily=self.daily(NOW + dt.timedelta(minutes=5)))
        self.assertEqual((entry / 'intent.json').read_bytes(), recorded)  # not rewritten
        self.assertTrue(result['archived'] and (entry / 'complete.json').exists())
        readers.require_complete_archives()

    def test_crash_after_the_move_is_finished_by_the_same_explicit_mode(self):
        with patch.object(readers, 'finish_archive', side_effect=RuntimeError('crash')):
            with self.assertRaises(RuntimeError):
                self.archive()
        entry = self.entry()
        self.assertFalse(self.world.state.exists())
        self.assertEqual({p.name for p in entry.iterdir()}, {'intent.json', 'state'})
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            readers.require_complete_archives()
        result = self.archive()
        self.assertFalse(result['alreadyArchived'])
        self.assertTrue((entry / 'complete.json').exists())
        readers.require_complete_archives()

    def test_repeat_after_completion_is_idempotent_and_never_rewrites_the_archive(self):
        self.archive()
        entry = self.entry()
        snapshot = {p.name: p.read_bytes() for p in entry.iterdir() if p.is_file()}
        again = self.archive()
        self.assertTrue(again['alreadyArchived'])
        self.assertEqual({p.name: p.read_bytes() for p in entry.iterdir() if p.is_file()}, snapshot)

    def test_repeat_with_a_different_receipt_or_nothing_to_archive_is_refused(self):
        self.archive()
        with self.assertRaisesRegex(ValueError, 'No reader preparation to archive'):
            self.archive(request={**self.world.request, 'preparedProof': {**self.world.value, 'preparedAt': (NOW - dt.timedelta(hours=3)).isoformat()}})

    def test_a_reappearing_preparation_or_another_incomplete_archive_blocks(self):
        self.archive()
        entry = self.entry()
        shutil.copytree(entry / 'state', self.world.state)
        with self.assertRaisesRegex(ValueError, 'reappeared'):
            self.archive()
        shutil.rmtree(self.world.state)
        shutil.copytree(entry.parent / entry.name, entry.parent / 'expired-20260101T000000Z-aaaaaaaaaaaaaaaa')
        with self.assertRaises(ValueError):  # identity no longer matches the copied directory
            readers.archive_inventory()

    def test_inventory_rejects_unknown_names_bad_ids_and_inconsistent_evidence(self):
        self.archive()
        root = readers.archive_root()
        entry = self.entry()
        (entry / 'extra.json').write_bytes(b'{}\n')
        with self.assertRaisesRegex(ValueError, 'Unexpected'):
            readers.archive_inventory()
        (entry / 'extra.json').unlink()
        (root / 'not-an-id').mkdir()
        with self.assertRaisesRegex(ValueError, 'Unexpected'):
            readers.archive_inventory()
        (root / 'not-an-id').rmdir()
        (entry / 'intent.json').unlink()
        with self.assertRaisesRegex(ValueError, 'inconsistent'):
            readers.archive_inventory()
        self.assertEqual(readers.archive_summary(), {'valid': False})

    def test_archived_byte_tampering_is_detected_by_every_later_prepare_gate(self):
        self.archive()
        (self.entry() / 'state' / 'readers.json').write_bytes(b'["tampered@example.invalid"]\n')
        with self.assertRaises(ValueError):
            readers.require_complete_archives()

    def test_container_change_during_the_move_leaves_it_incomplete_and_blocks_prepare(self):
        states = iter([{'web': 1}, {'web': 2}])
        daily = self.daily()
        daily.stable_state = lambda: next(states)
        with self.assertRaisesRegex(ValueError, 'containers changed'):
            readers.archive_expired(self.world.request, daily, None)
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            readers.require_complete_archives()

    def fresh_preparation(self, age):
        world = World.__new__(World)
        world.owner, world.state = self.world.owner, self.world.state
        world.prepared_at = NOW - dt.timedelta(seconds=age)
        world.write_state()
        self.world = world

    def test_the_tool_never_creates_an_archive_beyond_the_limit_the_backup_enforces(self):
        # AUD-01: 8 archives pass the inventory check, a 9th would break daily capture.
        for index in range(readers.ARCHIVE_LIMIT):
            if index:
                self.fresh_preparation(1000 + index * 10)
            self.archive()
        self.fresh_preparation(2000)
        with self.assertRaisesRegex(ValueError, 'limit reached'):
            self.archive()
        self.assertTrue(self.world.state.exists())  # nothing moved, nothing written
        self.assertEqual(len(list(readers.archive_root().iterdir())), readers.ARCHIVE_LIMIT)
        readers.require_complete_archives()
        self.assertEqual(readers.archive_summary(), {'valid': True, 'complete': 8, 'incomplete': 0})

    def test_the_intent_and_its_directory_entries_are_synced_before_the_move(self):
        order = []
        real_rename = os.rename
        with patch.object(readers, 'sync_file', lambda path: order.append('file')), \
             patch.object(readers, 'sync_directory', lambda path: order.append('dir')), \
             patch.object(readers.os, 'rename', lambda a, b: (order.append('rename'), real_rename(a, b))):
            self.archive()
        self.assertLess(order.index('file'), order.index('rename'))
        self.assertEqual(order[:order.index('rename')].count('dir'), 3)

    def test_no_container_command_is_ever_issued_and_signals_are_held_during_the_move(self):
        self.archive()
        self.assertTrue(all(call[0] in {'inspect', 'sync'} for call in self.calls))
        for number in readers.INTERRUPTION_SIGNALS:
            self.assertEqual(signal.getsignal(number), signal.SIG_IGN)

    def test_prepare_refuses_to_start_beside_an_incomplete_archive(self):
        # Reaches the archive gate after the cheaper prepare checks are satisfied.
        archived = self.world
        self.archive()
        (self.entry() / 'complete.json').unlink()
        access = {'teamDomain': 't', 'audience': 'a', 'allowedEmails': ['owner@example.invalid'], 'checkedAt': 'x'}
        reviewed = {**access, 'allowedEmails': ['owner@example.invalid', 'tester@example.invalid'],
                    'checkedAt': (NOW - dt.timedelta(seconds=10)).isoformat().replace('+00:00', 'Z')}
        request = {'ownerManifestDigest': archived.request['ownerManifestDigest'], 'ownerAccess': access,
                   'ownerFlags': '', 'readers': ['tester@example.invalid'], 'readerAccess': reviewed,
                   'previousStageProof': {}, 'access': access}
        policy = types.SimpleNamespace(reader_candidate=lambda *a, **k: ('expected', reviewed))
        with patch.object(readers.upgrade, 'baseline', lambda req: ({}, {}, {})), \
             patch.object(readers, 'projection', lambda value: {}), \
             patch.object(readers, 'owner_overlay', lambda text: {}):
            with self.assertRaisesRegex(ValueError, 'Incomplete'):
                readers.prepare(request, self.daily(), policy)
        self.assertFalse(self.world.state.exists())

    def test_inspect_style_summary_and_policy_constants_match_the_installed_daily_contract(self):
        daily = load('reader_expired_archive_daily', 'contabo-daily.py')
        self.assertEqual(daily.READER_ARCHIVE_ROOT_NAME, readers.archive_root().name)
        self.assertEqual(daily.READER_ARCHIVE_LIMIT, readers.ARCHIVE_LIMIT)
        self.assertEqual(daily.READER_ARCHIVE_ID.pattern, readers.ARCHIVE_ID.pattern)
        self.assertEqual(daily.READER_ARCHIVED_STATE_NAMES, set(readers.STATE_NAMES))
        self.assertEqual(daily.READER_ARCHIVED_ORIGINAL_NAMES, set(readers.ORIGINAL_NAMES))
        # The funded operator's pinned versions are deliberately unchanged.
        self.assertEqual(daily.READER_ARCHIVE_POLICY_VERSION, 1)
        self.assertEqual(daily.PERSONAL_ARCHIVE_POLICY_VERSION, 1)
        self.assertEqual(daily.READER_PREPARATION_ARCHIVE_POLICY_VERSION, 1)

    def test_python_and_js_share_one_canonical_json_byte_contract(self):
        value = {'b': 1, 'a': ['\u00e9', 'x'], 'c': {'z': True, 'y': None}}
        self.assertEqual(readers.encoded(value), b'{"a":["\\u00e9","x"],"b":1,"c":{"y":null,"z":true}}\n')


@unittest.skipIf(sys.platform == 'win32' or getattr(os, 'geteuid', lambda: -1)() != 0,
                 'Actual root POSIX fsync/mode/link contract')
class RootArchiveFileTests(unittest.TestCase):
    """Real root-owned 0600/0700 files, atomic rename and directory fsync."""

    def setUp(self):
        self.handlers = {n: signal.getsignal(n) for n in readers.INTERRUPTION_SIGNALS}
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        base.chmod(0o700)
        self.world = World(base)
        for path in [self.world.owner, self.world.state, self.world.state / 'original']:
            path.chmod(0o700)
        for path in self.world.owner.rglob('*'):
            if path.is_file():
                path.chmod(0o600)
        self.patches = [
            patch.object(readers, 'STATE', self.world.state), patch.object(readers, 'DIRECTORY', self.world.owner),
            patch.dict(readers.private_directory.__globals__, ROOT=self.world.owner.parent),
            patch.object(readers, 'zero_baseline', lambda request, base=None: (
                {n: readers.fence.original((base or readers.STATE) / 'original' / n) for n in readers.FILES}, {}, 'c', 'i')),
            patch.object(readers.upgrade, 'inspect_owner', lambda config, image: None),
            patch.object(readers.upgrade, 'foreign_state', lambda: {}),
            patch.object(readers, 'file_time', lambda path: self.world.prepared_at.timestamp()),
        ]
        for item in self.patches:
            item.start()
        services = {name: {'Config': {'Env': []}} for name in ('web', 'api', 'worker')}
        self.daily = types.SimpleNamespace(
            utcnow=lambda: NOW, stable_state=lambda: {}, owner_runtime=lambda: ({}, services),
            personal_runtime_policy=lambda env, now: {'mode': 'owner'})

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        for number, handler in self.handlers.items():
            signal.signal(number, handler)
        self.temp.cleanup()

    def test_real_archive_is_private_atomic_and_verifiable(self):
        before = self.world.tree()
        readers.archive_expired(self.world.request, self.daily, None)
        root = readers.archive_root()
        entry = next(root.iterdir())
        for path in [root, entry, entry / 'state', entry / 'state' / 'original']:
            self.assertEqual(stat.S_IMODE(path.lstat().st_mode), 0o700)
        for path in entry.rglob('*'):
            if path.is_file():
                self.assertEqual((stat.S_IMODE(path.lstat().st_mode), path.lstat().st_uid, path.lstat().st_nlink), (0o600, 0, 1))
        self.assertEqual(self.world.tree(entry / 'state'), before)
        readers.require_complete_archives()

    def test_links_public_modes_and_aliases_are_rejected(self):
        readers.archive_expired(self.world.request, self.daily, None)
        entry = next(readers.archive_root().iterdir())
        target = entry / 'state' / 'readers.json'
        target.chmod(0o644)
        with self.assertRaises(ValueError):
            readers.require_complete_archives()
        target.chmod(0o600)
        alias = self.world.owner / 'alias'
        os.link(target, alias)
        with self.assertRaises(ValueError):
            readers.require_complete_archives()
        alias.unlink()
        target.unlink()
        target.symlink_to(self.world.owner / 'server.env')
        with self.assertRaises(ValueError):
            readers.require_complete_archives()

    def test_a_symlinked_preparation_or_archive_root_is_rejected(self):
        moved = self.world.owner / 'real-state'
        self.world.state.rename(moved)
        self.world.state.symlink_to(moved)
        with self.assertRaises(ValueError):
            readers.archive_expired(self.world.request, self.daily, None)
        self.world.state.unlink()
        moved.rename(self.world.state)
        elsewhere = self.world.owner / 'elsewhere'
        elsewhere.mkdir(mode=0o700)
        readers.archive_root().symlink_to(elsewhere)
        with self.assertRaises(ValueError):
            readers.archive_expired(self.world.request, self.daily, None)
        self.assertTrue(self.world.state.exists())


if __name__ == '__main__':
    unittest.main()

"""Service-profile record: no Docker, DB, network or host mutation outside a temp dir."""
import copy
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import unittest

directory = Path(__file__).resolve().parents[2] / 'scripts/ops'
spec = importlib.util.spec_from_file_location('service_profile', directory / 'contabo-service-profile.py')
spr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spr)
NOW = dt.datetime(2026, 11, 3, 18, 0, tzinfo=dt.timezone.utc)


def profile(generation=1, parent='9' * 64, **changes):
    value = {
        'version': 'alterward-service-profile-1', 'generation': generation,
        'parentProfileSha256': parent, 'sourceCommit': 'a' * 40, 'imageId': 'sha256:' + 'b' * 64,
        'effectiveComposeSha256': 'c' * 64, 'serverEnvSha256': 'd' * 64, 'pinnedImageSha256': 'e' * 64,
        'schema': 40, 'serviceAccessEnforcement': True,
        'activation': {'approvalSha256': '1' * 64, 'approvedAt': '2026-11-03T17:50:00.000Z',
                       'backupManifestSha256': '2' * 64, 'restoreProofSha256': '3' * 64},
        'restoredFrom': None}
    value.update(changes)
    return value


@unittest.skipIf(os.name != 'posix', 'POSIX permission and ownership checks')
class ServiceProfileTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.dir = Path(self.temporary.name) / 'service-profile'

    def activate(self, value=None, at=NOW):
        return spr.activate(self.dir, value or profile(), now=at)

    def test_first_generation_round_trips_and_is_verified_every_time(self):
        result = self.activate()
        self.assertEqual(result['generation'], 1)
        self.assertEqual(result['profileSha256'], spr.profile_hash(profile()))
        again = spr.verify(self.dir)
        self.assertEqual(again, result)
        self.assertEqual(stat.S_IMODE((self.dir / 'profiles' / '1.json').stat().st_mode), 0o400)
        self.assertEqual(stat.S_IMODE(self.dir.stat().st_mode), 0o700)
        rows = [json.loads(line) for line in (self.dir / 'journal.jsonl').read_text().splitlines()]
        self.assertEqual([r['event'] for r in rows], ['profile-activated'])
        self.assertEqual(rows[0]['previousSha256'], '0' * 64)

    def test_next_generation_supersedes_and_must_chain_to_the_active_profile(self):
        first = self.activate()
        with self.assertRaises(spr.ProfileError):  # wrong parent
            self.activate(profile(2, parent='0' * 64))
        with self.assertRaises(spr.ProfileError):  # skipped generation
            self.activate(profile(3, parent=first['profileSha256']))
        with self.assertRaises(spr.ProfileError):  # repeated generation
            self.activate(profile(1, parent=first['profileSha256']))
        second = self.activate(profile(2, parent=first['profileSha256'], imageId='sha256:' + 'f' * 64))
        self.assertEqual(second['generation'], 2)
        self.assertEqual(spr.verify(self.dir)['profile']['imageId'], 'sha256:' + 'f' * 64)
        rows = [json.loads(line) for line in (self.dir / 'journal.jsonl').read_text().splitlines()]
        self.assertEqual([r['event'] for r in rows], ['profile-activated', 'profile-superseded', 'profile-activated'])
        self.assertTrue((self.dir / 'profiles' / '1.json').exists())  # history is kept

    def test_first_generation_is_required_for_an_empty_record(self):
        with self.assertRaises(spr.ProfileError):
            self.activate(profile(2))

    def test_exact_profile_values_only(self):
        for key, bad in [('schema', 39), ('schema', True), ('serviceAccessEnforcement', False),
                         ('serviceAccessEnforcement', 'true'), ('sourceCommit', 'A' * 40),
                         ('imageId', 'b' * 64), ('serverEnvSha256', 'zz'), ('generation', 0),
                         ('generation', True), ('version', 'alterward-service-profile-2'),
                         ('restoredFrom', 'short'), ('extra', 1)]:
            with self.subTest(key=key, bad=bad), self.assertRaises(spr.ProfileError):
                spr.parse_profile(profile(**{key: bad}))
        for key in ('serverEnvSha256', 'activation', 'restoredFrom'):
            value = profile()
            del value[key]
            with self.subTest(missing=key), self.assertRaises(spr.ProfileError):
                spr.parse_profile(value)
        for key, bad in [('approvedAt', 'yesterday'), ('approvedAt', '2026-13-40T00:00:00Z'),
                         ('approvalSha256', 'x'), ('extra', 1)]:
            value = profile()
            value['activation'][key] = bad
            with self.subTest(activation=key), self.assertRaises(spr.ProfileError):
                spr.parse_profile(value)

    def test_no_secret_shaped_content_can_be_stored(self):
        value = profile()
        value['serverEnvContent'] = 'STRIPE_SECRET_KEY=sk_live_example'
        with self.assertRaises(spr.ProfileError):
            self.activate(value)
        self.assertFalse(self.dir.exists() and any((self.dir / 'profiles').iterdir()))

    def test_missing_record_or_files_fail_closed(self):
        with self.assertRaises(spr.ProfileError):
            spr.verify(self.dir)
        self.activate()
        for name in ('head.json', 'journal.jsonl', 'profiles/1.json'):
            path = self.dir / name
            saved = path.read_bytes()
            mode = stat.S_IMODE(path.stat().st_mode)
            path.unlink()
            with self.subTest(missing=name), self.assertRaises(spr.ProfileError):
                spr.verify(self.dir)
            path.write_bytes(saved)
            path.chmod(mode)
        spr.verify(self.dir)

    def test_tampering_is_detected(self):
        first = self.activate()
        self.activate(profile(2, parent=first['profileSha256']))
        original = {p: p.read_bytes() for p in [self.dir / 'head.json', self.dir / 'journal.jsonl',
                                                *(self.dir / 'profiles').iterdir()]}

        def restore():
            for path, data in original.items():
                if path.exists():
                    path.chmod(0o600)
                path.write_bytes(data)
            (self.dir / 'profiles' / '1.json').chmod(0o400)
            (self.dir / 'profiles' / '2.json').chmod(0o400)
            spr.verify(self.dir)

        def edit(path, change):
            path.chmod(0o600)
            path.write_bytes(change(path.read_bytes()))

        cases = {
            'profile bytes': lambda: edit(self.dir / 'profiles' / '2.json', lambda b: b.replace(b'd' * 64, b'0' * 64, 1)),
            'journal row hash': lambda: edit(self.dir / 'journal.jsonl', lambda b: b.replace(b'profile-superseded', b'profile-activated')),
            'journal truncated': lambda: edit(self.dir / 'journal.jsonl', lambda b: b.splitlines(True)[0]),
            'head generation': lambda: edit(self.dir / 'head.json', lambda b: b.replace(b'"generation":2', b'"generation":1')),
            'head profile hash': lambda: edit(self.dir / 'head.json', lambda b: re.sub(rb'("profileSha256":")[a-f0-9]{64}', rb'\g<1>' + b'0' * 64, b)),
            'head journal hash': lambda: edit(self.dir / 'head.json', lambda b: re.sub(rb'("journalSha256":")[a-f0-9]{64}', rb'\g<1>' + b'0' * 64, b)),
            'head version': lambda: edit(self.dir / 'head.json', lambda b: b.replace(b'profile-head-1', b'profile-head-9')),
            'extra profile file': lambda: (self.dir / 'profiles' / '3.json').write_bytes(b'{}'),
            'old profile removed': lambda: (self.dir / 'profiles' / '1.json').unlink(),
        }
        for name, tamper in cases.items():
            with self.subTest(name):
                tamper()
                with self.assertRaises(spr.ProfileError):
                    spr.verify(self.dir)
                if (self.dir / 'profiles' / '3.json').exists():
                    (self.dir / 'profiles' / '3.json').unlink()
                restore()

    def test_documented_repair_paths_for_an_interrupted_activation(self):
        """ADR-011 SPR repair: orphan profile file, stale head, torn last journal line."""
        first = self.activate()
        second_profile = profile(2, parent=first['profileSha256'])
        # (a) the generation file was written, nothing else
        orphan = self.dir / 'profiles' / '2.json'
        orphan.write_bytes(spr.canonical(second_profile))
        orphan.chmod(0o400)
        with self.assertRaises(spr.ProfileError):
            spr.verify(self.dir)
        with self.assertRaises(spr.ProfileError):
            self.activate(second_profile)
        self.assertEqual(spr.profile_hash(json.loads(orphan.read_bytes())), spr.profile_hash(second_profile))
        orphan.unlink()
        self.assertEqual(self.activate(second_profile)['generation'], 2)
        # (b) journal rows exist, the head is stale: rewrite it from the last row
        head = self.dir / 'head.json'
        stale = head.read_bytes()
        last = json.loads((self.dir / 'journal.jsonl').read_text().splitlines()[-1])
        head.write_bytes(spr.canonical({'version': 'alterward-service-profile-head-1', 'generation': 1,
                                        'profileSha256': first['profileSha256'],
                                        'journalSha256': '0' * 64}))
        with self.assertRaises(spr.ProfileError):
            spr.verify(self.dir)
        head.write_bytes(spr.canonical({'version': 'alterward-service-profile-head-1',
                                        'generation': last['generation'],
                                        'profileSha256': last['profileSha256'],
                                        'journalSha256': last['sha256']}))
        self.assertEqual(head.read_bytes(), stale)
        self.assertEqual(spr.verify(self.dir)['generation'], 2)
        # (c) a torn trailing journal line: dropping only that line restores the chain
        journal = self.dir / 'journal.jsonl'
        good = journal.read_bytes()
        journal.write_bytes(good + b'{"version":"alterward-service-profile-jour')
        with self.assertRaises(spr.ProfileError):
            spr.verify(self.dir)
        journal.write_bytes(good)
        self.assertEqual(spr.verify(self.dir)['generation'], 2)

    def test_a_broken_record_is_never_extended(self):
        first = self.activate()
        (self.dir / 'head.json').chmod(0o600)
        (self.dir / 'head.json').write_text('{}')
        with self.assertRaises(spr.ProfileError):
            self.activate(profile(2, parent=first['profileSha256']))
        self.assertFalse((self.dir / 'profiles' / '2.json').exists())

    def test_permissions_ownership_and_links_are_enforced(self):
        self.activate()
        (self.dir / 'profiles' / '1.json').chmod(0o644)
        with self.assertRaises(spr.ProfileError):
            spr.verify(self.dir)
        (self.dir / 'profiles' / '1.json').chmod(0o400)
        self.dir.chmod(0o755)
        with self.assertRaises(spr.ProfileError):
            spr.verify(self.dir)
        self.dir.chmod(0o700)
        spr.verify(self.dir)
        alias = Path(self.temporary.name) / 'alias'
        alias.symlink_to(self.dir)
        with self.assertRaises(spr.ProfileError):
            spr.verify(alias)
        link = self.dir / 'journal-link'
        os.link(self.dir / 'journal.jsonl', link)
        with self.assertRaises(spr.ProfileError):
            spr.verify(self.dir)
        link.unlink()
        spr.verify(self.dir)

    def test_concurrent_activation_is_refused(self):
        import fcntl
        self.activate()
        fd = os.open(self.dir / '.lock', os.O_RDWR)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(OSError):
                self.activate(profile(2, parent=spr.verify(self.dir)['profileSha256']))
        finally:
            os.close(fd)

    def test_restored_profile_records_where_it_came_from(self):
        first = self.activate()
        restored = self.activate(profile(2, parent=first['profileSha256'], restoredFrom='4' * 64))
        self.assertEqual(restored['profile']['restoredFrom'], '4' * 64)


if __name__ == '__main__':
    unittest.main()

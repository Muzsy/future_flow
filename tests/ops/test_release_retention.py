"""Plan 054 KP6: release leftovers retention decisions (no Docker, no files)."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    'release_retention', Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-release-retention.py')
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)


class RetentionTests(unittest.TestCase):
    def test_only_unreferenced_alterward_release_images_are_removed(self):
        images = {
            'alterward:contabo-aaaaaaaaaaaa': 'run000000000',
            'alterward:contabo-bbbbbbbbbbbb': 'bak000000000',
            'alterward:contabo-cccccccccccc': 'old000000000',
            'verloth-ops-panel-backend:latest': 'other0000000',
            'postgres:17-bookworm': 'pg0000000000',
            'alterward:ci': 'ci0000000000',
        }
        self.assertEqual(
            retention.images_to_remove(images, {'run000000000'}, {'bak000000000'}),
            ['alterward:contabo-cccccccccccc'])

    def test_the_two_newest_builds_and_their_targets_stay(self):
        builds = [('image-old', 1, ['build-old', 'old-rehearsal']),
                  ('image-prev', 2, ['build-prev', 'prev-rehearsal']),
                  ('image-new', 3, ['build-new', 'new-rehearsal'])]
        removed, kept = retention.directories_to_remove(builds)
        self.assertEqual(removed, ['image-old'])
        self.assertEqual(kept, {'build-prev', 'prev-rehearsal', 'build-new', 'new-rehearsal'})

    def test_linked_targets_only_name_directories_under_target(self):
        import json, tempfile
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / 'build-result.json').write_text(json.dumps(
                {'sourceDirectory': '/root/alterward-ops/target/build-abc/source'}))
            (d / 'rehearsal-dir.txt').write_text('/root/alterward-ops/target/r053-rehearsal-1\n')
            self.assertEqual(retention.linked_targets(d), ['build-abc', 'r053-rehearsal-1'])
            (d / 'rehearsal-dir.txt').write_text('/etc/passwd\n')
            self.assertEqual(retention.linked_targets(d), ['build-abc'])


if __name__ == '__main__':
    unittest.main()

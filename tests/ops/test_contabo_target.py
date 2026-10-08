import importlib.util
import io
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
library_spec = importlib.util.spec_from_file_location(
    'alterward_backup', ROOT / 'scripts/ops/contabo-backup.py')
library = importlib.util.module_from_spec(library_spec)
library_spec.loader.exec_module(library)
sys.modules['alterward_backup'] = library
spec = importlib.util.spec_from_file_location('target', ROOT / 'scripts/ops/contabo-target.py')
target = importlib.util.module_from_spec(spec)
spec.loader.exec_module(target)


def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as tar:
        for name, kind in entries:
            entry = tarfile.TarInfo(name)
            entry.type = kind
            if kind == tarfile.REGTYPE:
                entry.size = 4
                tar.addfile(entry, io.BytesIO(b'test'))
            else:
                entry.linkname = '/outside'
                tar.addfile(entry)
    return output.getvalue()


class SourceArchiveSafetyTests(unittest.TestCase):
    def test_git_directories_and_regular_files_accepted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target.source_extract(archive([('apps/', tarfile.DIRTYPE),
                                           ('apps/web/file', tarfile.REGTYPE),
                                           ('.env.example', tarfile.REGTYPE)]), root)
            self.assertEqual((root / 'apps/web/file').read_bytes(), b'test')

    def test_private_paths_rejected_before_writes(self):
        for name in ['.env', '.env.local', '.env.local.example', '.local/proof', 'env/key.txt',
                     '.git/config', 'node_modules/key', '__pycache__/file']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                with self.assertRaises(ValueError):
                    target.source_extract(archive([('valid', tarfile.REGTYPE),
                                                   (name, tarfile.REGTYPE)]), root)
                self.assertEqual(list(root.iterdir()), [])

    def test_aliases_and_absolute_paths_rejected_before_writes(self):
        for name in ['/root/file', '../file', 'root/../file', 'root//file', 'root\\file']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                with self.assertRaises(ValueError):
                    target.source_extract(archive([('valid', tarfile.REGTYPE),
                                                   (name, tarfile.REGTYPE)]), root)
                self.assertEqual(list(root.iterdir()), [])

    def test_source_links_and_devices_forbidden(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                with self.assertRaises(ValueError):
                    target.source_extract(archive([('danger', kind)]), Path(temporary))

    def test_duplicate_regular_files_rejected_before_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(ValueError):
                target.source_extract(archive([('same', tarfile.REGTYPE),
                                               ('same', tarfile.REGTYPE)]), root)
            self.assertEqual(list(root.iterdir()), [])


if __name__ == '__main__':
    unittest.main()

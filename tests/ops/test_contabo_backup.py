import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    'backup', Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


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


class RestoreSafetyTests(unittest.TestCase):
    def test_regular_files_restored_inside_sandbox(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            backup.safe_extract(archive([('root/config/file', tarfile.REGTYPE)]), root)
            self.assertEqual((root / 'root/config/file').read_bytes(), b'test')

    def test_parent_escape_is_rejected_before_any_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(ValueError):
                backup.safe_extract(archive([('valid', tarfile.REGTYPE),
                                             ('../escape', tarfile.REGTYPE)]), root)
            self.assertEqual(list(root.iterdir()), [])

    def test_absolute_path_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(ValueError):
                backup.safe_extract(archive([('/etc/config', tarfile.REGTYPE)]), Path(temporary))

    def test_links_and_devices_rejected(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                with self.assertRaises(ValueError):
                    backup.safe_extract(archive([('danger', kind)]), Path(temporary))

    def test_duplicate_path_rejected_before_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(ValueError):
                backup.safe_extract(archive([('same', tarfile.REGTYPE),
                                             ('same', tarfile.REGTYPE)]), root)
            self.assertEqual(list(root.iterdir()), [])

    def test_path_aliases_rejected_before_writes(self):
        for name in ['root/../config', 'root/./config', 'root//config', 'root\\config']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                with self.assertRaises(ValueError):
                    backup.safe_extract(archive([('valid', tarfile.REGTYPE),
                                                 (name, tarfile.REGTYPE)]), root)
                self.assertEqual(list(root.iterdir()), [])

    def test_existing_file_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'file'
            target.write_bytes(b'keep')
            with self.assertRaises(FileExistsError):
                backup.private_file(target, b'overwrite')
            self.assertEqual(target.read_bytes(), b'keep')

    def test_confined_rejects_root_and_sibling(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for path in [root, root.parent / (root.name + '-sibling')]:
                with self.assertRaises(ValueError):
                    backup.confined(root, path)


if __name__ == '__main__':
    unittest.main()

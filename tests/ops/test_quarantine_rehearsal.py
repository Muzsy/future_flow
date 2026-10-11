"""Old dump cannot import executable definitions or an unreviewed table."""
import importlib.util
from pathlib import Path
import unittest

path=Path(__file__).resolve().parents[2]/'scripts/ops/contabo-quarantine-rehearsal.py'
spec=importlib.util.spec_from_file_location('quarantine_rehearsal',path)
quarantine=importlib.util.module_from_spec(spec);spec.loader.exec_module(quarantine)


class DataOnlyArchiveTests(unittest.TestCase):
    def test_only_complete_known_public_table_data_is_selected(self):
        toc=b'; comment\n1; 0 100 FUNCTION public dangerous() postgres\n2; 0 101 TABLE DATA public ff_users postgres\n3; 0 102 TABLE DATA public aw_lives postgres\n4; 0 103 TRIGGER public malicious postgres\n5; 0 104 SEQUENCE SET public dangerous postgres\n6; 0 105 BLOB - 123 postgres\n'
        selected=quarantine.selected_table_data(toc,['ff_users','aw_lives'])
        self.assertEqual(selected,b'2; 0 101 TABLE DATA public ff_users postgres\n3; 0 102 TABLE DATA public aw_lives postgres\n')

    def test_missing_duplicate_foreign_or_malformed_table_data_refuses(self):
        base=b'2; 0 101 TABLE DATA public ff_users postgres\n'
        for toc,tables in [(base,['ff_users','aw_lives']),
                           (base+base,['ff_users']),
                           (base+b'3; 0 102 TABLE DATA auth users postgres\n',['ff_users']),
                           (base+b'3; 0 102 TABLE DATA public aw_unreviewed postgres\n',['ff_users']),
                           (base+b'3; 0 102 TABLE DATA public ff_users evil; DROP SCHEMA public\n',['ff_users']),
                           (base,['ff_users','ff_users']),
                           (base,['ff_users;DROP']),
                           (b'x'*(2*1024**2+1),['ff_users'])]:
            with self.subTest(toc=toc[:80],tables=tables),self.assertRaises(ValueError):
                quarantine.selected_table_data(toc,tables)

    def test_schema_definitions_do_not_count_as_missing_table_data(self):
        with self.assertRaisesRegex(ValueError,'Complete'):
            quarantine.selected_table_data(b'1; 1 2 TABLE public ff_users postgres\n',['ff_users'])

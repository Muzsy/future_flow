"""Old dump cannot import executable definitions or an unreviewed table."""
import importlib.util
from pathlib import Path
import unittest
import datetime as dt
import hashlib
import tempfile
from types import SimpleNamespace

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

class BackupPreflightTests(unittest.TestCase):
    def fixture(self,root):
        now=dt.datetime(2026,10,11,6,0,tzinfo=dt.timezone.utc)
        dump=b'PGDMP-synthetic-only';cipher=b'age-synthetic-only'
        manifest={'ownerImage':quarantine.APP,'postgresImage':quarantine.PG,
                  'dumpSha256':hashlib.sha256(dump).hexdigest(),'runId':'20261011T030000Z-aaaaaaaa',
                  'encryptedFiles':{'application.dump.age':{'bytes':len(cipher),'sha256':hashlib.sha256(cipher).hexdigest()}}}
        record={'created':now-dt.timedelta(hours=3),'manifest':manifest,'path':root,
                'files':{'manifest.json':{'sha256':'a'*64}}}
        calls=[]
        def command(args,**_):
            calls.append(args)
            return b'age1synthetic-recipient\n' if args[0]=='age-keygen' else dump
        daily=SimpleNamespace(ROOT=root,RETENTION_SECONDS=7*86400,utcnow=lambda:now,
            config=lambda:{'recipient':'age1synthetic-recipient'},
            backup=SimpleNamespace(age_path=lambda name='age':name),command=command,
            completed_archives=lambda _: [record],
            expiry_file=lambda _: (cipher,{'bytes':len(cipher),'sha256':hashlib.sha256(cipher).hexdigest()}))
        return daily,record,calls

    def test_original_unexpired_bound_dump_and_identity_are_checked_before_any_docker_operation(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);daily,record,calls=self.fixture(root)
            proof=quarantine.prepare_backup(daily,{'recoveryIdentity':'synthetic-only'},root)
            self.assertEqual(proof['dump'],b'PGDMP-synthetic-only')
            self.assertEqual(proof['backupManifestSha256'],'a'*64)
            self.assertFalse((root/'recovery-identity.txt').exists())
            self.assertFalse(any(call[0]=='docker' for call in calls))

    def test_wrong_recipient_expired_image_cipher_digest_or_plaintext_never_leaves_key_file(self):
        for failure in ['recipient','expired','future','image','cipher','dump','oversize']:
            with self.subTest(failure=failure),tempfile.TemporaryDirectory() as directory:
                root=Path(directory);daily,record,calls=self.fixture(root)
                if failure=='recipient':daily.config=lambda:{'recipient':'different'}
                elif failure=='expired':record['created']-=dt.timedelta(days=8)
                elif failure=='future':record['created']+=dt.timedelta(days=1)
                elif failure=='image':record['manifest']['postgresImage']='sha256:'+'b'*64
                elif failure=='cipher':record['manifest']['encryptedFiles']['application.dump.age']['sha256']='b'*64
                elif failure=='dump':record['manifest']['dumpSha256']='b'*64
                elif failure=='oversize':daily.expiry_file=lambda _: (b'not-a-key',{'bytes':quarantine.MAX_DUMP+1,'sha256':'b'*64})
                with self.assertRaises(ValueError):
                    quarantine.prepare_backup(daily,{'recoveryIdentity':'synthetic-only'},root)
                self.assertFalse((root/'recovery-identity.txt').exists())
                self.assertFalse(any(call[0]=='docker' for call in calls))

"""Private root authority is chained to the unchanged original funded runtime."""
import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from test_contabo_daily import daily, test_read
from test_funded_replay import replay


def encoded(v):
    return (json.dumps(v, sort_keys=True, separators=(',', ':')) + '\n').encode()


def hashed(v):
    return daily.digest(encoded(v)[:-1])


class SuccessorAuthorityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.owner = Path(self.tmp.name).resolve() / 'owner'
        self.parent = self.owner / 'funded-runtime-upgrade'
        self.root = self.owner / 'beta-successor'
        self.now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
        self.prior = {'participants': [{'email': 'owner@example.invalid',
                                       'userId': '12345678-1234-4234-8234-123456789abc'}],
                      'projectUsd': '2', 'userUsd': '0.50',
                      'startsAt': (self.now-dt.timedelta(days=1)).isoformat().replace('+00:00', 'Z'),
                      'endsAt': (self.now+dt.timedelta(days=29)).isoformat().replace('+00:00', 'Z')}
        self.write(self.owner / 'personal-beta/terms.json', encoded(self.prior))
        self.trial_owner = {'email': 'actual-owner@example.invalid',
                            'userId': '87654321-1234-4234-8234-123456789abc'}
        self.access = {'allowedEmails': [self.prior['participants'][0]['email'], self.trial_owner['email']]}
        self.write(self.owner / 'personal-beta-readers/access.json', encoded(self.access))
        for n in daily.RUNTIME_NAMES:
            data = encoded({'commit':'a'*40,'imageId':'sha256:'+'a'*64}) if n == 'manifest.json' else b'original-' + n.encode()
            self.write(self.parent / 'target' / n, data)
            self.write(self.owner / n, data)
        old_files = {n:daily.digest((self.owner / n).read_bytes()) for n in daily.RUNTIME_NAMES}
        self.old = {'version':'alterward-funded-upgrade-1', 'sourceCommit':'a'*40,'bundleSha256':'d'*64,
                    'files':{'target':old_files},'baseline':{'authority':{
                        str(self.owner/'personal-beta/terms.json'):daily.digest(encoded(self.prior)),
                        str(self.owner/'personal-beta-readers/access.json'):daily.digest(encoded(self.access))}},
                    'release':{'target':{'imageId':'sha256:'+'a'*64,'commit':'a'*40}}}
        self.write(self.parent / 'prepared.json', encoded(self.old))
        self.journal(self.parent, self.old['version'], ['applied'])
        self.write(self.parent / 'readback.json', encoded({
            'preparedSha256':daily.digest(encoded(self.old)), 'schema':38,
            'protectedDataUnchanged':True, 'imageId':'sha256:'+'a'*64,
            'version':self.old['version'],'sourceCommit':self.old['sourceCommit'],
            'paidAiCalls':0,'operationPaidAiCalls':0,'databaseRestored':False}))
        self.start_patch('OWNER', self.owner)
        self.start_patch('UID', getattr(__import__('os'), 'getuid', lambda:0)())
        self.start_patch('regular', side_effect=test_read)
        self.start_patch('reader_config_paths', return_value=[self.owner/'personal-beta-readers/access.json'])
        self.start_patch('personal_config_paths', return_value=[self.owner/'personal-beta/terms.json'])
        self.start_patch('utcnow', return_value=self.now)
        def runtime():
            manifest=json.loads((self.owner/'manifest.json').read_bytes())
            return manifest,{role:{'Id':role,'Image':manifest['imageId'],
                                  'Config':{'Labels':{'com.docker.compose.project':'alterward-owner'}}}
                             for role in ('api','web','worker')}
        self.start_patch('owner_runtime',side_effect=runtime)
        self.start_patch('containers',side_effect=lambda:list(runtime()[1].values()))
        # Real directory/link checks run on Linux. Windows has no POSIX modes.
        if __import__('os').name == 'nt':
            self.start_patch('private_archive_directory', side_effect=lambda p: self.assertFalse(p.is_symlink()))

    def start_patch(self, name, *args, **kwargs):
        p = patch.object(daily, name, *args, **kwargs)
        self.addCleanup(p.stop)
        return p.start()

    def write(self, p, data):
        p.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        for directory in [p.parent, *p.parent.parents]:
            if directory == Path(self.tmp.name):
                break
            directory.chmod(0o700)
        p.write_bytes(data)
        p.chmod(0o600)

    def journal(self, root, version, states):
        rows=[];previous=None
        for state in states:
            row={'state':state,'changedAt':self.now.isoformat(), 'previousSha256':previous}
            row['sha256']=daily.digest(encoded(row));previous=row['sha256'];rows.append(row)
        self.write(root/'journal.json', encoded({'version':version,
            'preparedSha256':daily.digest((root/'prepared.json').read_bytes()),'states':rows}))

    def prepare(self):
        terms={**self.prior,'participants':[self.trial_owner], 'projectUsd':'3','userUsd':'3',
               'startsAt':(self.now+dt.timedelta(minutes=10)).isoformat().replace('+00:00','Z'),
               'endsAt':(self.now+dt.timedelta(days=30,minutes=10)).isoformat().replace('+00:00','Z')}
        selection={'purpose':'owner-e2e','previousTermsSha256':hashed(self.prior),
                   'closePreviousAt':(self.now+dt.timedelta(minutes=5)).isoformat().replace('+00:00','Z'), 'next':terms}
        self.write(self.root/'terms.json',encoded(terms));self.write(self.root/'selection.json',encoded(selection))
        files={'previous':self.old['files']['target']}
        release={}
        for n in daily.RUNTIME_NAMES:
            self.write(self.root/'previous'/n,(self.owner/n).read_bytes())
        env={'AI_PROJECT_BUDGET_USD':'3','AI_USER_BUDGET_USD':'3',
             'CLOSED_BETA_USER_IDS':terms['participants'][0]['userId'],
             'NARRATIVE_PIPELINE_MODE':'narrative-fiction-v2', 'NARRATIVE_FICTION_GENERATION':'v9',
             'NARRATIVE_COHORT_USER_IDS':terms['participants'][0]['userId'],
             'CLOSED_SITE_ALLOWED_EMAILS':','.join(self.access['allowedEmails']),
             'AI_BUDGET_WINDOW_REQUIRED':'true','AI_FICTION_TIMEOUT_MS':'300000',
             'AI_FICTION_MAX_REQUEST_BYTES':'196608',
             'AI_BUDGET_WINDOW_START':terms['startsAt'],'AI_BUDGET_WINDOW_END':terms['endsAt']}
        for role in ('target','recovery'):
            cfg={'services':{'web':{'environment':{'CLOSED_SITE_ALLOWED_EMAILS':env['CLOSED_SITE_ALLOWED_EMAILS']}},
                             'api':{'environment':dict(env)},
                             'worker':{'environment':{k:v for k,v in env.items() if k!='CLOSED_SITE_ALLOWED_EMAILS'}}}}
            self.write(self.root/role/'server.env',b'new-runtime')
            self.write(self.root/role/'effective-compose.json',encoded(cfg))
            self.write(self.root/role/'pinned-image.json',b'pinned')
            manifest={'commit':'b'*40,'imageId':'sha256:'+'b'*64,
                      'ownerEnvironmentSha256':daily.digest(b'new-runtime'),
                      'effectiveComposeSha256':daily.digest(encoded(cfg))}
            self.write(self.root/role/'manifest.json',encoded(manifest))
            files[role]={n:daily.digest((self.root/role/n).read_bytes()) for n in daily.RUNTIME_NAMES}
            release[role]={'commit':'b'*40,'imageId':'sha256:'+'b'*64}
        authority=daily.reader_config_paths()+daily.personal_config_paths()+daily.funded_tree_paths(self.parent)
        def normalized(t):
            return {**t, **{k: dt.datetime.fromisoformat(t[k].replace('Z','+00:00'))
                    .isoformat(timespec='milliseconds').replace('+00:00','Z') for k in ('startsAt','endsAt')}}
        value={'version':daily.SUCCESSOR_VERSION,'sourceCommit':'b'*40,'bundleSha256':'c'*64,
               'preparedAt':self.now.isoformat(),'expiresAt':(self.now+dt.timedelta(minutes=15)).isoformat(),
               'baseline':{'files':files['previous'],'authority':{str(p):daily.digest(p.read_bytes()) for p in authority}},
               'release':release,'files':files,'database':{},
               'operation':{'plan':{'version':'alterward-beta-successor-plan-2','purpose':'owner-e2e',
                  'previous':normalized(self.prior),'next':normalized(terms),
                  'observedAt':self.now.isoformat(timespec='milliseconds').replace('+00:00','Z'),
                  'expiresAt':(self.now+dt.timedelta(minutes=15)).isoformat(timespec='milliseconds').replace('+00:00','Z'),
                  'closePreviousAt':selection['closePreviousAt'].replace('Z','.000Z'),
                  'previousTermsSha256':hashed(self.prior),'selectionSha256':hashed(selection)}},
               'parentPreparedSha256':daily.digest((self.parent/'prepared.json').read_bytes()),
               'parentJournalSha256':daily.digest((self.parent/'journal.json').read_bytes()),
               'parentReadbackSha256':daily.digest((self.parent/'readback.json').read_bytes()),
               'termsSha256':daily.digest(encoded(terms)),'selectionSha256':daily.digest(encoded(selection))}
        self.write(self.root/'prepared.json',encoded(value))
        return value

    def expose(self,value):
        self.journal(self.root,daily.SUCCESSOR_VERSION,['apply-intent','held','database-intent','accounts-committed','authority-staged','exposure-intent','applied'])
        proof={'version':daily.SUCCESSOR_VERSION,'preparedSha256':daily.digest(encoded(value)),
               'sourceCommit':value['sourceCommit'],'imageId':value['release']['target']['imageId'],
               'schema':39,'protectedDataUnchanged':True,'previousSpendPreserved':True,
               'previousAllowanceClosed':True,'browserJourneyPassed':False,
               'operationSha256':hashed(value['operation']),'operationPaidAiCalls':0,'paidAiCalls':0,'databaseRestored':False}
        self.write(self.root/'readback.json',encoded(proof))
        for n in daily.RUNTIME_NAMES:
            self.write(self.owner/n,(self.root/'target'/n).read_bytes())
        return proof

    def test_original_funded_state_is_unchanged_when_no_successor_exists(self):
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))

    def test_unapplied_successor_is_backed_up_but_does_not_change_effective_runtime(self):
        value=self.prepare()
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertEqual(daily.successor_effective_role(value),'previous')
        self.assertEqual(len(daily.successor_config_paths(immutable_only=True)),15)

    def test_completed_successor_changes_only_effective_runtime_and_retains_parent(self):
        value=self.prepare();before={p:p.read_bytes() for p in self.parent.rglob('*') if p.is_file()}
        self.expose(value)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertEqual(before,{p:p.read_bytes() for p in self.parent.rglob('*') if p.is_file()})

    def test_partial_transition_is_not_healthy_even_with_original_services(self):
        self.prepare();self.journal(self.root,daily.SUCCESSOR_VERSION,['apply-intent','held','database-intent'])
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_parent_or_selection_tamper_fails_closed(self):
        self.prepare()
        for p in (self.parent/'readback.json',self.root/'selection.json',self.root/'terms.json'):
            old=p.read_bytes();p.write_bytes(b'{}')
            self.assertFalse(daily.funded_upgrade_healthy('personal-beta'));p.write_bytes(old)

    def test_unknown_and_linked_files_are_not_archived(self):
        self.prepare();extra=self.root/'unknown.json';extra.write_bytes(b'{}')
        with self.assertRaises(ValueError):daily.successor_config_paths()
        extra.unlink();original=self.root/'terms.json';other=self.owner/'elsewhere.json';original.rename(other);original.symlink_to(other)
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_commit_readback_cannot_claim_e2e_or_reopen_old_allowance(self):
        value=self.prepare();proof=self.expose(value)
        for field,wrong in [('browserJourneyPassed',True),('previousAllowanceClosed',False),('previousSpendPreserved',False),('operationSha256','f'*64)]:
            with self.subTest(field=field):
                self.write(self.root/'readback.json',encoded({**proof,field:wrong}))
                self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_runtime_bytes_and_chain_must_match_terminal_proof(self):
        value=self.prepare();self.expose(value);self.write(self.owner/'server.env',b'changed')
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_replay_uses_new_exact_authority_and_rejects_old_proof_after_exposure(self):
        old=replay.active_funded_runtime(daily,test_read)
        value=self.prepare()
        self.assertEqual(replay.active_funded_runtime(daily,test_read),old)
        self.expose(value)
        current=replay.active_funded_runtime(daily,test_read)
        self.assertEqual(current['sourceCommit'],value['sourceCommit'])
        self.assertNotEqual(current['preparedSha256'],old['preparedSha256'])
        self.assertNotEqual(current['authoritySha256'],old['authoritySha256'])
        self.assertEqual(replay.require_funded_runtime(daily,test_read,current),current)
        with self.assertRaises(ValueError):replay.require_funded_runtime(daily,test_read,old)

    def test_unknown_hashed_journal_state_is_rejected(self):
        value=self.prepare();self.expose(value)
        self.journal(self.root,daily.SUCCESSOR_VERSION,['arbitrary','applied'])
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_terminal_state_cannot_skip_checks_or_replay_sql_on_recovery(self):
        value=self.prepare();self.expose(value)
        for states in [
            ['applied'], ['apply-intent','applied'],
            ['apply-intent','held','accounts-committed','authority-staged','exposure-intent','applied'],
            ['apply-intent','held','database-intent','held-after-failure','recovery-intent','held',
             'database-intent','accounts-committed','authority-staged','exposure-intent','recovered'],
            ['apply-intent','held','database-intent','accounts-committed','authority-staged','exposure-intent','recovered'],
        ]:
            with self.subTest(states=states):
                self.journal(self.root,daily.SUCCESSOR_VERSION,states)
                self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_explicit_recovery_reconciles_without_new_database_intent(self):
        value=self.prepare();self.expose(value)
        self.journal(self.root,daily.SUCCESSOR_VERSION,['apply-intent','held','database-intent',
            'held-after-failure','recovery-intent','held','accounts-committed','authority-staged','exposure-intent','recovered'])
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))

    def test_new_owner_must_already_have_immutable_reader_access(self):
        value=self.prepare();self.expose(value)
        # The old funded technical account is deliberately a DIFFERENT user.
        self.assertNotEqual(self.prior['participants'],value['operation']['plan']['next']['participants'])
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        # Match the real Compose service boundary: ingress web/API carry the
        # reader list; the background worker deliberately has no such field.
        self.assertNotIn('CLOSED_SITE_ALLOWED_EMAILS',
            json.loads((self.root/'target/effective-compose.json').read_bytes())['services']['worker']['environment'])

    def test_rehashed_missing_or_foreign_ingress_reader_list_is_rejected(self):
        for role in ('target','recovery'):
            for service in ('web','api'):
                for wrong in (None,'stranger@example.invalid'):
                    with self.subTest(role=role,service=service,wrong=wrong):
                        value=self.prepare()
                        p=self.root/role/'effective-compose.json';cfg=json.loads(p.read_bytes())
                        env=cfg['services'][service]['environment']
                        if wrong is None:env.pop('CLOSED_SITE_ALLOWED_EMAILS')
                        else:env['CLOSED_SITE_ALLOWED_EMAILS']=wrong
                        self.write(p,encoded(cfg))
                        # Rebind all hashes so this reaches the reader-policy
                        # check rather than being rejected as generic tampering.
                        digest=daily.digest(encoded(cfg))
                        value['files'][role]['effective-compose.json']=digest
                        mp=self.root/role/'manifest.json';manifest=json.loads(mp.read_bytes())
                        manifest['effectiveComposeSha256']=digest
                        self.write(mp,encoded(manifest))
                        value['files'][role]['manifest.json']=daily.digest(encoded(manifest))
                        self.write(self.root/'prepared.json',encoded(value))
                        with self.assertRaisesRegex(ValueError,'reader access'):
                            daily.successor_candidate(self.old,'target')

    def test_pending_successor_one_off_is_not_healthy(self):
        value=self.prepare();self.expose(value)
        for observer in ('funded_probe_state','funded_capability_state'):
            with self.subTest(observer=observer), patch.object(daily,observer,
                    side_effect=lambda path: {'state':'pending'} if path==self.root else None):
                self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_rehashed_selection_cannot_add_a_reader_or_raise_the_approved_cap(self):
        for field, value in [('email','unlisted@example.invalid'), ('projectUsd','10')]:
            with self.subTest(field=field):
                prepared=self.prepare()
                terms=json.loads((self.root/'terms.json').read_bytes())
                if field=='email': terms['participants'][0]['email']=value
                else: terms[field]=value
                selection=json.loads((self.root/'selection.json').read_bytes())
                selection['next']=terms
                self.write(self.root/'terms.json',encoded(terms))
                self.write(self.root/'selection.json',encoded(selection))
                prepared['termsSha256']=daily.digest(encoded(terms))
                prepared['selectionSha256']=daily.digest(encoded(selection))
                prepared['operation']['plan']['selectionSha256']=hashed(selection)
                prepared['operation']['plan']['next']={**terms,**{
                    k:dt.datetime.fromisoformat(terms[k].replace('Z','+00:00')).isoformat(timespec='milliseconds').replace('+00:00','Z')
                    for k in ('startsAt','endsAt')}}
                self.write(self.root/'prepared.json',encoded(prepared))
                self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))


if __name__ == '__main__':
    unittest.main()

"""Real private authority/files, with explicit Docker/DB boundary substitutes.

These are adapter regression tests, NOT the Linux/root/PostgreSQL acceptance.
"""
import copy
import datetime as dt
import json
import sys
import unittest
from unittest.mock import Mock, patch

import test_beta_successor_authority as authority
import test_beta_successor_transition as sequencing
from test_funded_upgrade import funded, load

sys.modules['alterward_funded_upgrade'] = funded
sys.modules['alterward_successor_transition'] = sequencing.module
root = load('test_successor_root', 'contabo-beta-successor.py')


class SuccessorRootTests(unittest.TestCase):
    def setUp(self):
        self.fixture = authority.SuccessorAuthorityTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.value = self.fixture.prepare()
        self.selection = json.loads((self.fixture.root/'selection.json').read_bytes())
        self.request = {'mode':'apply','sourceCommit':self.value['sourceCommit'],
                        'bundleSha256':self.value['bundleSha256'],'sourceHashes':{},
                        'selection':self.selection,'release':self.value['release'],
                        'preparedSha256':authority.daily.digest(authority.encoded(self.value))}
        for module in (root, funded):
            p = patch.object(module,'DIRECTORY',self.fixture.owner)
            p.start();self.addCleanup(p.stop)
        p = patch.object(funded.fence,'original',side_effect=authority.test_read)
        p.start();self.addCleanup(p.stop)
        self.system = root.System(self.request,authority.daily)
        self.system.now = Mock(return_value=self.fixture.now+dt.timedelta(minutes=6))

    def test_candidate_is_bound_to_exact_source_selection_and_immutable_parent(self):
        self.assertEqual(self.system.candidate(),self.value)
        for field,value in [('sourceCommit','f'*40),('bundleSha256','f'*64),('preparedSha256','f'*64)]:
            with self.subTest(field=field):
                old=self.request[field];self.request[field]=value
                with self.assertRaises(ValueError):self.system.candidate()
                self.request[field]=old
        self.request['selection']=copy.deepcopy(self.selection)
        self.request['selection']['next']['participants'][0]['email']='other@example.invalid'
        with self.assertRaises(ValueError):self.system.candidate()

    def test_database_transport_has_fixed_modes_and_never_migrates(self):
        self.system.raw_probe=Mock(return_value={'observed':True})
        result=self.system.accounting('image','reconcile',self.value['operation'])
        self.assertEqual(result,{'observed':True})
        data=self.system.raw_probe.call_args.args[1]
        self.assertEqual(data['mode'],'successor')
        self.assertEqual(data['expected']['previous'],self.fixture.prior)
        self.assertEqual(data['expected']['selection'],self.selection)
        self.assertEqual(data['expected']['mode'],'reconcile')
        with self.assertRaises(ValueError):self.system.probe('image','migrate')

    def test_pending_probe_does_not_prevent_authenticating_candidate_for_stop_first_recovery(self):
        with patch.object(authority.daily,'funded_probe_state',side_effect=lambda p:
                {'state':'pending'} if p==self.fixture.root else None):
            self.assertEqual(self.system.candidate(),self.value)
            self.assertFalse(authority.daily.funded_upgrade_healthy('personal-beta'))

    def test_main_recovery_stops_services_then_cleans_pending_probe_before_strict_hold(self):
        self.fixture.journal(self.fixture.root,root.VERSION,['apply-intent','held','database-intent'])
        self.request.update(mode='recover',accessSnapshot={},restoreProof={})
        self.system.recovery=True
        job=self.fixture.owner/'daily/job.lock'
        self.fixture.write(job,b'')
        self.fixture.write(self.fixture.owner/'activation.lock',b'')
        events=[]
        self.system.stop=Mock(side_effect=lambda:events.append('regular-service-stop'))
        self.system.stop_and_hold=Mock(side_effect=ValueError('strict hold must follow cleanup'))
        self.system.cleanup_probe=Mock(side_effect=lambda:events.append('pending-probe-cleanup'))
        self.system.proof={}
        def execute(system,candidate,**kwargs):
            self.assertEqual(events,['regular-service-stop','pending-probe-cleanup'])
            self.assertTrue(kwargs['recovery'])
            events.append('transition-strict-hold')
            return {'browserJourneyPassed':False}
        with patch.object(root,'System',return_value=self.system),patch.object(root.os,'geteuid',return_value=0), \
             patch.object(root.fence,'DAILY',job.parent),patch.object(root.fence,'installed_daily',return_value=authority.daily), \
             patch.object(root,'transition',side_effect=execute),patch.object(root.signal,'signal'):
            self.assertFalse(root.main(self.request)['browserJourneyPassed'])
        self.assertEqual(events,['regular-service-stop','pending-probe-cleanup','transition-strict-hold'])
        self.system.stop_and_hold.assert_not_called()

    def test_reconcile_requires_original_operation_hash_and_protected_readback(self):
        valid={'state':'committed','operationSha256':root.canonical_sha(self.value['operation']),
               'protectedDataUnchanged':True,'paidAiCalls':0}
        self.system.accounting=Mock(return_value=valid)
        self.assertEqual(self.system.reconcile_accounts(self.value),valid)
        for field,value in [('operationSha256','f'*64),('protectedDataUnchanged',False),('paidAiCalls',1)]:
            self.system.accounting.return_value={**valid,field:value}
            with self.subTest(field=field),self.assertRaises(ValueError):
                self.system.reconcile_accounts(self.value)

    def test_partial_accounting_cannot_stage_or_promote_runtime(self):
        self.system.stage=Mock()
        self.system.reconcile_accounts=Mock(return_value={'state':'uncommitted'})
        with self.assertRaises(ValueError):self.system.stage_authority(self.value)
        self.system.stage.assert_not_called()
        self.system.promote=Mock()
        self.system.after={'snapshot':'after-closure'}
        self.system.postcheck=Mock(side_effect=ValueError('synthetic staged failure'))
        with self.assertRaises(ValueError):self.system.verify_staged(self.value)
        self.system.promote.assert_not_called()

    def test_staged_check_compares_post_closure_snapshot_before_promotion(self):
        events=[]
        self.system.after={'snapshot':'new-accounting'}
        self.system.postcheck=lambda value,**kw:events.append(('check',value['database']))
        self.system.reconcile_accounts=lambda value:events.append(('reconcile',None)) or {'state':'committed'}
        self.system.promote=lambda value,**kw:events.append(('promote',value['database']))
        self.system.verify_staged(self.value)
        self.assertEqual(events,[('check',self.system.after),('reconcile',None),('promote',self.value['database'])])

    def test_start_cannot_be_extended_to_force_a_recovery(self):
        self.system.require_future_start(self.value)
        self.system.now.return_value=funded.stamp(self.selection['next']['startsAt'])
        with self.assertRaises(ValueError):self.system.require_future_start(self.value)
        self.assertEqual(self.system.selected(),self.selection)

    def test_expired_or_early_candidate_is_refused_before_any_account_or_container_write(self):
        self.system.archive_support=Mock()
        self.system.baseline=Mock(return_value=self.value['baseline'])
        self.system.accounting=Mock()
        self.system.stop=Mock()
        for now in (self.fixture.now, self.fixture.now+dt.timedelta(minutes=16)):
            self.system.now.return_value=now
            with self.subTest(now=now),self.assertRaises(ValueError):
                self.system.preflight(self.value)
        self.system.accounting.assert_not_called()
        self.system.stop.assert_not_called()

    def test_environment_changes_only_approved_owner_window_image_and_v9(self):
        original={**root.selection_values(self.selection),
                  'CLOSED_BETA_USER_IDS':self.fixture.prior['participants'][0]['userId'],
                  'AI_PROJECT_BUDGET_USD':'2','AI_USER_BUDGET_USD':'0.50',
                  'ALTERWARD_TAG':'contabo-000000000000',
                  'OPENAI_API_KEY':'synthetic-preserved', 'CLOSED_SITE_ALLOWED_EMAILS':'owner@example.invalid',
                  'SHARED_CONTEXTS_ENABLED':'false','SYNTHETIC_UNRELATED':'unchanged'}
        text=''.join(k+"='"+v+"'\n" for k,v in original.items())
        after=root.candidate_environment(text,self.selection,'alterward:contabo-aaaaaaaaaaaa').decode()
        actual=funded.upgrade.server_environment(after)
        self.assertEqual(actual['CLOSED_BETA_USER_IDS'],self.fixture.trial_owner['userId'])
        self.assertEqual(actual['OPENAI_API_KEY'],original['OPENAI_API_KEY'])
        self.assertEqual(actual['CLOSED_SITE_ALLOWED_EMAILS'],original['CLOSED_SITE_ALLOWED_EMAILS'])
        self.assertEqual(actual['SHARED_CONTEXTS_ENABLED'],'false')
        self.assertEqual(actual['SYNTHETIC_UNRELATED'],'unchanged')
        self.assertEqual(actual['AI_PROJECT_BUDGET_USD'],'3')
        self.assertEqual(actual['NARRATIVE_COHORT_USER_IDS'],self.fixture.trial_owner['userId'])

    def test_expired_never_attempted_candidate_archives_without_any_financial_or_service_action(self):
        self.system.now.return_value=self.fixture.now+dt.timedelta(minutes=16)
        self.system.archive_support=Mock()
        self.system.baseline=Mock(return_value=self.value['baseline'])
        self.system.accounting=Mock()
        self.system.stop=Mock()
        before={p:p.read_bytes() for p in self.fixture.parent.rglob('*') if p.is_file()}
        with patch.object(funded.readers,'durable_file',side_effect=self.fixture.write),patch.object(
                sys.modules['alterward_backup'],'ROOT',self.fixture.owner):
            result=self.system.archive_expired()
            self.assertTrue(result['archived'])
            self.assertFalse(result['authorityChanged'])
            self.assertFalse(self.fixture.root.exists())
            self.assertTrue(authority.daily.successor_archived_paths())
            self.assertTrue(authority.daily.funded_upgrade_healthy('personal-beta'))
            self.assertTrue(self.system.archive_expired()['alreadyArchived'])
        self.system.accounting.assert_not_called()
        self.system.stop.assert_not_called()
        self.assertEqual(before,{p:p.read_bytes() for p in self.fixture.parent.rglob('*') if p.is_file()})

    def test_an_archived_preparation_stays_valid_while_a_new_one_is_in_flight(self):
        self.system.now.return_value=self.fixture.now+dt.timedelta(minutes=16)
        self.system.archive_support=Mock()
        self.system.baseline=Mock(return_value=self.value['baseline'])
        with patch.object(funded.readers,'durable_file',side_effect=self.fixture.write),patch.object(
                sys.modules['alterward_backup'],'ROOT',self.fixture.owner):
            self.system.archive_expired()
        self.assertFalse(self.fixture.root.exists())
        self.fixture.prepare()
        self.fixture.journal(self.fixture.root,root.VERSION,['apply-intent','held'])
        # The unfinished first generation is not a parent of anything, so the
        # archive and the backup path list must still be derivable (CI regression).
        self.assertTrue(authority.daily.successor_archived_paths())
        self.assertTrue(authority.daily.funded_upgrade_config_paths(immutable_only=True))

    def test_an_attempted_or_live_preparation_cannot_be_archived(self):
        self.system.archive_support=Mock()
        self.system.baseline=Mock(return_value=self.value['baseline'])
        with self.assertRaises(ValueError):self.system.archive_expired()
        self.system.now.return_value=self.fixture.now+dt.timedelta(minutes=16)
        self.fixture.journal(self.fixture.root,root.VERSION,['apply-intent','held'])
        with self.assertRaises(ValueError):self.system.archive_expired()
        self.assertTrue(self.fixture.root.exists())


if __name__ == '__main__':
    unittest.main()

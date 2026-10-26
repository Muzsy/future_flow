"""Successor cases inside the existing nonce-owned Linux/root Docker fixture.

Only host literals/source rendering and fixture DB identity are synthetic seams.
The production transition, accounts, private files, locks, encrypted restore,
Docker isolation/exposure, PID death watch and authority consumers execute.
"""
import copy
import datetime as dt
import json
import os
import signal
import time
from unittest.mock import patch


def exercise(engine, ctx, *, label, system, database, owner, project, terms, release,
             db, make_archive, private, checks):
    successor = engine.load('alterward_beta_successor', 'contabo-beta-successor.py')
    daily, funded, upgrade = engine.daily, engine.funded, engine.upgrade
    encoded, sha, frozen = engine.encoded, engine.sha, engine.frozen
    with patch.object(successor,'DIRECTORY',owner):
        now = dt.datetime.now(dt.timezone.utc)
        iso = lambda t:t.isoformat(timespec='milliseconds').replace('+00:00','Z')
        selection = {'purpose':'owner-e2e','previousTermsSha256':successor.canonical_sha(terms),
            'closePreviousAt':iso(now+dt.timedelta(seconds=60)), 'next':{
                'participants':[{'email':'owner@example.invalid','userId':'22222222-2222-4222-8222-222222222222'}],
                'projectUsd':'3','userUsd':'3','startsAt':iso(now+dt.timedelta(minutes=10)),
                'endsAt':iso(now+dt.timedelta(days=30,minutes=10))}}
        db('successor-setup', database, {'previous':terms,'selection':selection})
        request = {**system.request,'mode':'prepare','selection':selection,
            'release':{**release,'runtime':successor.runtime_selection(selection),'successorFixtureSha256':'b'*64}}
        request.pop('preparedSha256',None)
        request.pop('restoreProof',None)

        class FixtureSystem(successor.System):
            def __init__(self):
                super().__init__(request,daily)
                self.database=database
                self.staging_network=project+'-stage'
                self.applications=0

            def probe(self,image,mode,expected=None):
                if image != ctx['image'] or mode != 'capture' or expected is not None:
                    raise ValueError('Only actual synthetic038 capture supported')
                return db('capture',database)

            def accounting(self,image,mode,expected=None):
                if image != ctx['image'] or mode not in {'capture','apply','reconcile'}:
                    raise ValueError('Exact isolated successor transport required')
                return db('successor-'+mode,database,{'previous':terms,'selection':selection,'expected':expected})

            def apply_accounts(self,candidate):
                self.applications+=1
                result=super().apply_accounts(candidate)
                if label=='postcheck':
                    raise InterruptedError('Synthetic lost stdout AFTER actual PostgreSQL COMMIT')
                return result

            def build_files(self,role,build,baseline):
                path=self.root/role
                path.mkdir(mode=0o700)
                old=self.files(owner)
                config=self.configuration(owner)
                new=copy.deepcopy(config)
                values=successor.selection_values(selection)
                runtime=funded.narrative_runtime_values(successor.runtime_selection(selection))
                for name,svc in new['services'].items():
                    svc['image']=build['imageId']
                    if name in {'api','worker'}:
                        svc['environment'].update({k:v for k,v in values.items()
                            if name=='worker' or k in {'CLOSED_BETA_USER_IDS','AI_PROJECT_BUDGET_USD','AI_USER_BUDGET_USD'}})
                        svc['environment'].update({k:v for k,v in runtime.items() if name=='worker' or k in funded.NARRATIVE_DEFAULTS})
                assert successor.normalized(new,selection)==successor.normalized(config,selection)
                private(path/'server.env',successor.candidate_environment(old['server.env'].decode(),selection,build['imageTag']))
                private(path/'pinned-image.json',encoded({'services':{n:{'image':build['imageId'],'pull_policy':'never'} for n in new['services']}}))
                private(path/'effective-compose.json',frozen(new))
                private(path/'manifest.json',encoded({**json.loads(old['manifest.json']),
                    'commit':build['commit'],'imageId':build['imageId'],
                    'ownerEnvironmentSha256':sha((path/'server.env').read_bytes()),
                    'effectiveComposeSha256':sha(frozen(new))}))
                return self.hashes(path)

        trial=FixtureSystem()
        def runtime():
            manifest=json.loads((owner/'manifest.json').read_bytes())
            roles=trial.roles()
            config=trial.configuration(owner)
            engine.activation.validate_running(list(roles.values()),config,manifest['imageId'])
            assert sha(upgrade.CA.read_bytes())==manifest['databaseCaSha256']
            daily.personal_runtime_policy({k:v['environment'] for k,v in config['services'].items()},daily.utcnow())
            return manifest,roles

        with patch.object(daily,'owner_runtime',runtime):
            if label=='success':
                trial.prepare()
                # Actual never-attempted archival, preserving every byte. Only
                # the test clock/Access timestamp advances; no SQL or stop.
                prepared=json.loads((trial.root/'prepared.json').read_bytes())
                request['preparedSha256']=sha(encoded(prepared))
                real_now=trial.now
                expired=funded.stamp(prepared['expiresAt'])+dt.timedelta(seconds=1)
                trial.now=lambda:expired
                original_checked=request['accessSnapshot']['checkedAt']
                request['accessSnapshot']['checkedAt']=expired.isoformat()
                before={r:v['Id'] for r,v in trial.roles().items()}
                trial.archive_expired()
                assert before=={r:v['Id'] for r,v in trial.roles().items()}
                assert daily.successor_archived_paths()
                assert daily.funded_upgrade_healthy('personal-beta')
                trial.now=real_now
                request['accessSnapshot']['checkedAt']=original_checked
                # The DB capture must still be within the selection's future
                # close time. Reset only this disposable case's never-used dates.
                now=trial.now()
                selection['closePreviousAt']=iso(now+dt.timedelta(seconds=60))
                selection['next']['startsAt']=iso(now+dt.timedelta(minutes=10))
                selection['next']['endsAt']=iso(now+dt.timedelta(days=30,minutes=10))
                checks['expiredArchive']=True
                request.pop('preparedSha256',None)
            prepared=trial.prepare()
            candidate=json.loads((trial.root/'prepared.json').read_bytes())
            request['preparedSha256']=prepared['preparedSha256']
            assert trial.candidate()==candidate
            make_archive(trial,candidate)
            checks['candidateBackup']=True
            until=funded.stamp(selection['closePreviousAt'])
            while trial.now()<until:
                time.sleep(min(1,(until-trial.now()).total_seconds()))
            if label=='interruption-staged':
                pid=os.fork()
                if pid==0:
                    actual=trial.verify_staged
                    def kill(candidate):
                        actual(candidate)
                        os.kill(os.getpid(),signal.SIGKILL)
                    trial.verify_staged=kill
                    successor.transition(trial,candidate)
                    os._exit(3)
                _,status=os.waitpid(pid,0)
                assert os.WIFSIGNALED(status) and os.WTERMSIG(status)==signal.SIGKILL
                deadline=time.monotonic()+90
                while time.monotonic()<deadline:
                    if (trial.root/'watchdog.json').exists() and not any(v['State']['Running'] for v in trial.roles().values()):break
                    time.sleep(1)
                else:raise AssertionError('Successor death watch did not hold three services')
                assert json.loads((trial.root/'watchdog.json').read_bytes())[-1]['servicesStopped'] is True
                checks.update(watchdog=True,interruptionHeld=True)
                trial.recovery=True
                request['mode']='recover'
                successor.transition(trial,candidate,recovery=True)
            elif label=='postcheck':
                try:successor.transition(trial,candidate)
                except InterruptedError:pass
                else:raise AssertionError('Lost COMMIT output did not interrupt')
                assert trial.applications==1 and not any(v['State']['Running'] for v in trial.roles().values())
                assert trial.reconcile_accounts(candidate)['state']=='committed'
                trial.recovery=True
                request['mode']='recover'
                successor.transition(trial,candidate,recovery=True)
                assert trial.applications==1
                checks.update(lostCommitRecovery=True,noSqlReplay=True)
            else:
                successor.transition(trial,candidate)
                assert trial.applications==1
            assert daily.funded_upgrade_healthy('personal-beta')
            active=engine.replay.active_funded_runtime(daily, funded.fence.original)
            assert active['preparedSha256']==sha(encoded(candidate))
            assert trial.reconcile_accounts(candidate)['protectedDataUnchanged'] is True
            checks.update(db('successor-verify',database,{'previous':terms,'selection':selection,'expected':candidate['operation']}))
            checks.update(historyPreserved=True,stagedIngress=True,effectiveAuthority=True)
            assert trial.proof['browserJourneyPassed'] is False

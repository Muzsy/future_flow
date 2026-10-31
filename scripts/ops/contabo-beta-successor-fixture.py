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

# Time between choosing a disposable window and its start. The lead must cover
# prepare, the physical candidate backup, the 60 s close delay and the
# stop/restore/stage steps that run before the future-start check. The chained
# cases then really wait for the owner window, so the lead is wall-clock CI time.
START_LEAD = dt.timedelta(minutes=4)


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
                'projectUsd':'3','userUsd':'3','startsAt':iso(now+START_LEAD),
                'endsAt':iso(now+dt.timedelta(days=30)+START_LEAD)}}
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
                    raise ValueError('Only actual synthetic039 capture supported')
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
                selection['next']['startsAt']=iso(now+START_LEAD)
                selection['next']['endsAt']=iso(now+dt.timedelta(days=30)+START_LEAD)
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
                # A genuine pending API-shaped probe survives its operator's
                # SIGKILL. Its fixed Node command blocks on open stdin, so it
                # cannot query the DB or execute a provider while orphaned.
                pid=os.fork()
                if pid==0:
                    original_run=upgrade.run
                    def killed_probe(args,**kwargs):
                        if args[-len(funded.PROBE_COMMAND):]==funded.PROBE_COMMAND:
                            detached=list(args)
                            at=detached.index('run')+1
                            detached[at:at]=['--detach','--interactive']
                            original_run(detached,timeout=30)
                            os.kill(os.getpid(),signal.SIGKILL)
                        return original_run(args,**kwargs)
                    with patch.object(upgrade,'run',killed_probe):
                        trial.raw_probe(ctx['image'],{'mode':'capture','participants':[],'expected':None})
                    os._exit(3)
                _,status=os.waitpid(pid,0)
                assert os.WIFSIGNALED(status) and os.WTERMSIG(status)==signal.SIGKILL
                pending=daily.funded_probe_state(trial.root)
                assert pending['state']=='pending'
                probe=json.loads(upgrade.docker('inspect',pending['name']).stdout)[0]
                assert probe['State']['Running'] is True
                private(daily.ROOT/'job.lock',b'')
                # Only installed-source lookup and synthetic DB/source-render
                # adapter construction are seams; locks, stop/cleanup and main
                # dispatch are the actual production recovery path.
                with patch.object(successor.fence,'DAILY',daily.ROOT), \
                     patch.object(successor.fence,'installed_daily',return_value=daily), \
                     patch.object(successor,'System',return_value=trial):
                    successor.main(request)
                assert daily.funded_probe_state(trial.root)['state']=='cleaned'
                assert upgrade.docker('inspect',probe['Id'],check=False).returncode!=0
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
            if label=='success':
                chain(engine,successor,ctx,request=request,release=release,owner=owner,project=project,
                      database=database,window=selection['next'],db=db,make_archive=make_archive,
                      private=private,checks=checks)


READERS = ['funded@example.invalid','owner@example.invalid','tester-one@example.invalid','tester-two@example.invalid']
OWNER = {'email':'owner@example.invalid','userId':'22222222-2222-4222-8222-222222222222'}
TESTERS = [OWNER,
    {'email':'tester-one@example.invalid','userId':'33333333-3333-4333-8333-333333333333'},
    {'email':'tester-two@example.invalid','userId':'44444444-4444-4444-8444-444444444444'}]


def chain(engine, successor, ctx, *, request, release, owner, project, database, window, db,
          make_archive, private, checks):
    """The two separately authorized generations that follow the owner trial.

    The owner window must be running first (a real wait, no clock seam), then
    reader admission (Access list only, no database write), the 10 USD tester
    window and finally the schema 038 to 039 upgrade, each consuming the previous
    generation's complete evidence.
    """
    daily, funded, upgrade = engine.daily, engine.funded, engine.upgrade
    encoded, sha, frozen = engine.encoded, engine.sha, engine.frozen
    iso = lambda t:t.isoformat(timespec='milliseconds').replace('+00:00','Z')
    utc = lambda:dt.datetime.now(dt.timezone.utc)

    def fixture_system(req, selection, previous):
        class ChainSystem(successor.System):
            def __init__(self):
                super().__init__(req,daily)
                self.database=database
                self.staging_network=project+'-stage'
                self.applications=0
                self.interrupt_first=False

            def probe(self,image,mode,expected=None):
                if image != ctx['image']:
                    raise ValueError('Only the actual fixture image supported')
                if self.is_schema() and mode == 'migrate' and expected is not None:
                    # The real image-side migration against the real PostgreSQL.
                    return db('migrate',database,expected)
                if mode != 'capture' or expected is not None:
                    raise ValueError('Only actual synthetic039 capture supported')
                return db('capture',database)

            def accounting(self,image,mode,expected=None):
                if not self.is_window() or image != ctx['image'] or mode not in {'capture','apply','reconcile'}:
                    raise ValueError('Exact isolated successor transport required')
                return db('successor-'+mode,database,{'previous':previous,'selection':selection,'expected':expected})

            def apply_accounts(self,candidate):
                self.applications+=1
                if self.interrupt_first and self.applications == 1:
                    # Dies BEFORE any database write: the migration stays uncommitted.
                    raise InterruptedError('Synthetic interruption before the schema migration')
                return super().apply_accounts(candidate)

            def build_files(self,role,build,baseline):
                path=self.root/role
                path.mkdir(mode=0o700)
                old=self.files(owner)
                config=self.configuration(owner)
                new=copy.deepcopy(config)
                values=successor.selection_values(selection)
                runtime=funded.narrative_runtime_values(successor.runtime_selection(selection,previous))
                for name,svc in new['services'].items():
                    svc['image']=build['imageId']
                    if name in {'api','worker'}:
                        svc['environment'].update({k:v for k,v in values.items()
                            if name=='worker' or k in {'CLOSED_BETA_USER_IDS','AI_PROJECT_BUDGET_USD','AI_USER_BUDGET_USD'}})
                        svc['environment'].update({k:v for k,v in runtime.items() if name=='worker' or k in funded.NARRATIVE_DEFAULTS})
                    if self.is_reader() and name in {'web','api'}:
                        svc['environment']['CLOSED_SITE_ALLOWED_EMAILS']=','.join(successor.reader_emails(selection))
                if self.is_schema():
                    # The new image brings billing at its compose defaults (off).
                    for name in ('api','worker'):
                        new['services'][name]['environment'].update(funded.BILLING_DEFAULTS)
                    enabled=copy.deepcopy(new)
                    enabled['services']['api']['environment']['BILLING_ENABLED']='true'
                    assert successor.normalized(enabled,selection,previous)!=successor.normalized(config,selection,previous)
                    stripe=copy.deepcopy(new)
                    stripe['services']['worker']['environment']['STRIPE_SECRET_KEY']='synthetic'
                    assert successor.normalized(stripe,selection,previous)!=successor.normalized(config,selection,previous)
                    checks['billingDefaultsGuard']=True
                assert successor.normalized(new,selection,previous)==successor.normalized(config,selection,previous)
                private(path/'server.env',successor.candidate_environment(old['server.env'].decode(),selection,build['imageTag'],previous))
                private(path/'pinned-image.json',encoded({'services':{n:{'image':build['imageId'],'pull_policy':'never'} for n in new['services']}}))
                private(path/'effective-compose.json',frozen(new))
                manifest={**json.loads(old['manifest.json']),
                    'commit':build['commit'],'imageId':build['imageId'],
                    'ownerEnvironmentSha256':sha((path/'server.env').read_bytes()),
                    'effectiveComposeSha256':sha(frozen(new))}
                if self.is_reader():
                    manifest['accessConfigurationSha256']=sha(self.reader_receipt())
                private(path/'manifest.json',encoded(manifest))
                return self.hashes(path)
        return ChainSystem()

    def advance(selection, previous, *, emails, interrupted=False):
        req=copy.deepcopy(request)
        for key in ('preparedSha256','restoreProof'):
            req.pop(key,None)
        req.update(mode='prepare',selection=selection,release={**release,
            'runtime':successor.runtime_selection(selection,previous),'successorFixtureSha256':'b'*64})
        # External Access always leads the origin: it already shows the new list.
        req['accessSnapshot']={**req['accessSnapshot'],'allowedEmails':emails,'checkedAt':utc().isoformat()}
        trial=fixture_system(req,selection,previous)

        def runtime():
            manifest=json.loads((owner/'manifest.json').read_bytes())
            roles=trial.roles()
            config=trial.configuration(owner)
            engine.activation.validate_running(list(roles.values()),config,manifest['imageId'])
            assert sha(upgrade.CA.read_bytes())==manifest['databaseCaSha256']
            daily.personal_runtime_policy({k:v['environment'] for k,v in config['services'].items()},daily.utcnow())
            return manifest,roles

        with patch.object(daily,'owner_runtime',runtime):
            prepared=trial.prepare()
            candidate=json.loads((trial.root/'prepared.json').read_bytes())
            req['preparedSha256']=prepared['preparedSha256']
            assert trial.candidate()==candidate
            make_archive(trial,candidate)
            if 'closePreviousAt' in selection:
                until=funded.stamp(selection['closePreviousAt'])
                while trial.now()<until:
                    time.sleep(min(1,(until-trial.now()).total_seconds()))
            req['accessSnapshot']['checkedAt']=utc().isoformat()
            if interrupted:
                trial.interrupt_first=True
                try:successor.transition(trial,candidate)
                except InterruptedError:pass
                else:raise AssertionError('Interrupted schema migration did not stop')
                # Held and fenced with the database untouched (still schema 038).
                assert trial.applications==1 and not any(v['State']['Running'] for v in trial.roles().values())
                assert db('capture',database)['schema']==38
                assert trial.reconcile_accounts(candidate)['state']=='uncommitted'
                trial.recovery=True
                req['mode']='recover'
                req['accessSnapshot']['checkedAt']=utc().isoformat()
                successor.transition(trial,candidate,recovery=True)
                # Recovery observed the database first and finished the one step.
                assert trial.applications==2
            else:
                successor.transition(trial,candidate)
                assert trial.applications==1
            assert daily.funded_upgrade_healthy('personal-beta')
            active=engine.replay.active_funded_runtime(daily,funded.fence.original)
            assert active['preparedSha256']==sha(encoded(candidate))
            assert trial.reconcile_accounts(candidate)['protectedDataUnchanged'] is True
            assert trial.proof['browserJourneyPassed'] is False
        return trial,candidate

    # The owner window is part of the baseline of both later generations and must
    # be the running window: wait for its real start instead of moving a clock.
    start=funded.stamp(window['startsAt'])+dt.timedelta(seconds=3)
    while utc()<start:
        time.sleep(min(5,(start-utc()).total_seconds()))

    reader_selection={'purpose':'reader-admission','previousTermsSha256':successor.canonical_sha(window),
        'readers':{'allowedEmails':sorted(READERS)}}
    reader,reader_candidate=advance(reader_selection,window,emails=sorted(READERS))
    assert reader.generation==2 and reader.root.name=='beta-successor-2'
    assert (reader.root/'terms.json').read_bytes()==encoded(window)
    assert json.loads((reader.root/'access.json').read_bytes())['allowedEmails']==sorted(READERS)
    assert json.loads((reader.root/'readback.json').read_bytes())['previousAllowanceClosed'] is False
    # The origin now matches the externally admitted list and cohort is unchanged.
    env=reader.configuration(owner)['services']['api']['environment']
    assert env['CLOSED_SITE_ALLOWED_EMAILS']==','.join(sorted(READERS))
    assert env['CLOSED_BETA_USER_IDS']==OWNER['userId']
    checks['readerAdmission']=True

    db('successor-tester-setup',database,{'previous':window,'selection':{'purpose':'tester-beta','next':{'participants':TESTERS}}})
    now=utc()
    tester_selection={'purpose':'tester-beta','previousTermsSha256':successor.canonical_sha(window),
        'closePreviousAt':iso(now+dt.timedelta(seconds=60)),'next':{'participants':TESTERS,
        'projectUsd':'10','userUsd':'3.33','startsAt':iso(now+START_LEAD),
        'endsAt':iso(now+dt.timedelta(days=30)+START_LEAD)}}
    tester,tester_candidate=advance(tester_selection,window,emails=sorted(READERS))
    assert tester.generation==3 and tester.root.name=='beta-successor-3'
    verified=db('successor-tester-verify',database,{'previous':window,'selection':tester_selection,
                                                     'expected':tester_candidate['operation']})
    assert verified=={'testerBetaWindow':True}
    checks['testerBetaWindow']=True
    # Each generation re-proves its parent's complete evidence from the original
    # files; the active authority is the last one, with all earlier trees bound.
    state=daily.successor_active_state()
    assert state['generation']==3 and state['directory'].name=='beta-successor-3'
    assert reader_candidate['preparedAt']<tester_candidate['preparedAt']
    assert tester_candidate['parentPreparedSha256']==sha(encoded(reader_candidate))
    assert reader_candidate['parentPreparedSha256']!=tester_candidate['parentPreparedSha256']
    checks['chainedAuthority']=True

    # The schema generation: the live 038 database to the reviewed 039 billing
    # foundation. The fixture database is stepped back to 038 first (synthetic,
    # fixture only); the migration then runs inside the real image. The first
    # attempt dies before the database write, the explicit recovery finishes it.
    active_terms=json.loads((tester.root/'terms.json').read_bytes())
    assert db('schema-downgrade',database)=={'downgraded':True}
    assert db('capture',database)['schema']==38
    schema_selection={'purpose':'schema-039','previousTermsSha256':successor.canonical_sha(active_terms),
        'fromSchema':38,'toSchema':39}
    schema,schema_candidate=advance(schema_selection,active_terms,emails=sorted(READERS),interrupted=True)
    assert schema.generation==4 and schema.root.name=='beta-successor-4'
    assert (schema.root/'terms.json').read_bytes()==encoded(active_terms)
    assert db('capture',database)['schema']==39
    assert db('schema-verify',database)=={'schemaMigration':True}
    proof=json.loads((schema.root/'readback.json').read_bytes())
    assert proof['schema']==39 and proof['fromSchema']==38 and proof['previousAllowanceClosed'] is False
    # The cohort, allowance and readers are exactly the tester window's.
    env=schema.configuration(owner)['services']['api']['environment']
    assert env['CLOSED_SITE_ALLOWED_EMAILS']==','.join(sorted(READERS))
    assert env['CLOSED_BETA_USER_IDS']==','.join(p['userId'] for p in TESTERS)
    assert env['BILLING_ENABLED']=='false'
    assert tester_candidate['preparedAt']<schema_candidate['preparedAt']
    assert schema_candidate['parentPreparedSha256']==sha(encoded(tester_candidate))
    state=daily.successor_active_state()
    assert state['generation']==4 and state['directory'].name=='beta-successor-4'
    checks.update(schemaMigration=True,schemaRecovery=True)

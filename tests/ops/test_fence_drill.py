"""Transport rejects an unbound source before loading privileged operations."""
import base64
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
import os
import signal
import subprocess
import sys
from unittest.mock import patch

path = Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-fence-drill.py'
spec = importlib.util.spec_from_file_location('fence_drill', path)
drill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drill)


class FenceDrillBoundaryTests(unittest.TestCase):
    def request(self):
        data=b'# synthetic source only\n'
        request={'mode':'drill','sourceCommit':'a'*40,'ownerManifestDigest':'b'*64,
                'files':{name:{'data':base64.b64encode(data).decode(),
                              'sha256':hashlib.sha256(data).hexdigest()}
                         for name in drill.NODE_FILES|{drill.ENGINE,drill.EXECUTOR,drill.CLIENT,drill.QUARANTINE,drill.REGISTRY}}}
        registry=json.dumps({'version':1,'releases':[{'commit':'a'*40,'imageId':'sha256:'+'b'*64}]}).encode()
        request['files'][drill.REGISTRY]={'data':base64.b64encode(registry).decode(),'sha256':hashlib.sha256(registry).hexdigest()}
        return request

    def test_exact_source_set_and_bytes(self):
        request=self.request()
        self.assertEqual(len(drill.sources(request)),17)
        for bad in ['path','digest','encoding','size']:
            request=self.request()
            if bad=='path':
                request['files']['../../private-key'] = request['files'][drill.ENGINE]
            elif bad=='digest':
                request['files'][drill.ENGINE]['sha256']='c'*64
            elif bad=='encoding':
                request['files'][drill.ENGINE]['data']='not-base64!!'
            else:
                value=b'x'*(256*1024+1)
                request['files'][drill.ENGINE]={'data':base64.b64encode(value).decode(),'sha256':hashlib.sha256(value).hexdigest()}
            with self.assertRaises(ValueError):
                drill.sources(request)

    def test_reviewed_release_pairs_do_not_accept_mixed_or_duplicate_pins(self):
        value={'version':1,'releases':[{'commit':'a'*40,'imageId':'sha256:'+'b'*64},
                                     {'commit':'c'*40,'imageId':'sha256:'+'d'*64}]}
        releases=drill.reviewed_releases(json.dumps(value).encode())
        self.assertIn(('a'*40,'sha256:'+'b'*64),releases)
        self.assertNotIn(('a'*40,'sha256:'+'d'*64),releases)
        for mutate in [lambda v:v.update(version=True),lambda v:v.update(extra=True),
                       lambda v:v.update(releases=[]),lambda v:v.update(releases=v['releases']*5),
                       lambda v:v['releases'][1].update(commit='a'*40),
                       lambda v:v['releases'][1].update(imageId='sha256:'+'b'*64),
                       lambda v:v['releases'][0].update(imageId='alterward:latest'),
                       lambda v:v['releases'][0].update(extra=True)]:
            bad=copy.deepcopy(value);mutate(bad)
            with self.assertRaises(ValueError):
                drill.reviewed_releases(json.dumps(bad).encode())

    def test_recovery_or_unexpected_inputs_do_not_load_root_transport(self):
        for change in [{'mode':'recovery'},{'mode':'automatic'},{'extra':True}]:
            request={**self.request(),**change}
            with patch.object(drill.os,'geteuid',return_value=0,create=True), self.assertRaises(ValueError):
                drill.main(request)

    def test_executing_source_digest_required_before_installed_modules(self):
        with patch.object(drill.os,'geteuid',return_value=0,create=True), self.assertRaisesRegex(ValueError,'Executing transport'):
            drill.main(self.request())

    def test_executing_client_digest_required_before_privileged_import(self):
        request=self.request()
        with patch.object(drill.os,'geteuid',return_value=0,create=True), \
                patch.object(drill,'__operator_source_sha256__',request['files'][drill.EXECUTOR]['sha256'],create=True), \
                self.assertRaisesRegex(ValueError,'Executing client'):
            drill.main(request)

    @unittest.skipUnless(hasattr(signal,'pthread_sigmask'), 'POSIX cleanup signal boundary')
    def test_interrupt_is_deferred_until_boundary_then_further_signals_are_ignored(self):
        code="""import importlib.util,os,signal,sys
s=importlib.util.spec_from_file_location('d',sys.argv[1]);d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
d.install_interrupt_handlers()
try:
 with d.protected_cleanup():
  os.kill(os.getpid(),getattr(signal,sys.argv[2]))
  print('cleanup-completed',flush=True)
 d.check_interrupt()
except KeyboardInterrupt:
 print('interrupt-delivered-after-cleanup',flush=True)
 os.kill(os.getpid(),signal.SIGTERM)
 print('second-interrupt-ignored',flush=True)
"""
        for name in ['SIGTERM','SIGINT','SIGHUP','SIGALRM']:
            with self.subTest(signal=name):
                run=subprocess.run([sys.executable,'-c',code,str(path),name],capture_output=True,timeout=5,check=True)
                self.assertEqual(run.stdout.decode().splitlines(),['cleanup-completed','interrupt-delivered-after-cleanup','second-interrupt-ignored'])

    def original(self):
        return {'Id':'a'*64,'Image':'sha256:'+'b'*64,'RestartCount':0,
                'HostConfig':{'RestartPolicy':{'Name':'unless-stopped'}},
                'Config':{'Labels':{'com.docker.compose.project':'alterward-owner'}},
                'State':{'StartedAt':'original-start','Status':'running','Running':True,'OOMKilled':False}}

    def test_capture_and_cleanup_are_bound_to_the_selected_manifest_image(self):
        image='sha256:'+'d'*64;name='synthetic-helper';nonce='a'*24
        self.assertEqual(drill.capture_command(image,'synthetic code','observe'),
                         [image,'node','-e','synthetic code','--','--observe'])
        item={'Name':'/'+name,'Image':image,'Config':{'Labels':{drill.LABEL:nonce}},
              'HostConfig':{'PortBindings':{},'LogConfig':{'Type':'none'}}}
        self.assertTrue(drill.capture_identity(item,name,image,nonce))
        for mutate in [lambda v:v.update(Image='sha256:'+'b'*64),
                       lambda v:v.update(Name='/other'),
                       lambda v:v['Config']['Labels'].update({drill.LABEL:'c'*24}),
                       lambda v:v['HostConfig'].update(PortBindings={'443/tcp':[]}),
                       lambda v:v['HostConfig']['LogConfig'].update(Type='json-file')]:
            bad=copy.deepcopy(item);mutate(bad)
            self.assertFalse(drill.capture_identity(bad,name,image,nonce))
        for bad_image,bad_mode in [('alterward:latest','observe'),(image,'run')]:
            with self.assertRaises(ValueError):drill.capture_command(bad_image,'code',bad_mode)

    def test_late_daemon_exit_is_observed_before_resume(self):
        original=self.original()
        current=copy.deepcopy(original)
        tick=[0]
        def wait(_seconds):
            tick[0]+=1
            if tick[0]==2:
                current['State'].update(Status='exited',Running=False)
        drill.verify_original_exit(original,lambda:{original['Id']:current},seconds=5,clock=lambda:tick[0],wait=wait)
        self.assertEqual(tick[0],2)

    def test_unknown_stop_or_replaced_identity_remains_refused(self):
        original=self.original()
        current=copy.deepcopy(original)
        tick=[0]
        def wait(_seconds): tick[0]+=1
        with self.assertRaisesRegex(ValueError,'did not settle'):
            drill.verify_original_exit(original,lambda:{original['Id']:current},seconds=2,clock=lambda:tick[0],wait=wait)
        self.assertEqual(tick[0],2)
        current['Image']='sha256:'+'c'*64
        current['State'].update(Status='exited',Running=False)
        with self.assertRaisesRegex(ValueError,'identity changed'):
            drill.verify_original_exit(original,lambda:{original['Id']:current},seconds=2,clock=lambda:tick[0],wait=wait)

    def verify_resume(self,owner,probe,seconds=180):
        tick=[0];labels=[]
        def wait(value): tick[0]+=value
        result=drill.verify_owner_resume(owner,probe,seconds=seconds,clock=lambda:tick[0],wait=wait,label=labels.append)
        return result,tick[0],labels

    def test_resume_verify_waits_past_the_healthcheck_interval_and_succeeds(self):
        calls=[0]
        def owner():
            calls[0]+=1
            if calls[0]<36: raise ValueError('Owner service unhealthy')  # healthy only at ~70 s
        result,elapsed,labels=self.verify_resume(owner,lambda:True)
        self.assertEqual((result,labels),(True,[]))
        self.assertGreater(elapsed,60)
        self.assertLess(elapsed,180)

    def test_resume_verify_is_bounded_and_reports_fixed_labels(self):
        def unhealthy(): raise ValueError('Owner service unhealthy')
        def drift(): raise ValueError('Owner runtime drift')
        result,elapsed,labels=self.verify_resume(unhealthy,lambda:True)
        self.assertEqual((result,labels),(False,['resume-owner-unhealthy']))
        self.assertGreaterEqual(elapsed,180)
        self.assertLessEqual(elapsed,182)
        self.assertEqual(self.verify_resume(drift,lambda:True)[2],['resume-owner-runtime'])
        self.assertEqual(self.verify_resume(lambda:None,lambda:False)[2],['resume-origin-probe'])
        def broken(): raise RuntimeError('Private operation failed')
        result,_elapsed,labels=self.verify_resume(lambda:None,broken)
        self.assertEqual((result,labels),(False,['resume-origin-probe']))
        for value in labels+list(drill.RESUME_LABELS.values()):
            self.assertRegex(value,r'^[a-z-]{2,50}$')

    def test_resume_verify_window_fits_within_the_external_deadlines(self):
        self.assertEqual(drill.RESUME_VERIFY_SECONDS,180)
        client=(Path(__file__).resolve().parents[2]/'scripts/contabo-fence-operator.mjs').read_text()
        self.assertIn("mode === 'rehearsal' ? 1320000 : 900000",client)
        # 780 s operation alarm + three 30 s starts + verify window + one bounded probe round
        self.assertLess(780+3*30+drill.RESUME_VERIFY_SECONDS+2*60,1320)


if __name__=='__main__':
    unittest.main()

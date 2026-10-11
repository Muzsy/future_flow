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


if __name__=='__main__':
    unittest.main()

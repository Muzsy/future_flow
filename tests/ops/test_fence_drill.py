"""Transport rejects an unbound source before loading privileged operations."""
import base64
import hashlib
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-fence-drill.py'
spec = importlib.util.spec_from_file_location('fence_drill', path)
drill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drill)


class FenceDrillBoundaryTests(unittest.TestCase):
    def request(self):
        data=b'# synthetic source only\n'
        return {'mode':'drill','sourceCommit':'a'*40,'ownerManifestDigest':'b'*64,
                'files':{name:{'data':base64.b64encode(data).decode(),
                              'sha256':hashlib.sha256(data).hexdigest()}
                         for name in drill.NODE_FILES|{drill.ENGINE,drill.EXECUTOR}}}

    def test_exact_source_set_and_bytes(self):
        request=self.request()
        self.assertEqual(len(drill.sources(request)),9)
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

    def test_recovery_or_unexpected_inputs_do_not_load_root_transport(self):
        for change in [{'mode':'recovery'},{'mode':'automatic'},{'extra':True}]:
            request={**self.request(),**change}
            with patch.object(drill.os,'geteuid',return_value=0,create=True), self.assertRaises(ValueError):
                drill.main(request)

    def test_executing_source_digest_required_before_installed_modules(self):
        with patch.object(drill.os,'geteuid',return_value=0,create=True), self.assertRaisesRegex(ValueError,'Executing transport'):
            drill.main(self.request())


if __name__=='__main__':
    unittest.main()

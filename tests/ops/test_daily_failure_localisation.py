"""A failed Daily operation records where it stopped, never what it saw.

`status/backup.json` carried only the phase of the failure, so two refusals inside `proxy-config-capture`
(a vanished container, a file that moved during the capture, a failed command) looked alike. The record now
also names the exception types, the reviewed script lines and numeric codes; nothing else.
"""
import contextlib
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import test_contabo_daily as base

daily, library = base.daily, base.library
SECRET = 'hunter2-private-value'


def raised(source, filename):
    namespace = {}
    exec(compile(source, filename, 'exec'), namespace)
    try:
        namespace['boom']()
    except BaseException as error:
        return error
    raise AssertionError('expected a failure')


class FailureDiagnosticTests(unittest.TestCase):
    def test_only_types_reviewed_script_lines_and_numeric_codes_are_recorded(self):
        error = raised("def boom():\n    raise FileNotFoundError(2, %r, %r)\n" % (SECRET, '/root/' + SECRET),
                       '/root/alterward-ops/daily/scripts/backup_lib.py')
        result = daily.failure_diagnostic(error)
        self.assertEqual(result, {'version': 'alterward-daily-failure-1', 'exceptions': [
            {'type': 'FileNotFoundError', 'frames': [{'source': 'scripts/ops/contabo-backup.py', 'line': 2}], 'errno': 2}]})
        self.assertNotIn(SECRET, json.dumps(result))

    def test_the_cause_chain_and_installed_names_map_to_repository_sources(self):
        source = ("def inner():\n    raise KeyError(%r)\n"
                  "def boom():\n    try:\n        inner()\n    except KeyError as cause:\n"
                  "        raise ValueError(%r) from cause\n") % (SECRET, SECRET)
        for installed, repository in [('contabo-daily.py', 'scripts/ops/contabo-daily.py'),
                                      ('daily_entry.py', 'scripts/ops/contabo-daily-entry.py')]:
            result = daily.failure_diagnostic(raised(source, '/root/alterward-ops/daily/scripts/' + installed))
            self.assertEqual([e['type'] for e in result['exceptions']], ['ValueError', 'KeyError'])
            self.assertEqual(result['exceptions'][1]['frames'], [{'source': repository, 'line': 5}, {'source': repository, 'line': 2}])
            self.assertNotIn(SECRET, json.dumps(result))

    def test_foreign_files_odd_names_and_command_arguments_never_appear(self):
        result = daily.failure_diagnostic(raised("def boom():\n    raise RuntimeError('x')\n", '/tmp/%s/other.py' % SECRET))
        self.assertEqual(result['exceptions'], [{'type': 'RuntimeError', 'frames': []}])
        self.assertNotIn(SECRET, json.dumps(result))
        odd = type('Bad' + SECRET.replace('-', '_') * 6, (Exception,), {})
        self.assertEqual(daily.failure_diagnostic(odd(SECRET))['exceptions'][0]['type'], 'Exception')
        failed = subprocess.CalledProcessError(1, ['/usr/bin/docker', 'inspect', SECRET], output=SECRET.encode(), stderr=SECRET.encode())
        item = daily.failure_diagnostic(failed)['exceptions'][0]
        self.assertEqual((item['program'], item['exitCode']), ('docker', 1))
        self.assertNotIn(SECRET, json.dumps(item))
        self.assertEqual(daily.failure_diagnostic(subprocess.TimeoutExpired([SECRET], 5))['exceptions'][0]['program'], 'other')


class RecordedFailureTests(unittest.TestCase):
    def test_a_failed_backup_keeps_its_phase_and_gains_the_localisation(self):
        written = {}
        config = {'sourceCommit': 'a' * 40, 'scriptHashes': {'x': 'b' * 64}, 'unitHashes': {'y': 'c' * 64}}
        explode = raised("def boom():\n    raise ValueError(%r)\n" % SECRET, '/root/alterward-ops/daily/scripts/backup_lib.py')

        def capture(value):
            library.PHASE = 'proxy-config-capture'
            raise explode
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(daily, 'ROOT', Path(directory)), patch.object(daily, 'UID', os.geteuid()), \
             patch.object(daily, 'config', return_value=config), patch.object(daily, 'exclusive', contextlib.nullcontext), \
             patch.object(daily, 'clean_pending'), patch.object(daily, 'expire', return_value=0), \
             patch.object(daily, 'perform_backup', side_effect=capture), \
             patch.object(daily, 'atomic', side_effect=lambda path, value: written.update({path.name: value})):
            result = daily.run_operation('backup')
        self.assertEqual(written['backup.json'], result)
        self.assertEqual((result['ok'], result['phase'], result['alerts']), (False, 'proxy-config-capture', ['backup_operation_failed']))
        [item] = result['failure']['exceptions']
        self.assertEqual(item['type'], 'ValueError')
        # The call site inside the Daily script precedes the helper frame; the line of the first is not pinned.
        self.assertEqual([frame['source'] for frame in item['frames']], ['scripts/ops/contabo-daily.py', 'scripts/ops/contabo-backup.py'])
        self.assertEqual(item['frames'][-1], {'source': 'scripts/ops/contabo-backup.py', 'line': 2})
        self.assertNotIn(SECRET, json.dumps(result))
        # The health projection and the stale-record logic read only their own keys.
        self.assertEqual(daily.status_snapshot.__name__, 'status_snapshot')


if __name__ == '__main__':
    unittest.main()

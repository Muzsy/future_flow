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


class ConfigClassTests(unittest.TestCase):
    """Which KIND of source a capture refused on is named by a fixed word, never a path."""

    def test_the_class_vocabulary_is_fixed_and_a_foreign_value_is_dropped(self):
        for word in ('caddy-data', 'successor', 'ssh', 'proxy-lookup'):
            error = library.tagged(word, ValueError(SECRET))
            self.assertEqual(daily.failure_diagnostic(error)['exceptions'][0]['configClass'], word)
        for hostile in ('/root/' + SECRET, SECRET, '', None, 7, ['ssh']):
            error = ValueError(SECRET)
            error.configClass = hostile
            result = daily.failure_diagnostic(error)
            self.assertNotIn('configClass', result['exceptions'][0])
            self.assertNotIn(SECRET, json.dumps(result))
        self.assertEqual(daily.failure_diagnostic(ValueError('x'))['exceptions'], [{'type': 'ValueError', 'frames': []}])

    def test_every_daily_source_gets_a_class_from_the_vocabulary(self):
        owner, ops = daily.OWNER, daily.ORIGINAL_ROOT
        for path, expected in [(owner / 'beta-successor-4' / 'prepared.json', 'successor'),
                               (owner / 'beta-successor-archive' / ('a' * 64) / 'archive.json', 'successor'),
                               (owner / 'funded-runtime-upgrade' / 'journal.json', 'funded'),
                               (owner / 'upgrades' / ('b' * 40) / 'manifest.json', 'funded'),
                               (owner / 'personal-beta-readers' / 'access.json', 'reader'),
                               (owner / 'personal-beta' / 'terms.json', 'personal'),
                               (owner / 'server.env', 'owner'),
                               (ops / 'service-env' / 'journal.jsonl', 'service'),
                               (Path('/var/lib/alterward/service-operations/journal.jsonl'), 'service'),
                               (daily.ROOT / 'config.json', 'daily'),
                               (Path('/etc/systemd/system/alterward-backup.timer'), 'systemd'),
                               (Path('/etc/alterward/supabase-ca.crt'), 'ca'),
                               (Path('/root/.ssh/authorized_keys'), 'ssh'),
                               (Path('/somewhere/else'), 'other')]:
            self.assertEqual(daily.config_class(path), expected, path)
            self.assertIn(expected, daily.CONFIG_CLASSES)

    def test_the_proxy_capture_names_the_class_that_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            base_dir = Path(directory)
            data, config, caddyfile, compose = (base_dir / n for n in ('data', 'config', 'Caddyfile', 'compose'))
            data.mkdir(), config.mkdir(), compose.mkdir()
            (data / 'cert').write_bytes(b'one'), caddyfile.write_bytes(b'c'), (compose / 'compose.yaml').write_bytes(b'y')
            container = {'Mounts': [{'Destination': d, 'Type': 'bind', 'Source': str(s)} for d, s in
                                    [('/data', data), ('/config', config), ('/etc/caddy/Caddyfile', caddyfile)]],
                         'Config': {'Labels': {'com.docker.compose.project.working_dir': str(compose),
                                               'com.docker.compose.project.config_files': 'compose.yaml'}}}
            real_read, real_is_file = Path.read_bytes, Path.is_file
            reads = {}

            def read_bytes(path):
                text = str(path)
                if text.startswith(('/etc/ssh', '/root/.ssh')):
                    return b'ssh'
                reads[text] = reads.get(text, 0) + 1
                return real_read(path) if not (text == str(data / 'cert') and reads[text] > 1) else b'moved'

            def is_file(path):
                return True if str(path).startswith(('/etc/ssh', '/root/.ssh')) else real_is_file(path)
            with patch.object(Path, 'read_bytes', read_bytes), patch.object(Path, 'is_file', is_file), \
                 patch.object(Path, 'is_symlink', lambda path: False), \
                 patch.object(Path, 'is_dir', lambda path: not str(path).startswith(('/etc/ssh', '/root/.ssh')) and os.path.isdir(path)):
                with self.assertRaisesRegex(ValueError, 'Configuration changed during capture') as moved:
                    library.config_archive(container)
            self.assertEqual(daily.failure_diagnostic(moved.exception)['exceptions'][0]['configClass'], 'caddy-data')
            # An unreadable or missing source is classed the same way, whichever source it is.
            broken = {**container, 'Mounts': [{**container['Mounts'][0], 'Source': str(base_dir / 'absent')}, *container['Mounts'][1:]]}
            with self.assertRaises(ValueError) as absent:
                library.config_archive(broken)
            self.assertEqual(daily.failure_diagnostic(absent.exception)['exceptions'][0]['configClass'], 'caddy-data')
            with self.assertRaises(ValueError) as layout:
                library.config_archive({**container, 'Mounts': container['Mounts'][:1]})
            self.assertEqual(daily.failure_diagnostic(layout.exception)['exceptions'][0]['configClass'], 'caddy-config')
            self.assertNotIn(directory, json.dumps(daily.failure_diagnostic(moved.exception)))

    def test_the_proxy_lookup_names_its_class(self):
        with patch.object(library, 'run', side_effect=RuntimeError('Command failed')):
            with self.assertRaises(RuntimeError) as failed:
                library.proxy_container()
        self.assertEqual(daily.failure_diagnostic(failed.exception)['exceptions'][0]['configClass'], 'proxy-lookup')


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

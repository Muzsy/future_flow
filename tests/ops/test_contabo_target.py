import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from subprocess import CompletedProcess
from contextlib import ExitStack
from copy import deepcopy

ROOT = Path(__file__).resolve().parents[2]
library_spec = importlib.util.spec_from_file_location(
    'alterward_backup', ROOT / 'scripts/ops/contabo-backup.py')
library = importlib.util.module_from_spec(library_spec)
library_spec.loader.exec_module(library)
sys.modules['alterward_backup'] = library
spec = importlib.util.spec_from_file_location('target', ROOT / 'scripts/ops/contabo-target.py')
target = importlib.util.module_from_spec(spec)
spec.loader.exec_module(target)
sys.modules['alterward_target'] = target
owner_spec = importlib.util.spec_from_file_location('owner', ROOT / 'scripts/ops/contabo-owner.py')
owner = importlib.util.module_from_spec(owner_spec)
owner_spec.loader.exec_module(owner)


def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as tar:
        for name, kind in entries:
            entry = tarfile.TarInfo(name)
            entry.type = kind
            if kind == tarfile.REGTYPE:
                entry.size = 4
                tar.addfile(entry, io.BytesIO(b'test'))
            else:
                entry.linkname = '/outside'
                tar.addfile(entry)
    return output.getvalue()


class SourceArchiveSafetyTests(unittest.TestCase):
    def test_actual_server_environment_is_data_not_shell(self):
        self.assertEqual(owner.server_environment("# private template\nCLOSED_SITE_ENABLED='true'\nDATABASE_URL='postgresql://fixture@fixture/db'\n"),
                         {'CLOSED_SITE_ENABLED': 'true', 'DATABASE_URL': 'postgresql://fixture@fixture/db'})
        for text in ["KEY='first'\nKEY='second'", "KEY=unquoted", "KEY='one' command",
                     "KEY='line\nbreak'", "KEY='back\\slash'"]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                owner.server_environment(text)

    def test_rendered_owner_gate_and_paid_state_fail_closed(self):
        access = {'teamDomain': 'example.cloudflareaccess.com',
                  'audience': 'a' * 64, 'allowedEmails': ['owner@example.invalid']}
        gate = {'CLOSED_SITE_ENABLED': 'true',
                'CLOUDFLARE_ACCESS_TEAM_DOMAIN': access['teamDomain'],
                'CLOUDFLARE_ACCESS_AUD': access['audience'],
                'CLOSED_SITE_ALLOWED_EMAILS': access['allowedEmails'][0]}
        paid = {'CLOSED_BETA_ENABLED': 'true', 'CLOSED_BETA_USER_IDS': '',
                'AI_PROJECT_BUDGET_USD': '0', 'AI_USER_BUDGET_USD': '0'}
        flags = target.owner_overlay((ROOT / 'deploy/closed-site-owner.flags.env').read_text())
        config = {'services': {
            'web': {'environment': {**gate, 'PUBLIC_EXTERNAL_EXPOSURE_ENABLED': 'false'}},
            'api': {'environment': {**flags, **gate, **paid,
                    **{key: 'true' for key in ['OFFICIAL_PUBLICATIONS_ENABLED',
                       'DISCOVERY_ENABLED', 'PUBLIC_COLLECTIONS_ENABLED', 'PUBLIC_SCENARIOS_ENABLED']}}},
            'worker': {'environment': {**flags, **paid, 'AI_BUDGET_WINDOW_REQUIRED': 'true',
                       'AI_BUDGET_WINDOW_START': '', 'AI_BUDGET_WINDOW_END': ''}}}}
        target.validate_owner_configuration(config, access, flags)
        defaults = deepcopy(config)
        for service in ['api', 'worker']:
            defaults['services'][service]['environment'].update(
                NARRATIVE_PIPELINE_MODE='legacy', NARRATIVE_COHORT_USER_IDS='')
        target.validate_owner_configuration(defaults, access, flags)
        for service, key, value in [('web', 'CLOSED_SITE_ENABLED', 'false'),
                                    ('api', 'CLOSED_SITE_ENABLED', None),
                                    ('api', 'CLOUDFLARE_ACCESS_AUD', 'b' * 64),
                                    ('web', 'CLOSED_SITE_ALLOWED_EMAILS', 'foreign@example.invalid'),
                                    ('worker', 'AI_PROJECT_BUDGET_USD', '2'),
                                    ('api', 'CLOSED_BETA_ENABLED', 'false'),
                                    ('worker', 'CLOSED_BETA_USER_IDS', 'uninvited-user'),
                                    ('worker', 'AI_BUDGET_WINDOW_START', '2026-10-09T00:00:00Z'),
                                    ('api', 'SHARED_FRIEND_ENABLED', 'true'),
                                    ('worker', 'PUBLIC_REVIEW_JOBS_ENABLED', 'true'),
                                    ('api', 'PUBLIC_FORK_STARTS_ENABLED', None),
                                    ('web', 'PUBLIC_EXTERNAL_EXPOSURE_ENABLED', 'true'),
                                    ('api', 'NARRATIVE_PIPELINE_MODE', 'narrative-fiction-v2'),
                                    ('worker', 'NARRATIVE_PIPELINE_MODE', 'context'),
                                    ('worker', 'NARRATIVE_COHORT_USER_IDS', 'reader-id')]:
            with self.subTest(service=service, key=key):
                changed = deepcopy(config)
                changed['services'][service]['environment'][key] = value
                with self.assertRaises(ValueError):
                    target.validate_owner_configuration(changed, access, flags)

    def test_owner_overlay_rejects_duplicate_or_unbounded_values(self):
        for text in ['CLOSED_SITE_ENABLED=true\nCLOSED_SITE_ENABLED=false',
                     'OPENAI_API_KEY=private-key', 'PUBLICATIONS_ENABLED=true; command']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                target.owner_overlay(text)

    def test_host_credentials_cannot_override_fixture_environment(self):
        with patch.dict(os.environ, {'PATH': 'safe-path', 'HOME': 'safe-home',
                                     'OPENAI_API_KEY': 'host-key',
                                     'SUPABASE_SERVICE_ROLE_KEY': 'host-admin',
                                     'DATABASE_URL': 'host-database',
                                     'CLOSED_BETA_ENABLED': 'false'}, clear=True):
            with patch.object(target.subprocess, 'run',
                              return_value=CompletedProcess(['docker'], 0, b'', b'')) as command:
                target.run(['docker', 'compose', 'config'])
        self.assertEqual(command.call_args.kwargs['env'],
                         {'PATH': 'safe-path', 'HOME': 'safe-home'})

    def test_git_directories_and_regular_files_accepted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target.source_extract(archive([('apps/', tarfile.DIRTYPE),
                                           ('apps/web/file', tarfile.REGTYPE),
                                           ('.env.example', tarfile.REGTYPE)]), root)
            self.assertEqual((root / 'apps/web/file').read_bytes(), b'test')

    def test_private_paths_rejected_before_writes(self):
        for name in ['.env', '.env.local', '.env.local.example', '.local/proof', 'env/key.txt',
                     '.git/config', 'node_modules/key', '__pycache__/file']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                with self.assertRaises(ValueError):
                    target.source_extract(archive([('valid', tarfile.REGTYPE),
                                                   (name, tarfile.REGTYPE)]), root)
                self.assertEqual(list(root.iterdir()), [])

    def test_aliases_and_absolute_paths_rejected_before_writes(self):
        for name in ['/root/file', '../file', 'root/../file', 'root//file', 'root\\file']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                with self.assertRaises(ValueError):
                    target.source_extract(archive([('valid', tarfile.REGTYPE),
                                                   (name, tarfile.REGTYPE)]), root)
                self.assertEqual(list(root.iterdir()), [])

    def test_source_links_and_devices_forbidden(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                with self.assertRaises(ValueError):
                    target.source_extract(archive([('danger', kind)]), Path(temporary))

    def test_duplicate_regular_files_rejected_before_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(ValueError):
                target.source_extract(archive([('same', tarfile.REGTYPE),
                                               ('same', tarfile.REGTYPE)]), root)
            self.assertEqual(list(root.iterdir()), [])


class IsolatedWorkerCrashTests(unittest.TestCase):
    project = 'alterward-rehearsal-' + 'a'*12
    image = 'sha256:' + 'b'*64
    cid = 'c'*64

    def container(self):
        return {'Id': self.cid, 'Image': self.image, 'RestartCount': 0,
                'Config': {'User': 'node', 'Labels': {'com.docker.compose.project': self.project,
                           'com.docker.compose.service': 'worker'}, 'Env': [
                    'DATABASE_URL=postgresql://postgres:rehearsal_unused@postgres:5432/postgres',
                    'AI_PROJECT_BUDGET_USD=0', 'AI_USER_BUDGET_USD=0',
                    'CLOSED_BETA_USER_IDS=', 'OPENAI_API_KEY=rehearsal_openai_unused']},
                'HostConfig': {'PortBindings': {}, 'RestartPolicy': {'Name': 'unless-stopped'}},
                'NetworkSettings': {'Networks': {self.project+'_backend': {}}},
                'State': {'Running': True, 'Pid': 500, 'StartedAt': 'original'}}

    def mocks(self, stack, states):
        compose = stack.enter_context(patch.object(target, 'run'))
        compose.return_value = CompletedProcess([], 0, (self.cid+'\n').encode())
        stack.enter_context(patch.object(target, 'docker', side_effect=[
            CompletedProcess([], 0, value if isinstance(value, bytes) else json.dumps([value]).encode()) for value in states]))
        stack.enter_context(patch.object(target.time, 'sleep'))
        opened = stack.enter_context(patch.object(target.os, 'pidfd_open', return_value=42, create=True))
        sent = stack.enter_context(patch.object(target.signal, 'pidfd_send_signal', create=True))
        stack.enter_context(patch.object(target.signal, 'SIGKILL', 9, create=True))
        closed = stack.enter_context(patch.object(target.os, 'close'))
        stack.enter_context(patch.object(target.Path, 'read_text', return_value=f'0::/docker-{self.cid}.scope'))
        return compose, opened, sent, closed

    def test_production_project_and_unsafe_worker_refuse_before_any_signal(self):
        bad = []
        for edit in [lambda v: v['Config']['Labels'].update({'com.docker.compose.project': 'alterward-owner'}),
                     lambda v: v.update(Image='sha256:'+'d'*64),
                     lambda v: v['Config']['Env'].append('AI_PROJECT_BUDGET_USD=1'),
                     lambda v: v['HostConfig'].update(PortBindings={'3000/tcp': [{}]}),
                     lambda v: v['NetworkSettings'].update(Networks={'production': {}})]:
            value=self.container();edit(value);bad.append(value)
        for value in bad:
            with ExitStack() as stack:
                compose, opened, sent, _ = self.mocks(stack, [value])
                with self.assertRaises(ValueError):
                    target.isolated_worker_main_crash(compose, self.project, self.image)
                opened.assert_not_called();sent.assert_not_called()
        with ExitStack() as stack:
            compose, opened, sent, _ = self.mocks(stack, [])
            with self.assertRaises(ValueError):
                target.isolated_worker_main_crash(compose, 'alterward-owner', self.image)
            compose.assert_not_called();opened.assert_not_called();sent.assert_not_called()

    def test_lifecycle_drift_closes_bound_descriptor_without_signalling(self):
        before=self.container();drift=deepcopy(before);drift['State']['Pid']=600
        with ExitStack() as stack:
            compose, opened, sent, closed = self.mocks(stack, [before, drift])
            with self.assertRaises(ValueError):
                target.isolated_worker_main_crash(compose, self.project, self.image)
            opened.assert_called_once_with(500, 0);sent.assert_not_called();closed.assert_called_once_with(42)

    def test_only_bound_fixture_pid_is_killed_and_same_container_restart_required(self):
        before=self.container();after=deepcopy(before)
        after.update(RestartCount=1);after['State'].update(Pid=600,StartedAt='restarted')
        with ExitStack() as stack:
            compose, opened, sent, closed = self.mocks(stack, [before, before, after, b'not ready\n', after, b'AI worker started\n'])
            proof=target.isolated_worker_main_crash(compose, self.project, self.image)
            sent.assert_called_once_with(42, target.signal.SIGKILL);closed.assert_called_once_with(42)
            self.assertTrue(proof['automaticRestartVerified'])
            self.assertTrue(proof['restartedWorkerStartupVerified'])
            self.assertFalse(proof['productionWorkerKilled']);self.assertFalse(proof['hostRebooted'])

    def test_foreign_cgroup_refuses_even_when_docker_pid_matches(self):
        before=self.container()
        with ExitStack() as stack:
            compose, opened, sent, closed = self.mocks(stack, [before, before])
            stack.enter_context(patch.object(target.Path, 'read_text', return_value='0::/foreign.scope'))
            with self.assertRaises(ValueError):
                target.isolated_worker_main_crash(compose, self.project, self.image)
            sent.assert_not_called();closed.assert_called_once_with(42)


if __name__ == '__main__':
    unittest.main()

"""The public proxy is found while another operation's short-lived containers come and go.

The backup (`proxy-config-capture`) listed every running container and inspected them in ONE
`docker inspect`; a `--rm` helper that vanished in between made the whole call exit 1.
"""
import importlib.util
import json
import unittest
from pathlib import Path
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location(
    'backup_race', Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

CADDY = {'Id': 'c' * 64, 'Config': {'Image': 'caddy:2'}, 'NetworkSettings': {'Ports': {'443/tcp': [{'HostPort': '443'}]}}}
APP = {'Id': 'a' * 64, 'Config': {'Image': 'app'}, 'NetworkSettings': {'Ports': None}}


class Docker:
    """A tiny docker: `listed` are the ids `ps` shows, `gone` vanish before they can be inspected."""

    def __init__(self, listed, gone=(), failing=()):
        self.listed, self.gone, self.failing, self.calls = list(listed), set(gone), set(failing), []
        self.known = {'caddy': CADDY, 'app': APP}

    def __call__(self, args, **kwargs):
        self.calls.append(args)
        check = kwargs.get('check', True)
        if args[:3] == ['docker', 'ps', '-q']:
            return SimpleNamespace(returncode=0, stdout=''.join(i + '\n' for i in self.listed
                                                                  if i not in self.gone or not self.calls_inspected(i)).encode())
        assert args[:2] == ['docker', 'inspect'] and len(args) == 3, args  # one id at a time
        identifier = args[2]
        if identifier in self.gone or identifier in self.failing:
            self.listed = [i for i in self.listed if i not in self.gone]
            if check:
                raise RuntimeError('Command failed')
            return SimpleNamespace(returncode=1, stdout=b'')
        return SimpleNamespace(returncode=0, stdout=json.dumps([self.known[identifier]]).encode())

    def calls_inspected(self, identifier):
        return ['docker', 'inspect', identifier] in self.calls


class ProxyContainerRaceTests(unittest.TestCase):
    def find(self, docker):
        original, backup.run = backup.run, docker
        try:
            return backup.proxy_container()
        finally:
            backup.run = original

    def test_the_proxy_is_found_when_a_helper_vanishes_between_ps_and_inspect(self):
        docker = Docker(['helper1', 'caddy', 'app', 'helper2'], gone={'helper1', 'helper2'})
        self.assertEqual(self.find(docker)['Id'], CADDY['Id'])

    def test_a_container_without_a_port_map_is_not_a_proxy_and_not_a_crash(self):
        self.assertEqual(self.find(Docker(['app', 'caddy']))['Id'], CADDY['Id'])

    def test_a_listed_container_that_cannot_be_inspected_is_still_a_failure(self):
        with self.assertRaises(RuntimeError):
            self.find(Docker(['caddy', 'app'], failing={'app'}))

    def test_no_proxy_and_two_proxies_still_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'Expected one existing public Caddy'):
            self.find(Docker(['app', 'helper1'], gone={'helper1'}))
        two = Docker(['caddy', 'caddy2'])
        two.known['caddy2'] = {**CADDY, 'Id': 'd' * 64}
        with self.assertRaisesRegex(ValueError, 'Expected one existing public Caddy'):
            self.find(two)

    def test_the_proxy_itself_vanishing_is_not_silently_replaced(self):
        with self.assertRaisesRegex(ValueError, 'Expected one existing public Caddy'):
            self.find(Docker(['app', 'caddy'], gone={'caddy'}))


if __name__ == '__main__':
    unittest.main()

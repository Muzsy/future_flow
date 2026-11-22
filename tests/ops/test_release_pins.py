"""Plan 054 KP3: the newest release pins equal what scripts/release-pins.py computes.

A PR that changes image files without rerunning the tool fails here, so pins
always travel in the same PR as the change (no separate pin commit and CI run).
"""
import importlib.util
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pins = load('release_pins', 'scripts/release-pins.py')
service_env = load('service_env_for_pins', 'scripts/ops/contabo-service-env.py')


def newest_replay_exception():
    text = (ROOT / 'scripts/lib/funded-replay.mjs').read_text()
    start = text.index('const REVIEWED_REGISTRY_REPLAY_EXCEPTIONS = [')
    entry = re.search(r"sourceCommit: '([0-9a-f]{40})',\s*imageId:\s*'(sha256:[0-9a-f]{64})',\s*files: \{(.*?)\n    \}",
                      text[start:], re.S)
    files = dict(re.findall(r"'([^']+)':\s*'([0-9a-f]{64})'", entry.group(3)))
    return entry.group(1), files


def known(commit):
    return subprocess.run(['git', 'cat-file', '-e', commit + '^{commit}'], cwd=ROOT,
                          capture_output=True).returncode == 0


class ReleasePinsTests(unittest.TestCase):
    def test_the_newest_image_pins_match_head(self):
        previous = list(service_env.REVIEWED_IMAGE_CHANGES)[-1]
        if not known(previous):
            self.skipTest('shallow checkout without the serving commit')
        computed = pins.compute(previous)
        self.assertEqual(service_env.REVIEWED_IMAGE_CHANGES[previous], computed['image'],
                         'Image files changed since the pins: run scripts/release-pins.py')

    def test_the_newest_replay_exception_matches_head(self):
        previous, files = newest_replay_exception()
        if not known(previous):
            self.skipTest('shallow checkout without the serving commit')
        self.assertEqual(files, pins.compute(previous)['replay'],
                         'Replay-scope files changed since the pins: run scripts/release-pins.py')

    def test_the_tool_uses_the_same_scopes_as_the_release_gates(self):
        self.assertEqual(pins.IMAGE_SCOPE, service_env.IMAGE_SCOPE)
        replay = (ROOT / 'scripts/lib/funded-replay.mjs').read_text()
        body = replay[replay.index('function fundedReplayChanges'):]
        body = body[body.index('readChangedPaths(proof.sourceCommit, sourceCommit, ['):]
        listed = re.findall(r"'([^']+)'", body[body.index('['):body.index(']')])
        self.assertEqual(tuple(listed), pins.REPLAY_SCOPE)


if __name__ == '__main__':
    unittest.main()

"""Test bridge: the real service operator, with the probe answered by the parent process.

Used by tests/service-operator-e2e.test.ts. The parent holds a PGlite database
and answers every probe request with the real TypeScript probe code, so the
Python protocol (service-profile record, journal, persisted intents, lost-apply
handling) is exercised against the actual DB core. No Docker, network or host
state is touched: everything lives under the given temporary base directory.

  bridge.py BASE --setup                 create the service-profile record
  bridge.py BASE [--lose-apply] -- ARGS  run one operator command

Probe requests go out as `PROBE <json>` lines on stdout and are answered with
one JSON line on stdin; the command result is the `RESULT <json>` line.
"""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys

directory = Path(__file__).resolve().parents[2] / 'scripts/ops'
spec = importlib.util.spec_from_file_location('service_operator', directory / 'contabo-service-operator.py')
op = importlib.util.module_from_spec(spec)
spec.loader.exec_module(op)
spr = op._load('service_profile_for_bridge', 'contabo-service-profile.py')
IMAGE = 'sha256:' + 'b' * 64
NOW = dt.datetime(2026, 11, 3, 18, 0, tzinfo=dt.timezone.utc)


def profile():
    return {
        'version': 'alterward-service-profile-1', 'generation': 1, 'parentProfileSha256': '9' * 64,
        'sourceCommit': 'a' * 40, 'imageId': IMAGE, 'effectiveComposeSha256': 'c' * 64,
        'serverEnvSha256': 'd' * 64, 'pinnedImageSha256': 'e' * 64, 'schema': 40,
        'serviceAccessEnforcement': True,
        'activation': {'approvalSha256': '1' * 64, 'approvedAt': '2026-11-03T17:50:00.000Z',
                       'backupManifestSha256': '2' * 64, 'restoreProofSha256': '3' * 64},
        'restoredFrom': None}


class BridgeRuntime:
    def __init__(self, lose_apply):
        self.lose_apply = lose_apply

    def observe(self):
        return {'images': {s: IMAGE for s in op.SERVICES}, 'effectiveComposeSha256': 'c' * 64,
                'serverEnvSha256': 'd' * 64, 'pinnedImageSha256': 'e' * 64, 'serviceAccessEnforcement': True}

    def probe(self, image_id, data, directory):
        if image_id != IMAGE:
            raise op.Refusal('Unexpected probe image')
        print('PROBE ' + json.dumps(data, sort_keys=True), flush=True)
        answer = json.loads(sys.stdin.readline())
        if data['mode'] == 'service-apply' and self.lose_apply:
            raise RuntimeError('response lost after commit')  # the parent has already applied it
        if not answer.get('ok'):
            raise op.Refusal('Probe failed')
        return answer['value']


def main(argv):
    base = Path(argv[0])
    record, state = base / 'service-profile', base / 'service-operations'
    if argv[1:] == ['--setup']:
        state.mkdir(mode=0o700, exist_ok=True)
        spr.activate(record, profile(), now=NOW)
        return 0
    lose = argv[1] == '--lose-apply'
    command = argv[argv.index('--') + 1:]
    arguments = op.parser().parse_args(command)
    operator = op.Operator(profile_dir=record, state_dir=state, runtime=BridgeRuntime(lose),
                           clock=lambda: dt.datetime.now(dt.timezone.utc), identity=lambda: ('operator', 'host'))
    try:
        with op.operation_lock(state):
            print('RESULT ' + json.dumps(op.run(arguments, operator, command), sort_keys=True), flush=True)
        return 0
    except (op.Refusal, ValueError, OSError, RuntimeError) as error:
        print('REFUSED ' + (str(error) if isinstance(error, op.Refusal) else 'invalid input'), flush=True)
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

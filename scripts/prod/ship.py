"""Operator side of a release to the new production host (plan 055 F2b).

    python3 -I scripts/prod/ship.py --commit <40> --pr <n> --image sha256:<64>                     # card
    python3 -I scripts/prod/ship.py --commit <40> --pr <n> --image sha256:<64> --approve <card sha> # switch

Runs on the operator machine, in a checkout that has the release commit:

1. CI must be green on the release commit, or (plan 054 D2) on the PR head
   of a tree-equivalent merge;
2. the serving commit is read from the host's newest ``released`` receipt
   (``--base`` names it only for the very first release on the host);
3. a release that adds, changes or removes anything under
   ``database/migrations`` is refused: a schema change needs its own planned
   procedure;
4. without ``--approve``: ``release.py plan`` prints the card and its SHA-256;
5. with ``--approve``: a backup on the host, its offsite copy and restore
   check here (``offsite.py run``), then ``release.py apply --approved``,
   which takes one more fresh backup right before the switch.

The host is reached only over the key-only SSH name ``alterward-new``.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HOST = os.environ.get('ALTERWARD_PROD_HOST', 'alterward-new')
REMOTE = os.environ.get('ALTERWARD_REMOTE_ROOT', '/srv/alterward')
REPO_API = 'repos/Muzsy/future_flow/actions/runs'
CI_PATH = '.github/workflows/ci.yml'
MIGRATIONS = 'database/migrations'
DIGEST = re.compile(r'sha256:[0-9a-f]{64}')
COMMIT = re.compile(r'[0-9a-f]{40}')
CARD = re.compile(r'[0-9a-f]{64}')
RECEIPT = re.compile(r'\d{8}T\d{6}Z\.json')


def run(args, timeout=120, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=True, **kwargs)


def ci_verdict(runs):
    """success / failed / running / missing for the main CI workflow runs of one commit."""
    runs = [r for r in runs if r.get('path') == CI_PATH]
    if not runs:
        return 'missing'
    if all(r.get('status') == 'completed' and r.get('conclusion') == 'success' for r in runs):
        return 'success'
    if any(r.get('status') == 'completed' and r.get('conclusion') != 'success' for r in runs):
        return 'failed'
    return 'running'


def ci_state(commit):
    out = run(['gh', 'api', f'{REPO_API}?head_sha={commit}'])
    return ci_verdict(json.loads(out.stdout).get('workflow_runs', []))


def git(*args):
    return run(['git', *args]).stdout.strip()


def ci_green(commit):
    """Main CI on the commit, or the PR CI of a tree-equivalent merge (plan 054 D2)."""
    state = ci_state(commit)
    if state == 'success':
        return 'release commit'
    if state == 'failed':
        raise ValueError('CI failed on the release commit')
    parents = git('rev-list', '--parents', '-n', '1', commit).split()[1:]
    if len(parents) == 2:
        base, head = parents
        if (git('merge-base', base, head) == base
                and git('rev-parse', commit + '^{tree}') == git('rev-parse', head + '^{tree}')
                and ci_state(head) == 'success'):
            return 'PR head ' + head[:12] + ' (same tree)'
    raise ValueError(f'CI on the release commit is not green ({state})')


def schema_changes(name_status):
    """The migration paths a `git diff --name-status` output touches."""
    out = []
    for line in name_status.splitlines():
        fields = line.split('\t')
        if len(fields) >= 2 and any(p == MIGRATIONS or p.startswith(MIGRATIONS + '/') for p in fields[1:]):
            out.append(fields[-1])
    return out


def serving_commit(receipts):
    """The commit of the newest released receipt; receipts: [(name, record)]."""
    for name, record in sorted(receipts, key=lambda item: item[0], reverse=True):
        if record.get('outcome') == 'released' and COMMIT.fullmatch(str(record.get('commit', ''))):
            return record['commit']
    return None


def host_receipts():
    names = run(['ssh', '-o', 'BatchMode=yes', HOST, f'ls -1 {REMOTE}/releases 2>/dev/null || true']).stdout.split()
    out = []
    for name in names:
        if RECEIPT.fullmatch(name):
            text = run(['ssh', '-o', 'BatchMode=yes', HOST, f'cat {REMOTE}/releases/{name}']).stdout
            try:
                out.append((name, json.loads(text)))
            except ValueError:
                continue
    return out


def verified_backup():
    """A fresh host backup, copied here and test-restored (offsite.py)."""
    run(['ssh', '-o', 'BatchMode=yes', HOST, f'python3 -I {REMOTE}/app/scripts/prod/backup.py backup'], timeout=1500)
    offsite = Path(__file__).with_name('offsite.py')
    out = run([sys.executable, '-I', str(offsite), 'run'], timeout=1800)
    return json.loads(out.stdout.strip().splitlines()[-1])['restore']


def remote_release(command, image, commit, pr, approved=None):
    tool = f'{REMOTE}/app/scripts/prod/release.py'
    extra = f' --approved {approved}' if approved else ''
    timeout = 3600 if approved else 1200
    out = subprocess.run(['ssh', '-o', 'BatchMode=yes', HOST,
                          f'python3 -I {tool} {command} --image {image} --commit {commit} --pr {pr}{extra}'],
                         capture_output=True, text=True, timeout=timeout)
    return out.returncode, out.stdout


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument('--commit', required=True)
    parser.add_argument('--pr', required=True)
    parser.add_argument('--image', required=True)
    parser.add_argument('--base', help='serving commit, only for the first release on the host')
    parser.add_argument('--approve', help='the approved card SHA-256: performs the switch')
    args = parser.parse_args(argv)
    try:
        if (not COMMIT.fullmatch(args.commit) or not DIGEST.fullmatch(args.image)
                or not re.fullmatch(r'[1-9]\d{0,5}', args.pr)):
            raise ValueError('Exact commit, image digest and PR number required')
        if args.approve is not None and not CARD.fullmatch(args.approve):
            raise ValueError('--approve needs the card SHA-256')
        if args.base is not None and not COMMIT.fullmatch(args.base):
            raise ValueError('--base needs a full commit')
        git('cat-file', '-e', args.commit + '^{commit}')
        ci = ci_green(args.commit)
        serving = serving_commit(host_receipts())
        if serving and args.base and args.base != serving:
            raise ValueError('--base differs from the serving commit in the host receipts')
        base = serving or args.base
        if not base:
            raise ValueError('No released receipt on the host: name the serving commit with --base')
        git('cat-file', '-e', base + '^{commit}')
        changed = schema_changes(git('diff', '--name-status', base, args.commit, '--', MIGRATIONS))
        if changed:
            raise ValueError('The release changes database migrations (' + ', '.join(changed[:5])
                             + '): this needs its own planned procedure')
        print(f'CI green on the {ci}; serving {base[:12]}; no migration changes.')
        if args.approve:
            restore = verified_backup()
            print(f"Backup {restore['runId']} restored here: {restore['tables']} tables, {restore['rows']} rows.")
        code, output = remote_release('apply' if args.approve else 'plan', args.image, args.commit, args.pr,
                                      args.approve)
        print(output, end='')
        return code
    except subprocess.CalledProcessError as error:
        print(json.dumps({'ok': False, 'error': 'CalledProcessError', 'step': ' '.join(error.cmd[:2])}))
        return 1
    except Exception as error:
        print(json.dumps({'ok': False, 'error': type(error).__name__, 'message': str(error)[:300]}))
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

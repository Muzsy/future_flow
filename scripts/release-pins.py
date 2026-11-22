"""Release pins, computed instead of hand-written (plan 054 KP3).

    python3 scripts/release-pins.py --previous <serving commit> --image <serving image id>

From the serving commit and image it rewrites, for the current HEAD:

* REVIEWED_IMAGE_CHANGES[previous] in scripts/ops/contabo-service-env.py
  (every image-scope file changed since the serving commit, pinned by bytes);
* the REVIEWED_REGISTRY_REPLAY_EXCEPTIONS entry for (previous, image) in
  scripts/lib/funded-replay.mjs (only the replay-scope paths);
* REGISTRY_040_CHANGE_HASHES in scripts/ops/contabo-daily.py (pinned files
  whose bytes changed).

An existing entry for the same serving commit is replaced, so the tool can run
again after later commits in the same PR. tests/ops/test_release_pins.py checks
in CI that the newest entries equal what this tool computes for HEAD.
"""
import argparse
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGE_SCOPE = ('apps', 'packages', 'database', 'deploy', 'Dockerfile', '.dockerignore',
               'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json')
# Must equal fundedReplayChanges() in scripts/lib/funded-replay.mjs.
REPLAY_SCOPE = ('database', 'packages', 'Dockerfile', '.dockerignore', '.nvmrc', 'package.json',
                'apps/api/package.json', 'apps/web/package.json', 'apps/worker/package.json',
                'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json', 'tsconfig.scripts.json')
SERVICE_ENV = ROOT / 'scripts/ops/contabo-service-env.py'
REPLAY = ROOT / 'scripts/lib/funded-replay.mjs'
DAILY = ROOT / 'scripts/ops/contabo-daily.py'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def changed(previous, head, scope):
    return [p for p in git('diff', '--no-renames', '--name-only', previous, head, '--', *scope)
            .decode().split('\n') if p]


def blob_sha(head, path):
    return hashlib.sha256(git('cat-file', 'blob', f'{head}:{path}')).hexdigest()


def compute(previous, head='HEAD'):
    head = git('rev-parse', head).decode().strip()
    image = changed(previous, head, IMAGE_SCOPE)
    replay = changed(previous, head, REPLAY_SCOPE)
    return {'head': head,
            'image': {p: blob_sha(head, p) for p in image},
            'replay': {p: blob_sha(head, p) for p in replay}}


def service_env_entry(previous, files):
    body = ''.join(f"        '{p}':\n            '{h}',\n" for p, h in files.items())
    return (f"    # Over the serving {previous[:7]} (scripts/release-pins.py).\n"
            f"    '{previous}': {{\n{body}    }},\n")


def replay_entry(previous, image, files):
    body = ''.join(f"      '{p}':\n        '{h}',\n" for p, h in files.items())
    return (f"  {{\n    // Release over the serving {previous[:7]} image (scripts/release-pins.py).\n"
            f"    sourceCommit: '{previous}',\n    imageId:\n      '{image}',\n"
            f"    files: {{\n{body}    }},\n  }},\n")


def rewrite_service_env(text, previous, files):
    start = text.index('REVIEWED_IMAGE_CHANGES = {')
    end = text.index('\n}\nIMAGE_SCOPE', start)
    block = text[start:end]
    # Drop an existing entry (with its comment lines) for the same serving commit.
    block = re.sub(r"(?:\n    #[^\n]*)*\n    '" + previous + r"': \{\n(?:        [^\n]*\n)*    \},", '', block)
    return text[:start] + block + '\n' + service_env_entry(previous, files).rstrip('\n') + text[end:]


def rewrite_replay(text, previous, image, files):
    marker = 'const REVIEWED_REGISTRY_REPLAY_EXCEPTIONS = [\n'
    start = text.index(marker) + len(marker)
    end = text.index('\n];', start)
    block = text[start:end]
    block = re.sub(r"  \{\n    //[^\n]*\n    sourceCommit: '" + previous + r"',\n(?:    [^\n]*\n)*?  \},\n", '', block + '\n')
    return text[:start] + (replay_entry(previous, image, files) if files else '') + block.rstrip('\n') + text[end:]


def rewrite_registry(text):
    start = text.index('REGISTRY_040_CHANGE_HASHES = {')
    end = text.index('\n}', start)
    block = text[start:end]
    for path, old in re.findall(r"'([^']+)':\s*'([0-9a-f]{64})'", block):
        new = hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        if new != old:
            block = block.replace(f"'{path}': '{old}'", f"'{path}': '{new}'")
    return text[:start] + block + text[end:]


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--previous', required=True)
    parser.add_argument('--image', required=True)
    args = parser.parse_args(argv)
    if not re.fullmatch(r'[0-9a-f]{40}', args.previous) or not re.fullmatch(r'sha256:[0-9a-f]{64}', args.image):
        sys.exit('Exact serving commit and image id required')
    if git('status', '--porcelain', '--untracked-files=no').strip():
        sys.exit('Commit the release changes first: pins bind the committed bytes')
    pins = compute(args.previous)
    SERVICE_ENV.write_text(rewrite_service_env(SERVICE_ENV.read_text(), args.previous, pins['image']))
    REPLAY.write_text(rewrite_replay(REPLAY.read_text(), args.previous, args.image, pins['replay']))
    DAILY.write_text(rewrite_registry(DAILY.read_text()))
    print(f"pins for {pins['head'][:12]} over {args.previous[:12]}: "
          f"{len(pins['image'])} image files, {len(pins['replay'])} replay paths")


if __name__ == '__main__':
    main()

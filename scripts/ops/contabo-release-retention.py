"""Release leftovers retention on the Contabo host (plan 054 KP6).

Owner decision (2026-11-20, D4): keep the running Alterward image, every image a
retained Daily backup refers to (``ownerImage``), and the build/rehearsal
directories of the two newest releases. Everything else that the release path
created is removed: older ``alterward:contabo-*`` images and older
``image-*`` / ``target/*`` directories. Images and directories of other projects
are never touched. The removed names are written to ``diagnostics/``.

Run on the host as root:  python3 - [--apply] < contabo-release-retention.py
Without --apply it only prints what it would remove.
"""
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

OPS = Path('/root/alterward-ops')
TAG = re.compile(r'^alterward:contabo-[0-9a-f]{12}$')
KEEP_RELEASES = 2


def run(args):
    return subprocess.run(args, capture_output=True, text=True, check=True, timeout=120).stdout


def images_to_remove(images, running, referenced):
    """images: {tag: image_id}; running/referenced: sets of image ids."""
    keep = set(running) | set(referenced)
    return sorted(tag for tag, image in images.items() if TAG.fullmatch(tag) and image not in keep)


def directories_to_remove(builds, keep_releases=KEEP_RELEASES):
    """builds: [(name, mtime, [linked target names])] of image-* directories.

    The newest ``keep_releases`` builds and the target directories they link to
    stay; every other image-* directory and every target directory that only an
    older build (or nothing) links to is removed.
    """
    ordered = sorted(builds, key=lambda b: b[1], reverse=True)
    kept, removed = ordered[:keep_releases], ordered[keep_releases:]
    kept_targets = {t for _, _, targets in kept for t in targets}
    return [name for name, _, _ in removed], kept_targets


def linked_targets(directory):
    names = []
    for name, key in (('build-result.json', 'sourceDirectory'), ('rehearsal-dir.txt', None)):
        path = directory / name
        try:
            value = json.loads(path.read_text())[key] if key else path.read_text().strip()
        except (OSError, ValueError, KeyError):
            continue
        parts = Path(value).parts
        if len(parts) >= 5 and parts[:4] == ('/', 'root', 'alterward-ops', 'target'):
            names.append(parts[4])
    return names


def main(apply):
    images = {}
    for line in run(['docker', 'images', '--format', '{{.Repository}}:{{.Tag}} {{.ID}}']).splitlines():
        tag, image = line.split()
        images[tag] = image[:12]
    refs = {line.split()[1] for line in run(['docker', 'ps', '-a', '--format', '{{.Names}} {{.Image}}']).splitlines()
            if line.startswith('alterward-owner-')}
    running = {run(['docker', 'image', 'inspect', '--format', '{{.Id}}', ref]).strip()[7:19] for ref in refs}
    referenced = set()
    for manifest in (OPS / 'daily' / 'backups').glob('*/manifest.json'):
        try:
            referenced.add(json.loads(manifest.read_text())['ownerImage'][7:19])
        except (OSError, ValueError, KeyError):
            pass
    remove_images = images_to_remove(images, running, referenced)
    builds = [(d.name, d.stat().st_mtime, linked_targets(d)) for d in OPS.glob('image-*') if d.is_dir()]
    remove_builds, kept_targets = directories_to_remove(builds)
    remove_targets = sorted(d.name for d in (OPS / 'target').glob('*')
                            if d.is_dir() and d.name not in kept_targets)
    report = {'images': remove_images, 'builds': remove_builds, 'targets': remove_targets,
              'keptImages': sorted(running | referenced), 'applied': apply}
    if apply:
        for tag in remove_images:
            subprocess.run(['docker', 'image', 'rm', tag], capture_output=True, timeout=120)
        for name in remove_builds:
            shutil.rmtree(OPS / name)
        for name in remove_targets:
            shutil.rmtree(OPS / 'target' / name)
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        path = OPS / 'diagnostics' / f'release-retention-{stamp}.json'
        path.write_text(json.dumps(report, indent=1))
        os.chmod(path, 0o600)
    print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in report.items()}))


if __name__ == '__main__':
    main('--apply' in sys.argv[1:])

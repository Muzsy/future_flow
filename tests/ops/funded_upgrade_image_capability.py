"""Run the funded-upgrade capability probe inside the REAL CI-built image.

Uses the operator's own capability() (docker run --network none --read-only,
no credentials). Proves the image's contracts interpret every reviewed stored
policy generation and that it ships migration 038. Container CI only.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
for name, filename in [('alterward_backup', 'contabo-backup.py'), ('alterward_target', 'contabo-target.py'),
                       ('alterward_owner', 'contabo-owner.py'), ('alterward_activation', 'contabo-owner-activation.py'),
                       ('alterward_upgrade', 'contabo-owner-upgrade.py'), ('alterward_fence', 'contabo-writer-fence.py'),
                       ('alterward_readers', 'contabo-personal-beta-readers.py'),
                       ('alterward_funded_policy', 'contabo-funded-upgrade-policy.py'),
                       ('alterward_funded_upgrade', 'contabo-funded-upgrade.py')]:
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/ops' / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
funded = sys.modules['alterward_funded_upgrade']

GENERATE = """
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const c=await import(pathToFileURL(createRequire('/app/packages/database/package.json').resolve('@future-flow/contracts')).href);
const p=[c.fictionV1Policy(),c.fictionV2Policy(),c.fictionV3Policy(),c.fictionV4Policy(),c.fictionV5Policy(),
 c.fictionV6Policy(),c.fictionV6Quality25Policy(),c.fictionV7Policy(),c.fictionV8Policy(),c.narrativeV1Policy(),c.reviewedNarrativePolicy(),
 c.readyNarrativePolicy(),c.contextNarrativePolicy()];
console.log(JSON.stringify(p));
"""


def main(tag):
    image = json.loads(subprocess.run(['docker', 'image', 'inspect', tag], check=True,
                                      capture_output=True).stdout)[0]['Id']
    policies = json.loads(subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node',
                                          image, '--input-type=module', '-e', GENERATE], check=True,
                                         capture_output=True).stdout)
    unknown = {**policies[0], 'mode': 'narrative-fiction-v9'}
    source = (ROOT / 'scripts/lib/funded-upgrade-observation.mjs').read_text()
    result = funded.capability(image, policies + [unknown], source)
    names = [m['name'] for m in result['migrations']]
    expected = sorted(p.name for p in (ROOT / 'database/migrations').glob('*.sql'))
    if (len(result['accepted']) != len(policies) or len(result['rejected']) != 1 or
            names != expected or funded.policy.NARRATIVE_MIGRATION not in names):
        raise SystemExit('Image capability proof incomplete')
    print(json.dumps({'imageId': image, 'acceptedPolicies': len(result['accepted']),
                      'rejectedUnknown': 1, 'migrations': len(names), 'networkNone': True}))


if __name__ == '__main__':
    main(sys.argv[1])

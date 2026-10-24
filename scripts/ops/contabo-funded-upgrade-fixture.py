"""CI-only compatibility entry point; standalone rehearsal has a separate CLI."""
import importlib.util
import json
import os
from pathlib import Path
import sys


def main():
    if os.geteuid() != 0 or os.environ.get('CI') != 'true' or os.environ.get('GITHUB_ACTIONS') != 'true':
        raise ValueError('Actual CI Linux/root fixture only')
    path = Path(__file__).with_name('contabo-funded-fixture-engine.py')
    spec = importlib.util.spec_from_file_location('funded_fixture_engine', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.exercise(json.loads(sys.stdin.read()), scope='ci')


if __name__ == '__main__':
    print(json.dumps(main()))

"""Root-only installed entry, with no bytecode files in the backed-up scripts."""
import importlib.util
from pathlib import Path
import sys
import signal

sys.dont_write_bytecode = True
directory = Path(__file__).parent
for filename, name in [('backup_lib.py', 'alterward_backup'),
                       ('contabo-daily.py', 'alterward_daily')]:
    spec = importlib.util.spec_from_file_location(name, directory / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)

def interrupted(signum, frame):
    raise InterruptedError('Daily operation interrupted')

for name in ['SIGTERM', 'SIGINT', 'SIGHUP']:
    signal.signal(getattr(signal, name), interrupted)

try:
    result = module.main(sys.argv[1].removeprefix('--'))
    print(module.json.dumps(result))
    sys.exit(0 if result.get('ok', True) else 1)
except Exception:
    print('{"ok":false,"alerts":["daily_entry_failed"]}')
    sys.exit(1)

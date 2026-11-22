"""Production monitor on the new host (plan 055 F2a), run every 15 minutes.

    python3 -I scripts/prod/monitor.py run      # writes ops/status/monitor.json
    python3 -I scripts/prod/monitor.py health   # the projection the GitHub check reads

Checks, each true or false (an alert names every false one):

* containersHealthy: web, api, worker, proxy and registry run; web and api
  report a healthy Docker healthcheck;
* diskSpaceHealthy: at most 80 % of the root filesystem used;
* originCertificateHealthy: the Cloudflare Origin certificate is valid for
  more than 30 days;
* backupFresh: the last backup succeeded less than 26 hours ago;
* restoreVerified: the operator machine's restore check succeeded less than
  36 hours ago on a backup that is at most 50 hours old;
* serviceUsdQuiet: no USD threshold crossing worth a notification in the
  worker log since the previous run (project crossings, or a user at 2x/3x
  of the monthly reference). A crossing turns only that run red, so each one
  reaches the owner once.

No secret, user id or content leaves the host through this record.
"""
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get('ALTERWARD_ROOT', '/srv/alterward'))
STATUS = ROOT / 'ops' / 'status'
ORIGIN = ROOT / 'secrets' / 'origin' / 'origin.crt'
SERVICES = ('web', 'api', 'worker', 'proxy', 'registry')
HEALTHCHECKED = ('web', 'api')
CHECKS = ('containersHealthy', 'diskSpaceHealthy', 'originCertificateHealthy', 'backupFresh',
          'restoreVerified', 'serviceUsdQuiet')
USD_LINE = re.compile(r'\{"event":"service_usd_alert".{0,400}?\}\}')


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def private_write(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    with open(temporary, 'wb') as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(data)
    os.replace(temporary, path)


def stamp(value):
    parsed = dt.datetime.fromisoformat(value)
    if parsed.utcoffset() != dt.timedelta(0):
        raise ValueError('UTC timestamp required')
    return parsed


def fresh(record, key, now, limit):
    try:
        return record.get('ok') is True and dt.timedelta(0) <= now - stamp(record[key]) <= limit
    except (KeyError, TypeError, ValueError):
        return False


def notable_usd_alerts(text):
    count = 0
    for match in USD_LINE.finditer(text):
        try:
            item = json.loads(match.group(0))
        except ValueError:
            continue
        threshold = item.get('threshold')
        if isinstance(threshold, bool) or not isinstance(threshold, (int, float)):
            continue
        if item.get('scope') == 'project' or (item.get('scope') == 'user' and threshold >= 2):
            count += 1
    return count


def containers_healthy(inspect):
    """inspect: {service: docker inspect State} for the Compose project."""
    for service in SERVICES:
        state = inspect.get(service)
        if not state or state.get('Running') is not True:
            return False
        if service in HEALTHCHECKED and (state.get('Health') or {}).get('Status') != 'healthy':
            return False
    return True


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def inspect_project():
    names = subprocess.run(['docker', 'ps', '-a', '--filter', 'label=com.docker.compose.project=alterward',
                            '--format', '{{.Label "com.docker.compose.service"}} {{.ID}}'],
                           capture_output=True, text=True, timeout=30).stdout.split('\n')
    states = {}
    for line in names:
        if ' ' in line:
            service, ident = line.split(' ', 1)
            raw = subprocess.run(['docker', 'inspect', '--format', '{{json .State}}', ident],
                                 capture_output=True, text=True, timeout=30).stdout
            try:
                states[service] = json.loads(raw)
            except ValueError:
                pass
    return states


def certificate_days(path, now):
    out = subprocess.run(['openssl', 'x509', '-in', str(path), '-noout', '-enddate'],
                         capture_output=True, text=True, timeout=30)
    if out.returncode:
        return -1
    end = dt.datetime.strptime(out.stdout.strip().removeprefix('notAfter='), '%b %d %H:%M:%S %Y %Z')
    return (end.replace(tzinfo=dt.timezone.utc) - now).days


def worker_log_since(since):
    ident = subprocess.run(['docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=alterward',
                            '--filter', 'label=com.docker.compose.service=worker'],
                           capture_output=True, text=True, timeout=30).stdout.strip()
    if not ident:
        return None
    out = subprocess.run(['docker', 'logs', '--since', since.strftime('%Y-%m-%dT%H:%M:%SZ'), ident],
                         capture_output=True, timeout=60)
    return None if out.returncode else (out.stdout + out.stderr).decode('utf-8', 'replace')


def evaluate(now, inspect, disk, cert_days, backup, restore, usd_alerts):
    backup_ok = fresh(backup, 'capturedAt', now, dt.timedelta(hours=26))
    restore_ok = (fresh(restore, 'checkedAt', now, dt.timedelta(hours=36))
                  and fresh(restore, 'backupCapturedAt', now, dt.timedelta(hours=50)))
    checks = {
        'containersHealthy': containers_healthy(inspect),
        'diskSpaceHealthy': disk.used / disk.total <= 0.80,
        'originCertificateHealthy': cert_days > 30,
        'backupFresh': backup_ok,
        'restoreVerified': restore_ok,
        'serviceUsdQuiet': usd_alerts == 0,
    }
    return checks, [name for name in CHECKS if not checks[name]]


def run_monitor():
    now = utcnow()
    previous = read_json(STATUS / 'monitor.json')
    try:
        since = stamp(previous['capturedAt'])
        if not dt.timedelta(0) < now - since <= dt.timedelta(hours=6):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        since = now - dt.timedelta(minutes=30)
    log = worker_log_since(since)
    usd = notable_usd_alerts(log) if log is not None else 0
    checks, alerts = evaluate(now, inspect_project(), shutil.disk_usage('/'), certificate_days(ORIGIN, now),
                              read_json(STATUS / 'backup.json'), read_json(STATUS / 'restore.json'), usd)
    result = {'schemaVersion': 'alterward-prod-monitor-1', 'capturedAt': now.isoformat(), 'ok': not alerts,
              'alerts': alerts, 'checks': checks, 'serviceUsdAlerts': usd}
    private_write(STATUS / 'monitor.json', json.dumps(result).encode())
    return result


def health():
    """The minimal projection for the external check: fresh and complete or not ok."""
    record = read_json(STATUS / 'monitor.json')
    now = utcnow()
    try:
        current = dt.timedelta(0) <= now - stamp(record['capturedAt']) <= dt.timedelta(minutes=30)
    except (KeyError, TypeError, ValueError):
        current = False
    checks = record.get('checks', {}) if current and set(record.get('checks', {})) == set(CHECKS) else {}
    ok = bool(checks) and record.get('ok') is True and all(checks.values())
    return {'schemaVersion': 'alterward-prod-health-1', 'checkedAt': now.isoformat(), 'ok': ok,
            'checks': checks}


def main(argv):
    if argv == ['run']:
        result = run_monitor()
        print(json.dumps(result))
        return 0 if result['ok'] else 1
    if argv == ['health']:
        print(json.dumps(health()))
        return 0
    print('usage: monitor.py run|health', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

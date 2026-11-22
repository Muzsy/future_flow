"""Plan 055 F2a: the production monitor's decisions (no Docker)."""
import collections
import datetime as dt
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    'prod_monitor', Path(__file__).resolve().parents[2] / 'scripts/prod/monitor.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)
NOW = dt.datetime(2026, 12, 1, 12, tzinfo=dt.timezone.utc)
Disk = collections.namedtuple('Disk', 'total used free')
HEALTHY = {s: {'Running': True, 'Health': {'Status': 'healthy'}} for s in monitor.SERVICES}


def iso(hours):
    return (NOW - dt.timedelta(hours=hours)).isoformat()


class MonitorTests(unittest.TestCase):
    def ok_inputs(self):
        return dict(now=NOW, inspect=dict(HEALTHY), disk=Disk(100, 50, 50), cert_days=200,
                    backup={'ok': True, 'capturedAt': iso(3)},
                    restore={'ok': True, 'checkedAt': iso(2), 'backupCapturedAt': iso(3)}, usd_alerts=0)

    def test_everything_green_gives_no_alert(self):
        checks, alerts = monitor.evaluate(**self.ok_inputs())
        self.assertEqual(alerts, [])
        self.assertEqual(set(checks), set(monitor.CHECKS))

    def test_each_failure_names_its_check(self):
        cases = {
            'containersHealthy': {'inspect': {**HEALTHY, 'api': {'Running': True, 'Health': {'Status': 'unhealthy'}}}},
            'diskSpaceHealthy': {'disk': Disk(100, 81, 19)},
            'originCertificateHealthy': {'cert_days': 30},
            'backupFresh': {'backup': {'ok': True, 'capturedAt': iso(27)}},
            'restoreVerified': {'restore': {'ok': True, 'checkedAt': iso(2), 'backupCapturedAt': iso(51)}},
            'serviceUsdQuiet': {'usd_alerts': 1},
        }
        for name, change in cases.items():
            with self.subTest(name):
                _, alerts = monitor.evaluate(**{**self.ok_inputs(), **change})
                self.assertEqual(alerts, [name])

    def test_a_missing_registry_or_stopped_worker_is_unhealthy(self):
        without = {k: v for k, v in HEALTHY.items() if k != 'registry'}
        self.assertFalse(monitor.containers_healthy(without))
        self.assertFalse(monitor.containers_healthy({**HEALTHY, 'worker': {'Running': False}}))

    def test_usd_lines_count_project_and_large_user_crossings(self):
        line = lambda scope, t: json.dumps({'event': 'service_usd_alert', 'scope': scope, 'threshold': t,
                                            'limitMicroUsd': 1, 'accountedMicroUsd': 1,
                                            'window': {'startsAt': 'a', 'endsAt': 'b'}}, separators=(',', ':'))
        text = '\n'.join(['x', line('project', 0.5), line('user', 0.8), line('user', 2), line('project', 3)])
        self.assertEqual(monitor.notable_usd_alerts(text), 3)
        self.assertEqual(monitor.notable_usd_alerts(''), 0)


if __name__ == '__main__':
    unittest.main()

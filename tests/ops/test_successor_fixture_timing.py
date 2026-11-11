"""The successor fixture's window lead must fit the slowest machine it runs on.

Regression: a 4 minute lead passed on hosted CI (~100 s of work) but failed the
isolated rehearsal on the single-CPU target machine with "Owner trial start
already reached", because the work between choosing the window and the
future-start check took more than 240 s there.
"""
import datetime as dt
import importlib.util
import unittest
from pathlib import Path

path = Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-beta-successor-fixture.py'
spec = importlib.util.spec_from_file_location('successor_fixture_timing', path)
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

CLOSE_DELAY = dt.timedelta(seconds=60)  # closePreviousAt = now + 60 s in every window case
HOSTED_CI_WORK = dt.timedelta(seconds=170)  # measured upper bound on a hosted runner (PR #119)
SLOW_MACHINE_WORK = dt.timedelta(seconds=240)  # the single-CPU target machine exceeded this


class FixtureWindowLead(unittest.TestCase):
    def test_lead_is_at_least_the_long_proven_ten_minutes(self):
        self.assertGreaterEqual(fixture.START_LEAD, dt.timedelta(minutes=10))

    def test_lead_covers_the_work_before_the_future_start_check_with_wide_margin(self):
        # The close delay is part of the budget; the slow machine must still have
        # more than twice the failing measurement left over.
        self.assertGreater(fixture.START_LEAD - CLOSE_DELAY, 2 * SLOW_MACHINE_WORK)
        self.assertGreater(fixture.START_LEAD - CLOSE_DELAY, 3 * HOSTED_CI_WORK)

    def test_every_window_case_uses_the_shared_lead(self):
        source = path.read_text()
        self.assertNotIn('minutes=4', source)
        starts = [line for line in source.splitlines() if "'startsAt'" in line and 'iso(' in line]
        self.assertEqual(len(starts), 3)  # owner, expired-archive reset, tester window
        self.assertTrue(all('START_LEAD' in line for line in starts), starts)


if __name__ == '__main__':
    unittest.main()

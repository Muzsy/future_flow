"""Plan 055 F2c / E1: service settings on the new host (no Docker, no network)."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location(
    'prod_env', Path(__file__).resolve().parents[2] / 'scripts/prod/env.py')
env = importlib.util.module_from_spec(spec)
spec.loader.exec_module(env)

# Format-shaped placeholders, not real credentials.
LIVE = 'sk_live_' + 'A1b2C3d4' * 3
BASE = {
    'SERVICE_ACCESS_ENFORCEMENT': 'true', 'CLOSED_SITE_ENABLED': 'true',
    'BILLING_ENABLED': 'true', 'BILLING_ENFORCEMENT': 'true',
    'STRIPE_SECRET_KEY': LIVE, 'STRIPE_WEBHOOK_SECRET': 'whsec_' + 'Z9y8X7w6' * 2,
    'STRIPE_PRICE_ID': 'price_1AbCdEf', 'STRIPE_FOUNDER_COUPON_ID': 'founder-50',
    'STRIPE_API_VERSION': '2025-01-27.acacia',
    'BILLING_SUCCESS_URL': 'https://alterward.com/account?billing=success',
    'BILLING_CANCEL_URL': 'https://alterward.com/account?billing=cancel',
    'OPENAI_API_KEY': 'sk-proj-' + 'q' * 40,
    'CLOUDFLARE_ACCESS_TEAM_DOMAIN': 'alterward.cloudflareaccess.com', 'CLOUDFLARE_ACCESS_AUD': 'a' * 64,
    'TURNSTILE_SITE_KEY': '0x' + 'B' * 20,
    'AI_PROJECT_BUDGET_USD': '100', 'AI_USER_BUDGET_USD': '8.50', 'GENERATION_DAILY_LIMIT': '3',
    'AI_BUDGET_WINDOW_REQUIRED': 'false', 'AI_BUDGET_WINDOW_START': '', 'AI_BUDGET_WINDOW_END': '',
}


def request(**values):
    return json.dumps({'set': values})


class Price:
    def __init__(self, body):
        self.body = json.dumps(body).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.body


class EnvTests(unittest.TestCase):
    def test_closed_key_list_and_value_rules(self):
        self.assertEqual(env.validate_request(request(GENERATION_DAILY_LIMIT='2')), {'GENERATION_DAILY_LIMIT': '2'})
        for bad in (request(DATABASE_URL='postgres://x'), request(STRIPE_SECRET_KEY='sk_test_' + 'a' * 12),
                    request(BILLING_ENFORCEMENT='false'), request(BILLING_ENABLED='false'),
                    request(GENERATION_DAILY_LIMIT='4'), request(BILLING_SUCCESS_URL='https://evil.example/x'),
                    request(STRIPE_PRICE_ID="price_1'x"), '{"set": {}}', 'not json', '{"set": [], "x": 1}'):
            with self.assertRaises(env.Refusal):
                env.validate_request(bad)

    def test_the_resulting_environment_keeps_billing_complete_and_on(self):
        env.validate_after(BASE)
        for key, value in (('BILLING_ENFORCEMENT', 'false'), ('STRIPE_WEBHOOK_SECRET', ''),
                           ('STRIPE_SECRET_KEY', 'sk_test_' + 'a' * 12), ('OPENAI_API_KEY', ''),
                           ('AI_USER_BUDGET_USD', '9'), ('AI_BUDGET_WINDOW_START', '2026-12-01T00:00:00Z'),
                           ('CLOSED_SITE_ENABLED', 'false'), ('ANTHROPIC_API_KEY', 'x')):
            with self.assertRaises(env.Refusal, msg=key):
                env.validate_after({**BASE, key: value})
        env.validate_after({**BASE, 'AI_BUDGET_WINDOW_REQUIRED': 'true',
                            'AI_BUDGET_WINDOW_START': '2026-12-01T00:00:00Z',
                            'AI_BUDGET_WINDOW_END': '2026-12-31T00:00:00Z'})

    def test_render_keeps_other_lines_and_quotes_changed_values(self):
        text = "# head\nALTERWARD_IMAGE=127.0.0.1:5000/alterward@sha256:" + 'f' * 64 + "\nGENERATION_DAILY_LIMIT='3'\n"
        out = env.render_env(text, {'GENERATION_DAILY_LIMIT': '2', 'STRIPE_PRICE_ID': 'price_9'})
        self.assertEqual(out.splitlines(), ['# head', text.splitlines()[1], "GENERATION_DAILY_LIMIT='2'",
                                            "STRIPE_PRICE_ID='price_9'"])
        self.assertEqual(dict(env.parse_env(out))['GENERATION_DAILY_LIMIT'], '2')

    def test_secrets_appear_only_as_hash_prefixes(self):
        text = ''.join(f"{k}='{v}'\n" for k, v in BASE.items())
        new_key = 'sk_live_' + 'N3w4K5e6' * 3
        card = env.card_text(text, {'STRIPE_SECRET_KEY': new_key, 'GENERATION_DAILY_LIMIT': '2'}, '1990 HUF / month')
        self.assertNotIn(LIVE, card)
        self.assertNotIn(new_key, card)
        self.assertIn('sha256:', card)
        self.assertIn('| `GENERATION_DAILY_LIMIT` | 3 | 2 |', card)
        self.assertIn('1990 HUF / month', card)

    def test_stripe_check_is_read_only_and_needs_an_active_live_price(self):
        seen = []

        def opener(req, timeout):
            seen.append(req)
            return Price({'livemode': True, 'active': True, 'unit_amount': 1990, 'currency': 'huf',
                          'recurring': {'interval': 'month'}})
        self.assertEqual(env.stripe_price(BASE, opener), '1990 HUF / month')
        self.assertEqual(seen[0].get_method(), 'GET')
        self.assertTrue(seen[0].full_url.endswith('/v1/prices/price_1AbCdEf'))
        for body in ({'livemode': False, 'active': True}, {'livemode': True, 'active': False}):
            with self.assertRaises(env.Refusal):
                env.stripe_price(BASE, lambda req, timeout, b=body: Price(b))

        def failing(req, timeout):
            raise env.urllib.error.URLError('401')
        with self.assertRaises(env.Refusal):
            env.stripe_price(BASE, failing)

    def test_plan_checks_stripe_only_when_a_stripe_value_changes_and_apply_needs_the_card(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'server.env'
            path.write_text(''.join(f"{k}='{v}'\n" for k, v in BASE.items()))
            with mock.patch.object(env.release, 'ENV_FILE', path), \
                    mock.patch.object(env, 'stripe_price', return_value='1990 HUF / month') as price:
                _, _, card, digest = env.plan(request(GENERATION_DAILY_LIMIT='2'))
                price.assert_not_called()
                env.plan(request(STRIPE_PRICE_ID='price_2NewOne'))
                price.assert_called_once()
                with self.assertRaises(env.Refusal):
                    env.apply(request(GENERATION_DAILY_LIMIT='2'), 'b' * 64)
            self.assertIn("GENERATION_DAILY_LIMIT='3'", path.read_text())

    def _apply_with(self, healthy):
        events = []
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / 'server.env'
            path.write_text(''.join(f"{k}='{v}'\n" for k, v in BASE.items()))
            with mock.patch.object(env.release, 'ENV_FILE', path), \
                    mock.patch.object(env.release, 'ROOT', root), \
                    mock.patch.object(env.release, 'APP_SERVICES', ('web', 'api', 'worker')), \
                    mock.patch.object(env.release, 'DRAIN_SECONDS', 900), \
                    mock.patch.object(env.release, 'compose',
                                      side_effect=lambda *a, **k: events.append(('compose',) + a[:2])), \
                    mock.patch.object(env.release, 'write_env',
                                      side_effect=lambda text: (events.append(('write',)), path.write_text(text))), \
                    mock.patch.object(env.release, 'wait_healthy', side_effect=healthy):
                card = env.plan(request(GENERATION_DAILY_LIMIT='2'))[3]
                receipt = env.apply(request(GENERATION_DAILY_LIMIT='2'), card)
        return receipt, events

    def test_apply_drains_the_worker_before_writing_and_before_a_restore(self):
        receipt, events = self._apply_with([True])
        self.assertEqual(receipt['outcome'], 'applied')
        self.assertEqual(events, [('compose', 'stop', '-t'), ('write',), ('compose', 'up', '-d')])
        receipt, events = self._apply_with([False, True])
        self.assertEqual(receipt['outcome'], 'restored')
        self.assertEqual(events, [('compose', 'stop', '-t'), ('write',), ('compose', 'up', '-d'),
                                  ('compose', 'stop', '-t'), ('write',), ('compose', 'up', '-d')])

    def test_a_wrong_card_drains_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'server.env'
            path.write_text(''.join(f"{k}='{v}'\n" for k, v in BASE.items()))
            with mock.patch.object(env.release, 'ENV_FILE', path), \
                    mock.patch.object(env.release, 'compose') as compose:
                with self.assertRaises(env.Refusal):
                    env.apply(request(GENERATION_DAILY_LIMIT='2'), 'c' * 64)
            compose.assert_not_called()

    def test_main_never_prints_a_value_on_refusal(self):
        out = io.StringIO()
        with mock.patch('sys.stdin', io.StringIO(request(STRIPE_SECRET_KEY='sk_test_secretvalue123'))), \
                mock.patch('sys.stdout', out):
            self.assertEqual(env.main(['plan']), 1)
        self.assertNotIn('secretvalue', out.getvalue())


if __name__ == '__main__':
    unittest.main()

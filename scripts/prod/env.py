"""Service settings on the new production host (plan 055 F2c, decision E1).

    ssh alterward-new python3 -I /srv/alterward/app/scripts/prod/env.py plan < request.json
    ssh alterward-new python3 -I /srv/alterward/app/scripts/prod/env.py apply --approved <card sha> < request.json

The request comes on stdin (never in arguments, which other processes can
read): ``{"set": {"KEY": "value", ...}}``. Only the keys of a closed list can
be changed, each with an exact value rule; the complete resulting environment
must then pass the cross-key rules (``validate_after``).

* Secrets (Stripe secret key, webhook secret, provider key) are shown on the
  card only as the first 12 hex characters of their SHA-256.
* On this host only live Stripe keys are accepted. Billing and its
  enforcement stay on: this path can neither switch them off nor turn them on
  without a valid key, price and webhook secret.
* When a Stripe value changes, the price is fetched with the resulting key
  (read-only) and its state goes on the card; a key that cannot read the
  price is refused.
* ``apply`` rebuilds the card and refuses unless it equals the approved one,
  writes ``server.env`` atomically (the previous one is kept beside it),
  recreates web, api and worker with the same image and waits for health; on
  failure the previous file comes back.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

spec = importlib.util.spec_from_file_location('prod_release', Path(__file__).with_name('release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

ENV_LINE = re.compile(r"([A-Z][A-Z0-9_]*)=(.*)")
HEX64 = re.compile(r'[a-f0-9]{64}')
USD = re.compile(r'[0-9]{1,3}(\.[0-9]{1,2})?')
STAMP = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z')
TURNSTILE_KEY = re.compile(r'[0-3]x[A-Za-z0-9_-]{15,64}')
MAX_PROJECT_USD = 100
MAX_USER_USD = 8.5
MAX_DAILY_LIMIT = 3
MAX_WINDOW_DAYS = 31
STRIPE_API = os.environ.get('ALTERWARD_STRIPE_API', 'https://api.stripe.com')
SITE = re.compile(r'https://(www\.)?alterward\.com(/[A-Za-z0-9_./?=&{}%-]*)?')
STORY_UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}')


def story_cohort(value):
    if value == '':
        return True
    ids = value.lower().split(',')
    return len(ids) <= 100 and len(set(ids)) == len(ids) and all(STORY_UUID.fullmatch(i) for i in ids)


# Closed key set: key -> exact value rule. Everything else is refused.
ALLOWED = {
    'STORY_DIRECTIONS_ENABLED': lambda v: v in ('true', 'false'),
    'STORY_DIRECTIONS_COHORT_USER_IDS': story_cohort,
    'STORY_DIRECTION_POLITICS_ENABLED': lambda v: v in ('true', 'false'),
    'STORY_DIRECTION_POLITICS_COHORT_USER_IDS': story_cohort,
    'CLOUDFLARE_ACCESS_TEAM_DOMAIN': lambda v: re.fullmatch(r'[a-z0-9][a-z0-9-]{0,62}\.cloudflareaccess\.com',
                                                           v) is not None,
    'CLOUDFLARE_ACCESS_AUD': lambda v: HEX64.fullmatch(v) is not None,
    'AI_PROJECT_BUDGET_USD': lambda v: USD.fullmatch(v) is not None and 0 < float(v) <= MAX_PROJECT_USD,
    'AI_USER_BUDGET_USD': lambda v: USD.fullmatch(v) is not None and 0 < float(v) <= MAX_USER_USD,
    'GENERATION_DAILY_LIMIT': lambda v: re.fullmatch(r'[1-9]', v) is not None and int(v) <= MAX_DAILY_LIMIT,
    'AI_BUDGET_WINDOW_START': lambda v: v == '' or STAMP.fullmatch(v) is not None,
    'AI_BUDGET_WINDOW_END': lambda v: v == '' or STAMP.fullmatch(v) is not None,
    'AI_BUDGET_WINDOW_REQUIRED': lambda v: v in ('true', 'false'),
    'TURNSTILE_SITE_KEY': lambda v: TURNSTILE_KEY.fullmatch(v) is not None,
    'OPENAI_API_KEY': lambda v: re.fullmatch(r'sk-[A-Za-z0-9_-]{20,200}', v) is not None,
    # E1: billing settings. Live keys only on the production host.
    'STRIPE_SECRET_KEY': lambda v: re.fullmatch(r'(sk|rk)_live_[A-Za-z0-9]{8,}', v) is not None,
    'STRIPE_WEBHOOK_SECRET': lambda v: re.fullmatch(r'whsec_[A-Za-z0-9]{8,}', v) is not None,
    'STRIPE_PRICE_ID': lambda v: re.fullmatch(r'price_[A-Za-z0-9]+', v) is not None,
    'STRIPE_FOUNDER_COUPON_ID': lambda v: re.fullmatch(r'[A-Za-z0-9_-]{1,100}', v) is not None,
    'STRIPE_API_VERSION': lambda v: re.fullmatch(r'\d{4}-\d{2}-\d{2}(\.[a-z]+)?', v) is not None,
    'BILLING_SUCCESS_URL': lambda v: SITE.fullmatch(v) is not None,
    'BILLING_CANCEL_URL': lambda v: SITE.fullmatch(v) is not None,
    'BILLING_ENABLED': lambda v: v == 'true',
    'BILLING_ENFORCEMENT': lambda v: v == 'true',
}
SECRETS = {'OPENAI_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'}
STRIPE_KEYS = {k for k in ALLOWED if k.startswith('STRIPE_')}
BILLING_REQUIRED = ('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID', 'STRIPE_FOUNDER_COUPON_ID',
                    'STRIPE_API_VERSION', 'BILLING_SUCCESS_URL', 'BILLING_CANCEL_URL')


class Refusal(ValueError):
    """A value-free reason the operator can read."""


def parse_env(text):
    """[(key, value)] in file order; quotes around a value are removed."""
    out = []
    for line in text.splitlines():
        match = ENV_LINE.fullmatch(line.strip())
        if not match:
            continue
        key, value = match.groups()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '\'"':
            value = value[1:-1]
        out.append((key, value))
    return out


def render_env(text, changes):
    """The env text with the changed keys rewritten single-quoted (appended when new)."""
    lines, done = [], set()
    for line in text.splitlines():
        match = ENV_LINE.fullmatch(line.strip())
        if match and match.group(1) in changes:
            key = match.group(1)
            lines.append(f"{key}='{changes[key]}'")
            done.add(key)
        else:
            lines.append(line)
    lines += [f"{key}='{value}'" for key, value in sorted(changes.items()) if key not in done]
    return '\n'.join(lines) + '\n'


def validate_request(raw):
    try:
        request = json.loads(raw)
    except ValueError:
        raise Refusal('The request is not JSON')
    if not isinstance(request, dict) or set(request) != {'set'} or not isinstance(request['set'], dict) \
            or not request['set']:
        raise Refusal('The request must be {"set": {KEY: value}} with at least one key')
    for key, value in request['set'].items():
        rule = ALLOWED.get(key)
        if rule is None:
            raise Refusal('Key not changeable here: ' + str(key)[:64])
        if not isinstance(value, str) or "'" in value or '\n' in value or not rule(value):
            raise Refusal('Value does not match the rule for ' + key)
    return request['set']


def validate_after(env):
    """Cross-key rules on the complete resulting environment (never prints values)."""
    for key in ('SERVICE_ACCESS_ENFORCEMENT', 'CLOSED_SITE_ENABLED'):
        if env.get(key) != 'true':
            raise Refusal('Resulting environment requires ' + key + ' to be true')
    for key in ('BILLING_ENABLED', 'BILLING_ENFORCEMENT'):
        if env.get(key) != 'true':
            raise Refusal('Billing and its enforcement must stay on (' + key + ')')
    for key in BILLING_REQUIRED:
        if not ALLOWED[key](env.get(key, '')):
            raise Refusal('Billing needs a valid ' + key)
    if not ALLOWED['OPENAI_API_KEY'](env.get('OPENAI_API_KEY', '')):
        raise Refusal('The provider key is missing or malformed')
    for key in ('CLOUDFLARE_ACCESS_TEAM_DOMAIN', 'CLOUDFLARE_ACCESS_AUD', 'TURNSTILE_SITE_KEY'):
        if not ALLOWED[key](env.get(key, '')):
            raise Refusal('Resulting environment requires a valid ' + key)
    project, user = env.get('AI_PROJECT_BUDGET_USD', ''), env.get('AI_USER_BUDGET_USD', '')
    if not ALLOWED['AI_PROJECT_BUDGET_USD'](project) or not ALLOWED['AI_USER_BUDGET_USD'](user) \
            or float(user) > float(project):
        raise Refusal('Resulting environment requires positive, ordered, ceiling-bound USD reference budgets')
    if 'GENERATION_DAILY_LIMIT' in env and not ALLOWED['GENERATION_DAILY_LIMIT'](env['GENERATION_DAILY_LIMIT']):
        raise Refusal('Resulting environment requires a bounded daily generation limit')
    if (env.get('STORY_DIRECTIONS_ENABLED') == 'true' or env.get('STORY_DIRECTION_POLITICS_ENABLED') == 'true'
            or env.get('STORY_DIRECTIONS_COHORT_USER_IDS')):
        if env.get('NARRATIVE_PIPELINE_MODE') != 'narrative-fiction-v2' or \
                env.get('NARRATIVE_FICTION_GENERATION') != 'v9':
            raise Refusal('Story directions require the v9 fiction configuration')
    start, end = env.get('AI_BUDGET_WINDOW_START', ''), env.get('AI_BUDGET_WINDOW_END', '')
    if env.get('AI_BUDGET_WINDOW_REQUIRED') == 'false':
        if start or end:
            raise Refusal('Monitor budget mode requires an empty budget window')
    elif env.get('AI_BUDGET_WINDOW_REQUIRED') == 'true':
        if not STAMP.fullmatch(start) or not STAMP.fullmatch(end):
            raise Refusal('Resulting environment requires an exact UTC budget window')
        span = (dt.datetime.fromisoformat(end.replace('Z', '+00:00'))
                - dt.datetime.fromisoformat(start.replace('Z', '+00:00')))
        if not dt.timedelta(0) < span <= dt.timedelta(days=MAX_WINDOW_DAYS):
            raise Refusal('The budget window must be at most ' + str(MAX_WINDOW_DAYS) + ' days')
    else:
        raise Refusal('AI_BUDGET_WINDOW_REQUIRED must be true or false')
    if env.get('ANTHROPIC_API_KEY') or env.get('SMTP_PASSWORD'):
        raise Refusal('Unexpected provider credential present')


def shown(key, value):
    if value is None:
        return '(unset)'
    if key in SECRETS:
        return 'sha256:' + hashlib.sha256(value.encode()).hexdigest()[:12]
    return value if value else '(empty)'


def stripe_price(env, opener=urllib.request.urlopen):
    """Read-only: the configured price, fetched with the configured key."""
    url = STRIPE_API + '/v1/prices/' + urllib.parse.quote(env['STRIPE_PRICE_ID'])
    request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + env['STRIPE_SECRET_KEY'],
                                                   'Stripe-Version': env['STRIPE_API_VERSION']})
    try:
        with opener(request, timeout=20) as response:
            price = json.loads(response.read())
    except (urllib.error.URLError, ValueError, OSError):
        raise Refusal('The Stripe key cannot read the configured price')
    if price.get('livemode') is not True or price.get('active') is not True:
        raise Refusal('The configured Stripe price is not an active live price')
    recurring = price.get('recurring') or {}
    return f"{price.get('unit_amount')} {str(price.get('currency', '')).upper()} / {recurring.get('interval', 'once')}"


def card_text(text, changes, price):
    current = dict(parse_env(text))
    lines = ['# Alterward service settings card (new host)', '', '| Key | Now | After |', '| --- | --- | --- |']
    for key in sorted(changes):
        lines.append(f'| `{key}` | {shown(key, current.get(key))} | {shown(key, changes[key])} |')
    lines += ['', f'- Current file: sha256 `{hashlib.sha256(text.encode()).hexdigest()}`',
              f'- Stripe price check: {price or "not needed (no Stripe value changes)"}',
              '- Steps: write server.env (previous kept), recreate web/api/worker with the same image, '
              'health check, previous file back on failure',
              '- Approving this card authorizes this change on the production host.']
    return '\n'.join(lines) + '\n'


def current_text():
    return release.ENV_FILE.read_text()


def plan(raw):
    changes = validate_request(raw)
    text = current_text()
    current = dict(parse_env(text))
    after = {**current, **changes}
    validate_after(after)
    price = stripe_price(after) if STRIPE_KEYS & set(changes) else None
    card = card_text(text, changes, price)
    return changes, text, card, release.sha(card.encode())


def apply(raw, approved):
    changes, text, card, digest = plan(raw)
    if digest != approved:
        raise Refusal('The settings card differs from the approved one')
    backup = release.ENV_FILE.with_name(release.ENV_FILE.name + '.previous')
    with open(backup, 'w') as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(text)
    release.write_env(render_env(text, changes))
    release.compose('up', '-d', '--no-deps', *release.APP_SERVICES, timeout=900)
    if release.wait_healthy(release.HEALTH_SECONDS):
        outcome = 'applied'
    else:
        release.write_env(text)
        release.compose('up', '-d', '--no-deps', *release.APP_SERVICES, timeout=900)
        outcome = 'restored' if release.wait_healthy(release.HEALTH_SECONDS) else 'restore-unhealthy'
    receipt = {'schemaVersion': 'alterward-prod-env-1', 'card': digest, 'keys': sorted(changes),
               'outcome': outcome, 'at': release.utcnow().isoformat()}
    path = release.ROOT / 'releases' / ('env-' + release.utcnow().strftime('%Y%m%dT%H%M%SZ') + '.json')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(receipt, indent=1))
    return receipt


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['plan', 'apply'])
    parser.add_argument('--approved')
    args = parser.parse_args(argv)
    raw = sys.stdin.read(65536)
    try:
        if args.command == 'plan':
            _, _, card, digest = plan(raw)
            print(card + f'\ncard sha256: {digest}')
            return 0
        if not args.approved or not HEX64.fullmatch(args.approved):
            raise Refusal('--approved <card sha256> required')
        receipt = apply(raw, args.approved)
        print(json.dumps(receipt))
        return 0 if receipt['outcome'] == 'applied' else 1
    except Refusal as error:
        print(json.dumps({'ok': False, 'error': 'Refusal', 'message': str(error)}))
        return 1
    except Exception as error:  # type only: a message could carry a value
        print(json.dumps({'ok': False, 'error': type(error).__name__}))
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
